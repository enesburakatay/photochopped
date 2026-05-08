/**
 * ICO encoder — wraps a single PNG image in an ICO container. Modern Windows /
 * macOS / browsers all decode PNG-in-ICO. Max dimension 256 (the format stores
 * width/height as a single byte, where 0 means 256).
 *
 * Caller passes a PNG Blob (typically obtained from canvas.convertToBlob); we
 * prepend the 6-byte ICONDIR + 16-byte ICONDIRENTRY headers.
 */
export async function encodeICO(width: number, height: number, pngBlob: Blob): Promise<Blob> {
  if (width > 256 || height > 256) {
    throw new Error('ICO format requires width and height ≤ 256 px. Resize the document first.');
  }
  const png = new Uint8Array(await pngBlob.arrayBuffer());
  const headerSize = 6 + 16;
  const buf = new ArrayBuffer(headerSize + png.length);
  const view = new DataView(buf);
  let o = 0;

  // ICONDIR
  view.setUint16(o, 0, true); o += 2;          // reserved
  view.setUint16(o, 1, true); o += 2;          // type 1 = ICO (2 = CUR)
  view.setUint16(o, 1, true); o += 2;          // image count

  // ICONDIRENTRY
  view.setUint8(o++, width === 256 ? 0 : width);
  view.setUint8(o++, height === 256 ? 0 : height);
  view.setUint8(o++, 0);                       // color count (0 for ≥ 8 bpp)
  view.setUint8(o++, 0);                       // reserved
  view.setUint16(o, 1, true); o += 2;          // color planes
  view.setUint16(o, 32, true); o += 2;         // bits per pixel
  view.setUint32(o, png.length, true); o += 4; // image size in bytes
  view.setUint32(o, headerSize, true); o += 4; // image data offset

  new Uint8Array(buf, headerSize).set(png);
  return new Blob([buf], { type: 'image/x-icon' });
}
