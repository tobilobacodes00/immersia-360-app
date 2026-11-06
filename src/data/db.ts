import type { SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_NAME = 'immersia360.db';

/** The album every install starts with. It can be renamed, never deleted. */
export const DEFAULT_ALBUM_ID = 'default';

/**
 * Ordered migrations. Never edit one that has shipped: add the next. `PRAGMA user_version` records how many
 * have run, so each runs exactly once, inside a transaction with the version bump.
 */
const MIGRATIONS: ((db: SQLiteDatabase) => Promise<void>)[] = [
  async (db) => {
    await db.execAsync(`
      CREATE TABLE albums (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      -- One row per recording. The original file is written and this row inserted before any processing,
      -- so a crash or a failed render never loses a take.
      CREATE TABLE takes (
        id TEXT PRIMARY KEY NOT NULL,
        album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        camera_position TEXT NOT NULL,
        lens_name TEXT,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        fps REAL NOT NULL,
        duration_s REAL NOT NULL,
        -- How to make the video (segment plan, frame, music, size), fixed when the take is recorded so a
        -- retry makes the same video even if the settings changed since. JSON, see src/data/takes.ts.
        recipe_json TEXT NOT NULL,
        -- Paths are relative to the app's Documents directory, which iOS moves between app updates.
        original_path TEXT,
        original_bytes INTEGER,
        video_path TEXT,
        video_bytes INTEGER,
        thumb_path TEXT,
        -- recorded → creating → ready, or failed (the original is kept and the video can be retried)
        status TEXT NOT NULL DEFAULT 'recorded',
        progress REAL NOT NULL DEFAULT 0,
        error TEXT
      );
      CREATE INDEX takes_album_created ON takes (album_id, created_at DESC);
    `);
    await db.runAsync(
      'INSERT INTO albums (id, name, created_at) VALUES (?, ?, ?)',
      DEFAULT_ALBUM_ID,
      'Default',
      Date.now(),
    );
  },
  // v2: the overlay frame and music libraries.
  async (db) => {
    await db.execAsync(`
      CREATE TABLE overlays (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE tracks (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        duration_s REAL,
        start_s REAL NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
    `);
  },
];

export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  for (let version = row?.user_version ?? 0; version < MIGRATIONS.length; version++) {
    await db.withExclusiveTransactionAsync(async (tx) => {
      await MIGRATIONS[version]!(tx);
      await tx.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }
}
