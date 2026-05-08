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

export interface BrushSettings {
  radius: number;       // doc pixels
  hardness: number;     // 0-1 (1 = solid disk)
  opacity: number;      // 0-1 per-stamp paint opacity
  flow: number;         // 0-1 per-stamp ink flow
  spacing: number;      // 0..1 fraction of diameter between stamps
  color: RGBA;
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
    const r = stamp(pixels, sx, sy, mode, brush, color, selection);
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
