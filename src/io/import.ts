import type { Document } from '@/core/types';
import { createDocument, createRasterLayer } from '@/core/document';
import { uid } from '@/core/id';

const SUPPORTED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/tiff',
  'image/svg+xml',
]);

export function isSupportedMime(mime: string): boolean {
  return SUPPORTED_MIME.has(mime);
}

/**
 * Decode a File or Blob into a new Document. Uses the platform's `createImageBitmap`
 * (fast, off-thread) and falls back to <img> + canvas for SVGs.
 */
export async function importImageAsDocument(file: File | Blob, name?: string): Promise<Document> {
  const fname = name ?? (file instanceof File ? file.name : 'Untitled');
  const baseName = fname.replace(/\.[^.]+$/, '');

  let bitmap: ImageBitmap;
  if (file.type === 'image/svg+xml') {
    bitmap = await decodeSvg(file);
  } else {
    bitmap = await createImageBitmap(file);
  }

  const w = bitmap.width;
  const h = bitmap.height;
  const off = new OffscreenCanvas(w, h);
  const ctx = off.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, w, h);
  bitmap.close();

  const doc = createDocument(w, h, baseName);
  // Replace the default white background with the imported image.
  doc.layers = [
    {
      ...createRasterLayer(w, h, baseName || 'Image'),
      id: uid('l_'),
      pixels: { width: w, height: h, data: new Uint8ClampedArray(imageData.data) },
    },
  ];
  doc.activeLayerId = doc.layers[0].id;
  return doc;
}

async function decodeSvg(file: Blob): Promise<ImageBitmap> {
  const text = await file.text();
  const img = new Image();
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to decode SVG'));
    img.src = url;
  });
  // Render at 2x for crispness; user can resize after.
  const w = img.naturalWidth || 1024;
  const h = img.naturalHeight || 1024;
  const off = new OffscreenCanvas(w, h);
  off.getContext('2d')!.drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(url);
  return off.transferToImageBitmap();
}

export async function importFromClipboard(): Promise<Document | null> {
  if (!navigator.clipboard?.read) return null;
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      for (const type of item.types) {
        if (isSupportedMime(type)) {
          const blob = await item.getType(type);
          return importImageAsDocument(blob, 'Pasted');
        }
      }
    }
  } catch {
    // permission denied or no image
  }
  return null;
}
