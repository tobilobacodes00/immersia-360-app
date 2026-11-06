import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { parseSettings, type Settings } from '@/domain/settings';
import { getSettings, saveDraft } from '@/data/settings-store';

type DraftContext = {
  draft: Settings;
  /** Edits the draft. Nothing is stored until `save`. */
  edit: (change: (draft: Settings) => Settings) => void;
  dirty: boolean;
  save: () => void;
};

const Context = createContext<DraftContext | null>(null);

/**
 * The Settings modal edits a copy (the reference's Cancel / Save). Every screen inside the modal shares it,
 * so a picker pushed from Settings changes the same draft.
 */
export function SettingsDraftProvider({ children }: { children: ReactNode }) {
  const [base] = useState(getSettings);
  const [draft, setDraft] = useState(base);

  const edit = useCallback(
    (change: (draft: Settings) => Settings) => setDraft((d) => parseSettings(change(d))),
    [],
  );
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(base), [draft, base]);
  const save = useCallback(() => saveDraft(base, draft), [base, draft]);

  const value = useMemo(() => ({ draft, edit, dirty, save }), [draft, edit, dirty, save]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSettingsDraft(): DraftContext {
  const value = useContext(Context);
  if (!value) throw new Error('useSettingsDraft must be used inside the Settings modal.');
  return value;
}
