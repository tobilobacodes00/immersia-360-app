import { daysLeft, retryDelayMs } from './sharing';

describe('retryDelayMs', () => {
  it('backs off, then settles at 30 minutes', () => {
    expect([1, 2, 3, 4, 9].map(retryDelayMs)).toEqual([30_000, 120_000, 600_000, 1_800_000, 1_800_000]);
  });
});

describe('daysLeft', () => {
  const now = Date.UTC(2026, 10, 6, 12);
  it('rounds up, never below zero', () => {
    expect(daysLeft(now + 30 * 86_400_000, now)).toBe(30);
    expect(daysLeft(now + 1, now)).toBe(1);
    expect(daysLeft(now - 5, now)).toBe(0);
    expect(daysLeft(null, now)).toBeNull();
  });
});
