import {
  canAdjustCamera,
  captureReducer,
  initialCapture,
  type CaptureEvent,
  type CapturePhase,
} from './machine';

const run = (events: CaptureEvent[], from: CapturePhase = initialCapture) =>
  events.reduce(captureReducer, from);

describe('capture flow', () => {
  it('counts down, records and saves', () => {
    const steps: CaptureEvent[] = [
      { type: 'trigger', countdownS: 3 },
      { type: 'tick', countdownS: 3 },
      { type: 'tick', countdownS: 3 },
    ];
    expect(run(steps)).toEqual({ phase: 'countdown', remaining: 1 });
    expect(run([...steps, { type: 'tick', countdownS: 3 }])).toEqual({ phase: 'starting' });
    expect(
      run([
        ...steps,
        { type: 'tick', countdownS: 3 },
        { type: 'recordingStarted', at: 1000 },
        { type: 'recordingFinished' },
        { type: 'saved', takeId: 't1' },
      ]),
    ).toEqual({ phase: 'saved', takeId: 't1' });
  });

  it('skips the countdown when it is off', () => {
    expect(run([{ type: 'trigger', countdownS: 0 }])).toEqual({ phase: 'starting' });
  });

  it('cancels a countdown on a second tap', () => {
    expect(
      run([
        { type: 'trigger', countdownS: 3 },
        { type: 'trigger', countdownS: 3 },
      ]),
    ).toEqual({ phase: 'idle' });
  });

  it('stops early on a tap while recording, and still saves', () => {
    const recording = run([
      { type: 'trigger', countdownS: 0 },
      { type: 'recordingStarted', at: 5 },
    ]);
    expect(captureReducer(recording, { type: 'trigger', countdownS: 3 })).toEqual({
      phase: 'stopping',
      startedAt: 5,
    });
    expect(run([{ type: 'trigger', countdownS: 3 }, { type: 'recordingFinished' }], recording)).toEqual({
      phase: 'saving',
    });
  });

  it('ignores taps while the camera is starting, stopping or saving', () => {
    for (const state of [
      { phase: 'starting' },
      { phase: 'stopping', startedAt: 1 },
      { phase: 'saving' },
    ] as CapturePhase[]) {
      expect(captureReducer(state, { type: 'trigger', countdownS: 3 })).toBe(state);
    }
  });

  it('auto-starts into the normal countdown, and a tap cancels it', () => {
    const opened = run([{ type: 'opened', autoStartS: 2 }]);
    expect(opened).toEqual({ phase: 'autoStart', remaining: 2 });
    expect(
      run(
        [
          { type: 'tick', countdownS: 3 },
          { type: 'tick', countdownS: 3 },
        ],
        opened,
      ),
    ).toEqual({
      phase: 'countdown',
      remaining: 3,
    });
    expect(run([{ type: 'trigger', countdownS: 3 }], opened)).toEqual({ phase: 'idle' });
  });

  it('does nothing on open when auto-start is off, or when already busy', () => {
    expect(run([{ type: 'opened', autoStartS: 0 }])).toEqual(initialCapture);
    const busy: CapturePhase = { phase: 'recording', startedAt: 1 };
    expect(captureReducer(busy, { type: 'opened', autoStartS: 5 })).toBe(busy);
  });

  it('ignores camera events that arrive in the wrong phase', () => {
    expect(captureReducer(initialCapture, { type: 'recordingStarted', at: 1 })).toBe(initialCapture);
    expect(captureReducer(initialCapture, { type: 'recordingFinished' })).toBe(initialCapture);
    expect(captureReducer(initialCapture, { type: 'saved', takeId: 'x' })).toBe(initialCapture);
  });

  it('goes to error from anywhere and resets to idle', () => {
    const failed = run([
      { type: 'trigger', countdownS: 0 },
      { type: 'failed', message: 'Camera unavailable' },
    ]);
    expect(failed).toEqual({ phase: 'error', message: 'Camera unavailable' });
    expect(captureReducer(failed, { type: 'reset' })).toEqual(initialCapture);
  });

  it('only lets the camera be adjusted when idle', () => {
    expect(canAdjustCamera(initialCapture)).toBe(true);
    expect(canAdjustCamera({ phase: 'countdown', remaining: 2 })).toBe(false);
    expect(canAdjustCamera({ phase: 'recording', startedAt: 0 })).toBe(false);
  });
});
