/**
 * Byte sizes the way iOS shows them (Files, Settings > Storage): decimal units, one decimal place,
 * "87.3 MB", "41.2 GB". Under 10 MB keeps the decimal too ("4.5 MB"); whole KB below 1 MB.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (Math.round(bytes / 1e3) < 1e3) return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
  // Decide the unit after rounding, so 999.96 MB reads "1 GB", not "1000 MB".
  if (Math.round(bytes / 1e5) < 1e4) return `${trim(bytes / 1e6)} MB`;
  return `${trim(bytes / 1e9)} GB`;
}

function trim(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** Seconds as the settings rows show them: "20.0", "8.8". */
export function formatSeconds(seconds: number): string {
  return seconds.toFixed(1);
}
