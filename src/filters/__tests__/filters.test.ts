import { describe, expect, it } from 'vitest';
import { brightnessContrast, invert, blackAndWhite, levels, gaussianBlur, hueSaturation } from '..';

function makeImg(w: number, h: number, fill: [number, number, number, number]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0]; data[i + 1] = fill[1]; data[i + 2] = fill[2]; data[i + 3] = fill[3];
  }
  return { width: w, height: h, data };
}

describe('filters', () => {
  it('inverts colors', () => {
    const img = makeImg(2, 2, [10, 20, 30, 255]);
    invert.apply(img, {});
    expect(img.data[0]).toBe(245);
  });

  it('converts to grayscale', () => {
    const img = makeImg(2, 2, [200, 100, 50, 255]);
    blackAndWhite.apply(img, {});
    expect(img.data[0]).toBe(img.data[1]);
    expect(img.data[1]).toBe(img.data[2]);
  });

  it('brightens', () => {
    const img = makeImg(1, 1, [100, 100, 100, 255]);
    brightnessContrast.apply(img, { brightness: 50, contrast: 0 });
    expect(img.data[0]).toBeGreaterThan(100);
  });

  it('clamps levels white', () => {
    const img = makeImg(1, 1, [128, 128, 128, 255]);
    levels.apply(img, { black: 0, white: 128, gamma: 1 });
    expect(img.data[0]).toBe(255);
  });

  it('blurs without altering image dimensions', () => {
    const img = makeImg(8, 8, [100, 100, 100, 255]);
    const out = gaussianBlur.apply(img, { radius: 2 });
    expect(out.width).toBe(8);
    expect(out.height).toBe(8);
  });

  it('shifts hue by 360 degrees back to original', () => {
    const img = makeImg(1, 1, [200, 100, 50, 255]);
    const before = [img.data[0], img.data[1], img.data[2]];
    hueSaturation.apply(img, { hue: 180, saturation: 0, lightness: 0 });
    hueSaturation.apply(img, { hue: 180, saturation: 0, lightness: 0 });
    // Within rounding error after two 180° shifts.
    expect(Math.abs(img.data[0] - before[0])).toBeLessThan(3);
  });
});
