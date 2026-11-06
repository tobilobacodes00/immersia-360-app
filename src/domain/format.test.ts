import { formatBytes, formatSeconds } from './format';

describe('formatBytes', () => {
  it.each([
    [0, '0 KB'],
    [-5, '0 KB'],
    [Number.NaN, '0 KB'],
    [200, '1 KB'],
    [512_000, '512 KB'],
    [4_500_000, '4.5 MB'],
    [87_300_000, '87.3 MB'],
    [88_000_000, '88 MB'],
    [999_960_000, '1 GB'],
    [999_600, '1 MB'],
    [41_234_000_000, '41.2 GB'],
  ])('%d → %s', (bytes, shown) => expect(formatBytes(bytes)).toBe(shown));
});

describe('formatSeconds', () => {
  it('always shows one decimal, like the reference', () => {
    expect(formatSeconds(20)).toBe('20.0');
    expect(formatSeconds(8.8)).toBe('8.8');
  });
});
