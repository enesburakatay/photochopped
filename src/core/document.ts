import type {
  Document,
  Layer,
  RasterLayer,
  GroupLayer,
  Size,
  RGBA,
  ImageDataLike,
  Selection,
} from './types';
import { uid } from './id';
import { WHITE } from './color';

export function createImageDataLike(width: number, height: number): ImageDataLike {
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
  };
}

export function fillImageDataLike(img: ImageDataLike, color: RGBA): void {
  const { r, g, b, a } = color;
  const aByte = Math.round(a * 255);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = r;
    img.data[i + 1] = g;
    img.data[i + 2] = b;
    img.data[i + 3] = aByte;
  }
}

export function cloneImageDataLike(img: ImageDataLike): ImageDataLike {
  return {
    width: img.width,
    height: img.height,
    data: new Uint8ClampedArray(img.data),
  };
}

export function createRasterLayer(
  width: number,
  height: number,
  name = 'Layer',
  fill?: RGBA,
): RasterLayer {
  const pixels = createImageDataLike(width, height);
  if (fill) fillImageDataLike(pixels, fill);
  return {
    id: uid('l_'),
    kind: 'raster',
    name,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    x: 0,
    y: 0,
    pixels,
    mask: null,
  };
}

export function createGroupLayer(name = 'Group'): GroupLayer {
  return {
    id: uid('g_'),
    kind: 'group',
    name,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    x: 0,
    y: 0,
    collapsed: false,
    children: [],
    mask: null,
  };
}

export function createDocument(
  width: number,
  height: number,
  name = 'Untitled',
  background: RGBA = WHITE,
): Document {
  const bg = createRasterLayer(width, height, 'Background', background);
  bg.locked = true;
  return {
    id: uid('d_'),
    name,
    width,
    height,
    background,
    dpi: 72,
    layers: [bg],
    activeLayerId: bg.id,
    selection: null,
    colorProfile: 'srgb',
    modifiedAt: Date.now(),
    savedAt: null,
  };
}

// ---- Layer tree helpers ----

export function findLayer(layers: Layer[], id: string): Layer | null {
  for (const layer of layers) {
    if (layer.id === id) return layer;
    if (layer.kind === 'group') {
      const found = findLayer(layer.children, id);
      if (found) return found;
    }
  }
  return null;
}

export function findLayerIndex(layers: Layer[], id: string): number {
  return layers.findIndex((l) => l.id === id);
}

export function flattenLayers(layers: Layer[]): Layer[] {
  const out: Layer[] = [];
  const walk = (ls: Layer[]) => {
    for (const l of ls) {
      out.push(l);
      if (l.kind === 'group') walk(l.children);
    }
  };
  walk(layers);
  return out;
}

export function nextLayerName(layers: Layer[], base = 'Layer'): string {
  const all = flattenLayers(layers);
  let n = all.length;
  let candidate = `${base} ${n + 1}`;
  const used = new Set(all.map((l) => l.name));
  while (used.has(candidate)) {
    n++;
    candidate = `${base} ${n + 1}`;
  }
  return candidate;
}

export function isDirty(doc: Document): boolean {
  return doc.savedAt === null || doc.modifiedAt > doc.savedAt;
}

// ---- Selection helpers ----

export function selectionFromRect(rect: { x: number; y: number; width: number; height: number }): Selection {
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  const mask = new Uint8ClampedArray(w * h);
  mask.fill(255);
  return {
    bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: w, height: h },
    mask,
  };
}

export function selectionFromEllipse(rect: { x: number; y: number; width: number; height: number }): Selection {
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  const mask = new Uint8ClampedArray(w * h);
  const rx = w / 2;
  const ry = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - rx) / rx;
      const dy = (y + 0.5 - ry) / ry;
      const d = dx * dx + dy * dy;
      if (d <= 1) mask[y * w + x] = 255;
    }
  }
  return { bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: w, height: h }, mask };
}

export function isPointSelected(sel: Selection | null, x: number, y: number): number {
  if (!sel) return 255; // no selection => entire canvas selected
  const lx = x - sel.bounds.x;
  const ly = y - sel.bounds.y;
  if (lx < 0 || ly < 0 || lx >= sel.bounds.width || ly >= sel.bounds.height) return 0;
  return sel.mask[ly * sel.bounds.width + lx];
}

export function ensureDocumentSize(doc: Document, width: number, height: number): Size {
  return { width: Math.max(1, width), height: Math.max(1, height) };
}
