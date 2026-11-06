import { describe, expect, it } from 'vitest';

import { call, createShare, expire, readyShare } from './helpers';

describe('guest page /v/:id', () => {
  it('says the video is uploading and refreshes itself', async () => {
    const share = await createShare();
    const res = await call(`/v/${share.id}`, {}, false);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('still uploading');
    expect(html).toContain('location.reload');
  });

  it('shows the video, the download button and the expiry date when ready', async () => {
    const share = await readyShare();
    const res = await call(`/v/${share.id}`, {}, false);
    const html = await res.text();
    expect(html).toContain(`src="/f/${share.id}"`);
    expect(html).toContain('Download video');
    expect(html).toContain('This link expires on');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('escapes the album name', async () => {
    const share = await readyShare(undefined, { album: '<script>alert(1)</script>' });
    const html = await (await call(`/v/${share.id}`, {}, false)).text();
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('has friendly pages for expired and unknown links', async () => {
    const share = await readyShare();
    await expire(share.id);
    const expired = await call(`/v/${share.id}`, {}, false);
    expect(expired.status).toBe(410);
    await expired.text();
    const unknown = await call('/v/abcdefghjk', {}, false);
    expect(unknown.status).toBe(404);
    await unknown.text();
  });
});

describe('other pages', () => {
  it('serves QR codes as SVG', async () => {
    const share = await createShare();
    const res = await call(`/qr/${share.id}.svg`, {}, false);
    expect(res.headers.get('content-type')).toBe('image/svg+xml');
    expect(await res.text()).toContain('<svg');
    expect((await call('/qr/pair/ABC234.svg', {}, false)).status).toBe(200);
    expect((await call('/qr/nope.svg', {}, false)).status).toBe(404);
  });

  it('serves the privacy policy, the terms and the display', async () => {
    expect(await (await call('/privacy', {}, false)).text()).toContain('Privacy Policy');
    expect(await (await call('/terms', {}, false)).text()).toContain('Terms of Use');
    expect(await (await call('/display', {}, false)).text()).toContain('Connect this screen to the booth');
  });
});
