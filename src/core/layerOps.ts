import type { Document, Layer, ImageDataLike, Rect } from './types';
import { findLayerIndex } from './document';

/**
 * Pure-functional layer operations. Each returns a new Document; the caller is
 * responsible for tracking the change in history. We deep-update only what changed
 * so React's structural-eq checks stay cheap.
 */

export function addLayer(doc: Document, layer: Layer, atIndex = 0): Document {
  const layers = [...doc.layers];
  layers.splice(atIndex, 0, layer);
  return { ...doc, layers, activeLayerId: layer.id, modifiedAt: Date.now() };
}

export function removeLayerById(doc: Document, id: string): Document {
  const idx = findLayerIndex(doc.layers, id);
  if (idx < 0) return doc;
  const layers = [...doc.layers];
  layers.splice(idx, 1);
  const activeLayerId = doc.activeLayerId === id
    ? (layers[idx]?.id ?? layers[idx - 1]?.id ?? null)
    : doc.activeLayerId;
  return { ...doc, layers, activeLayerId, modifiedAt: Date.now() };
}

export function reorderLayer(doc: Document, fromIndex: number, toIndex: number): Document {
  if (fromIndex === toIndex) return doc;
  const layers = [...doc.layers];
  const [moved] = layers.splice(fromIndex, 1);
  layers.splice(toIndex, 0, moved);
  return { ...doc, layers, modifiedAt: Date.now() };
}

export function patchLayer(doc: Document, id: string, patch: Partial<Layer>): Document {
  const layers = doc.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l));
  return { ...doc, layers, modifiedAt: Date.now() };
}

export function duplicateLayer(doc: Document, id: string): Document {
  const idx = findLayerIndex(doc.layers, id);
  if (idx < 0) return doc;
  const src = doc.layers[idx];
  if (src.kind !== 'raster') return doc;
  const clone: Layer = {
    ...src,
    id: src.id + '_copy',
    name: `${src.name} copy`,
    pixels: {
      width: src.pixels.width,
      height: src.pixels.height,
      data: new Uint8ClampedArray(src.pixels.data),
    },
  };
  return addLayer(doc, clone, idx);
}

export function setActiveLayer(doc: Document, id: string | null): Document {
  return { ...doc, activeLayerId: id };
}

// ---- Pixel-buffer ops ----

export function copyPixelTile(
  src: ImageDataLike,
  rect: Rect,
): ImageDataLike {
  const w = Math.max(0, Math.min(src.width - rect.x, rect.width));
  const h = Math.max(0, Math.min(src.height - rect.y, rect.height));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const srcRow = ((rect.y + y) * src.width + rect.x) * 4;
    const dstRow = y * w * 4;
    out.set(src.data.subarray(srcRow, srcRow + w * 4), dstRow);
  }
  return { width: w, height: h, data: out };
}

export function pasteTile(
  dst: ImageDataLike,
  tile: ImageDataLike,
  x: number,
  y: number,
): void {
  for (let py = 0; py < tile.height; py++) {
    const dy = y + py;
    if (dy < 0 || dy >= dst.height) continue;
    for (let px = 0; px < tile.width; px++) {
      const dx = x + px;
      if (dx < 0 || dx >= dst.width) continue;
      const si = (py * tile.width + px) * 4;
      const di = (dy * dst.width + dx) * 4;
      dst.data[di] = tile.data[si];
      dst.data[di + 1] = tile.data[si + 1];
      dst.data[di + 2] = tile.data[si + 2];
      dst.data[di + 3] = tile.data[si + 3];
    }
  }
}
