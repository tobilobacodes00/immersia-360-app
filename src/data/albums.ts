import { randomUUID } from 'expo-crypto';
import { Directory, Paths } from 'expo-file-system';
import Storage from 'expo-sqlite/kv-store';
import type { SQLiteDatabase } from 'expo-sqlite';
import { useSyncExternalStore } from 'react';

import { DEFAULT_ALBUM_ID } from './db';
import { useLiveQuery } from './live';

export type Album = { id: string; name: string; createdAt: number; takeCount: number; bytes: number };

const CURRENT_KEY = 'album.current';

export const ALBUM_NAME_MAX = 40;

export function cleanAlbumName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, ALBUM_NAME_MAX);
}

export async function listAlbums(db: SQLiteDatabase): Promise<Album[]> {
  const rows = await db.getAllAsync<{
    id: string;
    name: string;
    created_at: number;
    take_count: number;
    bytes: number;
  }>(`
    SELECT a.id, a.name, a.created_at,
           COUNT(t.id) AS take_count,
           COALESCE(SUM(COALESCE(t.original_bytes, 0) + COALESCE(t.video_bytes, 0)), 0) AS bytes
    FROM albums a LEFT JOIN takes t ON t.album_id = a.id
    GROUP BY a.id
    ORDER BY a.id = '${DEFAULT_ALBUM_ID}' DESC, a.created_at DESC`);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    takeCount: r.take_count,
    bytes: r.bytes,
  }));
}

export async function createAlbum(db: SQLiteDatabase, name: string): Promise<string> {
  const clean = cleanAlbumName(name);
  if (!clean) throw new Error('An album needs a name.');
  const id = randomUUID();
  await db.runAsync('INSERT INTO albums (id, name, created_at) VALUES (?, ?, ?)', id, clean, Date.now());
  return id;
}

export async function renameAlbum(db: SQLiteDatabase, id: string, name: string): Promise<void> {
  const clean = cleanAlbumName(name);
  if (!clean) throw new Error('An album needs a name.');
  await db.runAsync('UPDATE albums SET name = ? WHERE id = ?', clean, id);
}

// ---- The current album: where new takes go and what the gallery shows ----

const listeners = new Set<() => void>();

function readCurrent(): string {
  return Storage.getItemSync(CURRENT_KEY) ?? DEFAULT_ALBUM_ID;
}

let current: string | undefined;

export function getCurrentAlbumId(): string {
  current ??= readCurrent();
  return current;
}

export function setCurrentAlbumId(id: string): void {
  current = id;
  Storage.setItemSync(CURRENT_KEY, id);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Called whenever the current album changes; returns the unsubscribe. */
export function subscribeCurrentAlbum(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCurrentAlbumId(): string {
  return useSyncExternalStore(subscribe, getCurrentAlbumId);
}

/** All albums, kept up to date. */
export function useAlbums(): Album[] | undefined {
  return useLiveQuery(['albums', 'takes'], 'all', listAlbums);
}

/** The current album. Falls back to Default if the stored one no longer exists. */
export function useCurrentAlbum(): Album | undefined {
  const id = useCurrentAlbumId();
  const albums = useAlbums();
  if (!albums) return undefined;
  return albums.find((a) => a.id === id) ?? albums.find((a) => a.id === DEFAULT_ALBUM_ID);
}

/** Deletes an album with every take in it, files included. The Default album cannot be deleted. */
export async function deleteAlbum(db: SQLiteDatabase, id: string): Promise<void> {
  if (id === DEFAULT_ALBUM_ID) throw new Error('The Default album cannot be deleted.');
  const takes = await db.getAllAsync<{ id: string }>('SELECT id FROM takes WHERE album_id = ?', id);
  for (const take of takes) {
    try {
      const folder = new Directory(Paths.document, `takes/${take.id}`);
      if (folder.exists) folder.delete();
    } catch {
      // keep going: the rows are removed below either way
    }
  }
  await db.runAsync('DELETE FROM takes WHERE album_id = ?', id);
  await db.runAsync('DELETE FROM albums WHERE id = ?', id);
  if (getCurrentAlbumId() === id) setCurrentAlbumId(DEFAULT_ALBUM_ID);
}
