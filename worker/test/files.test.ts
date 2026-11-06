import { describe, expect, it } from 'vitest';

import { parseRange } from '../src/files';

import { call, createShare, expire, readyShare } from './helpers';

const BYTES = new Uint8Array(100).map((_, i) => i);

describe('parseRange', () => {
  it.each([
    [null, null],
    ['bytes=0-9', { offset: 0, length: 10 }],
    ['bytes=90-', { offset: 90, length: 10 }],
    ['bytes=-5', { offset: 95, length: 5 }],
    ['bytes=-500', { offset: 0, length: 100 }],
    ['bytes=50-1000', { offset: 50, length: 50 }],
    ['bytes=100-', 'unsatisfiable'],
    ['bytes=20-10', 'unsatisfiable'],
    ['bytes=-0', 'unsatisfiable'],
    ['bytes=0-1,5-6', null],
    ['items=0-1', null],
  ])('%s → %o', (header, expected) => expect(parseRange(header, 100)).toEqual(expected));
});

describe('GET /f/:id', () => {
  it('serves the whole video', async () => {
    const share = await readyShare(BYTES);
    const res = await call(`/f/${share.id}`, {}, false);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('video/mp4');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('content-length')).toBe('100');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(BYTES);
  });

  it('serves byte ranges', async () => {
    const share = await readyShare(BYTES);
    const first = await call(`/f/${share.id}`, { headers: { range: 'bytes=0-9' } }, false);
    expect(first.status).toBe(206);
    expect(first.headers.get('content-range')).toBe('bytes 0-9/100');
    expect(new Uint8Array(await first.arrayBuffer())).toEqual(BYTES.slice(0, 10));

    const suffix = await call(`/f/${share.id}`, { headers: { range: 'bytes=-5' } }, false);
    expect(suffix.headers.get('content-range')).toBe('bytes 95-99/100');
    expect(new Uint8Array(await suffix.arrayBuffer())).toEqual(BYTES.slice(95));

    const open = await call(`/f/${share.id}`, { headers: { range: 'bytes=10-' } }, false);
    expect((await open.arrayBuffer()).byteLength).toBe(90);

    const bad = await call(`/f/${share.id}`, { headers: { range: 'bytes=500-' } }, false);
    expect(bad.status).toBe(416);
    expect(bad.headers.get('content-range')).toBe('bytes */100');
  });

  it('offers a download with a file name', async () => {
    const share = await readyShare(BYTES);
    const res = await call(`/f/${share.id}?download=1`, {}, false);
    expect(res.headers.get('content-disposition')).toBe(
      `attachment; filename="immersia-360-${share.id}.mp4"`,
    );
    await res.arrayBuffer();
  });

  it('refuses while uploading, after expiry, and for unknown ids', async () => {
    const uploading = await createShare();
    expect((await call(`/f/${uploading.id}`, {}, false)).status).toBe(409);
    const ready = await readyShare(BYTES);
    await expire(ready.id);
    expect((await call(`/f/${ready.id}`, {}, false)).status).toBe(410);
    expect((await call('/f/abcdefghjk', {}, false)).status).toBe(404);
  });

  it('serves the thumbnail', async () => {
    const share = await readyShare(BYTES);
    const res = await call(`/t/${share.id}`, {}, false);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    await res.arrayBuffer();
  });
});
