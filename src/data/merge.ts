type Plain = Record<string, unknown>;

const isPlain = (v: unknown): v is Plain => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Applies only what changed between `base` and `edited` onto `latest`.
 *
 * The Settings screen edits a draft. While it is open, other screens (Sharing, Overlays) may save settings of
 * their own. Saving the whole draft would silently undo those; this keeps them and applies the draft's own
 * edits on top. Plain objects are compared key by key; anything else (numbers, strings, arrays, null, a preset
 * object replaced as a whole) is one value.
 */
export function mergeChanges<T>(base: T, edited: T, latest: T): T {
  if (Object.is(base, edited)) return latest;
  if (!isPlain(base) || !isPlain(edited) || !isPlain(latest))
    return equalValues(base, edited) ? latest : edited;

  const out: Plain = { ...latest };
  for (const key of new Set([...Object.keys(base), ...Object.keys(edited)])) {
    out[key] = mergeChanges(base[key], edited[key], latest[key]);
  }
  return out as T;
}

function equalValues(a: unknown, b: unknown): boolean {
  return Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b);
}
