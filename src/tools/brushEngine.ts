import type { ImageDataLike, RGBA, Selection, Rect } from '@/core/types';
import { isPointSelected } from '@/core/document';

/**
 * Brush engine: rasterizes brush stamps into a raster layer's pixel buffer.
 *
 * Design:
 * - Each "tip" is a precomputed soft-edge alpha kernel sized by `radius * 2 + 1`.
 *   Hardness controls falloff. We cache kernels keyed by (radius, hardness) so
 *   repeated stamps reuse the same buffer.
 * - A stroke is a sequence of stamps spaced by `stepFactor * radius`. Spacing is
 *   what makes a moving cursor look like a continuous line.
 * - Stamps blend into the layer using "source-over" semantics manually (so we can
 *   honor selection masks and stay deterministic per-pixel).
 * - Eraser mode multiplies the existing alpha by (1 - kernel) instead of layering paint.
 */

export type BrushTipMode = 'normal' | 'spray' | 'smooth-spray' | 'pencil' | 'crayon';

export interface BrushSettings {
  radius: number;       // doc pixels
  hardness: number;     // 0-1 (1 = solid disk)
  opacity: number;      // 0-1 per-stamp paint opacity
  flow: number;         // 0-1 per-stamp ink flow
  spacing: number;      // 0..1 fraction of diameter between stamps
  color: RGBA;
  // ---- Optional preset behavior. Defaults preserve original brush ----
  tipMode?: BrushTipMode;   // dispatch knob for non-standard tips
  scatter?: number;          // 0..1 random offset of dab placement (spray)
  density?: number;          // dots per dab (spray)
  jitterSize?: number;       // 0..1 random radius variation per dab
  jitterOpacity?: number;    // 0..1 random opacity variation per dab
}

export interface EraserSettings {
  radius: number;
  hardness: number;
  opacity: number;
  spacing: number;
}

export type BrushMode = 'paint' | 'erase';

interface Kernel {
  size: number;
  data: Float32Array; // alpha 0..1
}

const KERNEL_CACHE = new Map<string, Kernel>();

function getKernel(radius: number, hardness: number): Kernel {
  const r = Math.max(0.5, radius);
  const h = Math.min(1, Math.max(0, hardness));
  const key = `${r.toFixed(2)}|${h.toFixed(2)}`;
  const cached = KERNEL_CACHE.get(key);
  if (cached) return cached;

  const size = Math.max(1, Math.ceil(r * 2));
  const data = new Float32Array(size * size);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  // Inner solid radius vs feather radius based on hardness.
  const inner = r * h;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      let a: number;
      if (d <= inner) a = 1;
      else if (d >= r) a = 0;
      else {
        const t = (r - d) / (r - inner);
        // Smoothstep falloff for natural-looking edges.
        a = t * t * (3 - 2 * t);
      }
      data[y * size + x] = a;
    }
  }
  const k: Kernel = { size, data };
  // Bound the cache so we don't leak indefinitely.
  if (KERNEL_CACHE.size > 256) {
    const firstKey = KERNEL_CACHE.keys().next().value;
    if (firstKey) KERNEL_CACHE.delete(firstKey);
  }
  KERNEL_CACHE.set(key, k);
  return k;
}

/**
 * Stamp a single brush dab. Returns the pixel rect that was modified
 * (so the caller can invalidate just that region for repaint + history).
 */
export function stamp(
  pixels: ImageDataLike,
  cx: number,
  cy: number,
  mode: BrushMode,
  brush: BrushSettings | EraserSettings,
  color: RGBA | null,
  selection: Selection | null,
): Rect {
  const k = getKernel(brush.radius, brush.hardness);
  const half = (k.size - 1) / 2;
  const x0 = Math.max(0, Math.floor(cx - half));
  const y0 = Math.max(0, Math.floor(cy - half));
  const x1 = Math.min(pixels.width, Math.ceil(cx + half + 1));
  const y1 = Math.min(pixels.height, Math.ceil(cy + half + 1));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return { x: x0, y: y0, width: 0, height: 0 };

  const opacity = (brush as BrushSettings).opacity ?? 1;
  const flow = (brush as BrushSettings).flow ?? 1;
  const dabAlpha = opacity * flow;

  const buf = pixels.data;

  if (mode === 'paint' && color) {
    const sr = color.r;
    const sg = color.g;
    const sb = color.b;
    const sa = color.a;
    for (let y = y0; y < y1; y++) {
      const ky = y - (cy - half);
      for (let x = x0; x < x1; x++) {
        const kx = x - (cx - half);
        if (kx < 0 || ky < 0 || kx >= k.size || ky >= k.size) continue;
        const ka = k.data[(ky | 0) * k.size + (kx | 0)] * sa * dabAlpha;
        if (ka <= 0) continue;
        const selA = isPointSelected(selection, x, y) / 255;
        if (selA <= 0) continue;
        const a = ka * selA;
        const di = (y * pixels.width + x) * 4;
        // Source-over alpha blending.
        const dr = buf[di];
        const dg = buf[di + 1];
        const db = buf[di + 2];
        const da = buf[di + 3] / 255;
        const outA = a + da * (1 - a);
        if (outA <= 0) continue;
        buf[di] = (sr * a + dr * da * (1 - a)) / outA;
        buf[di + 1] = (sg * a + dg * da * (1 - a)) / outA;
        buf[di + 2] = (sb * a + db * da * (1 - a)) / outA;
        buf[di + 3] = outA * 255;
      }
    }
  } else if (mode === 'erase') {
    for (let y = y0; y < y1; y++) {
      const ky = y - (cy - half);
      for (let x = x0; x < x1; x++) {
        const kx = x - (cx - half);
        if (kx < 0 || ky < 0 || kx >= k.size || ky >= k.size) continue;
        const ka = k.data[(ky | 0) * k.size + (kx | 0)] * dabAlpha;
        if (ka <= 0) continue;
        const selA = isPointSelected(selection, x, y) / 255;
        if (selA <= 0) continue;
        const di = (y * pixels.width + x) * 4;
        buf[di + 3] = buf[di + 3] * (1 - ka * selA);
      }
    }
  }

  return { x: x0, y: y0, width: w, height: h };
}

/**
 * Walk a line from (ax,ay) to (bx,by) stamping the brush at the configured spacing.
 * Returns the union rect of all modified pixels.
 */
export function strokeLine(
  pixels: ImageDataLike,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  mode: BrushMode,
  brush: BrushSettings | EraserSettings,
  color: RGBA | null,
  selection: Selection | null,
): Rect {
  // Spray brushes scatter random dabs along the path instead of stamping at fixed spacing.
  const tipMode = (brush as BrushSettings).tipMode ?? 'normal';
  if (mode === 'paint' && (tipMode === 'spray' || tipMode === 'smooth-spray')) {
    return strokeSpray(pixels, ax, ay, bx, by, brush as BrushSettings, color, selection);
  }
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.hypot(dx, dy);
  const step = Math.max(1, brush.spacing * brush.radius * 2);
  const steps = Math.max(1, Math.ceil(dist / step));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const sx = ax + dx * t;
    const sy = ay + dy * t;
    // Per-dab jitter for crayon/pencil presets (size + opacity wobble).
    const jBrush = applyJitter(brush as BrushSettings);
    const r = stamp(pixels, sx, sy, mode, jBrush, color, selection);
    if (r.width > 0 && r.height > 0) {
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.width);
      maxY = Math.max(maxY, r.y + r.height);
    }
  }
  if (!isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Spray-can stroke. Walks the path and at each step scatters `density` tiny dabs
 * in a random radius around the stamp center. Each dab has a small radius derived
 * from the brush radius; this is what makes spray look airy rather than stamped.
 *
 * Holding the cursor still ALSO accumulates paint (real spray cans behave this way),
 * so we always emit at least one dab per call even when the segment has zero length.
 */
function strokeSpray(
  pixels: ImageDataLike,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  brush: BrushSettings,
  color: RGBA | null,
  selection: Selection | null,
): Rect {
  const smoothing = brush.tipMode === 'smooth-spray';
  if (!smoothing && !color) return { x: 0, y: 0, width: 0, height: 0 };

  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.hypot(dx, dy);
  const step = Math.max(1, (brush.spacing || 0.05) * brush.radius);
  const steps = Math.max(1, Math.ceil(dist / step));
  const density = Math.max(1, Math.floor(brush.density ?? 12));
  const dabRadius = Math.max(0.8, brush.radius * (smoothing ? 0.18 : 0.12));
  // Smoothing kernel radius — how far around each dab we sample for the average.
  // Bigger = stronger blur per pass, but loses local detail; ~25% of brush radius is a sweet spot.
  const sampleRadius = Math.max(2, Math.round(brush.radius * 0.25));

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  // Each dab is a small soft disk applied at low opacity. For smoothing we lay
  // down the LOCAL AVERAGE color so high-frequency detail (pores, wrinkles, JPEG
  // noise) gets attenuated; many soft passes build up a healing/smoothing effect.
  const dabBrush: BrushSettings = {
    ...brush,
    radius: dabRadius,
    hardness: 0.4,
    opacity: brush.opacity * (smoothing ? 0.7 : 0.35),
    flow: brush.flow,
    spacing: 1,
    tipMode: 'normal',
  };

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = ax + dx * t;
    const cy = ay + dy * t;
    for (let n = 0; n < density; n++) {
      // Uniform random point inside the spray cone.
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * brush.radius;
      const sx = cx + Math.cos(a) * rr;
      const sy = cy + Math.sin(a) * rr;
      const dabColor = smoothing ? sampleNeighborhoodAvg(pixels, sx, sy, sampleRadius) : color!;
      if (smoothing && dabColor.a <= 0) continue; // skip transparent areas
      const r = stamp(pixels, sx, sy, 'paint', dabBrush, dabColor, selection);
      if (r.width > 0 && r.height > 0) {
        if (r.x < minX) minX = r.x;
        if (r.y < minY) minY = r.y;
        if (r.x + r.width > maxX) maxX = r.x + r.width;
        if (r.y + r.height > maxY) maxY = r.y + r.height;
      }
    }
  }
  if (!isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Gaussian-weighted average of a small disk of pixels. This is the kernel that
 * makes the smoothing spray "heal" — averaging out detail on each dab.
 */
function sampleNeighborhoodAvg(
  pixels: ImageDataLike,
  cx: number,
  cy: number,
  radius: number,
): RGBA {
  const ix = Math.floor(cx);
  const iy = Math.floor(cy);
  const r = Math.max(1, Math.floor(radius));
  const r2 = r * r;
  const sigma2 = r2 * 0.5;
  let sumR = 0, sumG = 0, sumB = 0, sumA = 0, sumW = 0;
  for (let dy = -r; dy <= r; dy++) {
    const yy = iy + dy;
    if (yy < 0 || yy >= pixels.height) continue;
    for (let dx = -r; dx <= r; dx++) {
      const xx = ix + dx;
      if (xx < 0 || xx >= pixels.width) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const w = Math.exp(-d2 / sigma2);
      const i = (yy * pixels.width + xx) * 4;
      sumR += pixels.data[i] * w;
      sumG += pixels.data[i + 1] * w;
      sumB += pixels.data[i + 2] * w;
      sumA += pixels.data[i + 3] * w;
      sumW += w;
    }
  }
  if (sumW === 0) return { r: 0, g: 0, b: 0, a: 0 };
  return { r: sumR / sumW, g: sumG / sumW, b: sumB / sumW, a: (sumA / sumW) / 255 };
}

/**
 * Apply per-dab size/opacity jitter for textured brushes (crayon, pencil).
 * Returns the original object if no jitter fields are set, so the standard brush
 * path stays allocation-free in the hot loop.
 */
function applyJitter(brush: BrushSettings): BrushSettings {
  const js = brush.jitterSize ?? 0;
  const jo = brush.jitterOpacity ?? 0;
  if (js === 0 && jo === 0) return brush;
  const sizeMul = 1 - js * Math.random();
  const opMul = 1 - jo * Math.random();
  return { ...brush, radius: Math.max(0.5, brush.radius * sizeMul), opacity: brush.opacity * opMul };
}
