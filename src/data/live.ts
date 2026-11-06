import { addDatabaseChangeListener, useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Runs `query` now and again whenever one of `tables` changes, from any screen or background job.
 * Uses SQLite's own change hook (the database is opened with `enableChangeListener`), so writers never need
 * to remember to notify readers. Results from a stale run are dropped.
 */
export function useLiveQuery<T>(
  tables: readonly string[],
  query: (db: SQLiteDatabase) => Promise<T>,
  deps: unknown[],
) {
  const db = useSQLiteContext();
  const [data, setData] = useState<T | undefined>(undefined);
  const run = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableQuery = useCallback(query, deps);
  const tableKey = tables.join(',');

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      const id = ++run.current;
      stableQuery(db).then(
        (result) => alive && id === run.current && setData(result),
        (error: unknown) => console.warn('[live query]', error),
      );
    };
    refresh();
    const watched = new Set(tableKey.split(','));
    const subscription = addDatabaseChangeListener((event) => {
      if (watched.has(event.tableName)) refresh();
    });
    return () => {
      alive = false;
      subscription.remove();
    };
  }, [db, stableQuery, tableKey]);

  return data;
}
