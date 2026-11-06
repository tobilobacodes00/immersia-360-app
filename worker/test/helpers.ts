import { env, SELF } from 'cloudflare:test';

export const ORIGIN = 'https://share.test';
export const KEY = 'test-sharing-key';

export function call(path: string, init: RequestInit = {}, auth = true): Promise<Response> {
  const headers = new Headers(init.headers);
  if (auth) headers.set('authorization', `Bearer ${KEY}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return SELF.fetch(`${ORIGIN}${path}`, { ...init, headers });
}

export const post = (path: string, body?: unknown, auth = true) =>
  call(path, { method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, auth);

export type CreatedShare = {
  id: string;
  url: string;
  videoUploadUrl: string;
  thumbUploadUrl: string;
  expiresAt: number;
};

export async function createShare(overrides: Record<string, unknown> = {}): Promise<CreatedShare> {
  const res = await post('/api/shares', {
    expiryDays: 30,
    album: 'Wedding',
    takenAt: 1_700_000_000_000,
    bytes: 1234,
    ...overrides,
  });
  if (res.status !== 201) throw new Error(`createShare: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Stands in for the phone's direct-to-R2 upload. */
export async function uploadVideo(id: string, bytes: Uint8Array): Promise<void> {
  const meta = (await (await env.VIDEOS.get(`m/${id}.json`))!.json()) as {
    videoKey: string;
    thumbKey: string;
  };
  await env.VIDEOS.put(meta.videoKey, bytes, { httpMetadata: { contentType: 'video/mp4' } });
  await env.VIDEOS.put(meta.thumbKey, new Uint8Array([0xff, 0xd8, 0xff]), {
    httpMetadata: { contentType: 'image/jpeg' },
  });
}

export async function readyShare(
  bytes = new Uint8Array(100).map((_, i) => i),
  overrides: Record<string, unknown> = {},
): Promise<CreatedShare> {
  const share = await createShare(overrides);
  await uploadVideo(share.id, bytes);
  const done = await post(`/api/shares/${share.id}/complete`);
  if (done.status !== 200) throw new Error(`complete: ${done.status}`);
  return share;
}

/** Rewrites a share's expiry, to test expired links without waiting 30 days. */
export async function expire(id: string): Promise<void> {
  const key = `m/${id}.json`;
  const meta = (await (await env.VIDEOS.get(key))!.json()) as Record<string, unknown>;
  await env.VIDEOS.put(key, JSON.stringify({ ...meta, expiresAt: Date.now() - 1000 }));
}
