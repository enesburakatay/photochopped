import type { ImageDataLike } from '@/core/types';
import { clamp } from '@/core/color';

/**
 * Filter pipeline.
 *
 * All filters are pure functions over ImageDataLike that mutate in place
 * (returning the modified buffer) so they can be composed cheaply. This file
 * implements the canonical CPU implementations; the same set will get GPU shader
 * implementations in Phase 2 (signature stays identical).
 */

export interface FilterDescriptor<P> {
  id: string;
  name: string;
  defaults: P;
  apply: (img: ImageDataLike, params: P) => ImageDataLike;
}

// ---------- Brightness / Contrast ----------
export interface BrightnessContrastParams {
  brightness: number; // -100..100
  contrast: number;   // -100..100
}

export const brightnessContrast: FilterDescriptor<BrightnessContrastParams> = {
  id: 'brightness-contrast',
  name: 'Brightness/Contrast',
  defaults: { brightness: 0, contrast: 0 },
  apply(img, { brightness, contrast }) {
    const b = brightness * 2.55;
    const c = (contrast + 100) / 100;
    const offset = 128 - 128 * c;
    const data = img.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = clamp(data[i] * c + offset + b, 0, 255);
      data[i + 1] = clamp(data[i + 1] * c + offset + b, 0, 255);
      data[i + 2] = clamp(data[i + 2] * c + offset + b, 0, 255);
    }
    return img;
  },
};

// ---------- Hue / Saturation / Lightness ----------
export interface HueSatParams {
  hue: number;        // -180..180
  saturation: number; // -100..100
  lightness: number;  // -100..100
}

export const hueSaturation: FilterDescriptor<HueSatParams> = {
  id: 'hue-saturation',
  name: 'Hue/Saturation',
  defaults: { hue: 0, saturation: 0, lightness: 0 },
  apply(img, { hue, saturation, lightness }) {
    const data = img.data;
    const hShift = hue / 360;
    const sShift = saturation / 100;
    const lShift = lightness / 100;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h = 0, s = 0;
      const l = (max + min) / 2;
      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
          case g: h = ((b - r) / d + 2); break;
          default: h = ((r - g) / d + 4); break;
        }
        h /= 6;
      }
      h = (h + hShift + 1) % 1;
      s = clamp(s + sShift, 0, 1);
      const ll = clamp(l + lShift, 0, 1);
      const hslR = hslToComponent(h, s, ll, 0);
      const hslG = hslToComponent(h, s, ll, 1);
      const hslB = hslToComponent(h, s, ll, 2);
      data[i] = hslR * 255;
      data[i + 1] = hslG * 255;
      data[i + 2] = hslB * 255;
    }
    return img;
  },
};

function hslToComponent(h: number, s: number, l: number, ch: number): number {
  if (s === 0) return l;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const t = ch === 0 ? h + 1 / 3 : ch === 1 ? h : h - 1 / 3;
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

// ---------- Invert ----------
export const invert: FilterDescriptor<Record<string, never>> = {
  id: 'invert',
  name: 'Invert',
  defaults: {},
  apply(img) {
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 255 - d[i];
      d[i + 1] = 255 - d[i + 1];
      d[i + 2] = 255 - d[i + 2];
    }
    return img;
  },
};

// ---------- Black & White ----------
export const blackAndWhite: FilterDescriptor<Record<string, never>> = {
  id: 'black-white',
  name: 'Black & White',
  defaults: {},
  apply(img) {
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      // ITU-R BT.709 luma
      const y = d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722;
      d[i] = d[i + 1] = d[i + 2] = y;
    }
    return img;
  },
};

// ---------- Gaussian Blur (separable) ----------
export interface BlurParams {
  radius: number; // px
}

export const gaussianBlur: FilterDescriptor<BlurParams> = {
  id: 'gaussian-blur',
  name: 'Gaussian Blur',
  defaults: { radius: 4 },
  apply(img, { radius }) {
    if (radius <= 0) return img;
    const sigma = radius / 2;
    const kernel = buildGaussianKernel(sigma);
    return separableConvolve(img, kernel);
  },
};

function buildGaussianKernel(sigma: number): Float32Array {
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const size = radius * 2 + 1;
  const k = new Float32Array(size);
  const s = 2 * sigma * sigma;
  let sum = 0;
  for (let i = 0; i < size; i++) {
    const x = i - radius;
    const v = Math.exp(-(x * x) / s);
    k[i] = v;
    sum += v;
  }
  for (let i = 0; i < size; i++) k[i] /= sum;
  return k;
}

function separableConvolve(img: ImageDataLike, kernel: Float32Array): ImageDataLike {
  const w = img.width;
  const h = img.height;
  const radius = (kernel.length - 1) / 2;
  const src = img.data;
  const tmp = new Uint8ClampedArray(src.length);
  // Horizontal pass.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = -radius; k <= radius; k++) {
        const sx = clamp(x + k, 0, w - 1) | 0;
        const i = (y * w + sx) * 4;
        const wt = kernel[k + radius];
        r += src[i] * wt;
        g += src[i + 1] * wt;
        b += src[i + 2] * wt;
        a += src[i + 3] * wt;
      }
      const di = (y * w + x) * 4;
      tmp[di] = r; tmp[di + 1] = g; tmp[di + 2] = b; tmp[di + 3] = a;
    }
  }
  // Vertical pass.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = -radius; k <= radius; k++) {
        const sy = clamp(y + k, 0, h - 1) | 0;
        const i = (sy * w + x) * 4;
        const wt = kernel[k + radius];
        r += tmp[i] * wt;
        g += tmp[i + 1] * wt;
        b += tmp[i + 2] * wt;
        a += tmp[i + 3] * wt;
      }
      const di = (y * w + x) * 4;
      src[di] = r; src[di + 1] = g; src[di + 2] = b; src[di + 3] = a;
    }
  }
  return img;
}

// ---------- Sharpen (unsharp mask) ----------
export interface SharpenParams { amount: number; }

export const sharpen: FilterDescriptor<SharpenParams> = {
  id: 'sharpen',
  name: 'Sharpen',
  defaults: { amount: 0.5 },
  apply(img, { amount }) {
    const w = img.width;
    const h = img.height;
    const src = new Uint8ClampedArray(img.data);
    const out = img.data;
    const k = amount;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        for (let c = 0; c < 3; c++) {
          const i = (y * w + x) * 4 + c;
          const v = src[i] * (1 + 4 * k)
            - src[((y - 1) * w + x) * 4 + c] * k
            - src[((y + 1) * w + x) * 4 + c] * k
            - src[(y * w + (x - 1)) * 4 + c] * k
            - src[(y * w + (x + 1)) * 4 + c] * k;
          out[i] = clamp(v, 0, 255);
        }
      }
    }
    return img;
  },
};

// ---------- Pixelate ----------
export interface PixelateParams { size: number; }

export const pixelate: FilterDescriptor<PixelateParams> = {
  id: 'pixelate',
  name: 'Pixelate',
  defaults: { size: 8 },
  apply(img, { size }) {
    const w = img.width;
    const h = img.height;
    const data = img.data;
    const block = Math.max(1, Math.floor(size));
    for (let by = 0; by < h; by += block) {
      for (let bx = 0; bx < w; bx += block) {
        let r = 0, g = 0, b = 0, a = 0, count = 0;
        for (let yy = 0; yy < block && by + yy < h; yy++) {
          for (let xx = 0; xx < block && bx + xx < w; xx++) {
            const i = ((by + yy) * w + (bx + xx)) * 4;
            r += data[i]; g += data[i + 1]; b += data[i + 2]; a += data[i + 3];
            count++;
          }
        }
        r /= count; g /= count; b /= count; a /= count;
        for (let yy = 0; yy < block && by + yy < h; yy++) {
          for (let xx = 0; xx < block && bx + xx < w; xx++) {
            const i = ((by + yy) * w + (bx + xx)) * 4;
            data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
          }
        }
      }
    }
    return img;
  },
};

// ---------- Noise ----------
export interface NoiseParams { amount: number; monochrome: boolean; }

export const noise: FilterDescriptor<NoiseParams> = {
  id: 'noise',
  name: 'Noise',
  defaults: { amount: 25, monochrome: false },
  apply(img, { amount, monochrome }) {
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (monochrome) {
        const n = (Math.random() - 0.5) * 2 * amount;
        d[i] = clamp(d[i] + n, 0, 255);
        d[i + 1] = clamp(d[i + 1] + n, 0, 255);
        d[i + 2] = clamp(d[i + 2] + n, 0, 255);
      } else {
        d[i] = clamp(d[i] + (Math.random() - 0.5) * 2 * amount, 0, 255);
        d[i + 1] = clamp(d[i + 1] + (Math.random() - 0.5) * 2 * amount, 0, 255);
        d[i + 2] = clamp(d[i + 2] + (Math.random() - 0.5) * 2 * amount, 0, 255);
      }
    }
    return img;
  },
};

// ---------- Levels ----------
export interface LevelsParams {
  black: number;  // 0..255
  white: number;  // 0..255
  gamma: number;  // 0.1..10 (1 = neutral)
}

export const levels: FilterDescriptor<LevelsParams> = {
  id: 'levels',
  name: 'Levels',
  defaults: { black: 0, white: 255, gamma: 1 },
  apply(img, { black, white, gamma }) {
    const d = img.data;
    const range = Math.max(1, white - black);
    const inv = 1 / gamma;
    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) {
      const t = clamp((i - black) / range, 0, 1);
      lut[i] = Math.pow(t, inv) * 255;
    }
    for (let i = 0; i < d.length; i += 4) {
      d[i] = lut[d[i]];
      d[i + 1] = lut[d[i + 1]];
      d[i + 2] = lut[d[i + 2]];
    }
    return img;
  },
};

export const FILTERS = [
  brightnessContrast,
  hueSaturation,
  levels,
  invert,
  blackAndWhite,
  gaussianBlur,
  sharpen,
  pixelate,
  noise,
];
