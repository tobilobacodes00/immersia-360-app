export type PngInfo = { width: number; height: number; hasTransparency: boolean };

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Reads a PNG's size and whether it can be transparent, from its header chunks alone (no decoding).
 * Transparent: an alpha channel (colour types 4 and 6), or a `tRNS` chunk (palette or single-colour
 * transparency). `null` for anything that is not a PNG.
 */
export function readPngInfo(bytes: Uint8Array): PngInfo | null {
  if (bytes.length < 33 || SIGNATURE.some((b, i) => bytes[i] !== b)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (chunkType(bytes, 12) !== 'IHDR') return null;
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const colorType = bytes[25]!;
  if (width === 0 || height === 0) return null;

  let hasTransparency = colorType === 4 || colorType === 6;
  // Walk the chunks before the image data looking for tRNS.
  let offset = 8;
  while (!hasTransparency && offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = chunkType(bytes, offset + 4);
    if (type === 'tRNS') hasTransparency = true;
    if (type === 'IDAT' || type === 'IEND') break;
    offset += 12 + length;
  }
  return { width, height, hasTransparency };
}

function chunkType(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(bytes[at]!, bytes[at + 1]!, bytes[at + 2]!, bytes[at + 3]!);
}

/** Portrait video is 9:16; a frame more than 2% off it gets cropped at the edges. */
export function isPortraitVideoShape(width: number, height: number): boolean {
  return Math.abs(width / height - 9 / 16) <= 0.02 * (9 / 16);
}
