import { centreWindowAt, dragWindow, pickDragMode } from './timeline-drag';

const w = { slowmoStartS: 8.8, slowmoDurationS: 3 };

describe('pickDragMode', () => {
  it('grabs an edge near it, the body inside, and recentres on a touch outside', () => {
    expect(pickDragMode(w, 8.9, 0.5, 20).mode).toBe('start');
    expect(pickDragMode(w, 11.6, 0.5, 20).mode).toBe('end');
    expect(pickDragMode(w, 10, 0.5, 20)).toEqual({ mode: 'move', window: w });
    expect(pickDragMode(w, 2, 0.5, 20)).toEqual({
      mode: 'move',
      window: { slowmoStartS: 0.5, slowmoDurationS: 3 },
    });
  });

  it('picks the nearer edge on a window narrower than the grab zone', () => {
    const narrow = { slowmoStartS: 5, slowmoDurationS: 0.5 };
    expect(pickDragMode(narrow, 5.1, 0.6, 20).mode).toBe('start');
    expect(pickDragMode(narrow, 5.4, 0.6, 20).mode).toBe('end');
  });
});

describe('dragWindow', () => {
  it('moves the window and keeps its length, inside the take', () => {
    expect(dragWindow('move', w, 1.04, 20)).toEqual({ slowmoStartS: 9.8, slowmoDurationS: 3 });
    expect(dragWindow('move', w, -50, 20)).toEqual({ slowmoStartS: 0, slowmoDurationS: 3 });
    expect(dragWindow('move', w, 50, 20)).toEqual({ slowmoStartS: 17, slowmoDurationS: 3 });
  });

  it('drags the start edge with the end fixed', () => {
    expect(dragWindow('start', w, -1.83, 20)).toEqual({ slowmoStartS: 7, slowmoDurationS: 4.8 });
    expect(dragWindow('start', w, 10, 20)).toEqual({ slowmoStartS: 11.3, slowmoDurationS: 0.5 });
  });

  it('drags the end edge with the start fixed', () => {
    expect(dragWindow('end', w, 2.27, 20)).toEqual({ slowmoStartS: 8.8, slowmoDurationS: 5.3 });
    expect(dragWindow('end', w, 50, 20)).toEqual({ slowmoStartS: 8.8, slowmoDurationS: 11.2 });
    expect(dragWindow('end', w, -50, 20)).toEqual({ slowmoStartS: 8.8, slowmoDurationS: 0.5 });
  });

  it('can pull a window out of an off (zero-length) slow motion', () => {
    expect(dragWindow('end', { slowmoStartS: 4, slowmoDurationS: 0 }, 2, 20)).toEqual({
      slowmoStartS: 4,
      slowmoDurationS: 2,
    });
  });
});

describe('centreWindowAt', () => {
  it('centres on the touch and stays inside the take', () => {
    expect(centreWindowAt(w, 10, 20)).toEqual({ slowmoStartS: 8.5, slowmoDurationS: 3 });
    expect(centreWindowAt(w, 19.9, 20)).toEqual({ slowmoStartS: 17, slowmoDurationS: 3 });
  });
});
