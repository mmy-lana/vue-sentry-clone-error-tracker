import Dexie, { type Table } from 'dexie';
import type { Issue, ErrorEvent } from '../types';

export class ErrorTrackerDatabase extends Dexie {
  issues!: Table<Issue, string>;
  events!: Table<ErrorEvent, string>;

  constructor() {
    super('vue_sentry_clone_db');
    this.version(1).stores({
      issues: 'id, fingerprint, status, level, last_seen, event_count, user_count',
      events: 'id, issue_id, timestamp, level, fingerprint'
    });
  }
}

export const db = new ErrorTrackerDatabase();
