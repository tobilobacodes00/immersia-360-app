import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import type { BoothHub } from '../src/hub';

import { call, createShare, expire, post, readyShare, uploadVideo } from './helpers';

const recentIds = () =>
  runInDurableObject(env.HUB.get(env.HUB.idFromName('owner')), async (_: BoothHub, state) =>
    ((await state.storage.get<{ id: string }[]>('recent')) ?? []).map((v) => v.id),
  );

describe('auth', () => {
  it('refuses a missing or wrong key', async () => {
    expect((await call('/api/health', {}, false)).status).toBe(401);
    expect((await call('/api/health', { headers: { authorization: 'Bearer nope' } }, false)).status).toBe(
      401,
    );
  });

  it('accepts the sharing key', async () => {
    const res = await call('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('POST /api/shares', () => {
  it.each([
    [{ expiryDays: 14 }, 'expiryDays'],
    [{ album: '' }, 'album'],
    [{ album: 'x'.repeat(81) }, 'album'],
    [{ takenAt: 'yesterday' }, 'takenAt'],
    [{ bytes: 0 }, 'bytes'],
    [{ bytes: 601 * 1024 * 1024 }, 'bytes'],
    [{ bytes: 1.5 }, 'bytes'],
  ])('rejects %o', async (override, field) => {
    const res = await post('/api/shares', {
      expiryDays: 30,
      album: 'Wedding',
      takenAt: 1,
      bytes: 10,
      ...override,
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain(field);
  });

  it('rejects a body that is not JSON', async () => {
    expect((await call('/api/shares', { method: 'POST', body: 'hello' })).status).toBe(400);
  });

  it('creates a share with presigned upload links under its expiry prefix', async () => {
    const share = await createShare({ expiryDays: 30 });
    expect(share.id).toMatch(/^[2-9a-km-zA-HJ-NP-Z]{10}$/);
    expect(share.url).toBe(`https://share.test/v/${share.id}`);
    expect(share.videoUploadUrl).toContain(`/immersia-360-videos/v/30d/${share.id}.mp4`);
    expect(share.videoUploadUrl).toContain('X-Amz-Signature=');
    expect(share.videoUploadUrl).toContain('X-Amz-Expires=3600');
    expect(share.videoUploadUrl).toContain('content-type'); // the type is part of the signature
    expect(share.thumbUploadUrl).toContain(`/t/30d/${share.id}.jpg`);
    const meta = (await (await env.VIDEOS.get(`m/${share.id}.json`))!.json()) as {
      status: string;
      album: string;
    };
    expect(meta).toMatchObject({ status: 'uploading', album: 'Wedding' });
    expect(share.expiresAt - Date.now()).toBeGreaterThan(29 * 86_400_000);
  });
});

describe('completing and renewing', () => {
  it('refuses to complete before the video is uploaded, then completes and tells the hub', async () => {
    const share = await createShare();
    expect((await post(`/api/shares/${share.id}/complete`)).status).toBe(409);
    await uploadVideo(share.id, new Uint8Array(500));
    const done = await post(`/api/shares/${share.id}/complete`);
    expect(done.status).toBe(200);
    expect(await done.json()).toMatchObject({ status: 'ready', bytes: 500 });
    expect(await recentIds()).toContain(share.id);
  });

  it('renews upload links for the same share while it is uploading', async () => {
    const share = await createShare();
    const res = await post(`/api/shares/${share.id}/upload-urls`);
    expect(res.status).toBe(200);
    const links = (await res.json()) as { videoUploadUrl: string };
    expect(links.videoUploadUrl).toContain(`/v/30d/${share.id}.mp4`);
  });

  it('does not renew links for an unknown, uploaded or expired share', async () => {
    expect((await post('/api/shares/abcdefghjk/upload-urls')).status).toBe(404);
    const ready = await readyShare();
    expect((await post(`/api/shares/${ready.id}/upload-urls`)).status).toBe(409);
    const old = await createShare();
    await expire(old.id);
    expect((await post(`/api/shares/${old.id}/upload-urls`)).status).toBe(410);
  });
});

describe('DELETE /api/shares/:id', () => {
  it('removes every object, tells the hub, and is idempotent', async () => {
    const share = await readyShare();
    expect((await call(`/api/shares/${share.id}`, { method: 'DELETE' })).status).toBe(204);
    expect(await env.VIDEOS.head(`m/${share.id}.json`)).toBeNull();
    expect(await env.VIDEOS.head(`v/30d/${share.id}.mp4`)).toBeNull();
    expect(await recentIds()).not.toContain(share.id);
    expect((await call(`/api/shares/${share.id}`, { method: 'DELETE' })).status).toBe(204);
  });
});
