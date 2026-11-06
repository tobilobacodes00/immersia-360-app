import type { SQLiteDatabase } from 'expo-sqlite';

import { getCurrentAlbumId, subscribeCurrentAlbum } from '@/data/albums';
import { getSettings } from '@/data/settings-store';
import { getSharingConfig } from '@/data/sharing-config';
import { sharingApi } from '@/platform/sharing-api';

type BoothEvent =
  | { type: 'booth.recording'; countdownS: number; recordS: number }
  | { type: 'booth.creating' }
  | { type: 'booth.idle' };

/** Tells paired Displays what the booth is doing. Silent when sharing is off or not set up. */
export function sendBoothEvent(event: BoothEvent): void {
  const config = getSharingConfig();
  if (!config || !getSettings().sharing.enabled) return;
  void sharingApi.event(config, event);
}

/** Keeps the Displays on the current album: tells the server whenever the album changes. */
export function startAlbumSync(db: SQLiteDatabase): () => void {
  const send = async () => {
    const config = getSharingConfig();
    if (!config || !getSettings().sharing.enabled) return;
    const row = await db.getFirstAsync<{ name: string }>(
      'SELECT name FROM albums WHERE id = ?',
      getCurrentAlbumId(),
    );
    if (row) void sharingApi.event(config, { type: 'album.changed', album: row.name });
  };
  void send();
  return subscribeCurrentAlbum(() => void send());
}
