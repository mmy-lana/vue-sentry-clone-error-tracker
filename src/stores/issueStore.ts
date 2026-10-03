import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { db, observeAllIssues, observeStatusTallies } from '../services/db';
import { calculate24HourBuckets, computeFingerprint } from '../utils/analytics';
import type {
  BulkActionType,
  ErrorEvent,
  ErrorEventInput,
  IngestionLogEntry,
  Issue,
  IssueStatus
} from '../types';

/** Rolling window kept per issue so sub-hour histograms stay accurate. */
const MAX_ROLLING_TIMESTAMPS = 500;
const MAX_INGESTION_LOG = 200;

function createEventId(): string {
  return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createIssueId(): string {
  return `issue_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface IngestResult {
  issueId: string;
  eventId: string;
  outcome: IngestionLogEntry['outcome'];
  fingerprint: string;
}

export const useIssueStore = defineStore('issues', () => {
  const issues = ref<Issue[]>([]);
  const statusTallies = ref<Record<IssueStatus, number>>({
    unresolved: 0,
    resolved: 0,
    ignored: 0
  });
  const selectedIssueIds = ref<string[]>([]);
  const currentIssueId = ref<string | null>(null);
  const isLoading = ref<boolean>(true);
  const isProcessing = ref<boolean>(false);
  const errorMessage = ref<string | null>(null);
  const ingestionLog = ref<IngestionLogEntry[]>([]);

  let issuesSubscription: { unsubscribe: () => void } | null = null;
  let talliesSubscription: { unsubscribe: () => void } | null = null;

  const currentIssue = computed<Issue | null>(() =>
    currentIssueId.value === null
      ? null
      : (issues.value.find((issue) => issue.id === currentIssueId.value) ?? null)
  );

  const totalUnresolvedCount = computed<number>(
    () => issues.value.filter((issue) => issue.status === 'unresolved').length
  );

  const totalEventCount = computed<number>(() =>
    issues.value.reduce((sum, issue) => sum + issue.event_count, 0)
  );

  const selectedIssues = computed<Issue[]>(() =>
    issues.value.filter((issue) => selectedIssueIds.value.includes(issue.id))
  );

  const allVisibleSelected = computed<boolean>(
    () => issues.value.length > 0 && selectedIssueIds.value.length === issues.value.length
  );

  function appendLog(entry: IngestionLogEntry): void {
    ingestionLog.value = [entry, ...ingestionLog.value].slice(0, MAX_INGESTION_LOG);
  }

  /** Binds the Dexie liveQuery observables into reactive refs. */
  function startObserving(): void {
    issuesSubscription?.unsubscribe();
    talliesSubscription?.unsubscribe();

    issuesSubscription = observeAllIssues().subscribe({
      next: (rows) => {
        issues.value = rows;
        isLoading.value = false;
        // Orphan guard: drop selections and the open issue once rows vanish.
        const liveIds = new Set(rows.map((issue) => issue.id));
        selectedIssueIds.value = selectedIssueIds.value.filter((id) => liveIds.has(id));
        if (currentIssueId.value !== null && !liveIds.has(currentIssueId.value)) {
          currentIssueId.value = null;
        }
      },
      error: (error: unknown) => {
        isLoading.value = false;
        errorMessage.value = error instanceof Error ? error.message : String(error);
      }
    });

    talliesSubscription = observeStatusTallies().subscribe({
      next: (tallies) => {
        statusTallies.value = tallies;
      },
      error: () => {
        statusTallies.value = { unresolved: 0, resolved: 0, ignored: 0 };
      }
    });
  }

  function stopObserving(): void {
    issuesSubscription?.unsubscribe();
    talliesSubscription?.unsubscribe();
    issuesSubscription = null;
    talliesSubscription = null;
  }

  function selectIssue(issueId: string | null): void {
    currentIssueId.value = issueId;
  }

  /**
   * Atomic read-modify-write of an issue plus its event inside a single Dexie
   * transaction, so concurrent ingests cannot interleave partial updates.
   */
  async function ingestEvent(rawEvent: ErrorEventInput): Promise<IngestResult> {
    const frames = rawEvent.exception?.stacktrace?.frames ?? [];
    const fingerprint = rawEvent.fingerprint ?? computeFingerprint(
      rawEvent.exception?.type ?? 'Error',
      rawEvent.message ?? '',
      frames
    );
    const timestamp = rawEvent.timestamp && rawEvent.timestamp > 0 ? rawEvent.timestamp : Date.now();
    const environment = rawEvent.tags?.environment ?? 'production';
    const eventId = rawEvent.id ?? createEventId();

    let issueId = '';
    let outcome: IngestionLogEntry['outcome'] = 'created';

    await db.transaction('rw', [db.issues, db.events], async () => {
      const existingIssue = await db.issues.where('fingerprint').equals(fingerprint).first();

      if (existingIssue) {
        issueId = existingIssue.id;
        const regressed = existingIssue.status === 'resolved';
        outcome = regressed ? 'regressed' : 'merged';

        const rollingTimestamps = [...(existingIssue.recent_timestamps ?? []), timestamp].slice(
          -MAX_ROLLING_TIMESTAMPS
        );
        const uniqueUsers = new Set(existingIssue.unique_users ?? []);
        if (rawEvent.user?.id) uniqueUsers.add(rawEvent.user.id);
        else if (rawEvent.user?.email) uniqueUsers.add(rawEvent.user.email);

        const environments = new Set(existingIssue.environments ?? []);
        environments.add(environment);

        const tagsSummary: Record<string, Record<string, number>> = {
          ...(existingIssue.tags_summary ?? {})
        };
        for (const [key, value] of Object.entries(rawEvent.tags ?? {})) {
          const bucket = tagsSummary[key] ?? (tagsSummary[key] = {});
          bucket[value] = (bucket[value] ?? 0) + 1;
        }

        await db.issues.update(existingIssue.id, {
          last_seen: Math.max(existingIssue.last_seen, timestamp),
          first_seen: Math.min(existingIssue.first_seen, timestamp),
          level: existingIssue.status === 'unresolved' ? rawEvent.level : existingIssue.level,
          event_count: existingIssue.event_count + 1,
          user_count: uniqueUsers.size,
          unique_users: Array.from(uniqueUsers),
          environments: Array.from(environments),
          regression_count: existingIssue.regression_count + (regressed ? 1 : 0),
          recent_timestamps: rollingTimestamps,
          histogram_24h: calculate24HourBuckets(rollingTimestamps, Date.now()),
          tags_summary: tagsSummary,
          status: regressed ? 'unresolved' : existingIssue.status
        });
      } else {
        issueId = rawEvent.issue_id ?? createIssueId();
        outcome = 'created';

        const uniqueUsers = new Set<string>();
        if (rawEvent.user?.id) uniqueUsers.add(rawEvent.user.id);
        else if (rawEvent.user?.email) uniqueUsers.add(rawEvent.user.email);

        const tagsSummary: Record<string, Record<string, number>> = {};
        for (const [key, value] of Object.entries(rawEvent.tags ?? {})) {
          tagsSummary[key] = { [value]: 1 };
        }

        const issue: Issue = {
          id: issueId,
          project_id: rawEvent.project_id,
          fingerprint,
          title: `${rawEvent.exception?.type ?? 'Error'}: ${rawEvent.message ?? ''}`,
          culprit: rawEvent.culprit || 'unknown location',
          level: rawEvent.level,
          status: 'unresolved',
          first_seen: timestamp,
          last_seen: timestamp,
          event_count: 1,
          user_count: uniqueUsers.size,
          unique_users: Array.from(uniqueUsers),
          environments: [environment],
          regression_count: 0,
          recent_timestamps: [timestamp],
          histogram_24h: calculate24HourBuckets([timestamp], Date.now()),
          tags_summary: tagsSummary
        };

        await db.issues.add(issue);
      }

      const event: ErrorEvent = {
        ...rawEvent,
        timestamp,
        platform: rawEvent.platform ?? 'javascript',
        level: rawEvent.level,
        message: rawEvent.message ?? rawEvent.exception?.value ?? 'Unknown error',
        culprit: rawEvent.culprit || 'unknown location',
        fingerprint,
        exception: rawEvent.exception ?? {
          type: 'Error',
          value: rawEvent.message ?? 'Unknown error',
          stacktrace: { frames: [] }
        },
        breadcrumbs: rawEvent.breadcrumbs ?? [],
        tags: rawEvent.tags ?? {},
        device: rawEvent.device ?? {
          browser: 'Unknown',
          browser_version: '0',
          os: 'Unknown',
          os_version: '0',
          viewport: '0x0'
        },
        sdk: rawEvent.sdk ?? { name: 'vue-sentry-tracker', version: '1.0.0' },
        id: eventId,
        issue_id: issueId
      };

      await db.events.add(event);
    });

    appendLog({
      id: `log_${eventId}`,
      timestamp: Date.now(),
      outcome,
      issue_id: issueId,
      issue_title: rawEvent.message ?? rawEvent.exception?.type ?? 'Error',
      level: rawEvent.level,
      fingerprint,
      detail:
        outcome === 'created'
          ? 'New fingerprint group created'
          : outcome === 'regressed'
            ? 'Resolved issue re-opened'
            : 'Merged into an existing fingerprint group'
    });

    return { issueId, eventId, outcome, fingerprint };
  }

  async function updateStatus(issueIds: string[], status: IssueStatus): Promise<void> {
    if (issueIds.length === 0) return;
    isProcessing.value = true;
    try {
      await db.transaction('rw', db.issues, async () => {
        for (const id of issueIds) {
          await db.issues.update(id, { status });
        }
      });
      selectedIssueIds.value = selectedIssueIds.value.filter((id) => !issueIds.includes(id));
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      isProcessing.value = false;
    }
  }

  async function deleteIssues(issueIds: string[]): Promise<void> {
    if (issueIds.length === 0) return;
    isProcessing.value = true;
    try {
      await db.transaction('rw', [db.issues, db.events], async () => {
        for (const id of issueIds) {
          await db.issues.delete(id);
          await db.events.where('issue_id').equals(id).delete();
        }
      });
      selectedIssueIds.value = selectedIssueIds.value.filter((id) => !issueIds.includes(id));
      if (currentIssueId.value !== null && issueIds.includes(currentIssueId.value)) {
        currentIssueId.value = null;
      }
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      isProcessing.value = false;
    }
  }

  async function applyBulkAction(request: { issue_ids: string[]; action: BulkActionType }): Promise<void> {
    const targets = [...request.issue_ids];
    if (targets.length === 0) return;

    if (request.action === 'delete') {
      await deleteIssues(targets);
      return;
    }

    const status: IssueStatus =
      request.action === 'resolve' ? 'resolved' : request.action === 'ignore' ? 'ignored' : 'unresolved';
    await updateStatus(targets, status);
  }

  async function assignIssue(issueId: string, assignee: string | null): Promise<void> {
    await db.issues.update(issueId, { assigned_to: assignee ?? undefined });
  }

  function toggleSelection(issueId: string): void {
    selectedIssueIds.value = selectedIssueIds.value.includes(issueId)
      ? selectedIssueIds.value.filter((id) => id !== issueId)
      : [...selectedIssueIds.value, issueId];
  }

  /** Passing the current selection clears it (select-all toggle behaviour). */
  function toggleSelectAll(allIds: string[]): void {
    selectedIssueIds.value =
      allIds.length > 0 && allIds.length === selectedIssueIds.value.length ? [] : [...allIds];
  }

  function clearSelection(): void {
    selectedIssueIds.value = [];
  }

  function clearIngestionLog(): void {
    ingestionLog.value = [];
  }

  return {
    issues,
    statusTallies,
    selectedIssueIds,
    currentIssueId,
    currentIssue,
    isLoading,
    isProcessing,
    errorMessage,
    ingestionLog,
    totalUnresolvedCount,
    totalEventCount,
    selectedIssues,
    allVisibleSelected,
    startObserving,
    stopObserving,
    selectIssue,
    ingestEvent,
    updateStatus,
    deleteIssues,
    applyBulkAction,
    assignIssue,
    toggleSelection,
    toggleSelectAll,
    clearSelection,
    clearIngestionLog
  };
});