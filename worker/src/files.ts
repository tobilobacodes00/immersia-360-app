import { getMeta, isExpired } from './shares';

export type ByteRange = { offset: number; length: number };

/**
 * Parses a single `Range: bytes=…` header against an object of `size` bytes.
 * `null`: no (or an unsupported multi-part) range, serve everything. `'unsatisfiable'`: answer 416.
 */
export function parseRange(header: string | null, size: number): ByteRange | null | 'unsatisfiable' {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, startText = '', endText = ''] = match;
  if (startText === '' && endText === '') return null;
  if (startText === '') {
    // bytes=-500: the last 500 bytes
    const suffix = Number(endText);
    if (suffix === 0) return 'unsatisfiable';
    const length = Math.min(suffix, size);
    return { offset: size - length, length };
  }
  const start = Number(startText);
  if (start >= size) return 'unsatisfiable';
  const end = endText === '' ? size - 1 : Math.min(Number(endText), size - 1);
  if (end < start) return 'unsatisfiable';
  return { offset: start, length: end - start + 1 };
}

const page = (status: number, text: string) =>
  new Response(text, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });

/** GET /f/:id — the video, with Range support (players seek with ranges; iOS will not play without them). */
export async function serveVideo(request: Request, env: Env, id: string): Promise<Response> {
  const meta = await getMeta(env, id);
  if (!meta) return page(404, 'This video does not exist.');
  if (isExpired(meta)) return page(410, 'This video has expired.');
  if (meta.status !== 'ready') return page(409, 'This video is still uploading. Try again in a moment.');

  const head = await env.VIDEOS.head(meta.videoKey);
  if (!head) return page(404, 'This video does not exist.');
  const range = parseRange(request.headers.get('range'), head.size);
  const headers = new Headers({
    'content-type': 'video/mp4',
    'accept-ranges': 'bytes',
    etag: head.httpEtag,
    // Immutable content, but the link expires: never let a cache outlive it.
    'cache-control': `public, max-age=${Math.max(0, Math.floor((meta.expiresAt - Date.now()) / 1000))}`,
  });
  if (new URL(request.url).searchParams.get('download') === '1') {
    headers.set('content-disposition', `attachment; filename="immersia-360-${id}.mp4"`);
  }
  if (range === 'unsatisfiable') {
    headers.set('content-range', `bytes */${head.size}`);
    return new Response(null, { status: 416, headers });
  }

  const object = await env.VIDEOS.get(meta.videoKey, range ? { range } : {});
  if (!object) return page(404, 'This video does not exist.');
  if (range) {
    headers.set('content-range', `bytes ${range.offset}-${range.offset + range.length - 1}/${head.size}`);
    headers.set('content-length', String(range.length));
    return new Response(request.method === 'HEAD' ? null : object.body, { status: 206, headers });
  }
  headers.set('content-length', String(head.size));
  return new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers });
}

/** GET /t/:id — the thumbnail, a poster for the page and the Display. */
export async function serveThumb(env: Env, id: string): Promise<Response> {
  const meta = await getMeta(env, id);
  if (!meta || isExpired(meta)) return page(meta ? 410 : 404, 'No thumbnail.');
  const object = await env.VIDEOS.get(meta.thumbKey);
  if (!object) return page(404, 'No thumbnail.');
  return new Response(object.body, {
    headers: {
      'content-type': 'image/jpeg',
      'cache-control': 'public, max-age=86400',
      etag: object.httpEtag,
    },
  });
}
