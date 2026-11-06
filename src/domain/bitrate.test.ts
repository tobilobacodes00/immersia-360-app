import { recordingBitrate } from './bitrate';

describe('recordingBitrate', () => {
  it('scales with pixels and frame rate', () => {
    expect(recordingBitrate(1920, 1080, 240, 'medium')).toBe(34_836_480);
    expect(recordingBitrate(1920, 1080, 120, 'medium')).toBe(17_418_240);
  });

  it('orders low < medium < high', () => {
    const [low, medium, high] = (['low', 'medium', 'high'] as const).map((q) =>
      recordingBitrate(1920, 1080, 240, q),
    );
    expect(low).toBeLessThan(medium!);
    expect(medium).toBeLessThan(high!);
  });

  it('keeps a floor and a ceiling', () => {
    expect(recordingBitrate(1280, 720, 30, 'low')).toBe(4e6);
    expect(recordingBitrate(3840, 2160, 120, 'high')).toBe(100e6);
  });
});
