/** "share.example.com/" or "http://x" → "https://share.example.com". Returns null for anything unusable. */
export function normaliseServer(input: string): string | null {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') return null; // keys never travel unencrypted
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}
