import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

import { parseSettings, type Settings } from '@/domain/settings';

import { mergeChanges } from './merge';

const KEY = 'settings.v1';

let current: Settings | undefined;
const listeners = new Set<() => void>();

function load(): Settings {
  let stored: unknown;
  try {
    const raw = Storage.getItemSync(KEY);
    stored = raw ? JSON.parse(raw) : undefined;
  } catch {
    stored = undefined; // unreadable JSON: every field falls back to its default
  }
  return parseSettings(stored);
}

export function getSettings(): Settings {
  current ??= load();
  return current;
}

/** Validates and stores the settings, then re-renders every screen that reads them. */
export function saveSettings(next: Settings): Settings {
  current = parseSettings(next);
  Storage.setItemSync(KEY, JSON.stringify(current));
  for (const listener of listeners) listener();
  return current;
}

export function updateSettings(change: (s: Settings) => Settings): Settings {
  return saveSettings(change(getSettings()));
}

/** Saves a draft that was edited from `base`, keeping anything saved elsewhere since. */
export function saveDraft(base: Settings, draft: Settings): Settings {
  return saveSettings(mergeChanges(base, draft, getSettings()));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings);
}
