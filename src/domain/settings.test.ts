import { DEFAULT_SETTINGS, parseSettings } from './settings';

describe('settings', () => {
  it('has the documented defaults', () => {
    expect(DEFAULT_SETTINGS.recording).toEqual({
      countdownS: 3,
      recordS: 10,
      slowmoStartS: 3,
      slowmoDurationS: 3,
      reverse: true,
      autoStartS: 0,
      tapAnywhere: true,
      countdownBeep: false,
      showFrameOnCamera: true,
    });
    expect(DEFAULT_SETTINGS.camera.position).toBe('back');
    expect(DEFAULT_SETTINGS.camera.back).toEqual({
      lensId: null,
      preset: null,
      quality: 'high',
      stabilization: 'off',
      mirror: false,
    });
    expect(DEFAULT_SETTINGS.output.size).toBe('1080p');
    expect(DEFAULT_SETTINGS.storage).toEqual({ saveOriginals: true, autoSaveToPhotos: false });
    expect(DEFAULT_SETTINGS.booth.idleReturnS).toBe(60);
    expect(DEFAULT_SETTINGS.sharing).toEqual({
      enabled: false,
      linkExpiryDays: 30,
      wifiOnly: false,
      showQrAfterTake: true,
    });
    expect(DEFAULT_SETTINGS.onboardingDone).toBe(false);
  });

  it('never throws, whatever is stored', () => {
    for (const junk of [undefined, null, 42, 'x', [], { recording: 'nope' }, { camera: { back: 7 } }]) {
      expect(() => parseSettings(junk)).not.toThrow();
      expect(parseSettings(junk).recording.recordS).toBe(10);
    }
  });

  it('resets only the damaged field', () => {
    const s = parseSettings({
      recording: { recordS: 'twelve', countdownS: 5 },
      storage: { saveOriginals: false },
    });
    expect(s.recording.recordS).toBe(10);
    expect(s.recording.countdownS).toBe(5);
    expect(s.storage).toEqual({ saveOriginals: false, autoSaveToPhotos: false });
  });

  it('pulls out-of-range times into range and rounds them to tenths', () => {
    const s = parseSettings({ recording: { recordS: 45, countdownS: -2, slowmoStartS: 1.2345 } });
    expect(s.recording.recordS).toBe(20);
    expect(s.recording.countdownS).toBe(0);
    expect(s.recording.slowmoStartS).toBe(1.2);
  });

  it('rejects choices that are not offered', () => {
    const s = parseSettings({
      recording: { autoStartS: 7 },
      booth: { idleReturnS: 45 },
      sharing: { linkExpiryDays: 365 },
    });
    expect(s.recording.autoStartS).toBe(0);
    expect(s.booth.idleReturnS).toBe(60);
    expect(s.sharing.linkExpiryDays).toBe(30);
  });

  it('keeps the slow-motion window inside the take', () => {
    const s = parseSettings({ recording: { recordS: 6, slowmoStartS: 8.8, slowmoDurationS: 3 } });
    expect(s.recording).toMatchObject({ recordS: 6, slowmoStartS: 3, slowmoDurationS: 3 });
  });

  it('round-trips through JSON', () => {
    const changed = parseSettings({
      ...DEFAULT_SETTINGS,
      recording: { ...DEFAULT_SETTINGS.recording, reverse: false },
    });
    expect(parseSettings(JSON.parse(JSON.stringify(changed)))).toEqual(changed);
  });

  it('keeps a chosen preset and lens', () => {
    const s = parseSettings({
      camera: {
        position: 'front',
        front: {
          lensId: 'com.apple.avfoundation.avcapturedevice.built-in_video:1',
          preset: { width: 1280, height: 720, fps: 60 },
        },
      },
    });
    expect(s.camera.position).toBe('front');
    expect(s.camera.front.preset).toEqual({ width: 1280, height: 720, fps: 60 });
    expect(s.camera.front.quality).toBe('high');
  });
});
