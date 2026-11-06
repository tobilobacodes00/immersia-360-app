import { File, UploadType } from 'expo-file-system';
import { addNetworkStateListener, getNetworkStateAsync, NetworkStateType } from 'expo-network';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getSharingConfig, type SharingConfig } from '@/data/sharing-config';
import { getSettings } from '@/data/settings-store';
import { getTake, resolveFile } from '@/data/takes';
import { retryDelayMs } from '@/domain/sharing';
import { sharingApi, SharingError } from '@/platform/sharing-api';

export type UploadStatus = 'queued' | 'uploading' | 'online' | 'failed';

export type Upload = {
  takeId: string;
  shareId: string | null;
  url: string | null;
  expiresAt: number | null;
  status: UploadStatus;
  progress: number;
  error: string | null;
  attempts: number;
  nextAttemptAt: number;
};

export const WAITING_FOR_WIFI = 'Waiting for Wi-Fi';

type Links = { videoUploadUrl: string; thumbUploadUrl: string };

/**
 * Puts finished videos online for QR sharing, one at a time. The share is created first, so its QR code can be
 * shown to the guest straight away; the page waits for the upload. Videos go straight to storage over
 * presigned links (the iOS background session keeps going if the app is put away). Failures retry with
 * backoff and as soon as the connection comes back; an upload left from a previous launch starts again.
 */
class UploadQueue {
  private db: SQLiteDatabase | null = null;
  private running = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Upload links last an hour; kept in memory only, renewed when missing or refused. */
  private links = new Map<string, Links>();

  async start(db: SQLiteDatabase): Promise<void> {
    if (this.db) return;
    this.db = db;
    // Anything that was mid-upload when the app stopped starts again.
    await db.runAsync(`UPDATE uploads SET status = 'queued' WHERE status = 'uploading'`);
    addNetworkStateListener((state) => {
      if (state.isConnected) void this.drain();
    });
    void this.drain();
  }

  /** Shares a take's video (idempotent): queues it and returns once its link exists, if it can be made now. */
  async share(takeId: string): Promise<void> {
    const db = this.db;
    if (!db) return;
    await db.runAsync(
      `INSERT INTO uploads (take_id, status, created_at) VALUES (?, 'queued', ?)
       ON CONFLICT(take_id) DO UPDATE SET status = CASE WHEN status = 'online' THEN 'online' ELSE 'queued' END,
         next_attempt_at = 0`,
      takeId,
      Date.now(),
    );
    const config = getSharingConfig();
    if (config) await this.ensureShare(db, config, takeId).catch(() => undefined);
    void this.drain();
  }

  retryAll(): void {
    void this.db
      ?.runAsync(`UPDATE uploads SET next_attempt_at = 0 WHERE status IN ('queued', 'failed')`)
      .then(() => this.drain());
  }

  /** Takes a video offline: deletes the link (so the QR stops working) and forgets the upload. */
  async unshare(takeId: string): Promise<void> {
    const db = this.db;
    if (!db) return;
    const row = await db.getFirstAsync<{ share_id: string | null }>(
      'SELECT share_id FROM uploads WHERE take_id = ?',
      takeId,
    );
    const config = getSharingConfig();
    if (row?.share_id && config) await sharingApi.deleteShare(config, row.share_id);
    await db.runAsync('DELETE FROM uploads WHERE take_id = ?', takeId);
  }

  private async drain(): Promise<void> {
    const db = this.db;
    if (!db || this.running) return;
    this.running = true;
    clearTimeout(this.timer);
    try {
      for (;;) {
        const config = getSharingConfig();
        if (!config || !getSettings().sharing.enabled) return;
        const next = await db.getFirstAsync<{ take_id: string }>(
          `SELECT take_id FROM uploads WHERE status IN ('queued', 'failed') AND next_attempt_at <= ? ORDER BY created_at`,
          Date.now(),
        );
        if (!next) break;
        if (getSettings().sharing.wifiOnly && !(await onWifi())) {
          await db.runAsync(
            `UPDATE uploads SET status = 'queued', error = ? WHERE status IN ('queued', 'failed')`,
            WAITING_FOR_WIFI,
          );
          return; // the network listener wakes the queue when Wi-Fi comes back
        }
        await this.upload(db, config, next.take_id);
      }
      // Wake up for the earliest scheduled retry.
      const later = await db.getFirstAsync<{ at: number }>(
        `SELECT MIN(next_attempt_at) AS at FROM uploads WHERE status IN ('queued', 'failed')`,
      );
      if (later?.at) this.timer = setTimeout(() => void this.drain(), Math.max(1000, later.at - Date.now()));
    } finally {
      this.running = false;
    }
  }

  private async ensureShare(db: SQLiteDatabase, config: SharingConfig, takeId: string): Promise<string> {
    const row = await db.getFirstAsync<{ share_id: string | null }>(
      'SELECT share_id FROM uploads WHERE take_id = ?',
      takeId,
    );
    if (row?.share_id) return row.share_id;
    const take = await getTake(db, takeId);
    if (!take?.videoPath) throw new Error('This take has no video to share yet.');
    const album = await db.getFirstAsync<{ name: string }>(
      'SELECT name FROM albums WHERE id = ?',
      take.albumId,
    );
    const share = await sharingApi.createShare(config, {
      expiryDays: getSettings().sharing.linkExpiryDays,
      album: album?.name ?? 'Immersia 360',
      takenAt: take.createdAt,
      bytes: Math.max(1, take.videoBytes ?? resolveFile(take.videoPath).size),
    });
    this.links.set(share.id, { videoUploadUrl: share.videoUploadUrl, thumbUploadUrl: share.thumbUploadUrl });
    await db.runAsync(
      'UPDATE uploads SET share_id = ?, url = ?, expires_at = ? WHERE take_id = ?',
      share.id,
      share.url,
      share.expiresAt,
      takeId,
    );
    return share.id;
  }

  private async upload(db: SQLiteDatabase, config: SharingConfig, takeId: string): Promise<void> {
    await db.runAsync(
      `UPDATE uploads SET status = 'uploading', progress = 0, error = NULL WHERE take_id = ?`,
      takeId,
    );
    try {
      const take = await getTake(db, takeId);
      if (!take?.videoPath) throw new Error('This take has no video any more.');
      const shareId = await this.ensureShare(db, config, takeId);
      let links = this.links.get(shareId) ?? (await sharingApi.renewUploadUrls(config, shareId));

      let lastWrite = 0;
      const video = resolveFile(take.videoPath);
      const put = async (file: File, url: string, type: string, onProgress?: (f: number) => void) => {
        const result = await file.upload(url, {
          httpMethod: 'PUT',
          uploadType: UploadType.BINARY_CONTENT,
          headers: { 'content-type': type },
          sessionType: 'background',
          onProgress:
            onProgress &&
            (({ bytesSent, totalBytes }) => totalBytes > 0 && onProgress(bytesSent / totalBytes)),
        });
        return result.status;
      };
      const onProgress = (fraction: number) => {
        const now = Date.now();
        if (now - lastWrite < 500) return;
        lastWrite = now;
        void db.runAsync('UPDATE uploads SET progress = ? WHERE take_id = ?', fraction * 0.97, takeId);
      };

      let status = await put(video, links.videoUploadUrl, 'video/mp4', onProgress);
      if (status === 403) {
        // The link ran out (an hour passed, say offline at the venue): new links, same share, same QR.
        links = await sharingApi.renewUploadUrls(config, shareId);
        status = await put(video, links.videoUploadUrl, 'video/mp4', onProgress);
      }
      if (status < 200 || status >= 300) throw new SharingError(`Upload refused (${status}).`, status);
      this.links.set(shareId, links);

      if (take.thumbPath) {
        const thumb = resolveFile(take.thumbPath);
        if (thumb.exists) await put(thumb, links.thumbUploadUrl, 'image/jpeg').catch(() => undefined); // cosmetic
      }
      await sharingApi.completeShare(config, shareId);
      this.links.delete(shareId);
      await db.runAsync(
        `UPDATE uploads SET status = 'online', progress = 1, error = NULL, attempts = 0 WHERE take_id = ?`,
        takeId,
      );
    } catch (error) {
      const row = await db.getFirstAsync<{ attempts: number }>(
        'SELECT attempts FROM uploads WHERE take_id = ?',
        takeId,
      );
      const attempts = (row?.attempts ?? 0) + 1;
      await db.runAsync(
        `UPDATE uploads SET status = 'failed', error = ?, attempts = ?, next_attempt_at = ? WHERE take_id = ?`,
        error instanceof Error ? error.message : String(error),
        attempts,
        Date.now() + retryDelayMs(attempts),
        takeId,
      );
    }
  }
}

export const uploadQueue = new UploadQueue();

async function onWifi(): Promise<boolean> {
  const state = await getNetworkStateAsync();
  return state.type === NetworkStateType.WIFI || state.type === NetworkStateType.ETHERNET;
}
