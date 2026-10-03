import Dexie, { liveQuery, type Observable, type Table } from 'dexie';
import type { ErrorEvent, Issue, IssueStatus, SettingRecord } from '../types';

/**
 * Single source of truth for the IndexedDB layout. Changing `DB_CONFIG.version`
 * requires a matching `this.version(n).stores(...)` upgrade declaration below.
 */
export const DB_CONFIG = {
  name: 'vue_sentry_clone_db',
  version: 1,
  stores: {
    issues: 'id, fingerprint, status, level, last_seen, event_count, user_count',
    events: 'id, issue_id, timestamp, level, fingerprint',
    settings: 'key'
  }
} as const;

export class ErrorTrackerDatabase extends Dexie {
  issues!: Table<Issue, string>;
  events!: Table<ErrorEvent, string>;
  settings!: Table<SettingRecord, string>;

  constructor() {
    super(DB_CONFIG.name);
    this.version(DB_CONFIG.version).stores({
      issues: DB_CONFIG.stores.issues,
      events: DB_CONFIG.stores.events,
      settings: DB_CONFIG.stores.settings
    });
  }
}

export const db = new ErrorTrackerDatabase();

/** Every issue, newest activity first. */
export function observeAllIssues(): Observable<Issue[]> {
  return liveQuery(() => db.issues.orderBy('last_seen').reverse().toArray());
}

/** A single issue by primary key; emits `undefined` once the row is removed. */
export function observeIssueById(issueId: string): Observable<Issue | undefined> {
  return liveQuery(() => db.issues.get(issueId));
}

/** All events attached to an issue, oldest first (stable stepper ordering). */
export function observeEventsForIssue(issueId: string): Observable<ErrorEvent[]> {
  return liveQuery(() =>
    db.events.where('issue_id').equals(issueId).sortBy('timestamp')
  );
}

/** Most recent events across every issue, newest first. */
export function observeRecentEvents(limit = 100): Observable<ErrorEvent[]> {
  return liveQuery(async () => {
    const rows = await db.events.orderBy('timestamp').reverse().limit(limit).toArray();
    return rows;
  });
}

/** Unresolved/resolved/ignored tallies used by the sidebar counters. */
export function observeStatusTallies(): Observable<Record<IssueStatus, number>> {
  return liveQuery(async () => {
    const tallies: Record<IssueStatus, number> = {
      unresolved: 0,
      resolved: 0,
      ignored: 0
    };
    await db.issues.each((issue: Issue) => {
      if (issue.status in tallies) {
        tallies[issue.status] += 1;
      }
    });
    return tallies;
  });
}

/** Distinct environment tag values observed across all issues. */
export function observeEnvironments(): Observable<string[]> {
  return liveQuery(async () => {
    const environments = new Set<string>();
    await db.issues.each((issue: Issue) => {
      for (const environment of issue.environments) {
        environments.add(environment);
      }
    });
    return Array.from(environments).sort((a, b) => a.localeCompare(b));
  });
}

/** Settings row read with a caller supplied fallback. */
export async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row === undefined ? fallback : (row.value as T);
}

/** Upsert a settings row. Values are stored verbatim (structured clone). */
export async function writeSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}

/** Wipe every table — used by the settings screen "reset local data" action. */
export async function resetDatabase(): Promise<void> {
  await db.transaction('rw', [db.issues, db.events, db.settings], async () => {
    await Promise.all([db.issues.clear(), db.events.clear(), db.settings.clear()]);
  });
}