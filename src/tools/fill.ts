import type { ImageDataLike, RGBA, Selection, Point } from '@/core/types';
import { isPointSelected } from '@/core/document';

/**
 * Flood-fill (paint bucket) using a 4-connected scanline algorithm.
 * Tolerance 0..255 controls how close a neighbor color needs to be to fill.
 *
 * Returns the bounding rect of changed pixels (for history + repaint).
 */
export function floodFill(
  pixels: ImageDataLike,
  start: Point,
  fill: RGBA,
  tolerance: number,
  selection: Selection | null,
  contiguous: boolean,
): { x: number; y: number; width: number; height: number } {
  const w = pixels.width;
  const h = pixels.height;
  const sx = Math.floor(start.x);
  const sy = Math.floor(start.y);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return { x: 0, y: 0, width: 0, height: 0 };

  const data = pixels.data;
  const startIdx = (sy * w + sx) * 4;
  const seedR = data[startIdx];
  const seedG = data[startIdx + 1];
  const seedB = data[startIdx + 2];
  const seedA = data[startIdx + 3];

  const tol2 = tolerance * tolerance * 4;

  const fillR = fill.r;
  const fillG = fill.g;
  const fillB = fill.b;
  const fillA = Math.round(fill.a * 255);

  const matches = (i: number) => {
    const dr = data[i] - seedR;
    const dg = data[i + 1] - seedG;
    const db = data[i + 2] - seedB;
    const da = data[i + 3] - seedA;
    return dr * dr + dg * dg + db * db + da * da <= tol2;
  };

  let minX = w, minY = h, maxX = 0, maxY = 0;

  if (!contiguous) {
    // Global match.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (!matches(i)) continue;
        if (isPointSelected(selection, x, y) === 0) continue;
        data[i] = fillR;
        data[i + 1] = fillG;
        data[i + 2] = fillB;
        data[i + 3] = fillA;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  } else {
    // Scanline flood fill — iterative using a stack to avoid recursion limits.
    const visited = new Uint8Array(w * h);
    const stack: number[] = [sx, sy];
    while (stack.length) {
      const py = stack.pop()!;
      let px = stack.pop()!;
      // Move to leftmost matching pixel on this row.
      while (px >= 0 && matches((py * w + px) * 4) && !visited[py * w + px]) px--;
      px++;
      let spanAbove = false;
      let spanBelow = false;
      while (px < w && matches((py * w + px) * 4) && !visited[py * w + px]) {
        if (isPointSelected(selection, px, py) > 0) {
          const i = (py * w + px) * 4;
          data[i] = fillR;
          data[i + 1] = fillG;
          data[i + 2] = fillB;
          data[i + 3] = fillA;
        }
        visited[py * w + px] = 1;
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
        if (py > 0) {
          const above = ((py - 1) * w + px) * 4;
          if (!spanAbove && matches(above) && !visited[(py - 1) * w + px]) {
            stack.push(px, py - 1);
            spanAbove = true;
          } else if (spanAbove && !matches(above)) {
            spanAbove = false;
          }
        }
        if (py < h - 1) {
          const below = ((py + 1) * w + px) * 4;
          if (!spanBelow && matches(below) && !visited[(py + 1) * w + px]) {
            stack.push(px, py + 1);
            spanBelow = true;
          } else if (spanBelow && !matches(below)) {
            spanBelow = false;
          }
        }
        px++;
      }
    }
  }
  if (minX > maxX) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
