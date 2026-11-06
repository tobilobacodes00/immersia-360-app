import type { SharingConfig } from '@/data/sharing-config';

/** Talks to the sharing server (worker/). Every call has a timeout; errors carry the server's own message. */

export class SharingError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'SharingError';
  }
}

const TIMEOUT_MS = 15_000;

async function call<T>(config: SharingConfig, method: string, path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${config.server}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${config.key}`,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new SharingError(
      controller.signal.aborted
        ? 'The sharing server did not answer in time.'
        : 'No connection to the sharing server.',
      null,
    );
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // not JSON: use the status below
  }
  if (!response.ok) {
    const message =
      (json as { error?: string } | null)?.error ??
      (response.status === 401
        ? 'The sharing key was not accepted.'
        : `The sharing server answered ${response.status}.`);
    throw new SharingError(message, response.status);
  }
  return json as T;
}

export type CreatedShare = {
  id: string;
  url: string;
  videoUploadUrl: string;
  thumbUploadUrl: string;
  expiresAt: number;
};

export const sharingApi = {
  health: (c: SharingConfig) => call<{ ok: true }>(c, 'GET', '/api/health'),

  createShare: (
    c: SharingConfig,
    body: { expiryDays: number; album: string; takenAt: number; bytes: number },
  ) => call<CreatedShare>(c, 'POST', '/api/shares', body),

  /** Fresh upload links for a share whose first upload did not finish within the hour the links last. */
  renewUploadUrls: (c: SharingConfig, id: string) =>
    call<{ videoUploadUrl: string; thumbUploadUrl: string }>(
      c,
      'POST',
      `/api/shares/${encodeURIComponent(id)}/upload-urls`,
    ),

  completeShare: (c: SharingConfig, id: string) =>
    call<unknown>(c, 'POST', `/api/shares/${encodeURIComponent(id)}/complete`),

  deleteShare: (c: SharingConfig, id: string) =>
    call<void>(c, 'DELETE', `/api/shares/${encodeURIComponent(id)}`),

  claimDisplay: (c: SharingConfig, code: string) =>
    call<{ id: string; name: string }>(c, 'POST', '/api/displays/claim', { code: code.trim().toUpperCase() }),

  listDisplays: (c: SharingConfig) =>
    call<{
      displays: {
        id: string;
        name: string;
        pairedAt: number;
        connected: boolean;
        lastSeenAt: number | null;
      }[];
    }>(c, 'GET', '/api/displays/list'),

  unpairDisplay: (c: SharingConfig, id: string) =>
    call<void>(c, 'DELETE', `/api/displays/${encodeURIComponent(id)}`),

  /** What the booth is doing, for the Display. Fire and forget: a missed event only delays a screen. */
  event: (
    c: SharingConfig,
    event:
      | { type: 'booth.recording'; countdownS: number; recordS: number }
      | { type: 'booth.creating' }
      | { type: 'booth.idle' }
      | { type: 'album.changed'; album: string },
  ) => call<unknown>(c, 'POST', '/api/hub/events', event).catch(() => undefined),
};
