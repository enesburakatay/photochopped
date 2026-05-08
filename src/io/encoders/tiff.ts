/**
 * Baseline TIFF encoder — uncompressed RGBA, little-endian.
 *
 * Layout (offsets are bytes from start of file):
 *   0    Header (8 bytes)         "II" magic + version 42 + IFD offset
 *   8    Pixel data (W*H*4 bytes) raw RGBA, top-down by row
 *   ...  IFD count (uint16)
 *        IFD entries (12 bytes × N)
 *        Next IFD pointer (uint32 = 0)
 *        Trailing data referenced by IFD (BitsPerSample, X/YResolution)
 *
 * Tags emitted are the minimum baseline set required by spec for an RGBA image
 * plus ResolutionUnit and ExtraSamples (alpha = 1 = associated alpha).
 */
export function encodeTIFF(width: number, height: number, rgba: Uint8ClampedArray): Blob {
  const headerSize = 8;
  const pixelSize = width * height * 4;
  const ifdStart = headerSize + pixelSize;

  // Trailing-data layout planned upfront so we know offsets.
  const numEntries = 13;
  const ifdSize = 2 + numEntries * 12 + 4;
  const trailingStart = ifdStart + ifdSize;
  const bitsPerSampleOffset = trailingStart;          // 4 × uint16 = 8 bytes
  const xResolutionOffset = bitsPerSampleOffset + 8;  // RATIONAL = 8 bytes
  const yResolutionOffset = xResolutionOffset + 8;    // RATIONAL = 8 bytes
  const totalSize = yResolutionOffset + 8;

  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);
  let o = 0;

  // -- TIFF header --
  view.setUint8(o++, 0x49); // 'I'
  view.setUint8(o++, 0x49); // 'I' (little-endian byte order)
  view.setUint16(o, 42, true); o += 2;       // magic
  view.setUint32(o, ifdStart, true); o += 4; // first IFD offset

  // -- Pixel data: rgba is already RGBA top-down --
  new Uint8Array(buf, headerSize, pixelSize).set(rgba);

  // -- IFD --
  o = ifdStart;
  view.setUint16(o, numEntries, true); o += 2;

  // Helper to write a 12-byte IFD entry. type: 3=SHORT, 4=LONG, 5=RATIONAL.
  const entry = (tag: number, type: number, count: number, value: number) => {
    view.setUint16(o, tag, true); o += 2;
    view.setUint16(o, type, true); o += 2;
    view.setUint32(o, count, true); o += 4;
    // Value field: 4 bytes; for SHORT count=1 we write low 16 bits + 0 padding.
    if (type === 3 && count === 1) {
      view.setUint16(o, value, true);
      view.setUint16(o + 2, 0, true);
    } else {
      view.setUint32(o, value, true);
    }
    o += 4;
  };

  entry(256, 4, 1, width);                    // ImageWidth
  entry(257, 4, 1, height);                   // ImageLength
  entry(258, 3, 4, bitsPerSampleOffset);      // BitsPerSample = [8,8,8,8]
  entry(259, 3, 1, 1);                        // Compression = 1 (none)
  entry(262, 3, 1, 2);                        // PhotometricInterpretation = 2 (RGB)
  entry(273, 4, 1, headerSize);               // StripOffsets = pixel data start
  entry(277, 3, 1, 4);                        // SamplesPerPixel = 4
  entry(278, 4, 1, height);                   // RowsPerStrip
  entry(279, 4, 1, pixelSize);                // StripByteCounts
  entry(282, 5, 1, xResolutionOffset);        // XResolution
  entry(283, 5, 1, yResolutionOffset);        // YResolution
  entry(296, 3, 1, 2);                        // ResolutionUnit = 2 (inch)
  entry(338, 3, 1, 1);                        // ExtraSamples = 1 (associated alpha)

  view.setUint32(o, 0, true); o += 4;         // Next IFD offset = 0

  // -- Trailing data --
  // BitsPerSample [8,8,8,8]
  o = bitsPerSampleOffset;
  view.setUint16(o, 8, true); o += 2;
  view.setUint16(o, 8, true); o += 2;
  view.setUint16(o, 8, true); o += 2;
  view.setUint16(o, 8, true); o += 2;
  // XResolution = 72/1
  view.setUint32(o, 72, true); o += 4;
  view.setUint32(o, 1, true); o += 4;
  // YResolution = 72/1
  view.setUint32(o, 72, true); o += 4;
  view.setUint32(o, 1, true); o += 4;

  return new Blob([buf], { type: 'image/tiff' });
}
