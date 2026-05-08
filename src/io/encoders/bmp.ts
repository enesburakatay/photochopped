/**
 * BMP encoder — 32 bpp BITMAPV5HEADER with full alpha (BI_BITFIELDS).
 *
 * Browsers don't natively support BMP via canvas.toBlob, so we serialize the
 * format ourselves. V5 is widely understood by viewers and preserves the alpha
 * channel via explicit RGBA bit masks. Rows are bottom-up by convention.
 */
export function encodeBMP(width: number, height: number, rgba: Uint8ClampedArray): Blob {
  const fileHeaderSize = 14;
  const infoHeaderSize = 124; // BITMAPV5HEADER
  const headerSize = fileHeaderSize + infoHeaderSize;
  const rowSize = width * 4;          // 32 bpp, no padding needed
  const pixelSize = rowSize * height;
  const total = headerSize + pixelSize;

  const buf = new ArrayBuffer(total);
  const view = new DataView(buf);
  let o = 0;

  // -- BITMAPFILEHEADER --
  view.setUint8(o++, 0x42);                  // 'B'
  view.setUint8(o++, 0x4D);                  // 'M'
  view.setUint32(o, total, true); o += 4;
  view.setUint16(o, 0, true); o += 2;        // reserved1
  view.setUint16(o, 0, true); o += 2;        // reserved2
  view.setUint32(o, headerSize, true); o += 4; // pixel data offset

  // -- BITMAPV5HEADER --
  view.setUint32(o, infoHeaderSize, true); o += 4;
  view.setInt32(o, width, true); o += 4;
  view.setInt32(o, -height, true); o += 4;   // negative height = top-down rows
  view.setUint16(o, 1, true); o += 2;        // planes
  view.setUint16(o, 32, true); o += 2;       // bpp
  view.setUint32(o, 3, true); o += 4;        // BI_BITFIELDS = 3 (enables alpha)
  view.setUint32(o, pixelSize, true); o += 4;
  view.setInt32(o, 2835, true); o += 4;      // X PPM (~72 dpi)
  view.setInt32(o, 2835, true); o += 4;      // Y PPM
  view.setUint32(o, 0, true); o += 4;        // colors used
  view.setUint32(o, 0, true); o += 4;        // important colors
  // Channel masks — BGRA layout in memory.
  view.setUint32(o, 0x00FF0000, true); o += 4; // R mask
  view.setUint32(o, 0x0000FF00, true); o += 4; // G mask
  view.setUint32(o, 0x000000FF, true); o += 4; // B mask
  view.setUint32(o, 0xFF000000, true); o += 4; // A mask
  // CSType = 'BGRs' (sRGB) when read as 4 ASCII chars in big-endian order.
  // Stored as little-endian uint32 so we write the bytes 'B','G','R','s' = 0x73524742.
  view.setUint32(o, 0x73524742, true); o += 4;
  // CIEXYZTRIPLE Endpoints (36 bytes) — zero-fill is acceptable when CSType != PROFILE_*
  for (let i = 0; i < 36; i++) view.setUint8(o++, 0);
  view.setUint32(o, 0, true); o += 4;        // GammaRed
  view.setUint32(o, 0, true); o += 4;        // GammaGreen
  view.setUint32(o, 0, true); o += 4;        // GammaBlue
  view.setUint32(o, 4, true); o += 4;        // Intent: LCS_GM_IMAGES (perceptual)
  view.setUint32(o, 0, true); o += 4;        // ProfileData
  view.setUint32(o, 0, true); o += 4;        // ProfileSize
  view.setUint32(o, 0, true); o += 4;        // Reserved

  // -- Pixel data: RGBA -> BGRA, top-down (we set negative height above) --
  const out = new Uint8Array(buf, headerSize);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 4) {
    out[j]     = rgba[i + 2]; // B
    out[j + 1] = rgba[i + 1]; // G
    out[j + 2] = rgba[i];     // R
    out[j + 3] = rgba[i + 3]; // A
  }
  return new Blob([buf], { type: 'image/bmp' });
}
