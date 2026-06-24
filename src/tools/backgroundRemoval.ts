import type { ImageDataLike, Rect } from '@/core/types';

/**
 * Local, fully-offline background removal.
 *
 * No ML, no network — a classical segmentation tuned for the common "subject on a
 * relatively uniform background" case (product shots, portraits on a studio sweep):
 *
 *   1. Sample the image border to build a background color reference (per-channel
 *      median, so a subject that touches one edge doesn't skew it).
 *   2. Flood-fill inward from every border pixel that matches the reference within
 *      `tolerance`. Only background *connected to the edge* is removed, so a region
 *      inside the subject that happens to share the background color is kept.
 *   3. Feather the resulting matte so the cutout edge is anti-aliased rather than
 *      a hard 1-bit stair-step.
 *
 * The operation edits the layer's ALPHA channel only (RGB is preserved), so:
 *   - the compositor renders the cutout immediately (it honors alpha),
 *   - PNG export emits real transparency, and
 *   - "restore" can perfectly bring pixels back by raising alpha again.
 *
 * All functions mutate `pixels.data` in place and return the bounding rect of the
 * changed region (for history + repaint), matching the convention used by the
 * brush engine and flood fill.
 */

export interface BgRemovalOptions {
  /** Color-distance threshold from the background reference (0..255-ish). */
  tolerance: number;
  /** Soft-edge width in pixels (0 = hard edge). */
  feather: number;
}

export const DEFAULT_BG_REMOVAL: BgRemovalOptions = { tolerance: 30, feather: 1.5 };

const FULL_RECT = (w: number, h: number): Rect => ({ x: 0, y: 0, width: w, height: h });

/** Per-channel median color of the 1px border ring — robust background estimate. */
function sampleBorderColor(data: Uint8ClampedArray, w: number, h: number): [number, number, number] {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const push = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    // Ignore already-transparent pixels so re-running on a cutout stays stable.
    if (data[i + 3] === 0) return;
    rs.push(data[i]);
    gs.push(data[i + 1]);
    bs.push(data[i + 2]);
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 1; y < h - 1; y++) { push(0, y); push(w - 1, y); }
  const median = (arr: number[]) => {
    if (arr.length === 0) return 0;
    arr.sort((a, b) => a - b);
    return arr[arr.length >> 1];
  };
  return [median(rs), median(gs), median(bs)];
}

export function removeBackground(pixels: ImageDataLike, opts: BgRemovalOptions): Rect {
  const w = pixels.width;
  const h = pixels.height;
  if (w === 0 || h === 0) return FULL_RECT(w, h);
  const data = pixels.data;
  const n = w * h;

  const [refR, refG, refB] = sampleBorderColor(data, w, h);
  const tol2 = opts.tolerance * opts.tolerance * 3;

  const matchesBg = (px: number): boolean => {
    const i = px * 4;
    if (data[i + 3] === 0) return true; // already transparent => treat as background
    const dr = data[i] - refR;
    const dg = data[i + 1] - refG;
    const db = data[i + 2] - refB;
    return dr * dr + dg * dg + db * db <= tol2;
  };

  // 1 = background (connected to an edge), 0 = keep.
  const bg = new Uint8Array(n);
  // Stack of pixel indices to visit (4-connected flood from the borders).
  const stack = new Int32Array(n);
  let sp = 0;

  const seed = (px: number) => {
    if (!bg[px] && matchesBg(px)) { bg[px] = 1; stack[sp++] = px; }
  };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }

  while (sp > 0) {
    const px = stack[--sp];
    const x = px % w;
    const y = (px / w) | 0;
    if (x > 0) { const p = px - 1; if (!bg[p] && matchesBg(p)) { bg[p] = 1; stack[sp++] = p; } }
    if (x < w - 1) { const p = px + 1; if (!bg[p] && matchesBg(p)) { bg[p] = 1; stack[sp++] = p; } }
    if (y > 0) { const p = px - w; if (!bg[p] && matchesBg(p)) { bg[p] = 1; stack[sp++] = p; } }
    if (y < h - 1) { const p = px + w; if (!bg[p] && matchesBg(p)) { bg[p] = 1; stack[sp++] = p; } }
  }

  // keep[px] in 0..1 — 1 where we keep the original alpha, 0 where background.
  const radius = Math.max(0, Math.round(opts.feather));
  if (radius === 0) {
    for (let px = 0; px < n; px++) {
      if (bg[px]) data[px * 4 + 3] = 0;
    }
    return FULL_RECT(w, h);
  }

  // Feather: box-blur the binary keep mask, then multiply alpha by the soft matte.
  const keep = new Float32Array(n);
  for (let px = 0; px < n; px++) keep[px] = bg[px] ? 0 : 1;
  const soft = boxBlur(keep, w, h, radius);
  for (let px = 0; px < n; px++) {
    const i = px * 4;
    data[i + 3] = Math.round(data[i + 3] * soft[px]);
  }
  return FULL_RECT(w, h);
}

/** Separable box blur with edge clamping. Returns a new buffer. */
function boxBlur(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const win = radius * 2 + 1;
  // Horizontal pass.
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += src[row + clampInt(k, 0, w - 1)];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / win;
      const add = src[row + clampInt(x + radius + 1, 0, w - 1)];
      const rem = src[row + clampInt(x - radius, 0, w - 1)];
      sum += add - rem;
    }
  }
  // Vertical pass.
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += tmp[clampInt(k, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / win;
      const add = tmp[clampInt(y + radius + 1, 0, h - 1) * w + x];
      const rem = tmp[clampInt(y - radius, 0, h - 1) * w + x];
      sum += add - rem;
    }
  }
  return out;
}

function clampInt(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Magic-wand cutout edit: flood a region whose RGB matches the clicked pixel and
 * either cut it out (alpha → 0) or restore it (alpha → 255). RGB is preserved by
 * every cutout op, so restore re-reveals the original pixels.
 *
 * `contiguous` true = only the connected region under the cursor; false = every
 * matching pixel in the layer.
 */
export function floodAlphaRegion(
  pixels: ImageDataLike,
  start: { x: number; y: number },
  tolerance: number,
  contiguous: boolean,
  mode: 'cut' | 'restore',
): Rect {
  const w = pixels.width;
  const h = pixels.height;
  const sx = Math.floor(start.x);
  const sy = Math.floor(start.y);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return { x: 0, y: 0, width: 0, height: 0 };

  const data = pixels.data;
  const targetAlpha = mode === 'cut' ? 0 : 255;
  const si = (sy * w + sx) * 4;
  const seedR = data[si];
  const seedG = data[si + 1];
  const seedB = data[si + 2];
  const tol2 = tolerance * tolerance * 3;

  const matches = (px: number): boolean => {
    const i = px * 4;
    const dr = data[i] - seedR;
    const dg = data[i + 1] - seedG;
    const db = data[i + 2] - seedB;
    return dr * dr + dg * dg + db * db <= tol2;
  };

  let minX = w, minY = h, maxX = -1, maxY = -1;
  const mark = (px: number) => {
    data[px * 4 + 3] = targetAlpha;
    const x = px % w;
    const y = (px / w) | 0;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  if (!contiguous) {
    for (let px = 0; px < w * h; px++) if (matches(px)) mark(px);
  } else {
    const visited = new Uint8Array(w * h);
    const stack = new Int32Array(w * h);
    let sp = 0;
    const start0 = sy * w + sx;
    if (!matches(start0)) return { x: 0, y: 0, width: 0, height: 0 };
    visited[start0] = 1;
    stack[sp++] = start0;
    while (sp > 0) {
      const px = stack[--sp];
      mark(px);
      const x = px % w;
      const y = (px / w) | 0;
      if (x > 0) { const p = px - 1; if (!visited[p] && matches(p)) { visited[p] = 1; stack[sp++] = p; } }
      if (x < w - 1) { const p = px + 1; if (!visited[p] && matches(p)) { visited[p] = 1; stack[sp++] = p; } }
      if (y > 0) { const p = px - w; if (!visited[p] && matches(p)) { visited[p] = 1; stack[sp++] = p; } }
      if (y < h - 1) { const p = px + w; if (!visited[p] && matches(p)) { visited[p] = 1; stack[sp++] = p; } }
    }
  }

  if (maxX < minX) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
