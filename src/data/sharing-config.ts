import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

export { normaliseServer } from '@/domain/server-url';

/**
 * Where the sharing server is and the key that proves this phone belongs to its owner. The key lives in the
 * iOS Keychain (SecureStore), never in the settings database or a backup in plain text.
 */
export type SharingConfig = { server: string; key: string };

const SERVER_KEY = 'sharing.server';
const SECRET_KEY = 'sharing.key';

let current: SharingConfig | null | undefined;
const listeners = new Set<() => void>();

function load(): SharingConfig | null {
  const server = Storage.getItemSync(SERVER_KEY);
  const key = SecureStore.getItem(SECRET_KEY);
  return server && key ? { server, key } : null;
}

export function getSharingConfig(): SharingConfig | null {
  if (current === undefined) current = load();
  return current;
}

export async function saveSharingConfig(config: SharingConfig): Promise<void> {
  await SecureStore.setItemAsync(SECRET_KEY, config.key);
  Storage.setItemSync(SERVER_KEY, config.server);
  current = config;
  for (const l of listeners) l();
}

export async function clearSharingConfig(): Promise<void> {
  await SecureStore.deleteItemAsync(SECRET_KEY);
  Storage.removeItemSync(SERVER_KEY);
  current = null;
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSharingConfig(): SharingConfig | null {
  return useSyncExternalStore(subscribe, getSharingConfig);
}
