import { HttpError } from './http';

/** Throws 401 unless the request carries `Authorization: Bearer <SHARING_KEY>`. Constant-time comparison. */
export function requireOwner(request: Request, env: Env): void {
  const header = request.headers.get('authorization') ?? '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!env.SHARING_KEY || !timingSafeEqual(given, env.SHARING_KEY)) {
    throw new HttpError(401, 'The sharing key was not accepted.');
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  // Compare equal-length buffers so the time does not reveal the length either.
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < length; i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}
