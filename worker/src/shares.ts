import type { BoothHub } from './hub';
import { HttpError, json, readJson } from './http';
import { isShareId, shareId } from './ids';
import { presignPut } from './presign';

export const EXPIRY_DAYS = [7, 30, 90] as const;
export const MAX_BYTES = 600 * 1024 * 1024;
const DAY_MS = 86_400_000;

export type ShareMeta = {
  id: string;
  videoKey: string;
  thumbKey: string;
  createdAt: number;
  expiresAt: number;
  status: 'uploading' | 'ready';
  album: string;
  takenAt: number;
  bytes: number;
};

export const metaKey = (id: string) => `m/${id}.json`;

export function hub(env: Env): DurableObjectStub<BoothHub> {
  return env.HUB.get(env.HUB.idFromName('owner'));
}

export async function getMeta(env: Env, id: string): Promise<ShareMeta | null> {
  if (!isShareId(id)) return null;
  const object = await env.VIDEOS.get(metaKey(id));
  return object ? ((await object.json()) as ShareMeta) : null;
}

const putMeta = (env: Env, meta: ShareMeta) =>
  env.VIDEOS.put(metaKey(meta.id), JSON.stringify(meta), {
    httpMetadata: { contentType: 'application/json' },
  });

export const isExpired = (meta: ShareMeta, now = Date.now()) => meta.expiresAt <= now;

const links = (origin: string, id: string) => ({
  url: `${origin}/v/${id}`,
  videoUrl: `${origin}/f/${id}`,
  thumbUrl: `${origin}/t/${id}`,
});

/** POST /api/shares */
export async function createShare(request: Request, env: Env, origin: string): Promise<Response> {
  const body = await readJson(request);
  const expiryDays = body.expiryDays;
  if (typeof expiryDays !== 'number' || !(EXPIRY_DAYS as readonly number[]).includes(expiryDays)) {
    throw new HttpError(400, 'expiryDays must be 7, 30 or 90.');
  }
  const album = typeof body.album === 'string' ? body.album.trim() : '';
  if (album.length < 1 || album.length > 80) throw new HttpError(400, 'album must be 1 to 80 characters.');
  const takenAt = body.takenAt;
  if (typeof takenAt !== 'number' || !Number.isFinite(takenAt) || takenAt <= 0) {
    throw new HttpError(400, 'takenAt must be a time in milliseconds.');
  }
  const bytes = body.bytes;
  if (typeof bytes !== 'number' || !Number.isInteger(bytes) || bytes < 1 || bytes > MAX_BYTES) {
    throw new HttpError(400, `bytes must be a whole number from 1 to ${MAX_BYTES}.`);
  }

  const id = shareId();
  const now = Date.now();
  const meta: ShareMeta = {
    id,
    videoKey: `v/${expiryDays}d/${id}.mp4`,
    thumbKey: `t/${expiryDays}d/${id}.jpg`,
    createdAt: now,
    expiresAt: now + expiryDays * DAY_MS,
    status: 'uploading',
    album,
    takenAt,
    bytes,
  };
  await putMeta(env, meta);
  return json(
    {
      id,
      url: links(origin, id).url,
      expiresAt: meta.expiresAt,
      videoUploadUrl: await presignPut(env, meta.videoKey, 'video/mp4'),
      thumbUploadUrl: await presignPut(env, meta.thumbKey, 'image/jpeg'),
    },
    201,
  );
}

/** POST /api/shares/:id/upload-urls: fresh links for an upload that did not finish within the hour. */
export async function renewUploadUrls(env: Env, id: string): Promise<Response> {
  const meta = await getMeta(env, id);
  if (!meta) throw new HttpError(404, 'No such share.');
  if (isExpired(meta)) throw new HttpError(410, 'This share has expired.');
  if (meta.status === 'ready') throw new HttpError(409, 'This share is already uploaded.');
  return json({
    videoUploadUrl: await presignPut(env, meta.videoKey, 'video/mp4'),
    thumbUploadUrl: await presignPut(env, meta.thumbKey, 'image/jpeg'),
  });
}

/** POST /api/shares/:id/complete */
export async function completeShare(env: Env, id: string, origin: string): Promise<Response> {
  const meta = await getMeta(env, id);
  if (!meta) throw new HttpError(404, 'No such share.');
  if (isExpired(meta)) throw new HttpError(410, 'This share has expired.');
  const video = await env.VIDEOS.head(meta.videoKey);
  if (!video) throw new HttpError(409, 'The video has not been uploaded yet.');

  const ready: ShareMeta = { ...meta, status: 'ready', bytes: video.size };
  await putMeta(env, ready);
  const { url, thumbUrl } = links(origin, id);
  await hub(env).videoReady({ id, url, thumbUrl, album: meta.album, takenAt: meta.takenAt });
  return json(ready);
}

/** DELETE /api/shares/:id: idempotent. */
export async function deleteShare(env: Env, id: string): Promise<Response> {
  const meta = await getMeta(env, id);
  if (meta) await env.VIDEOS.delete([meta.videoKey, meta.thumbKey, metaKey(id)]);
  await hub(env).videoDeleted(id);
  return new Response(null, { status: 204 });
}
