import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';

import { useLiveQuery } from './live';

import type { Settings } from '@/domain/settings';
import { buildPlan, type Plan } from '@/domain/timeline';
import type { CameraPosition, RecordedClip } from '@/platform/camera';

export type TakeStatus = 'recorded' | 'creating' | 'ready' | 'failed';

/** Everything needed to make (or remake) the video, frozen when the take is recorded. */
export type Recipe = {
  plan: Plan;
  overlayId: string | null;
  trackId: string | null;
  outputSize: Settings['output']['size'];
  mirror: boolean;
};

export type Take = {
  id: string;
  albumId: string;
  createdAt: number;
  position: CameraPosition;
  lensName: string | null;
  width: number;
  height: number;
  fps: number;
  durationS: number;
  recipe: Recipe;
  originalPath: string | null;
  originalBytes: number | null;
  videoPath: string | null;
  videoBytes: number | null;
  thumbPath: string | null;
  status: TakeStatus;
  progress: number;
  error: string | null;
};

type TakeRow = {
  id: string;
  album_id: string;
  created_at: number;
  camera_position: CameraPosition;
  lens_name: string | null;
  width: number;
  height: number;
  fps: number;
  duration_s: number;
  recipe_json: string;
  original_path: string | null;
  original_bytes: number | null;
  video_path: string | null;
  video_bytes: number | null;
  thumb_path: string | null;
  status: TakeStatus;
  progress: number;
  error: string | null;
};

const fromRow = (r: TakeRow): Take => ({
  id: r.id,
  albumId: r.album_id,
  createdAt: r.created_at,
  position: r.camera_position,
  lensName: r.lens_name,
  width: r.width,
  height: r.height,
  fps: r.fps,
  durationS: r.duration_s,
  recipe: JSON.parse(r.recipe_json) as Recipe,
  originalPath: r.original_path,
  originalBytes: r.original_bytes,
  videoPath: r.video_path,
  videoBytes: r.video_bytes,
  thumbPath: r.thumb_path,
  status: r.status,
  progress: r.progress,
  error: r.error,
});

/** Where a take's files live, relative to Documents: `takes/<id>/original.mov`. */
export const takeFolder = (id: string) => `takes/${id}`;

/** A stored relative path as a file the app can open now. */
export function resolveFile(relativePath: string): File {
  return new File(Paths.document, relativePath);
}

/**
 * Moves a finished recording out of the camera's temporary folder (which iOS may empty at any time) into the
 * take's own folder, then records the take. Nothing is processed before this has happened, so a crash at any
 * later point still leaves the original and a row pointing at it.
 */
export async function saveTake(
  db: SQLiteDatabase,
  clip: RecordedClip,
  context: { albumId: string; position: CameraPosition; settings: Settings },
): Promise<string> {
  const id = randomUUID();
  const folder = new Directory(Paths.document, takeFolder(id));
  folder.create({ intermediates: true, idempotent: true });

  const source = new File(clip.uri);
  const extension = source.extension || '.mov';
  const relative = `${takeFolder(id)}/original${extension}`;
  const destination = new File(Paths.document, relative);
  try {
    await source.move(destination);
  } catch (error) {
    folder.delete();
    throw error;
  }

  const { settings } = context;
  const recipe: Recipe = {
    plan: buildPlan(settings.recording, clip.fps, clip.durationS),
    overlayId: settings.look.overlayId,
    trackId: settings.look.trackId,
    outputSize: settings.output.size,
    mirror: context.position === 'front' && settings.camera.front.mirror,
  };

  await db.runAsync(
    `INSERT INTO takes (id, album_id, created_at, camera_position, lens_name, width, height, fps, duration_s,
       recipe_json, original_path, original_bytes, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'recorded')`,
    id,
    context.albumId,
    Date.now(),
    context.position,
    clip.lensName,
    clip.width,
    clip.height,
    clip.fps,
    clip.durationS,
    JSON.stringify(recipe),
    relative,
    destination.size || null,
  );
  return id;
}

export async function getTake(db: SQLiteDatabase, id: string): Promise<Take | null> {
  const row = await db.getFirstAsync<TakeRow>('SELECT * FROM takes WHERE id = ?', id);
  return row ? fromRow(row) : null;
}

export async function listTakes(db: SQLiteDatabase, albumId: string): Promise<Take[]> {
  const rows = await db.getAllAsync<TakeRow>(
    'SELECT * FROM takes WHERE album_id = ? ORDER BY created_at DESC',
    albumId,
  );
  return rows.map(fromRow);
}

/** Deletes a recording that was stopped and discarded before it became a take. */
export function discardClip(clip: RecordedClip): void {
  try {
    const file = new File(clip.uri);
    if (file.exists) file.delete();
  } catch {
    // Already gone, or in a temporary folder iOS clears anyway.
  }
}

/** One take, kept up to date as its video is made. `null` once it no longer exists. */
export function useTake(id: string): Take | null | undefined {
  return useLiveQuery(['takes'], id, (db) => getTake(db, id));
}

/** The takes of one album, newest first, kept up to date. */
export function useTakes(albumId: string): Take[] | undefined {
  return useLiveQuery(['takes'], albumId, (db) => listTakes(db, albumId));
}

/** Deletes a take's files and its row. */
export async function deleteTake(db: SQLiteDatabase, id: string): Promise<void> {
  const folder = new Directory(Paths.document, takeFolder(id));
  try {
    if (folder.exists) folder.delete();
  } catch {
    // Files already gone: still remove the row so the gallery does not show a dead take.
  }
  await db.runAsync('DELETE FROM takes WHERE id = ?', id);
}
