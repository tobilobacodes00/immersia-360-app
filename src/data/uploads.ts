import type { SQLiteDatabase } from 'expo-sqlite';

import type { Upload, UploadStatus } from '@/jobs/uploads';

import { useLiveQuery } from './live';

type UploadRow = {
  take_id: string;
  share_id: string | null;
  url: string | null;
  expires_at: number | null;
  status: UploadStatus;
  progress: number;
  error: string | null;
  attempts: number;
  next_attempt_at: number;
};

const fromRow = (r: UploadRow): Upload => ({
  takeId: r.take_id,
  shareId: r.share_id,
  url: r.url,
  expiresAt: r.expires_at,
  status: r.status,
  progress: r.progress,
  error: r.error,
  attempts: r.attempts,
  nextAttemptAt: r.next_attempt_at,
});

export async function getUpload(db: SQLiteDatabase, takeId: string): Promise<Upload | null> {
  const row = await db.getFirstAsync<UploadRow>('SELECT * FROM uploads WHERE take_id = ?', takeId);
  return row ? fromRow(row) : null;
}

/** One take's upload, live. `null` when the take is not shared. */
export function useUpload(takeId: string): Upload | null | undefined {
  return useLiveQuery(['uploads'], takeId, (db) => getUpload(db, takeId));
}

/** Every upload, newest first, with the take's date for the list. */
export function useUploads(): (Upload & { createdAt: number })[] | undefined {
  return useLiveQuery(['uploads', 'takes'], 'all', async (db) => {
    const rows = await db.getAllAsync<UploadRow & { take_created_at: number }>(
      `SELECT u.*, t.created_at AS take_created_at FROM uploads u JOIN takes t ON t.id = u.take_id
       ORDER BY t.created_at DESC`,
    );
    return rows.map((r) => ({ ...fromRow(r), createdAt: r.take_created_at }));
  });
}

/** Uploads still to finish: the Sharing button's badge. */
export function usePendingUploads(): number {
  return (
    useLiveQuery(['uploads'], 'pending', async (db) => {
      const row = await db.getFirstAsync<{ n: number }>(
        `SELECT COUNT(*) AS n FROM uploads WHERE status != 'online'`,
      );
      return row?.n ?? 0;
    }) ?? 0
  );
}

export { daysLeft } from '@/domain/sharing';
