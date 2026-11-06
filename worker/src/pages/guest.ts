import { escapeHtml, htmlResponse, nonce } from '../http';
import { getMeta, isExpired } from '../shares';

import { page } from './layout';

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/** GET /v/:id — where a guest lands after scanning the QR code. */
export async function guestPage(env: Env, id: string): Promise<Response> {
  const n = nonce();
  const meta = await getMeta(env, id);

  if (!meta) {
    return htmlResponse(
      page(
        'Video not found',
        n,
        '<h1>This video is not here</h1><p>The link may be mistyped, or the video was deleted.</p>',
      ),
      n,
      404,
    );
  }
  if (isExpired(meta)) {
    return htmlResponse(
      page(
        'Link expired',
        n,
        '<h1>This link has expired</h1><p>Videos are kept for a limited time. Ask the booth for a new link.</p>',
      ),
      n,
      410,
    );
  }
  if (meta.status !== 'ready') {
    // Refreshes itself until the upload is done (the QR is shown before the upload finishes).
    return htmlResponse(
      page(
        'Your video is on its way',
        n,
        `<h1>Your video is still uploading…</h1><p>This page refreshes by itself. It usually takes under a minute.</p>
<script nonce="${n}">setTimeout(function () { location.reload(); }, 4000);</script>`,
      ),
      n,
    );
  }

  const expires = dateFormat.format(new Date(meta.expiresAt));
  return htmlResponse(
    page(
      'Your Immersia 360 video',
      n,
      `<h1>Your video</h1>
<video src="/f/${escapeHtml(id)}" poster="/t/${escapeHtml(id)}" controls playsinline loop preload="metadata" aria-label="Your 360 video from ${escapeHtml(meta.album)}"></video>
<a class="button" href="/f/${escapeHtml(id)}?download=1" download>Download video</a>
<p>On iPhone: tap Download, then the share button, then Save Video.</p>
<p class="faint">${escapeHtml(meta.album)} · This link expires on ${escapeHtml(expires)}.</p>`,
    ),
    n,
  );
}
