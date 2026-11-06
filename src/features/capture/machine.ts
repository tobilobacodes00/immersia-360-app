/**
 * The capture screen's flow, as a pure reducer so every transition is testable:
 *
 *   idle ──trigger──▶ countdown ──0──▶ starting ──camera started──▶ recording ──finished──▶ saving ──▶ saved
 *     ▲                  │                                              │
 *     └──trigger (cancel)┘                                   trigger (stop early)
 *
 * With auto-start on, the screen opens in `autoStart`, which counts down by itself into the normal countdown;
 * a trigger there cancels it. A countdown of 0 goes straight to `starting`.
 */

export type CapturePhase =
  | { phase: 'idle' }
  | { phase: 'autoStart'; remaining: number }
  | { phase: 'countdown'; remaining: number }
  | { phase: 'starting' }
  | { phase: 'recording'; startedAt: number }
  | { phase: 'stopping'; startedAt: number }
  | { phase: 'saving' }
  | { phase: 'saved'; takeId: string }
  | { phase: 'error'; message: string };

export type CaptureEvent =
  | { type: 'opened'; autoStartS: number }
  /** The record button, a tap anywhere on the preview, or the end of auto-start. */
  | { type: 'trigger'; countdownS: number }
  | { type: 'tick'; countdownS: number }
  | { type: 'recordingStarted'; at: number }
  | { type: 'recordingFinished' }
  | { type: 'saved'; takeId: string }
  | { type: 'failed'; message: string }
  | { type: 'reset' };

export const initialCapture: CapturePhase = { phase: 'idle' };

export function captureReducer(state: CapturePhase, event: CaptureEvent): CapturePhase {
  switch (event.type) {
    case 'opened':
      if (state.phase !== 'idle') return state;
      return event.autoStartS > 0 ? { phase: 'autoStart', remaining: event.autoStartS } : state;

    case 'trigger':
      switch (state.phase) {
        case 'idle':
          return startCountdown(event.countdownS);
        case 'autoStart':
        case 'countdown':
          return { phase: 'idle' }; // a tap during either countdown cancels it
        case 'recording':
          return { phase: 'stopping', startedAt: state.startedAt };
        default:
          return state; // starting, stopping, saving: the camera is busy, ignore taps
      }

    case 'tick':
      if (state.phase === 'autoStart') {
        return state.remaining > 1
          ? { phase: 'autoStart', remaining: state.remaining - 1 }
          : startCountdown(event.countdownS);
      }
      if (state.phase === 'countdown') {
        return state.remaining > 1
          ? { phase: 'countdown', remaining: state.remaining - 1 }
          : { phase: 'starting' };
      }
      return state;

    case 'recordingStarted':
      return state.phase === 'starting' ? { phase: 'recording', startedAt: event.at } : state;

    case 'recordingFinished':
      return state.phase === 'recording' || state.phase === 'stopping' ? { phase: 'saving' } : state;

    case 'saved':
      return state.phase === 'saving' ? { phase: 'saved', takeId: event.takeId } : state;

    case 'failed':
      return { phase: 'error', message: event.message };

    case 'reset':
      return initialCapture;
  }
}

function startCountdown(countdownS: number): CapturePhase {
  return countdownS > 0 ? { phase: 'countdown', remaining: countdownS } : { phase: 'starting' };
}

/** Whether the camera's settings (flip, lens, torch) may change: only while nothing is under way. */
export function canAdjustCamera(state: CapturePhase): boolean {
  return state.phase === 'idle' || state.phase === 'error';
}
