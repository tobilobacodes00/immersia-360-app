import { addDatabaseChangeListener, useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useEffect, useEffectEvent, useState } from 'react';

/**
 * Runs `query` now and again whenever one of `tables` changes, from any screen or background job.
 * Uses SQLite's own change hook (the database is opened with `enableChangeListener`), so writers never need
 * to remember to notify readers. Results from a stale run are dropped.
 *
 * @param key identifies the query's inputs (for example the album id): the query runs again when it changes.
 */
export function useLiveQuery<T>(
  tables: readonly string[],
  key: string,
  query: (db: SQLiteDatabase) => Promise<T>,
): T | undefined {
  const db = useSQLiteContext();
  const [data, setData] = useState<T | undefined>(undefined);
  const runQuery = useEffectEvent((database: SQLiteDatabase) => query(database));
  const tableKey = tables.join(',');

  useEffect(() => {
    let alive = true;
    let run = 0;
    const refresh = () => {
      const id = ++run;
      runQuery(db).then(
        (result) => {
          if (alive && id === run) setData(result);
        },
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
  }, [db, tableKey, key]);

  return data;
}
