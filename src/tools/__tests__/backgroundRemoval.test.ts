import { describe, expect, it } from 'vitest';
import type { ImageDataLike } from '@/core/types';
import { removeBackground, floodAlphaRegion } from '../backgroundRemoval';

/**
 * Build a w×h image of solid `bg`, then paint a centered square of `fg`.
 * Returns the image plus the inclusive bounds of the square (for assertions).
 */
function bgWithCenterSquare(
  w: number,
  h: number,
  bg: [number, number, number],
  fg: [number, number, number],
  squareSize: number,
): { img: ImageDataLike; x0: number; y0: number; x1: number; y1: number } {
  const data = new Uint8ClampedArray(w * h * 4);
  const x0 = ((w - squareSize) / 2) | 0;
  const y0 = ((h - squareSize) / 2) | 0;
  const x1 = x0 + squareSize - 1;
  const y1 = y0 + squareSize - 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const inside = x >= x0 && x <= x1 && y >= y0 && y <= y1;
      const c = inside ? fg : bg;
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
    }
  }
  return { img: { width: w, height: h, data }, x0, y0, x1, y1 };
}

const alphaAt = (img: ImageDataLike, x: number, y: number) => img.data[(y * img.width + x) * 4 + 3];

describe('removeBackground', () => {
  it('makes the connected background transparent and keeps the subject opaque', () => {
    const { img, x0, y0 } = bgWithCenterSquare(40, 40, [255, 0, 0], [0, 200, 0], 12);
    removeBackground(img, { tolerance: 30, feather: 0 });

    // Corners (background) are fully transparent.
    expect(alphaAt(img, 0, 0)).toBe(0);
    expect(alphaAt(img, 39, 39)).toBe(0);
    // Subject center stays opaque.
    expect(alphaAt(img, x0 + 6, y0 + 6)).toBe(255);
  });

  it('preserves RGB so a cutout can be restored', () => {
    const { img } = bgWithCenterSquare(20, 20, [255, 255, 255], [10, 20, 30], 8);
    removeBackground(img, { tolerance: 20, feather: 0 });
    // A background pixel: alpha cleared but RGB untouched.
    const i = (0 * 20 + 0) * 4;
    expect(img.data[i + 3]).toBe(0);
    expect(img.data[i]).toBe(255);
    expect(img.data[i + 1]).toBe(255);
    expect(img.data[i + 2]).toBe(255);
  });

  it('does not remove an interior region that merely shares the background color', () => {
    // Background red, subject square also red but enclosed by a green ring -> the
    // inner red must survive because it is not connected to the border.
    const w = 30, h = 30;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const onRing = x >= 10 && x <= 19 && y >= 10 && y <= 19 &&
          (x === 10 || x === 19 || y === 10 || y === 19);
        const innerRed = x >= 11 && x <= 18 && y >= 11 && y <= 18;
        const c = onRing ? [0, 255, 0] : innerRed ? [255, 0, 0] : [255, 0, 0];
        data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
      }
    }
    const img: ImageDataLike = { width: w, height: h, data };
    removeBackground(img, { tolerance: 20, feather: 0 });
    expect(alphaAt(img, 0, 0)).toBe(0);        // outer red removed
    expect(alphaAt(img, 14, 14)).toBe(255);    // inner red kept (ring-protected)
  });
});

describe('floodAlphaRegion', () => {
  it('cuts a connected region to transparent', () => {
    const { img } = bgWithCenterSquare(20, 20, [255, 0, 0], [0, 0, 255], 8);
    floodAlphaRegion(img, { x: 0, y: 0 }, 20, true, 'cut');
    expect(alphaAt(img, 0, 0)).toBe(0);
    // The blue square (different color, not flooded) stays opaque.
    expect(alphaAt(img, 10, 10)).toBe(255);
  });

  it('restores a previously cut region', () => {
    const { img } = bgWithCenterSquare(20, 20, [255, 0, 0], [0, 0, 255], 8);
    floodAlphaRegion(img, { x: 0, y: 0 }, 20, true, 'cut');
    expect(alphaAt(img, 0, 0)).toBe(0);
    floodAlphaRegion(img, { x: 0, y: 0 }, 20, true, 'restore');
    expect(alphaAt(img, 0, 0)).toBe(255);
  });
});
