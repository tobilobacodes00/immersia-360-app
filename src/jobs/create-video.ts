import { randomUUID } from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import * as VideoThumbnails from 'expo-video-thumbnails';

import { lookFiles } from '@/data/look';
import { getSettings } from '@/data/settings-store';
import { getTake, NOT_MADE, resolveFile, takeFolder, type Take } from '@/data/takes';
import { thumbnailTimeS } from '@/domain/timeline';
import { composer, type ComposeRequest } from '@/platform/composer';
import { saveVideoToPhotos } from '@/platform/share';
import { getSharingConfig } from '@/data/sharing-config';

import { sendBoothEvent } from './hub';
import { uploadQueue } from './uploads';

/** Error stored on a take whose video the operator cancelled: shown as "not made yet", not as a failure. */
export const CANCELLED = NOT_MADE;

const OUTPUT = {
  '1080p': { width: 1080, height: 1920, bitrate: 12e6 },
  '720p': { width: 720, height: 1280, bitrate: 6e6 },
} as const;

/** Progress is written to the database (which every screen watches) at most this often. */
const PROGRESS_WRITE_MS = 250;

/**
 * Makes videos one at a time, in the order takes were recorded. The queue lives for the whole app session.
 * On launch it picks up any take that was waiting or half made when the app last stopped, so a crash or a
 * force-quit mid-render never strands a take.
 */
class VideoQueue {
  private db: SQLiteDatabase | null = null;
  private pending: string[] = [];
  private active: { takeId: string; jobId: string; cancelled: boolean } | null = null;
  private running = false;
  private held = false;

  async start(db: SQLiteDatabase): Promise<void> {
    if (this.db) return;
    this.db = db;
    const waiting = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM takes WHERE status IN ('recorded', 'creating') ORDER BY created_at`,
    );
    for (const { id } of waiting) this.enqueue(id);
  }

  /**
   * Holds off starting the next video while the camera records: a 240 fps capture and a video encode at once
   * risk dropped frames and a hot phone. A video already being made carries on.
   */
  hold(on: boolean): void {
    this.held = on;
    if (!on) void this.drain();
  }

  enqueue(takeId: string): void {
    if (this.active?.takeId === takeId || this.pending.includes(takeId)) return;
    this.pending.push(takeId);
    void this.drain();
  }

  async cancel(takeId: string): Promise<void> {
    const db = this.db;
    if (!db) return;
    if (this.active?.takeId === takeId) {
      this.active.cancelled = true;
      composer.cancel(this.active.jobId);
      return; // the running job records the cancellation when the engine stops
    }
    this.pending = this.pending.filter((id) => id !== takeId);
    await db.runAsync(
      `UPDATE takes SET status = 'failed', error = ?, progress = 0 WHERE id = ?`,
      CANCELLED,
      takeId,
    );
  }

  private async drain(): Promise<void> {
    if (this.running || !this.db) return;
    this.running = true;
    try {
      while (!this.held && this.pending.length > 0) await this.make(this.db, this.pending.shift()!);
    } finally {
      this.running = false;
    }
  }

  private async make(db: SQLiteDatabase, takeId: string): Promise<void> {
    const take = await getTake(db, takeId);
    if (!take) return;
    if (!take.originalPath) {
      await fail(db, takeId, 'The original clip is gone, so this video cannot be made.');
      return;
    }

    const jobId = randomUUID();
    this.active = { takeId, jobId, cancelled: false };
    await db.runAsync(
      `UPDATE takes SET status = 'creating', progress = 0, error = NULL WHERE id = ?`,
      takeId,
    );

    let lastWrite = 0;
    try {
      const look = await lookFiles(db, take.recipe.overlayId, take.recipe.trackId);
      const request = buildRequest(take, jobId, look);
      const result = await composer.compose(request, (fraction) => {
        const now = Date.now();
        if (now - lastWrite < PROGRESS_WRITE_MS && fraction < 1) return;
        lastWrite = now;
        void db.runAsync(
          `UPDATE takes SET progress = ? WHERE id = ? AND status = 'creating'`,
          fraction,
          takeId,
        );
      });

      const videoRelative = `${takeFolder(takeId)}/${result.outputPath.split('/').pop()}`;
      const thumbRelative = await makeThumbnail(
        takeId,
        videoRelative,
        thumbnailTimeS(take.recipe.plan),
        result.durationS,
      );

      if (take.videoPath && take.videoPath !== videoRelative) deleteQuietly(take.videoPath);
      if (take.thumbPath && take.thumbPath !== thumbRelative) deleteQuietly(take.thumbPath);
      await db.runAsync(
        `UPDATE takes SET status = 'ready', progress = 1, error = NULL, video_path = ?, video_bytes = ?, thumb_path = ?
         WHERE id = ?`,
        videoRelative,
        result.bytes,
        thumbRelative,
        takeId,
      );

      if (getSettings().sharing.enabled && getSharingConfig()) void uploadQueue.share(takeId);
      sendBoothEvent({ type: 'booth.idle' });

      if (getSettings().storage.autoSaveToPhotos) {
        await saveVideoToPhotos(resolveFile(videoRelative).uri, { quiet: true });
      }

      if (!getSettings().storage.saveOriginals) {
        deleteQuietly(take.originalPath);
        await db.runAsync(
          'UPDATE takes SET original_path = NULL, original_bytes = NULL WHERE id = ?',
          takeId,
        );
      }
    } catch (error) {
      if (this.active?.cancelled) {
        await db.runAsync(
          `UPDATE takes SET status = 'failed', error = ?, progress = 0 WHERE id = ?`,
          CANCELLED,
          takeId,
        );
      } else {
        await fail(db, takeId, error instanceof Error ? error.message : String(error));
      }
    } finally {
      this.active = null;
    }
  }
}

export const videoQueue = new VideoQueue();

function buildRequest(
  take: Take,
  jobId: string,
  look: { overlayUri: string | null; audioUri: string | null; audioStartS: number },
): ComposeRequest {
  const { recipe } = take;
  const out = OUTPUT[recipe.outputSize];
  return {
    jobId,
    inputPath: toPath(resolveFile(take.originalPath!).uri),
    // A new name each time: when a video is made again, the old one stays until the new one is done.
    outputPath: toPath(new File(Paths.document, `${takeFolder(take.id)}/video-${Date.now()}.mp4`).uri),
    segments: recipe.plan.segments,
    reverse: recipe.plan.reverse,
    outputFps: recipe.plan.outputFps,
    width: out.width,
    height: out.height,
    bitrate: out.bitrate,
    overlayPath: look.overlayUri ? toPath(look.overlayUri) : null,
    audioPath: look.audioUri ? toPath(look.audioUri) : null,
    audioStartS: look.audioStartS,
    audioFadeOutS: 1,
    mirror: recipe.mirror,
  };
}

async function makeThumbnail(
  takeId: string,
  videoRelative: string,
  atS: number,
  durationS: number,
): Promise<string | null> {
  try {
    const time = Math.max(0, Math.min(atS, durationS - 0.1));
    const { uri } = await VideoThumbnails.getThumbnailAsync(resolveFile(videoRelative).uri, {
      time: Math.round(time * 1000),
      quality: 0.7,
    });
    // A new name each time so image caches never show a thumbnail of the previous video.
    const relative = `${takeFolder(takeId)}/thumb-${Date.now()}.jpg`;
    const destination = new File(Paths.document, relative);
    await new File(uri).move(destination);
    return relative;
  } catch {
    return null; // a missing thumbnail is cosmetic; the gallery shows a placeholder
  }
}

async function fail(db: SQLiteDatabase, takeId: string, message: string) {
  await db.runAsync(
    `UPDATE takes SET status = 'failed', error = ?, progress = 0 WHERE id = ?`,
    message,
    takeId,
  );
}

function deleteQuietly(relativePath: string) {
  try {
    const file = resolveFile(relativePath);
    if (file.exists) file.delete();
  } catch {
    // nothing to clean up
  }
}

/** `file:///var/.../a%20b.mp4` → `/var/.../a b.mp4`, the form native engines take. */
export function toPath(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, ''));
}
