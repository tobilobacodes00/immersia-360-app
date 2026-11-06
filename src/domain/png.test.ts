import { isPortraitVideoShape, readPngInfo } from './png';

/** A minimal PNG byte sequence: signature, IHDR, optional extra chunks, IDAT, IEND (CRCs are not checked). */
function png(width: number, height: number, colorType: number, extra: string[] = []): Uint8Array {
  const chunk = (type: string, data: number[] = []) => {
    const length = [24, 16, 8, 0].map((s) => (data.length >>> s) & 0xff);
    return [...length, ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
  };
  const u32 = (n: number) => [24, 16, 8, 0].map((s) => (n >>> s) & 0xff);
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk('IHDR', [...u32(width), ...u32(height), 8, colorType, 0, 0, 0]),
    ...extra.flatMap((type) => chunk(type, [0])),
    ...chunk('IDAT', [1, 2, 3]),
    ...chunk('IEND'),
  ]);
}

describe('readPngInfo', () => {
  it('reads the size of an RGBA PNG and sees its alpha channel', () => {
    expect(readPngInfo(png(1080, 1920, 6))).toEqual({ width: 1080, height: 1920, hasTransparency: true });
    expect(readPngInfo(png(10, 10, 4))?.hasTransparency).toBe(true);
  });

  it('sees no transparency in an RGB PNG without tRNS', () => {
    expect(readPngInfo(png(1080, 1920, 2))?.hasTransparency).toBe(false);
  });

  it('sees transparency from a tRNS chunk (palette PNGs)', () => {
    expect(readPngInfo(png(100, 100, 3, ['PLTE', 'tRNS']))?.hasTransparency).toBe(true);
    expect(readPngInfo(png(100, 100, 3, ['PLTE']))?.hasTransparency).toBe(false);
  });

  it('rejects files that are not PNGs', () => {
    expect(readPngInfo(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(40).fill(0)]))).toBeNull();
    expect(readPngInfo(new Uint8Array(4))).toBeNull();
  });
});

describe('isPortraitVideoShape', () => {
  it('accepts 9:16 and near it, rejects other shapes', () => {
    expect(isPortraitVideoShape(1080, 1920)).toBe(true);
    expect(isPortraitVideoShape(1081, 1920)).toBe(true);
    expect(isPortraitVideoShape(1080, 1080)).toBe(false);
    expect(isPortraitVideoShape(1920, 1080)).toBe(false);
  });
});
