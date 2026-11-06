import { DurableObject } from 'cloudflare:workers';

import { displayToken, pairingCode } from './ids';

/** A ready video as the Display shows it. */
export type RecentVideo = { id: string; url: string; thumbUrl: string; album: string; takenAt: number };

/** Events the booth sends, passed on to every Display. */
export type BoothEvent =
  | { type: 'booth.recording'; countdownS: number; recordS: number }
  | { type: 'booth.creating' }
  | { type: 'booth.idle' };

type DisplayRecord = { id: string; name: string; token: string; pairedAt: number; lastSeenAt: number | null };
type TokenRecord =
  { state: 'pending'; code: string; expiresAt: number } | { state: 'paired'; displayId: string };

/** The socket close code a Display gets when the owner disconnects it: it forgets its token and re-pairs. */
export const UNPAIRED_CLOSE_CODE = 4001;
export const PAIRING_MS = 10 * 60 * 1000;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 10;
const RECENT_CAP = 50;
const HELLO_COUNT = 12;

/**
 * The one hub for the owner's booth (`idFromName('owner')`): pairings, paired Displays and their sockets,
 * the current album and the recent videos. Sockets use the hibernation API, so an idle Display costs nothing.
 */
export class BoothHub extends DurableObject<Env> {
  // ---------------------------------------------------------------- pairing

  /** A new pairing code for a Display, or `null` when this address asked too often. */
  async createPairing(ip: string): Promise<{ code: string; token: string; expiresAt: number } | null> {
    const now = Date.now();
    const rateKey = `rate:${ip}`;
    const rate = (await this.ctx.storage.get<{ since: number; count: number }>(rateKey)) ?? {
      since: now,
      count: 0,
    };
    const window = now - rate.since > RATE_WINDOW_MS ? { since: now, count: 0 } : rate;
    if (window.count >= RATE_LIMIT) return null;
    await this.ctx.storage.put(rateKey, { since: window.since, count: window.count + 1 });

    await this.purgeExpiredPairings(now);
    let code = pairingCode();
    while (await this.ctx.storage.get(`code:${code}`)) code = pairingCode();
    const token = displayToken();
    const expiresAt = now + PAIRING_MS;
    await this.ctx.storage.put({
      [`code:${code}`]: token,
      [`token:${token}`]: { state: 'pending', code, expiresAt } satisfies TokenRecord,
    });
    return { code, token, expiresAt };
  }

  /** What a Display's token is: still waiting, expired, paired (with its name), or unknown. */
  async pairingStatus(
    token: string,
  ): Promise<{ state: 'unknown' | 'pending' | 'expired' } | { state: 'paired'; name: string }> {
    const record = await this.ctx.storage.get<TokenRecord>(`token:${token}`);
    if (!record) return { state: 'unknown' };
    if (record.state === 'pending') return { state: record.expiresAt < Date.now() ? 'expired' : 'pending' };
    const display = await this.ctx.storage.get<DisplayRecord>(`display:${record.displayId}`);
    return display ? { state: 'paired', name: display.name } : { state: 'unknown' };
  }

  /** The Display a paired token belongs to, for routing its socket. */
  async displayIdForToken(token: string): Promise<string | null> {
    const record = await this.ctx.storage.get<TokenRecord>(`token:${token}`);
    return record?.state === 'paired' ? record.displayId : null;
  }

  async claim(code: string, name?: string): Promise<{ id: string; name: string } | 'unknown' | 'expired'> {
    const key = `code:${code.toUpperCase()}`;
    const token = await this.ctx.storage.get<string>(key);
    if (!token) return 'unknown';
    const record = await this.ctx.storage.get<TokenRecord>(`token:${token}`);
    if (!record || record.state !== 'pending') return 'unknown';
    if (record.expiresAt < Date.now()) return 'expired';

    const displays = await this.displays();
    const id = crypto.randomUUID();
    const display: DisplayRecord = {
      id,
      name: name?.trim().slice(0, 40) || `Display ${displays.length + 1}`,
      token,
      pairedAt: Date.now(),
      lastSeenAt: null,
    };
    await this.ctx.storage.delete(key);
    await this.ctx.storage.put({
      [`display:${id}`]: display,
      [`token:${token}`]: { state: 'paired', displayId: id } satisfies TokenRecord,
    });
    return { id, name: display.name };
  }

  async listDisplays(): Promise<
    { id: string; name: string; pairedAt: number; connected: boolean; lastSeenAt: number | null }[]
  > {
    return (await this.displays()).map((d) => ({
      id: d.id,
      name: d.name,
      pairedAt: d.pairedAt,
      connected: this.ctx.getWebSockets(d.id).length > 0,
      lastSeenAt: d.lastSeenAt,
    }));
  }

  /** Forgets a Display and closes its screens; they show a new pairing code. */
  async unpair(id: string): Promise<boolean> {
    const display = await this.ctx.storage.get<DisplayRecord>(`display:${id}`);
    if (!display) return false;
    await this.ctx.storage.delete([`display:${id}`, `token:${display.token}`]);
    for (const socket of this.ctx.getWebSockets(id))
      socket.close(UNPAIRED_CLOSE_CODE, 'Disconnected by the booth');
    return true;
  }

  // ---------------------------------------------------------------- events

  async boothEvent(event: BoothEvent): Promise<void> {
    this.send(event);
  }

  async videoReady(video: RecentVideo): Promise<void> {
    const recent = (await this.recent()).filter((v) => v.id !== video.id);
    await this.ctx.storage.put('recent', [video, ...recent].slice(0, RECENT_CAP));
    this.send({ type: 'video.ready', video });
  }

  async videoDeleted(id: string): Promise<void> {
    const recent = await this.recent();
    await this.ctx.storage.put(
      'recent',
      recent.filter((v) => v.id !== id),
    );
    this.send({ type: 'video.deleted', id });
  }

  async setAlbum(album: string): Promise<void> {
    if ((await this.ctx.storage.get<string>('album')) === album) return;
    await this.ctx.storage.put('album', album);
    const hello = await this.hello();
    for (const socket of this.ctx.getWebSockets()) safeSend(socket, hello);
  }

  // ---------------------------------------------------------------- sockets

  /** The router has already checked the token and passes the Display's id. */
  override async fetch(request: Request): Promise<Response> {
    const displayId = request.headers.get('x-display-id');
    if (request.headers.get('upgrade') !== 'websocket' || !displayId) {
      return new Response('Expected a WebSocket upgrade', { status: 426 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [displayId]);
    safeSend(server, await this.hello());
    await this.touch(displayId);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (message === 'ping') socket.send('pong');
    const [displayId] = this.ctx.getTags(socket);
    if (displayId) await this.touch(displayId);
  }

  override async webSocketClose(socket: WebSocket, code: number, reason: string): Promise<void> {
    const [displayId] = this.ctx.getTags(socket);
    if (displayId) await this.touch(displayId);
    try {
      socket.close(code, reason);
    } catch {
      // already closed
    }
  }

  // ---------------------------------------------------------------- internals

  private send(message: unknown): void {
    for (const socket of this.ctx.getWebSockets()) safeSend(socket, message);
  }

  private async hello() {
    const album = (await this.ctx.storage.get<string>('album')) ?? '';
    const recent = (await this.recent()).filter((v) => !album || v.album === album).slice(0, HELLO_COUNT);
    return { type: 'hello', album, recent };
  }

  private async recent(): Promise<RecentVideo[]> {
    return (await this.ctx.storage.get<RecentVideo[]>('recent')) ?? [];
  }

  private async displays(): Promise<DisplayRecord[]> {
    const map = await this.ctx.storage.list<DisplayRecord>({ prefix: 'display:' });
    return [...map.values()].sort((a, b) => a.pairedAt - b.pairedAt);
  }

  private async touch(displayId: string): Promise<void> {
    const display = await this.ctx.storage.get<DisplayRecord>(`display:${displayId}`);
    if (display) await this.ctx.storage.put(`display:${displayId}`, { ...display, lastSeenAt: Date.now() });
  }

  private async purgeExpiredPairings(now: number): Promise<void> {
    const tokens = await this.ctx.storage.list<TokenRecord>({ prefix: 'token:' });
    const stale: string[] = [];
    for (const [key, record] of tokens) {
      if (record.state === 'pending' && record.expiresAt < now - PAIRING_MS)
        stale.push(key, `code:${record.code}`);
    }
    if (stale.length) await this.ctx.storage.delete(stale);
  }
}

function safeSend(socket: WebSocket, message: unknown): void {
  try {
    socket.send(JSON.stringify(message));
  } catch {
    // the socket is closing; its close handler tidies up
  }
}
