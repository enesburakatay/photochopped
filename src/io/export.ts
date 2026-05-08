import type { Document } from '@/core/types';
import { Compositor } from '@/engine/compositor';
import { encodeBMP } from './encoders/bmp';
import { encodeTIFF } from './encoders/tiff';
import { encodeICO } from './encoders/ico';

export type ExportFormat =
  | 'png'
  | 'jpeg'
  | 'webp'
  | 'avif'   // native via convertToBlob in modern browsers
  | 'bmp'    // custom encoder, full alpha
  | 'tiff'   // custom encoder, uncompressed RGBA
  | 'ico';   // PNG-in-ICO container, ≤256 px

/** Format metadata used by the export dialog. */
export const EXPORT_FORMATS: Array<{
  id: ExportFormat;
  label: string;
  ext: string;
  hasQuality: boolean;
  notes?: string;
}> = [
  { id: 'png',  label: 'PNG (lossless, transparency)', ext: 'png',  hasQuality: false },
  { id: 'jpeg', label: 'JPEG (lossy, no transparency)', ext: 'jpg', hasQuality: true },
  { id: 'webp', label: 'WebP (lossy, transparency)',    ext: 'webp', hasQuality: true },
  { id: 'avif', label: 'AVIF (lossy, modern, smaller)', ext: 'avif', hasQuality: true, notes: 'May not be supported in all browsers.' },
  { id: 'bmp',  label: 'BMP (uncompressed, transparency)', ext: 'bmp', hasQuality: false },
  { id: 'tiff', label: 'TIFF (uncompressed RGBA)',       ext: 'tif', hasQuality: false },
  { id: 'ico',  label: 'ICO (Windows icon, ≤256 px)',     ext: 'ico', hasQuality: false },
];

export interface ExportOptions {
  format: ExportFormat;
  quality?: number; // 0..1 for jpeg/webp/avif
}

/**
 * Composite the document and emit a Blob in the requested format. Native formats
 * go through OffscreenCanvas.convertToBlob; the rest run our custom encoders on
 * the composited RGBA buffer.
 */
export async function exportDocument(doc: Document, opts: ExportOptions): Promise<Blob> {
  const compositor = new Compositor();
  const off = compositor.render(doc);
  let blob: Blob;
  try {
    if (opts.format === 'png' || opts.format === 'jpeg' || opts.format === 'webp' || opts.format === 'avif') {
      blob = await off.convertToBlob({ type: `image/${opts.format}`, quality: opts.quality ?? 0.92 });
      // convertToBlob silently falls back to PNG when a format is unsupported;
      // detect that and surface a clear error rather than mislabeling the file.
      if (opts.format === 'avif' && blob.type !== 'image/avif') {
        throw new Error('AVIF export is not supported by this browser. Try PNG or WebP instead.');
      }
    } else {
      const ctx = off.getContext('2d')!;
      const id = ctx.getImageData(0, 0, off.width, off.height);
      if (opts.format === 'bmp') {
        blob = encodeBMP(off.width, off.height, id.data);
      } else if (opts.format === 'tiff') {
        blob = encodeTIFF(off.width, off.height, id.data);
      } else { // ico
        const png = await off.convertToBlob({ type: 'image/png' });
        blob = await encodeICO(off.width, off.height, png);
      }
    }
  } finally {
    compositor.dispose();
  }
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
