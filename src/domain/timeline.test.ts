import { buildPlan, finalLengthS, fitWindow, formatLength, roundTenth, slowFactor } from './timeline';

// The reference app's own readout for these settings: "Total duration: 0:46 @ 60fps, 0:58 @ 120fps, 1:22 @ 240fps".
const reference = { recordS: 20, slowmoStartS: 8.8, slowmoDurationS: 3, reverse: true };

describe('final length', () => {
  it.each([
    [60, '0:46'],
    [120, '0:58'],
    [240, '1:22'],
  ])('matches the reference app at %i fps', (fps, shown) => {
    expect(formatLength(finalLengthS(reference, fps))).toBe(shown);
  });

  it('is exact, not just rounded to the same second', () => {
    expect(finalLengthS(reference, 60)).toBeCloseTo(46, 9);
    expect(finalLengthS(reference, 120)).toBeCloseTo(58, 9);
    expect(finalLengthS(reference, 240)).toBeCloseTo(82, 9);
  });

  it('halves without reverse', () => {
    expect(finalLengthS({ ...reference, reverse: false }, 240)).toBeCloseTo(41, 9);
  });

  it('has no slow motion at 30 fps or below', () => {
    expect(slowFactor(30)).toBe(1);
    expect(slowFactor(24)).toBe(1);
    expect(finalLengthS({ ...reference, reverse: false }, 30)).toBeCloseTo(20, 9);
    expect(buildPlan(reference, 30).segments).toEqual([{ srcStartS: 0, srcEndS: 20, stretch: 1 }]);
  });
});

describe('segments', () => {
  it('cuts normal, slow, normal', () => {
    const plan = buildPlan(reference, 240);
    expect(plan.segments).toHaveLength(3);
    expect(plan.segments[0]).toEqual({ srcStartS: 0, srcEndS: 8.8, stretch: 1 });
    expect(plan.segments[1]?.srcStartS).toBe(8.8);
    expect(plan.segments[1]?.srcEndS).toBeCloseTo(11.8, 9);
    expect(plan.segments[1]?.stretch).toBe(8);
    expect(plan.segments[2]?.srcStartS).toBeCloseTo(11.8, 9);
    expect(plan.segments[2]?.srcEndS).toBe(20);
    expect(plan).toMatchObject({ reverse: true, outputFps: 30 });
    expect(plan.forwardS).toBeCloseTo(41, 9);
  });

  it('drops the leading normal part when slow motion starts at 0', () => {
    const plan = buildPlan({ ...reference, slowmoStartS: 0 }, 120);
    expect(plan.segments.map((s) => s.stretch)).toEqual([4, 1]);
  });

  it('drops the trailing normal part when slow motion runs to the end', () => {
    const plan = buildPlan({ ...reference, slowmoStartS: 17 }, 120);
    expect(plan.segments.map((s) => s.stretch)).toEqual([1, 4]);
    expect(plan.segments[1]?.srcEndS).toBe(20);
  });

  it('is one real-time segment when slow motion is off', () => {
    const plan = buildPlan({ ...reference, slowmoDurationS: 0 }, 240);
    expect(plan.segments).toEqual([{ srcStartS: 0, srcEndS: 20, stretch: 1 }]);
    expect(plan.totalS).toBeCloseTo(40, 9);
  });

  it('covers the whole take with no gaps or overlaps', () => {
    for (const fps of [30, 60, 120, 240]) {
      for (const start of [0, 0.5, 3, 8.8, 19.5, 20]) {
        for (const duration of [0, 0.5, 3, 20]) {
          const { segments } = buildPlan(
            { recordS: 20, slowmoStartS: start, slowmoDurationS: duration, reverse: false },
            fps,
          );
          expect(segments[0]?.srcStartS).toBe(0);
          expect(segments[segments.length - 1]?.srcEndS).toBe(20);
          segments.slice(1).forEach((s, i) => expect(s.srcStartS).toBeCloseTo(segments[i]!.srcEndS, 9));
        }
      }
    }
  });
});

describe('early stop', () => {
  it('trims the slow-motion window to the recorded length', () => {
    const plan = buildPlan(reference, 240, 10);
    expect(plan.segments.map((s) => [s.srcStartS, roundTenth(s.srcEndS), s.stretch])).toEqual([
      [0, 8.8, 1],
      [8.8, 10, 8],
    ]);
  });

  it('has no slow motion when stopped before the window starts', () => {
    const plan = buildPlan(reference, 240, 5);
    expect(plan.segments).toEqual([{ srcStartS: 0, srcEndS: 5, stretch: 1 }]);
    expect(plan.totalS).toBeCloseTo(10, 9);
  });

  it('ignores a recording that ran past the planned length', () => {
    expect(buildPlan(reference, 240, 20.4).segments.at(-1)?.srcEndS).toBe(20);
  });
});

describe('fitWindow', () => {
  it('leaves a window that fits untouched', () => {
    expect(fitWindow({ slowmoStartS: 8.8, slowmoDurationS: 3 }, 20)).toEqual({
      slowmoStartS: 8.8,
      slowmoDurationS: 3,
    });
  });

  it('moves the window left before shrinking it', () => {
    expect(fitWindow({ slowmoStartS: 8.8, slowmoDurationS: 3 }, 10)).toEqual({
      slowmoStartS: 7,
      slowmoDurationS: 3,
    });
  });

  it('shrinks the window only when the take is shorter than it', () => {
    expect(fitWindow({ slowmoStartS: 8.8, slowmoDurationS: 3 }, 2)).toEqual({
      slowmoStartS: 0,
      slowmoDurationS: 2,
    });
  });

  it('rounds to tenths', () => {
    expect(fitWindow({ slowmoStartS: 0.1 + 0.2, slowmoDurationS: 1 }, 5)).toEqual({
      slowmoStartS: 0.3,
      slowmoDurationS: 1,
    });
  });
});

describe('formatLength', () => {
  it.each([
    [0, '0:00'],
    [9.4, '0:09'],
    [9.5, '0:10'],
    [59.6, '1:00'],
    [82, '1:22'],
    [725, '12:05'],
    [-3, '0:00'],
  ])('%d s → %s', (seconds, shown) => expect(formatLength(seconds)).toBe(shown));
});
