/** Retry delays after a failed upload: 30 s, 2 min, 10 min, then every 30 min. */
export function retryDelayMs(attempts: number): number {
  return [30_000, 120_000, 600_000][attempts - 1] ?? 1_800_000;
}

/** Days until a link expires, rounded up; 0 once it has; null when unknown. */
export function daysLeft(expiresAt: number | null, now = Date.now()): number | null {
  if (expiresAt === null) return null;
  return Math.max(0, Math.ceil((expiresAt - now) / 86_400_000));
}
