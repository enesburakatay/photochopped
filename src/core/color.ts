import type { RGBA, HSL } from './types';

export const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 1 };
export const WHITE: RGBA = { r: 255, g: 255, b: 255, a: 1 };
export const TRANSPARENT: RGBA = { r: 0, g: 0, b: 0, a: 0 };

export function rgbaToCss(c: RGBA): string {
  return `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${c.a})`;
}

export function rgbaToHex(c: RGBA): string {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(c.r | 0)}${h(c.g | 0)}${h(c.b | 0)}`;
}

export function hexToRgba(hex: string, alpha = 1): RGBA {
  const m = hex.replace('#', '');
  const v = m.length === 3
    ? m.split('').map((ch) => ch + ch).join('')
    : m.padEnd(6, '0');
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16),
    a: alpha,
  };
}

export function rgbToHsl({ r, g, b }: { r: number; g: number; b: number }): HSL {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)); break;
      case gn: h = ((bn - rn) / d + 2); break;
      case bn: h = ((rn - gn) / d + 4); break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

export function hslToRgb({ h, s, l }: HSL): { r: number; g: number; b: number } {
  const hh = h / 360;
  const ss = s / 100;
  const ll = l / 100;
  if (ss === 0) {
    const v = Math.round(ll * 255);
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  return {
    r: Math.round(hue2rgb(p, q, hh + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, hh) * 255),
    b: Math.round(hue2rgb(p, q, hh - 1 / 3) * 255),
  };
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
