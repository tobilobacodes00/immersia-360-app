import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';

import { isPortraitVideoShape, readPngInfo } from '@/domain/png';

import { useLiveQuery } from './live';
import { updateSettings } from './settings-store';
import { resolveFile } from './takes';

export type Overlay = {
  id: string;
  name: string;
  filePath: string;
  width: number;
  height: number;
  createdAt: number;
};
export type Track = {
  id: string;
  name: string;
  filePath: string;
  durationS: number | null;
  startS: number;
  createdAt: number;
};

const NAME_MAX = 40;
const cleanName = (name: string, fallback: string) =>
  name.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) || fallback;
/** File name without folder or extension, as a starting name: "Wedding frame.png" → "Wedding frame". */
const baseName = (fileName: string) => fileName.replace(/^.*\//, '').replace(/\.[^.]+$/, '');

// ---- Overlay frames ----

export type FrameCheck =
  { ok: true; width: number; height: number; portrait: boolean } | { ok: false; reason: string };

/** Whether a picked image can be a frame: a PNG with transparent areas. Says why not, in plain words. */
export async function checkFrame(uri: string): Promise<FrameCheck> {
  let info;
  try {
    info = readPngInfo(await new File(uri).bytes());
  } catch {
    return { ok: false, reason: 'The image could not be read.' };
  }
  if (!info)
    return { ok: false, reason: 'Frames must be PNG images. Export your frame as a PNG and try again.' };
  if (!info.hasTransparency) {
    return {
      ok: false,
      reason:
        'This PNG has no transparent areas, so it would cover the whole video. Export it with a transparent middle.',
    };
  }
  return {
    ok: true,
    width: info.width,
    height: info.height,
    portrait: isPortraitVideoShape(info.width, info.height),
  };
}

export async function addOverlay(
  db: SQLiteDatabase,
  uri: string,
  fileName: string,
  size: { width: number; height: number },
): Promise<string> {
  const id = randomUUID();
  const relative = `overlays/${id}.png`;
  new Directory(Paths.document, 'overlays').create({ intermediates: true, idempotent: true });
  await new File(uri).copy(new File(Paths.document, relative));
  await db.runAsync(
    'INSERT INTO overlays (id, name, file_path, width, height, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    cleanName(baseName(fileName), 'Frame'),
    relative,
    size.width,
    size.height,
    Date.now(),
  );
  return id;
}

export async function renameOverlay(db: SQLiteDatabase, id: string, name: string) {
  await db.runAsync('UPDATE overlays SET name = ? WHERE id = ?', cleanName(name, 'Frame'), id);
}

/** Deletes a frame. Takes already recorded with it keep their videos; new ones are made without it. */
export async function deleteOverlay(db: SQLiteDatabase, overlay: Overlay) {
  removeQuietly(overlay.filePath);
  await db.runAsync('DELETE FROM overlays WHERE id = ?', overlay.id);
  updateSettings((s) =>
    s.look.overlayId === overlay.id ? { ...s, look: { ...s.look, overlayId: null } } : s,
  );
}

export function useOverlays(): Overlay[] | undefined {
  return useLiveQuery(['overlays'], 'all', async (db) => {
    const rows = await db.getAllAsync<{
      id: string;
      name: string;
      file_path: string;
      width: number;
      height: number;
      created_at: number;
    }>('SELECT * FROM overlays ORDER BY created_at DESC');
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      filePath: r.file_path,
      width: r.width,
      height: r.height,
      createdAt: r.created_at,
    }));
  });
}

// ---- Music ----

export const MUSIC_TYPES = [
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/wav',
  'audio/x-wav',
  'audio/*',
];

export async function addTrack(
  db: SQLiteDatabase,
  uri: string,
  fileName: string,
  durationS: number | null,
): Promise<string> {
  const id = randomUUID();
  const extension = (fileName.match(/\.[a-z0-9]+$/i)?.[0] ?? '.m4a').toLowerCase();
  const relative = `music/${id}${extension}`;
  new Directory(Paths.document, 'music').create({ intermediates: true, idempotent: true });
  await new File(uri).copy(new File(Paths.document, relative));
  await db.runAsync(
    'INSERT INTO tracks (id, name, file_path, duration_s, start_s, created_at) VALUES (?, ?, ?, ?, 0, ?)',
    id,
    cleanName(baseName(fileName), 'Song'),
    relative,
    durationS,
    Date.now(),
  );
  return id;
}

export async function renameTrack(db: SQLiteDatabase, id: string, name: string) {
  await db.runAsync('UPDATE tracks SET name = ? WHERE id = ?', cleanName(name, 'Song'), id);
}

export async function setTrackStart(db: SQLiteDatabase, id: string, startS: number) {
  await db.runAsync(
    'UPDATE tracks SET start_s = ? WHERE id = ?',
    Math.max(0, Math.round(startS * 10) / 10),
    id,
  );
}

export async function setTrackDuration(db: SQLiteDatabase, id: string, durationS: number) {
  await db.runAsync('UPDATE tracks SET duration_s = ? WHERE id = ? AND duration_s IS NULL', durationS, id);
}

export async function deleteTrack(db: SQLiteDatabase, track: Track) {
  removeQuietly(track.filePath);
  await db.runAsync('DELETE FROM tracks WHERE id = ?', track.id);
  updateSettings((s) => (s.look.trackId === track.id ? { ...s, look: { ...s.look, trackId: null } } : s));
}

export function useTracks(): Track[] | undefined {
  return useLiveQuery(['tracks'], 'all', async (db) => {
    const rows = await db.getAllAsync<{
      id: string;
      name: string;
      file_path: string;
      duration_s: number | null;
      start_s: number;
      created_at: number;
    }>('SELECT * FROM tracks ORDER BY created_at DESC');
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      filePath: r.file_path,
      durationS: r.duration_s,
      startS: r.start_s,
      createdAt: r.created_at,
    }));
  });
}

// ---- For the video queue ----

/** The files a take's recipe names, if they still exist. A deleted frame or song is simply left out. */
export async function lookFiles(
  db: SQLiteDatabase,
  overlayId: string | null,
  trackId: string | null,
): Promise<{ overlayUri: string | null; audioUri: string | null; audioStartS: number }> {
  const overlay = overlayId
    ? await db.getFirstAsync<{ file_path: string }>('SELECT file_path FROM overlays WHERE id = ?', overlayId)
    : null;
  const track = trackId
    ? await db.getFirstAsync<{ file_path: string; start_s: number }>(
        'SELECT file_path, start_s FROM tracks WHERE id = ?',
        trackId,
      )
    : null;
  const existing = (path: string | undefined) => {
    if (!path) return null;
    const file = resolveFile(path);
    return file.exists ? file.uri : null;
  };
  return {
    overlayUri: existing(overlay?.file_path),
    audioUri: existing(track?.file_path),
    audioStartS: track?.start_s ?? 0,
  };
}

function removeQuietly(relativePath: string) {
  try {
    const file = resolveFile(relativePath);
    if (file.exists) file.delete();
  } catch {
    // already gone
  }
}
