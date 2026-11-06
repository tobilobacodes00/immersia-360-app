import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { PAIRING_MS, UNPAIRED_CLOSE_CODE, type BoothHub } from '../src/hub';

import { call, post, readyShare } from './helpers';

type Pairing = { code: string; token: string; expiresAt: number };

async function newPairing(ip = '203.0.113.1'): Promise<Pairing> {
  const res = await call('/api/displays', { method: 'POST', headers: { 'cf-connecting-ip': ip } }, false);
  expect(res.status).toBe(201);
  return res.json();
}

async function paired(): Promise<{ pairing: Pairing; id: string }> {
  const pairing = await newPairing();
  const res = await post('/api/displays/claim', { code: pairing.code.toLowerCase() });
  expect(res.status).toBe(200);
  const { id } = (await res.json()) as { id: string };
  return { pairing, id };
}

type Message = { type: string; [key: string]: unknown };

/** Opens a Display socket and collects what it receives. */
async function openSocket(token: string) {
  const res = await call(`/api/displays/${token}/socket`, { headers: { upgrade: 'websocket' } }, false);
  expect(res.status).toBe(101);
  const ws = res.webSocket!;
  const messages: Message[] = [];
  let closedWith: number | null = null;
  ws.addEventListener('message', (e) => {
    if (typeof e.data === 'string' && e.data !== 'pong') messages.push(JSON.parse(e.data) as Message);
  });
  ws.addEventListener('close', (e) => {
    closedWith = e.code;
  });
  ws.accept();
  const next = async (type: string): Promise<Message> => {
    for (let i = 0; i < 200; i++) {
      const found = messages.find((m) => m.type === type);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`no ${type} message; got ${JSON.stringify(messages)}`);
  };
  const closed = async (): Promise<number | null> => {
    for (let i = 0; i < 200 && closedWith === null; i++) await new Promise((r) => setTimeout(r, 10));
    return closedWith;
  };
  return { ws, next, closed };
}

describe('pairing', () => {
  it('gives a code and a token, and the token waits until the code is claimed', async () => {
    const pairing = await newPairing();
    expect(pairing.code).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
    expect(pairing.token).toMatch(/^[0-9a-f]{64}$/);
    expect(await (await call(`/api/displays/${pairing.token}`, {}, false)).json()).toMatchObject({
      state: 'pending',
      paired: false,
    });

    expect((await post('/api/displays/claim', { code: 'ZZZZZZ' })).status).toBe(404);
    const claim = await post('/api/displays/claim', { code: pairing.code });
    expect(await claim.json()).toMatchObject({ name: 'Display 1' });
    expect(await (await call(`/api/displays/${pairing.token}`, {}, false)).json()).toMatchObject({
      state: 'paired',
      paired: true,
      name: 'Display 1',
    });
  });

  it('refuses an expired code', async () => {
    const pairing = await newPairing();
    await runInDurableObject(env.HUB.get(env.HUB.idFromName('owner')), async (_: BoothHub, state) => {
      const record = (await state.storage.get<{ expiresAt: number }>(`token:${pairing.token}`))!;
      await state.storage.put(`token:${pairing.token}`, {
        ...record,
        expiresAt: Date.now() - PAIRING_MS / 10,
      });
    });
    expect((await post('/api/displays/claim', { code: pairing.code })).status).toBe(410);
    expect(await (await call(`/api/displays/${pairing.token}`, {}, false)).json()).toMatchObject({
      state: 'expired',
    });
  });

  it('needs the sharing key to claim, list or disconnect', async () => {
    expect((await post('/api/displays/claim', { code: 'ABCDEF' }, false)).status).toBe(401);
    expect((await call('/api/displays/list', {}, false)).status).toBe(401);
    expect((await call('/api/displays/some-id', { method: 'DELETE' }, false)).status).toBe(401);
  });

  it('limits how many codes one network can ask for', async () => {
    for (let i = 0; i < 10; i++) await newPairing('198.51.100.7');
    const res = await call(
      '/api/displays',
      { method: 'POST', headers: { 'cf-connecting-ip': '198.51.100.7' } },
      false,
    );
    expect(res.status).toBe(429);
  });
});

describe('the live socket', () => {
  it('refuses a token that is not paired', async () => {
    const pairing = await newPairing();
    const res = await call(
      `/api/displays/${pairing.token}/socket`,
      { headers: { upgrade: 'websocket' } },
      false,
    );
    expect(res.status).toBe(403);
  });

  it('says hello with the album and recent videos, then passes booth events on', async () => {
    await post('/api/hub/events', { type: 'album.changed', album: 'Wedding' });
    const share = await readyShare();
    const { pairing } = await paired();
    const display = await openSocket(pairing.token);

    const hello = await display.next('hello');
    expect(hello.album).toBe('Wedding');
    expect((hello.recent as { id: string }[]).map((v) => v.id)).toContain(share.id);

    expect(
      (await post('/api/hub/events', { type: 'booth.recording', countdownS: 3, recordS: 10 })).status,
    ).toBe(200);
    expect(await display.next('booth.recording')).toMatchObject({ countdownS: 3, recordS: 10 });

    const second = await readyShare();
    expect(await display.next('video.ready')).toMatchObject({ video: { id: second.id, album: 'Wedding' } });

    await call(`/api/shares/${second.id}`, { method: 'DELETE' });
    expect(await display.next('video.deleted')).toMatchObject({ id: second.id });
    display.ws.close();
  });

  it('rejects unknown events', async () => {
    expect((await post('/api/hub/events', { type: 'booth.explode' })).status).toBe(400);
    expect(
      (await post('/api/hub/events', { type: 'booth.recording', countdownS: -1, recordS: 10 })).status,
    ).toBe(400);
    expect((await post('/api/hub/events', { type: 'album.changed', album: '' })).status).toBe(400);
  });

  it('shows the display as connected, and disconnecting closes its screen with the unpaired code', async () => {
    const { pairing, id } = await paired();
    const display = await openSocket(pairing.token);
    await display.next('hello');
    const list = (await (await call('/api/displays/list')).json()) as {
      displays: { id: string; connected: boolean }[];
    };
    expect(list.displays.find((d) => d.id === id)?.connected).toBe(true);

    expect((await call(`/api/displays/${id}`, { method: 'DELETE' })).status).toBe(204);
    expect(await display.closed()).toBe(UNPAIRED_CLOSE_CODE);
    expect(await (await call(`/api/displays/${pairing.token}`, {}, false)).json()).toMatchObject({
      state: 'unknown',
    });
  });
});
