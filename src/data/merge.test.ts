import { mergeChanges } from './merge';

describe('mergeChanges', () => {
  const base = {
    a: { x: 1, y: 2 },
    b: { on: false },
    preset: { w: 1920, fps: 240 } as { w: number; fps: number } | null,
  };

  it('returns latest when nothing was edited', () => {
    const latest = { ...base, b: { on: true } };
    expect(mergeChanges(base, structuredClone(base), latest)).toEqual(latest);
  });

  it('keeps changes made elsewhere and applies the draft edits on top', () => {
    const edited = { ...base, a: { x: 5, y: 2 } };
    const latest = { ...base, b: { on: true } };
    expect(mergeChanges(base, edited, latest)).toEqual({
      a: { x: 5, y: 2 },
      b: { on: true },
      preset: base.preset,
    });
  });

  it('lets the draft win on the same field', () => {
    const edited = { ...base, a: { x: 5, y: 2 } };
    const latest = { ...base, a: { x: 9, y: 3 } };
    expect(mergeChanges(base, edited, latest)).toEqual({ ...base, a: { x: 5, y: 3 } });
  });

  it('replaces values that became null or came back from null', () => {
    expect(mergeChanges(base, { ...base, preset: null }, base).preset).toBeNull();
    const fromNull: typeof base = { ...base, preset: null };
    expect(mergeChanges(fromNull, { ...fromNull, preset: { w: 1280, fps: 60 } }, fromNull).preset).toEqual({
      w: 1280,
      fps: 60,
    });
  });

  it('treats an equal but re-created value as unchanged', () => {
    const latest = { ...base, preset: { w: 3840, fps: 60 } };
    expect(mergeChanges(base, { ...base, preset: { w: 1920, fps: 240 } }, latest).preset).toEqual({
      w: 3840,
      fps: 60,
    });
  });
});
