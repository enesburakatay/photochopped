import type { Document } from '@/core/types';
import { Compositor } from '@/engine/compositor';

export type ExportFormat = 'png' | 'jpeg' | 'webp';

export interface ExportOptions {
  format: ExportFormat;
  quality?: number; // 0..1 for jpeg/webp
}

/**
 * Composite the document and emit a Blob in the requested format.
 * Quality is ignored for PNG.
 */
export async function exportDocument(doc: Document, opts: ExportOptions): Promise<Blob> {
  const compositor = new Compositor();
  const off = compositor.render(doc);
  const blob = await off.convertToBlob({
    type: `image/${opts.format}`,
    quality: opts.quality ?? 0.92,
  });
  compositor.dispose();
  return blob;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyDocumentToClipboard(doc: Document): Promise<boolean> {
  if (!navigator.clipboard?.write) return false;
  try {
    const blob = await exportDocument(doc, { format: 'png' });
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob }),
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Project format (.pchop) — JSON wrapper around the Document with pixel buffers
 * base64-encoded. Plain JSON keeps the format inspectable; binary attachment via
 * a multi-part container is a Phase 2 improvement.
 */
export async function exportProjectFile(doc: Document): Promise<Blob> {
  const serial = serializeDocument(doc);
  const json = JSON.stringify(serial);
  return new Blob([json], { type: 'application/json' });
}

export async function importProjectFile(file: File | Blob): Promise<Document> {
  const text = await file.text();
  const obj = JSON.parse(text);
  return deserializeDocument(obj);
}

function serializeDocument(doc: Document): unknown {
  return {
    version: 1,
    id: doc.id,
    name: doc.name,
    width: doc.width,
    height: doc.height,
    background: doc.background,
    dpi: doc.dpi,
    colorProfile: doc.colorProfile,
    activeLayerId: doc.activeLayerId,
    selection: doc.selection
      ? { bounds: doc.selection.bounds, mask: encodeBytes(doc.selection.mask) }
      : null,
    layers: doc.layers.map(serializeLayer),
  };
}

function serializeLayer(l: import('@/core/types').Layer): unknown {
  const base = {
    id: l.id,
    name: l.name,
    visible: l.visible,
    locked: l.locked,
    opacity: l.opacity,
    blendMode: l.blendMode,
    x: l.x,
    y: l.y,
    kind: l.kind,
  };
  if (l.kind === 'raster') {
    return {
      ...base,
      pixels: { width: l.pixels.width, height: l.pixels.height, data: encodeBytes(l.pixels.data) },
    };
  }
  if (l.kind === 'group') {
    return { ...base, collapsed: l.collapsed, children: l.children.map(serializeLayer) };
  }
  return base;
}

function deserializeDocument(obj: any): Document {
  return {
    id: obj.id,
    name: obj.name,
    width: obj.width,
    height: obj.height,
    background: obj.background,
    dpi: obj.dpi,
    colorProfile: obj.colorProfile,
    activeLayerId: obj.activeLayerId,
    selection: obj.selection
      ? { bounds: obj.selection.bounds, mask: decodeBytes(obj.selection.mask) }
      : null,
    layers: obj.layers.map(deserializeLayer),
    modifiedAt: Date.now(),
    savedAt: Date.now(),
  };
}

function deserializeLayer(o: any): import('@/core/types').Layer {
  if (o.kind === 'raster') {
    return {
      kind: 'raster',
      id: o.id,
      name: o.name,
      visible: o.visible,
      locked: o.locked,
      opacity: o.opacity,
      blendMode: o.blendMode,
      x: o.x,
      y: o.y,
      pixels: { width: o.pixels.width, height: o.pixels.height, data: decodeBytes(o.pixels.data) },
      mask: null,
    };
  }
  if (o.kind === 'group') {
    return {
      kind: 'group',
      id: o.id,
      name: o.name,
      visible: o.visible,
      locked: o.locked,
      opacity: o.opacity,
      blendMode: o.blendMode,
      x: o.x,
      y: o.y,
      collapsed: o.collapsed,
      children: o.children.map(deserializeLayer),
      mask: null,
    };
  }
  // Fallback for unsupported layer kinds in this build
  return {
    kind: 'raster',
    id: o.id,
    name: o.name,
    visible: o.visible,
    locked: o.locked,
    opacity: o.opacity,
    blendMode: o.blendMode,
    x: o.x,
    y: o.y,
    pixels: { width: 1, height: 1, data: new Uint8ClampedArray(4) },
    mask: null,
  };
}

function encodeBytes(bytes: Uint8ClampedArray | Uint8Array): string {
  // Base64-encode in chunks to avoid stack overflow on large buffers.
  let out = '';
  const chunk = 32768;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(out);
}

function decodeBytes(b64: string): Uint8ClampedArray {
  const bin = atob(b64);
  const out = new Uint8ClampedArray(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
