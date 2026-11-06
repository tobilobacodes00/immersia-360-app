import { roundTenth, type SlowmoWindow } from './timeline';

/** What a drag on the timeline strip is doing, decided where the finger first lands. */
export type DragMode = 'move' | 'start' | 'end';

/** Shortest window the edges can be dragged to; the duration stepper can still go to 0 (off). */
export const MIN_DRAG_DURATION_S = 0.5;
/** Drags snap to this grid. */
export const DRAG_SNAP_S = 0.1;

/**
 * Picks the drag mode for a touch at `touchS` seconds along the strip. `edgeS` is how close (in seconds) a
 * touch must be to an edge to grab it; on a narrow window the nearer edge wins. A touch outside the window
 * moves the window there (centred on the finger) and then drags it.
 */
export function pickDragMode(
  window: SlowmoWindow,
  touchS: number,
  edgeS: number,
  recordS: number,
): { mode: DragMode; window: SlowmoWindow } {
  const start = window.slowmoStartS;
  const end = start + window.slowmoDurationS;
  const nearStart = Math.abs(touchS - start) <= edgeS;
  const nearEnd = Math.abs(touchS - end) <= edgeS;
  if (nearStart && nearEnd) return { mode: touchS <= (start + end) / 2 ? 'start' : 'end', window };
  if (nearStart) return { mode: 'start', window };
  if (nearEnd) return { mode: 'end', window };
  if (touchS > start && touchS < end) return { mode: 'move', window };
  return { mode: 'move', window: centreWindowAt(window, touchS, recordS) };
}

/**
 * The window after dragging by `deltaS` seconds from `initial`, kept inside [0, recordS], snapped to 0.1 s.
 * Moving keeps the duration; dragging an edge keeps the other edge fixed.
 */
export function dragWindow(
  mode: DragMode,
  initial: SlowmoWindow,
  deltaS: number,
  recordS: number,
): SlowmoWindow {
  const snap = (v: number) => roundTenth(Math.round(v / DRAG_SNAP_S) * DRAG_SNAP_S);
  const start = initial.slowmoStartS;
  const end = start + initial.slowmoDurationS;

  if (mode === 'move') {
    const duration = initial.slowmoDurationS;
    const next = snap(clamp(start + deltaS, 0, recordS - duration));
    return { slowmoStartS: next, slowmoDurationS: roundTenth(duration) };
  }
  const minDuration = Math.min(MIN_DRAG_DURATION_S, initial.slowmoDurationS || MIN_DRAG_DURATION_S, recordS);
  if (mode === 'start') {
    const next = snap(clamp(start + deltaS, 0, end - minDuration));
    return { slowmoStartS: next, slowmoDurationS: roundTenth(end - next) };
  }
  const next = snap(clamp(end + deltaS, start + minDuration, recordS));
  return { slowmoStartS: roundTenth(start), slowmoDurationS: roundTenth(next - start) };
}

/** Where a tap outside the window puts it: centred on the finger, kept inside the take. */
export function centreWindowAt(window: SlowmoWindow, touchS: number, recordS: number): SlowmoWindow {
  const duration = window.slowmoDurationS;
  const start = clamp(touchS - duration / 2, 0, recordS - duration);
  return {
    slowmoStartS: roundTenth(Math.round(start / DRAG_SNAP_S) * DRAG_SNAP_S),
    slowmoDurationS: duration,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
