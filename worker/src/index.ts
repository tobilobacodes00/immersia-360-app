import { requireOwner } from './auth';
import { serveThumb, serveVideo } from './files';
import type { BoothEvent } from './hub';
import { errorResponse, HttpError, json, readJson } from './http';
import { isShareId, isToken } from './ids';
import { displayPage } from './pages/display';
import { guestPage } from './pages/guest';
import { privacyPage, termsPage } from './pages/legal';
import { qrSvg } from './qr';
import { completeShare, createShare, deleteShare, hub, renewUploadUrls } from './shares';

export { BoothHub } from './hub';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      return errorResponse(error);
    }
  },
} satisfies ExportedHandler<Env>;

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const origin = url.origin;
  const method = request.method;
  const parts = url.pathname.split('/').filter(Boolean);
  const [first, second, third, fourth] = parts;

  // ---------------------------------------------------------------- the owner's booth (authenticated)
  if (first === 'api' && second === 'health' && method === 'GET') {
    requireOwner(request, env);
    return json({ ok: true });
  }

  if (first === 'api' && second === 'shares') {
    requireOwner(request, env);
    if (!third && method === 'POST') return createShare(request, env, origin);
    if (third && isShareId(third)) {
      if (!fourth && method === 'DELETE') return deleteShare(env, third);
      if (fourth === 'complete' && method === 'POST') return completeShare(env, third, origin);
      if (fourth === 'upload-urls' && method === 'POST') return renewUploadUrls(env, third);
    }
    throw new HttpError(third && !isShareId(third) ? 404 : 405, 'No such share route.');
  }

  if (first === 'api' && second === 'hub' && third === 'events' && method === 'POST') {
    requireOwner(request, env);
    const body = await readJson(request);
    if (body.type === 'album.changed') {
      const album = typeof body.album === 'string' ? body.album.trim().slice(0, 80) : '';
      if (!album) throw new HttpError(400, 'album is required.');
      await hub(env).setAlbum(album);
    } else {
      await hub(env).boothEvent(boothEvent(body));
    }
    return json({ ok: true });
  }

  if (first === 'api' && second === 'displays') {
    // Unauthenticated: a Display asking for a pairing code, and checking it with its secret token.
    if (!third && method === 'POST') {
      const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
      const pairing = await hub(env).createPairing(ip);
      if (!pairing) throw new HttpError(429, 'Too many pairing codes from this network. Wait a few minutes.');
      return json(pairing, 201);
    }
    if (third && isToken(third)) {
      const status = await hub(env).pairingStatus(third);
      if (!fourth && method === 'GET') {
        return json({ ...status, paired: status.state === 'paired' });
      }
      if (fourth === 'socket' && method === 'GET') {
        if (status.state !== 'paired') throw new HttpError(403, 'This screen is not paired.');
        const displayId = await displayIdFor(env, third);
        const forwarded = new Request(request.url, request);
        forwarded.headers.set('x-display-id', displayId);
        return hub(env).fetch(forwarded);
      }
    }

    // The owner managing Displays.
    requireOwner(request, env);
    if (third === 'claim' && method === 'POST') {
      const body = await readJson(request);
      const code = typeof body.code === 'string' ? body.code.trim() : '';
      if (!/^[A-Za-z0-9]{6}$/.test(code)) throw new HttpError(400, 'The code is 6 letters and numbers.');
      const result = await hub(env).claim(code, typeof body.name === 'string' ? body.name : undefined);
      if (result === 'unknown') throw new HttpError(404, 'No screen is showing that code.');
      if (result === 'expired')
        throw new HttpError(410, 'That code has expired. The screen shows a new one.');
      return json(result);
    }
    if (third === 'list' && method === 'GET') return json({ displays: await hub(env).listDisplays() });
    if (third && method === 'DELETE') {
      return (await hub(env).unpair(third))
        ? new Response(null, { status: 204 })
        : json({ error: 'No such display.' }, 404);
    }
    throw new HttpError(404, 'No such display route.');
  }

  // ---------------------------------------------------------------- public pages and files
  if (method !== 'GET' && method !== 'HEAD') throw new HttpError(405, 'Method not allowed.');
  if (first === 'v' && second) return guestPage(env, second);
  if (first === 'f' && second) return serveVideo(request, env, second);
  if (first === 't' && second) return serveThumb(env, second);
  if (first === 'qr' && second === 'pair' && third?.endsWith('.svg')) {
    const code = third.slice(0, -4).toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) throw new HttpError(404, 'No such code.');
    return qrSvg(`immersia360://pair?code=${code}`);
  }
  if (first === 'qr' && second?.endsWith('.svg') && !third) {
    const id = second.slice(0, -4);
    if (!isShareId(id)) throw new HttpError(404, 'No such video.');
    return qrSvg(`${origin}/v/${id}`);
  }
  if (first === 'display' && !second) return displayPage();
  if (first === 'privacy' && !second) return privacyPage();
  if (first === 'terms' && !second) return termsPage();
  if (!first) return Response.redirect(`${origin}/display`, 302);
  throw new HttpError(404, 'Not found.');
}

function boothEvent(body: Record<string, unknown>): BoothEvent {
  const seconds = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 600;
  if (body.type === 'booth.recording' && seconds(body.countdownS) && seconds(body.recordS)) {
    return {
      type: 'booth.recording',
      countdownS: body.countdownS as number,
      recordS: body.recordS as number,
    };
  }
  if (body.type === 'booth.creating' || body.type === 'booth.idle') return { type: body.type };
  throw new HttpError(400, 'Unknown event.');
}

async function displayIdFor(env: Env, token: string): Promise<string> {
  const id = await hub(env).displayIdForToken(token);
  if (!id) throw new HttpError(403, 'This screen is not paired.');
  return id;
}
