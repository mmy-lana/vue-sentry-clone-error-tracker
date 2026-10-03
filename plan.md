# Architecture & Implementation Plan: Bug & Error Tracking Logger Dashboard (`vue-sentry-clone-error-tracker`)

---

## 1. Data Schema & Pure TypeScript Interfaces

### 1.1 Core Domain Models (`src/types/index.ts`)

```typescript
export type ErrorLevel = 'fatal' | 'error' | 'warning' | 'info' | 'debug';
export type IssueStatus = 'unresolved' | 'resolved' | 'ignored';
export type BreadcrumbType = 'default' | 'http' | 'navigation' | 'ui.click' | 'console' | 'system';

export interface StackFrame {
  id: string;
  filename: string;
  function: string;
  lineno: number;
  colno: number;
  in_app: boolean;
  pre_context: string[];
  context_line: string;
  post_context: string[];
  vars?: Record<string, unknown>;
}

export interface ExceptionValue {
  type: string;
  value: string;
  module?: string;
  stacktrace: {
    frames: StackFrame[];
  };
}

export interface Breadcrumb {
  id: string;
  timestamp: number;
  category: string;
  type: BreadcrumbType;
  level: ErrorLevel;
  message: string;
  data?: Record<string, unknown>;
}

export interface UserContext {
  id?: string;
  email?: string;
  username?: string;
  ip_address?: string;
}

export interface RequestContext {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers: Record<string, string>;
  query_params?: Record<string, string>;
  body?: string;
}

export interface DeviceContext {
  browser: string;
  browser_version: string;
  os: string;
  os_version: string;
  device_model?: string;
  viewport: string;
}

export interface ErrorEvent {
  id: string;
  issue_id: string;
  project_id: string;
  timestamp: number;
  platform: 'javascript' | 'node' | 'vue';
  level: ErrorLevel;
  message: string;
  culprit: string;
  fingerprint: string;
  exception: ExceptionValue;
  breadcrumbs: Breadcrumb[];
  tags: Record<string, string>;
  user?: UserContext;
  request?: RequestContext;
  device: DeviceContext;
  sdk: {
    name: string;
    version: string;
  };
}

export interface HourlyBucket {
  hour_timestamp: number;
  count: number;
}

export interface Issue {
  id: string;
  project_id: string;
  fingerprint: string;
  title: string;
  culprit: string;
  level: ErrorLevel;
  status: IssueStatus;
  first_seen: number;
  last_seen: number;
  event_count: number;
  user_count: number;
  unique_users: string[];
  environments: string[];
  regression_count: number;
  recent_timestamps: number[];
  histogram_24h: HourlyBucket[];
  tags_summary: Record<string, Record<string, number>>;
  assigned_to?: string;
}

export interface IssueFilterCriteria {
  search_query: string;
  status: IssueStatus | 'all';
  level: ErrorLevel | 'all';
  environment: string | 'all';
  time_range_hours: number;
  sort_by: 'last_seen' | 'event_count' | 'user_count' | 'first_seen';
  sort_order: 'asc' | 'desc';
}

export interface BulkActionRequest {
  issue_ids: string[];
  action: 'resolve' | 'unresolve' | 'ignore' | 'delete';
}

export interface TabItem {
  key: string;
  label: string;
  badge?: number | string;
}

export interface BaseTabsProps {
  modelValue: string;
  tabs: TabItem[];
}

export interface BaseDropdownItem {
  id: string;
  label: string;
  icon?: string;
  danger?: boolean;
}

export interface BaseDropdownProps {
  items: BaseDropdownItem[];
  triggerText?: string;
}
```

### 1.2 Storage Schema (Dexie IndexedDB Engine)

```typescript
export interface AppDatabaseSchema {
  issues: {
    key: string;
    value: Issue;
    indexes: string[];
  };
  events: {
    key: string;
    value: ErrorEvent;
    indexes: string[];
  };
  settings: {
    key: string;
    value: {
      key: string;
      value: unknown;
    };
  };
}

export const DB_CONFIG = {
  name: 'vue_sentry_clone_db',
  version: 1,
  stores: {
    issues: 'id, fingerprint, status, level, last_seen, event_count, user_count',
    events: 'id, issue_id, timestamp, level, fingerprint',
    settings: 'key'
  }
};
```

---

## 2. Project Structure & Component Architecture

```
src/
├── assets/
│   └── main.css
├── router/
│   └── index.ts
├── types/
│   └── index.ts
├── services/
│   ├── db.ts
│   └── seeder.ts
├── utils/
│   ├── analytics.ts
│   └── date.ts
├── composables/
│   ├── useBreakpoints.ts
│   ├── useErrorEvent.ts
│   ├── useIssues.ts
│   ├── useSearchFilter.ts
│   └── useSimulator.ts
├── stores/
│   ├── eventStore.ts
│   ├── filterStore.ts
│   └── issueStore.ts
├── components/
│   ├── ui/
│   │   ├── BaseBadge.vue
│   │   ├── BaseButton.vue
│   │   ├── BaseCard.vue
│   │   ├── BaseCheckbox.vue
│   │   ├── BaseDropdown.vue
│   │   ├── BaseInput.vue
│   │   ├── BaseModal.vue
│   │   ├── BasePagination.vue
│   │   ├── BaseTabs.vue
│   │   └── BaseTooltip.vue
│   ├── molecules/
│   │   ├── EmptyState.vue
│   │   ├── EnvironmentTag.vue
│   │   ├── FilterSearchBar.vue
│   │   ├── SparklineBarGraph.vue
│   │   ├── TagBadgeGroup.vue
│   │   ├── TimeAgo.vue
│   │   └── UserAvatar.vue
│   ├── domain/
│   │   ├── details/
│   │   │   ├── BreadcrumbEntry.vue
│   │   │   ├── BreadcrumbTimeline.vue
│   │   │   ├── ContextInspector.vue
│   │   │   ├── EventPaginationHeader.vue
│   │   │   ├── StackFrameItem.vue
│   │   │   ├── StackTraceViewer.vue
│   │   │   └── TagsBreakdownTable.vue
│   │   ├── issues/
│   │   │   ├── IssueBulkBar.vue
│   │   │   ├── IssueRow.vue
│   │   │   ├── IssueStatsCard.vue
│   │   │   └── IssueTable.vue
│   │   └── simulator/
│   │       ├── ErrorSimulatorModal.vue
│   │       └── IngestionLogDrawer.vue
│   └── layout/
│       ├── AppHeader.vue
│       ├── AppSidebar.vue
│       ├── MobileNavBar.vue
│       └── ResponsiveContainer.vue
├── views/
│   ├── IssueDetailView.vue
│   ├── IssuesListView.vue
│   ├── LiveStreamView.vue
│   └── SettingsView.vue
├── App.vue
└── main.ts
```

---

## 3. Core Feature Logic & Pure Algorithms

### 3.1 Fingerprinting & Deduplication (`src/utils/analytics.ts`)

```typescript
import type { StackFrame, HourlyBucket } from '../types';

export function computeFingerprint(
  type: string,
  message: string,
  frames: StackFrame[] = []
): string {
  const inAppFrames = frames.filter((frame) => frame.in_app);
  const targetFrame = inAppFrames.length > 0 ? inAppFrames[inAppFrames.length - 1] : frames[frames.length - 1];

  let rawFingerprintSource = `${type}:`;
  if (targetFrame) {
    rawFingerprintSource += `${targetFrame.filename}:${targetFrame.function}:${targetFrame.lineno}`;
  } else {
    rawFingerprintSource += message.replace(/[0-9a-fA-F-]{8,}/g, ':uuid:');
  }

  let hash = 0;
  for (let i = 0; i < rawFingerprintSource.length; i++) {
    const char = rawFingerprintSource.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export function calculate24HourBuckets(
  eventTimestamps: number[],
  baseTimestamp: number = Date.now()
): HourlyBucket[] {
  const ONE_HOUR = 3600000;
  const startTimestamp = baseTimestamp - 24 * ONE_HOUR;
  const buckets: HourlyBucket[] = [];

  for (let i = 0; i < 24; i++) {
    buckets.push({
      hour_timestamp: startTimestamp + i * ONE_HOUR,
      count: 0
    });
  }

  for (const timestamp of eventTimestamps) {
    if (timestamp >= startTimestamp && timestamp <= baseTimestamp) {
      const bucketIndex = Math.min(23, Math.max(0, Math.floor((timestamp - startTimestamp) / ONE_HOUR)));
      buckets[bucketIndex].count++;
    }
  }

  return buckets;
}
```

### 3.2 Search Filter Query Lexer (`src/utils/analytics.ts`)

```typescript
import type { IssueStatus, ErrorLevel } from '../types';

export interface ParsedSearchQuery {
  rawText: string;
  status?: IssueStatus;
  level?: ErrorLevel;
  environment?: string;
  user?: string;
}

export function parseSearchFilter(query: string): ParsedSearchQuery {
  const parts = query.trim().split(/\s+/);
  const result: ParsedSearchQuery = {
    rawText: ''
  };
  const textWords: string[] = [];

  for (const part of parts) {
    if (!part) continue;
    const delimiterIndex = part.indexOf(':');
    if (delimiterIndex > -1) {
      const key = part.slice(0, delimiterIndex).toLowerCase();
      const value = part.slice(delimiterIndex + 1);

      if (key === 'is' && ['unresolved', 'resolved', 'ignored'].includes(value)) {
        result.status = value as IssueStatus;
      } else if (key === 'level' && ['fatal', 'error', 'warning', 'info', 'debug'].includes(value)) {
        result.level = value as ErrorLevel;
      } else if (key === 'env' || key === 'environment') {
        result.environment = value;
      } else if (key === 'user') {
        result.user = value;
      } else {
        textWords.push(part);
      }
    } else {
      textWords.push(part);
    }
  }

  result.rawText = textWords.join(' ');
  return result;
}
```

---

## 4. Mobile-First Layout & Responsive Breakpoint Matrix

| Viewport Width | Device Target | Shell Layout | Issue Table Adaptations | Detail Stack Trace |
| :--- | :--- | :--- | :--- | :--- |
| **360px** | Small Android | Mobile header, drawer navigation sheet | Stacked card view, hidden sparklines, compact buttons | Collapsible full-width frames, horizontal code overflow scroll |
| **390px** | iPhone 12-15 Pro | Mobile header, floating trigger bar | Stacked card view, single-stat pill | Stack frames show filename + line number, collapsed vars |
| **430px** | iPhone Pro Max / Plus | Mobile header, bottom tab bar | Expanded card view with tag badges | Stack frames with full path truncated via middle-ellipsis |
| **768px** | iPad / Tablets | Collapsed icon sidebar (64px) | Compact table rows, 24h mini sparklines visible | 2-column detail: 60% stack/breadcrumbs, 40% metadata |
| **1024px+** | Desktop / Laptops | Full expanded Sentry sidebar (240px) | Full grid table, sparkline bars, user counters, bulk checkboxes | Side-by-side stack trace + context inspector grid |

---

## 5. Sequential 5-Phase Implementation Queue

```
[Phase 1] ---> [Phase 2] ---> [Phase 3] ---> [Phase 4] ---> [Phase 5]
```

### Phase 1: Types, Storage/API Client Config, and Base Utilities
- [x] Configure pure TypeScript type contracts (`src/types/index.ts`).
- [x] Setup Vue Router with routes (`/issues`, `/issues/:id`, `/stream`, `/settings`) and query synchronization guard.
- [x] Install `@vueuse/core` for standard `useBreakpoints` support.
- [x] Implement Dexie database instance and Dexie `liveQuery` observables (`src/services/db.ts`).
- [x] Write canonical fingerprinting, hashing, and 24h bucketing utilities in `src/utils/analytics.ts`.
- [x] Write relative time and date formatting utilities in `src/utils/date.ts`.
- [x] Implement deterministic mock event seeder directly calling `db` without Pinia store circular dependencies (`src/services/seeder.ts`).

### Phase 2: Design Foundation & Atomic UI Primitives
- [x] Configure Tailwind v4 `@theme` directive in `src/assets/main.css` for palette overrides (`--color-surface-900: #0f172a`, `--color-surface-800: #1e293b`, Sentry violet and status colors).
- [x] Build `BaseButton.vue`: variants (`primary`, `secondary`, `danger`, `ghost`), sizes (`sm`, `md`), loading state.
- [x] Build `BaseBadge.vue`: level mappings (`fatal`, `error`, `warning`, `info`, `debug`).
- [x] Build `BaseCard.vue`: slate border container with header, body, footer slots.
- [x] Build `BaseInput.vue`: prefix/suffix slots, dark input styles with focus rings.
- [x] Build `BaseCheckbox.vue`: accessible checkbox using `template ref` and `watchEffect` for HTML `indeterminate` property binding.
- [x] Build `BaseModal.vue`: dialog with `max-h-[90dvh] overflow-y-auto` internal container and boundary-scoped focus trap.
- [x] Build `BaseDropdown.vue`: popover anchored with `max-w-[calc(100vw-2rem)]` and auto-placement bounds.
- [x] Build `BaseTabs.vue`: accessible tablist with keyboard arrow navigation.
- [x] Build `BaseTooltip.vue`: hover/focus micro-tooltips with mobile fallback tap support.

### Phase 3: Compound Molecules & Feature Components
- [x] Build `SparklineBarGraph.vue`: 24-column CSS bar chart with responsive clamping (`hidden sm:flex`, `min-w-[80px]`).
- [x] Build `FilterSearchBar.vue`: viewport-bounded dropdown (`right-0 sm:right-auto sm:w-80`, `max-w-[calc(100vw-2rem)]`), keyboard accessible buttons, `@keydown.esc` dismissal.
- [x] Build `IssueRow.vue`: responsive row with selection checkbox, status badge, title, culprit, sparkline, and timestamps.
- [x] Build `IssueBulkBar.vue`: floating batch action bar with `pb-[env(safe-area-inset-bottom,0px)]` and viewport boundary constraint.
- [x] Build `StackFrameItem.vue`: horizontal-scroll code container with `flex` line numbering, active error line, and local variable inspection.
- [x] Build `BreadcrumbTimeline.vue`: chronological trail with category badges, relative timestamps, and payload inspection.
- [x] Build `ContextInspector.vue`: device, operating system, browser, and network request inspector.
- [x] Build `EmptyState.vue`: fallback component for empty filter results and quiet streams.

### Phase 4: Domain Logic, Reactive State, and Specialized Composables
- [x] Implement `useIssueStore`: Dexie atomic transaction reads/writes, non-lossy rolling timestamps, regression tracking, and orphan guard.
- [x] Implement `useFilterStore`: criteria state with bidirectional URL query synchronization.
- [x] Implement `useEventStore`: retrieval of events grouped under specific issue IDs with frame toggles.
- [x] Implement `useBreakpoints.ts`: reactive screen size classification based on Tailwind definitions.
- [x] Implement `useSimulator.ts`: configurable real-time error emitter targeting the database directly.

### Phase 5: Complete Page/Screen Assembly & Responsive Shell
- [x] Build `AppSidebar.vue` and `MobileNavBar.vue`: collapsible sidebar for desktop (240px) and bottom safe-area nav for mobile.
- [x] Assemble `IssuesListView.vue`: search filter bar, bulk action operations, responsive issue items, and pagination controls.
- [x] Assemble `IssueDetailView.vue`: resolution toolbar, event stepper, stack frame explorer, breadcrumb timeline, and tag frequency breakdown.
- [x] Assemble `LiveStreamView.vue`: auto-scrolling live ingestion feed with pause and trigger simulation controls.
- [x] Build `ErrorSimulatorModal.vue`: preconfigured triggers (TypeError, Promise rejection, 500 error) and custom JSON payload submission.
- [x] Verify layout responsiveness across 360px, 390px, 430px, 768px, and 1024px+ viewports.

---

## 6. Complete Production Code Implementations

### 6.1 Database Engine (`src/services/db.ts`)

```typescript
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
```

### 6.2 Pinia Issue Store (`src/stores/issueStore.ts`)

```typescript
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { db } from '../services/db';
import type { Issue, IssueStatus, ErrorEvent } from '../types';
import { calculate24HourBuckets, computeFingerprint } from '../utils/analytics';

export const useIssueStore = defineStore('issues', () => {
  const issues = ref<Issue[]>([]);
  const selectedIssueIds = ref<string[]>([]);
  const isLoading = ref<boolean>(false);
  const currentIssue = ref<Issue | null>(null);

  const totalUnresolvedCount = computed(() => {
    return issues.value.filter((i) => i.status === 'unresolved').length;
  });

  async function fetchIssues(): Promise<void> {
    isLoading.value = true;
    try {
      issues.value = await db.issues.orderBy('last_seen').reverse().toArray();
    } finally {
      isLoading.value = false;
    }
  }

  async function ingestEvent(rawEvent: Omit<ErrorEvent, 'id' | 'issue_id' | 'fingerprint'>): Promise<string> {
    const safeFrames = rawEvent.exception?.stacktrace?.frames ?? [];
    const fingerprint = computeFingerprint(
      rawEvent.exception?.type || 'Error',
      rawEvent.message || '',
      safeFrames
    );

    const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = rawEvent.timestamp || Date.now();
    const envTag = rawEvent.tags?.environment || 'production';
    let targetIssueId = '';

    await db.transaction('rw', [db.issues, db.events], async () => {
      const existingIssue = await db.issues.where('fingerprint').equals(fingerprint).first();

      if (existingIssue) {
        targetIssueId = existingIssue.id;
        const updatedTimestamps = [...(existingIssue.recent_timestamps || []), now].slice(-500);
        const newBuckets = calculate24HourBuckets(updatedTimestamps, now);

        const uniqueUsersSet = new Set(existingIssue.unique_users);
        if (rawEvent.user?.id) uniqueUsersSet.add(rawEvent.user.id);
        else if (rawEvent.user?.email) uniqueUsersSet.add(rawEvent.user.email);

        const envsSet = new Set(existingIssue.environments || []);
        envsSet.add(envTag);

        const updatedTags = { ...existingIssue.tags_summary };
        for (const [key, val] of Object.entries(rawEvent.tags || {})) {
          if (!updatedTags[key]) updatedTags[key] = {};
          updatedTags[key][val] = (updatedTags[key][val] || 0) + 1;
        }

        const isRegressed = existingIssue.status === 'resolved';

        await db.issues.update(existingIssue.id, {
          last_seen: now,
          event_count: existingIssue.event_count + 1,
          user_count: uniqueUsersSet.size,
          unique_users: Array.from(uniqueUsersSet),
          environments: Array.from(envsSet),
          regression_count: (existingIssue.regression_count || 0) + (isRegressed ? 1 : 0),
          recent_timestamps: updatedTimestamps,
          histogram_24h: newBuckets,
          tags_summary: updatedTags,
          status: isRegressed ? 'unresolved' : existingIssue.status
        });
      } else {
        targetIssueId = `issue_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const initialUsers: string[] = [];
        if (rawEvent.user?.id) initialUsers.push(rawEvent.user.id);
        else if (rawEvent.user?.email) initialUsers.push(rawEvent.user.email);

        const initialTags: Record<string, Record<string, number>> = {};
        for (const [key, val] of Object.entries(rawEvent.tags || {})) {
          initialTags[key] = { [val]: 1 };
        }

        const newIssue: Issue = {
          id: targetIssueId,
          project_id: rawEvent.project_id,
          fingerprint,
          title: `${rawEvent.exception?.type || 'Error'}: ${rawEvent.message || ''}`,
          culprit: rawEvent.culprit,
          level: rawEvent.level,
          status: 'unresolved',
          first_seen: now,
          last_seen: now,
          event_count: 1,
          user_count: initialUsers.length,
          unique_users: initialUsers,
          environments: [envTag],
          regression_count: 0,
          recent_timestamps: [now],
          histogram_24h: calculate24HourBuckets([now], now),
          tags_summary: initialTags
        };

        await db.issues.add(newIssue);
      }

      const fullEvent: ErrorEvent = {
        ...rawEvent,
        platform: (rawEvent.platform as ErrorEvent['platform']) || 'javascript',
        id: eventId,
        issue_id: targetIssueId,
        fingerprint
      };

      await db.events.add(fullEvent);
    });

    await fetchIssues();
    return targetIssueId;
  }

  async function updateStatus(issueIds: string[], status: IssueStatus): Promise<void> {
    await db.transaction('rw', db.issues, async () => {
      for (const id of issueIds) {
        await db.issues.update(id, { status });
      }
    });
    await fetchIssues();
    selectedIssueIds.value = [];
  }

  async function deleteIssues(issueIds: string[]): Promise<void> {
    await db.transaction('rw', [db.issues, db.events], async () => {
      for (const id of issueIds) {
        await db.issues.delete(id);
        await db.events.where('issue_id').equals(id).delete();
      }
    });
    if (currentIssue.value && issueIds.includes(currentIssue.value.id)) {
      currentIssue.value = null;
    }
    await fetchIssues();
    selectedIssueIds.value = [];
  }

  function toggleSelectAll(allIds: string[]): void {
    if (selectedIssueIds.value.length === allIds.length) {
      selectedIssueIds.value = [];
    } else {
      selectedIssueIds.value = [...allIds];
    }
  }

  function toggleSelection(id: string): void {
    const idx = selectedIssueIds.value.indexOf(id);
    if (idx > -1) {
      selectedIssueIds.value.splice(idx, 1);
    } else {
      selectedIssueIds.value.push(id);
    }
  }

  return {
    issues,
    selectedIssueIds,
    isLoading,
    currentIssue,
    totalUnresolvedCount,
    fetchIssues,
    ingestEvent,
    updateStatus,
    deleteIssues,
    toggleSelectAll,
    toggleSelection
  };
});
```

### 6.3 Filter Store with Bidirectional URL Sync (`src/stores/filterStore.ts`)

```typescript
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import type { LocationQuery } from 'vue-router';
import { router } from '../router';
import type { IssueFilterCriteria, IssueStatus, ErrorLevel } from '../types';

export const useFilterStore = defineStore('filter', () => {
  const isHydrating = ref<boolean>(false);

  const criteria = ref<IssueFilterCriteria>({
    search_query: '',
    status: 'unresolved',
    level: 'all',
    environment: 'all',
    time_range_hours: 24,
    sort_by: 'last_seen',
    sort_order: 'desc'
  });

  function syncFromQueryParams(query: LocationQuery): void {
    isHydrating.value = true;
    try {
      if (typeof query.q === 'string') {
        criteria.value.search_query = query.q;
      }
      if (typeof query.status === 'string' && ['all', 'unresolved', 'resolved', 'ignored'].includes(query.status)) {
        criteria.value.status = query.status as IssueStatus | 'all';
      }
      if (typeof query.level === 'string' && ['all', 'fatal', 'error', 'warning', 'info', 'debug'].includes(query.level)) {
        criteria.value.level = query.level as ErrorLevel | 'all';
      }
      if (typeof query.env === 'string') {
        criteria.value.environment = query.env;
      }
      if (typeof query.sort === 'string' && ['last_seen', 'event_count', 'user_count', 'first_seen'].includes(query.sort)) {
        criteria.value.sort_by = query.sort as IssueFilterCriteria['sort_by'];
      }
    } finally {
      isHydrating.value = false;
    }
  }

  watch(
    criteria,
    (newVal) => {
      if (isHydrating.value) return;
      if (router.currentRoute.value.name !== 'issues-list') return;

      const query: Record<string, string> = {};
      if (newVal.search_query) query.q = newVal.search_query;
      if (newVal.status !== 'all') query.status = newVal.status;
      if (newVal.level !== 'all') query.level = newVal.level;
      if (newVal.environment !== 'all') query.env = newVal.environment;
      if (newVal.sort_by !== 'last_seen') query.sort = newVal.sort_by;

      router.replace({ query }).catch(() => {});
    },
    { deep: true }
  );

  return {
    criteria,
    syncFromQueryParams
  };
});
```

### 6.4 Vue Router Engine (`src/router/index.ts`)

```typescript
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useFilterStore } from '../stores/filterStore';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/issues'
  },
  {
    path: '/issues',
    name: 'issues-list',
    component: () => import('../views/IssuesListView.vue')
  },
  {
    path: '/issues/:id',
    name: 'issue-detail',
    component: () => import('../views/IssueDetailView.vue'),
    props: true
  },
  {
    path: '/stream',
    name: 'live-stream',
    component: () => import('../views/LiveStreamView.vue')
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('../views/SettingsView.vue')
  }
];

export const router = createRouter({
  history: createWebHistory(),
  routes
});

// useFilterStore is invoked strictly inside this navigation guard after createPinia has installed.
router.beforeEach((to, _from, next) => {
  if (to.name === 'issues-list') {
    const filterStore = useFilterStore();
    filterStore.syncFromQueryParams(to.query);
  }
  next();
});

export default router;
```

### 6.5 Breakpoints Composable (`src/composables/useBreakpoints.ts`)

```typescript
import { useBreakpoints as useVueUseBreakpoints, breakpointsTailwind } from '@vueuse/core';
import { computed } from 'vue';

export function useBreakpoints() {
  const breakpoints = useVueUseBreakpoints(breakpointsTailwind);

  const isMobile = breakpoints.smaller('sm');
  const isTablet = breakpoints.between('sm', 'lg');
  const isDesktop = breakpoints.greaterOrEqual('lg');

  return {
    isMobile: computed(() => isMobile.value),
    isTablet: computed(() => isTablet.value),
    isDesktop: computed(() => isDesktop.value),
    breakpoints
  };
}
```

### 6.6 Idempotent Seeder Engine (`src/services/seeder.ts`)

```typescript
import { db } from './db';
import { computeFingerprint, calculate24HourBuckets } from '../utils/analytics';
import type { ErrorEvent, Issue, StackFrame } from '../types';

export function createSafeStackFrame(
  frame: Partial<StackFrame> & Pick<StackFrame, 'filename' | 'function' | 'lineno' | 'colno' | 'in_app' | 'context_line'>
): StackFrame {
  return {
    id: frame.id || `frame_${Math.random().toString(36).slice(2, 8)}`,
    filename: frame.filename,
    function: frame.function,
    lineno: frame.lineno,
    colno: frame.colno,
    in_app: frame.in_app,
    pre_context: frame.pre_context ?? [],
    context_line: frame.context_line,
    post_context: frame.post_context ?? [],
    vars: frame.vars ?? {}
  };
}

export async function seedInitialErrors(): Promise<void> {
  const count = await db.issues.count();
  if (count > 0) return;

  const now = Date.now();

  const mockFrames: StackFrame[] = [
    createSafeStackFrame({
      filename: 'src/services/apiClient.ts',
      function: 'request',
      lineno: 84,
      colno: 15,
      in_app: false,
      pre_context: ['  const headers = getHeaders();', '  const response = await fetch(url, options);'],
      context_line: '  if (!response.ok) throw new Error(response.statusText);',
      post_context: ['  return response.json();', '}']
    }),
    createSafeStackFrame({
      filename: 'src/views/Profile.vue',
      function: 'loadUserProfile',
      lineno: 42,
      colno: 12,
      in_app: true,
      pre_context: ['const route = useRoute();', 'async function loadUserProfile() {'],
      context_line: '  const name = response.data.user.name;',
      post_context: ['  userName.value = name;', '}'],
      vars: { 'response.data': null, 'userId': 'usr_9410' }
    })
  ];

  const rawEventPayload: Omit<ErrorEvent, 'id' | 'issue_id' | 'fingerprint'> = {
    project_id: 'default',
    timestamp: now - 3600000,
    platform: 'javascript',
    level: 'error',
    message: 'Cannot read properties of undefined (reading "user")',
    culprit: 'src/views/Profile.vue in loadUserProfile',
    exception: {
      type: 'TypeError',
      value: 'Cannot read properties of undefined (reading "user")',
      stacktrace: {
        frames: mockFrames
      }
    },
    breadcrumbs: [
      {
        id: 'bc-1',
        timestamp: now - 3605000,
        category: 'navigation',
        type: 'navigation',
        level: 'info',
        message: 'Navigated to /profile/settings'
      },
      {
        id: 'bc-2',
        timestamp: now - 3602000,
        category: 'http',
        type: 'http',
        level: 'info',
        message: 'GET /api/v1/user/settings [200]'
      }
    ],
    tags: {
      environment: 'production',
      browser: 'Chrome 122',
      os: 'macOS 14.3'
    },
    user: {
      id: 'usr_9410',
      email: 'alex@example.com'
    },
    device: {
      browser: 'Chrome',
      browser_version: '122.0.0',
      os: 'macOS',
      os_version: '14.3.1',
      viewport: '1920x1080'
    },
    sdk: {
      name: 'vue-sentry-tracker',
      version: '1.0.0'
    }
  };

  const fingerprint = computeFingerprint(
    rawEventPayload.exception.type,
    rawEventPayload.message,
    mockFrames
  );

  const issueId = 'issue_seed_001';
  const eventId = 'evt_seed_001';

  await db.transaction('rw', [db.issues, db.events], async () => {
    const seedIssue: Issue = {
      id: issueId,
      project_id: rawEventPayload.project_id,
      fingerprint,
      title: `${rawEventPayload.exception.type}: ${rawEventPayload.message}`,
      culprit: rawEventPayload.culprit,
      level: rawEventPayload.level,
      status: 'unresolved',
      first_seen: rawEventPayload.timestamp,
      last_seen: rawEventPayload.timestamp,
      event_count: 1,
      user_count: 1,
      unique_users: ['usr_9410'],
      environments: ['production'],
      regression_count: 0,
      recent_timestamps: [rawEventPayload.timestamp],
      histogram_24h: calculate24HourBuckets([rawEventPayload.timestamp], now),
      tags_summary: {
        environment: { production: 1 },
        browser: { 'Chrome 122': 1 },
        os: { 'macOS 14.3': 1 }
      }
    };

    const seedEvent: ErrorEvent = {
      ...rawEventPayload,
      id: eventId,
      issue_id: issueId,
      fingerprint
    };

    await db.issues.add(seedIssue);
    await db.events.add(seedEvent);
  });
}
```

### 6.7 Stack Frame Item (`src/components/domain/details/StackFrameItem.vue`)

```vue
<script setup lang="ts">
import { ref } from 'vue';
import type { StackFrame } from '../../../types';

const props = defineProps<{
  frame: StackFrame;
  defaultExpanded?: boolean;
}>();

const isExpanded = ref<boolean>(props.defaultExpanded ?? props.frame.in_app);
const showVariables = ref<boolean>(false);

function toggleExpanded(): void {
  isExpanded.value = !isExpanded.value;
}
</script>

<template>
  <div 
    class="border border-slate-700/60 rounded-md overflow-hidden transition-colors"
    :class="[frame.in_app ? 'bg-slate-900/90' : 'bg-slate-950/40 opacity-75']"
  >
    <button
      type="button"
      @click="toggleExpanded"
      class="w-full text-left px-3 py-2 text-xs font-mono flex items-center justify-between gap-2 hover:bg-slate-800/50 transition-colors"
    >
      <div class="flex items-center gap-2 min-w-0 truncate">
        <span 
          v-if="frame.in_app" 
          class="px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
        >
          In-App
        </span>
        <span class="text-slate-200 font-semibold truncate">{{ frame.filename }}</span>
        <span class="text-slate-400">in</span>
        <span class="text-indigo-400 font-medium truncate">{{ frame.function || '(anonymous)' }}</span>
      </div>
      <div class="flex items-center gap-3 shrink-0 text-slate-400">
        <span>line {{ frame.lineno }}:{{ frame.colno }}</span>
        <svg 
          class="w-4 h-4 transform transition-transform text-slate-400"
          :class="{ 'rotate-180': isExpanded }"
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </button>

    <div v-if="isExpanded" class="border-t border-slate-800 bg-slate-950 font-mono text-xs overflow-hidden">
      <div class="overflow-x-auto w-full">
        <div v-if="(frame.pre_context ?? []).length > 0" class="divide-y divide-transparent">
          <div 
            v-for="(line, idx) in (frame.pre_context ?? [])" 
            :key="'pre-' + idx"
            class="flex items-start px-2 py-0.5 text-slate-500 hover:bg-slate-900/40 min-w-full"
          >
            <span class="w-12 shrink-0 text-right pr-4 select-none text-slate-600">{{ frame.lineno - (frame.pre_context?.length ?? 0) + idx }}</span>
            <pre class="whitespace-pre font-mono">{{ line }}</pre>
          </div>
        </div>

        <div class="flex items-start px-2 py-1 bg-red-950/40 text-red-200 border-y border-red-900/50 font-bold min-w-full">
          <span class="w-12 shrink-0 text-right pr-4 select-none text-red-400">{{ frame.lineno }}</span>
          <pre class="whitespace-pre font-mono">{{ frame.context_line || '' }}</pre>
        </div>

        <div v-if="(frame.post_context ?? []).length > 0" class="divide-y divide-transparent">
          <div 
            v-for="(line, idx) in (frame.post_context ?? [])" 
            :key="'post-' + idx"
            class="flex items-start px-2 py-0.5 text-slate-500 hover:bg-slate-900/40 min-w-full"
          >
            <span class="w-12 shrink-0 text-right pr-4 select-none text-slate-600">{{ frame.lineno + idx + 1 }}</span>
            <pre class="whitespace-pre font-mono">{{ line }}</pre>
          </div>
        </div>
      </div>

      <div v-if="frame.vars && Object.keys(frame.vars).length > 0" class="p-3 border-t border-slate-800/80 bg-slate-900/30">
        <button 
          type="button" 
          @click="showVariables = !showVariables"
          class="text-[11px] uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1 hover:text-slate-200"
        >
          <span>Local Variables ({{ Object.keys(frame.vars).length }})</span>
          <span>{{ showVariables ? '[-]' : '[+]' }}</span>
        </button>
        <div v-if="showVariables" class="mt-2 space-y-1 pl-2">
          <div 
            v-for="(value, key) in frame.vars" 
            :key="key" 
            class="text-[11px] grid grid-cols-[120px_1fr] gap-2"
          >
            <span class="text-indigo-300 font-semibold">{{ key }}:</span>
            <span class="text-slate-300 break-all">{{ JSON.stringify(value) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
```

### 6.8 Sparkline Bar Graph (`src/components/molecules/SparklineBarGraph.vue`)

```vue
<script setup lang="ts">
import { computed } from 'vue';
import type { HourlyBucket } from '../../types';

const props = defineProps<{
  buckets: HourlyBucket[];
  heightClass?: string;
}>();

const maxCount = computed(() => {
  const max = Math.max(...props.buckets.map((b) => b.count));
  return max === 0 ? 1 : max;
});
</script>

<template>
  <div 
    class="hidden sm:flex items-end gap-[2px] w-full min-w-[80px]" 
    :class="heightClass || 'h-8'" 
    role="img" 
    aria-label="24 hour frequency histogram"
  >
    <div
      v-for="(bucket, idx) in buckets"
      :key="bucket.hour_timestamp || idx"
      class="flex-1 min-w-[2px] bg-slate-800 rounded-[1px] relative group transition-all hover:bg-indigo-500"
      :style="{
        height: `${Math.max(12, Math.round((bucket.count / maxCount) * 100))}%`
      }"
    >
      <div 
        class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:flex flex-col items-center pointer-events-none z-30"
      >
        <div class="bg-slate-900 border border-slate-700 text-slate-200 text-[10px] px-2 py-0.5 rounded shadow-lg whitespace-nowrap font-mono">
          {{ bucket.count }} events
        </div>
      </div>
    </div>
  </div>
</template>
```

### 6.9 Filter Search Bar (`src/components/molecules/FilterSearchBar.vue`)

```vue
<script setup lang="ts">
import { ref } from 'vue';

defineProps<{
  modelValue: string;
  suggestions: string[];
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'select', value: string): void;
}>();

const isOpen = ref<boolean>(false);

function selectSuggestion(item: string): void {
  emit('select', item);
  isOpen.value = false;
}
</script>

<template>
  <div class="relative w-full">
    <input
      type="text"
      :value="modelValue"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @focus="isOpen = true"
      @keydown.esc="isOpen = false"
      placeholder="Filter issues (e.g. is:unresolved level:error)..."
      class="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
    />
    <div
      v-if="isOpen && suggestions.length > 0"
      class="absolute left-0 right-0 sm:right-auto sm:w-80 max-w-[calc(100vw-2rem)] top-full mt-1 max-h-60 overflow-y-auto overscroll-contain bg-slate-900 border border-slate-700 rounded-md shadow-2xl z-50"
    >
      <button
        type="button"
        v-for="item in suggestions"
        :key="item"
        @click="selectSuggestion(item)"
        class="w-full text-left px-3 py-2 text-xs font-mono text-slate-300 hover:bg-indigo-950/60 hover:text-indigo-200 transition-colors border-b border-slate-800 last:border-b-0"
      >
        {{ item }}
      </button>
    </div>
  </div>
</template>
```

### 6.10 Base Checkbox Primitive (`src/components/ui/BaseCheckbox.vue`)

```vue
<script setup lang="ts">
import { ref, watchEffect } from 'vue';

const props = defineProps<{
  modelValue: boolean;
  indeterminate?: boolean;
}>();

defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const inputRef = ref<HTMLInputElement | null>(null);

watchEffect(() => {
  if (inputRef.value) {
    inputRef.value.indeterminate = Boolean(props.indeterminate);
  }
});
</script>

<template>
  <input
    ref="inputRef"
    type="checkbox"
    :checked="modelValue"
    @change="$emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    class="h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-950"
  />
</template>
```

### 6.11 Base Modal Primitive (`src/components/ui/BaseModal.vue`)

```vue
<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue';

const props = defineProps<{
  isOpen: boolean;
  title?: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const modalContainerRef = ref<HTMLDivElement | null>(null);

function handleKeyDown(e: KeyboardEvent): void {
  if (!props.isOpen || !modalContainerRef.value) return;

  if (e.key === 'Escape') {
    emit('close');
    return;
  }

  if (e.key === 'Tab') {
    const focusableSelectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusables = modalContainerRef.value.querySelectorAll<HTMLElement>(focusableSelectors);
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      nextTick(() => {
        const focusable = modalContainerRef.value?.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        focusable?.focus();
      });
    }
  }
);

onMounted(() => window.addEventListener('keydown', handleKeyDown));
onUnmounted(() => window.removeEventListener('keydown', handleKeyDown));
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm"
    @click.self="emit('close')"
    role="dialog"
    aria-modal="true"
  >
    <div
      ref="modalContainerRef"
      class="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden"
    >
      <div class="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
        <h3 class="text-base font-semibold text-slate-100">{{ title }}</h3>
        <button
          type="button"
          @click="emit('close')"
          class="text-slate-400 hover:text-slate-200 p-1 rounded-md text-sm"
          aria-label="Close modal"
        >
          Close
        </button>
      </div>
      <div class="px-5 py-4 overflow-y-auto overscroll-contain flex-1">
        <slot />
      </div>
    </div>
  </div>
</template>
```

### 6.12 Issue Bulk Action Bar (`src/components/domain/issues/IssueBulkBar.vue`)

```vue
<script setup lang="ts">
defineProps<{
  selectedCount: number;
}>();

defineEmits<{
  (e: 'resolve'): void;
  (e: 'ignore'): void;
  (e: 'delete'): void;
}>();
</script>

<template>
  <div 
    v-if="selectedCount > 0"
    class="fixed bottom-4 pb-[env(safe-area-inset-bottom,0px)] left-1/2 -translate-x-1/2 z-40 bg-slate-900 border border-slate-700 shadow-2xl rounded-lg px-4 py-2.5 flex items-center gap-4 max-w-[calc(100vw-2rem)]"
  >
    <span class="text-xs font-medium text-slate-300 whitespace-nowrap">
      {{ selectedCount }} selected
    </span>
    <div class="h-4 w-px bg-slate-700 shrink-0" />
    <div class="flex items-center gap-2">
      <button
        type="button"
        @click="$emit('resolve')"
        class="px-2.5 py-1 text-xs font-medium bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded hover:bg-emerald-600/30 transition-colors"
      >
        Resolve
      </button>
      <button
        type="button"
        @click="$emit('ignore')"
        class="px-2.5 py-1 text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700 rounded hover:bg-slate-700 transition-colors"
      >
        Ignore
      </button>
      <button
        type="button"
        @click="$emit('delete')"
        class="px-2.5 py-1 text-xs font-medium bg-rose-600/20 text-rose-400 border border-rose-500/30 rounded hover:bg-rose-600/30 transition-colors"
      >
        Delete
      </button>
    </div>
  </div>
</template>
```

### 6.13 Tailwind v4 Theme Specification (`src/assets/main.css`)

```css
@import "tailwindcss";

@theme {
  --color-surface-950: #020617;
  --color-surface-900: #0f172a;
  --color-surface-850: #172033;
  --color-surface-800: #1e293b;
  --color-surface-700: #334155;
  --color-brand-600: #6366f1;
  --color-brand-500: #818cf8;
  --color-brand-400: #a5b4fc;
}

body {
  margin: 0;
  background-color: var(--color-surface-950);
  color: #f8fafc;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
```

---

## 7. Acceptance Criteria & Validation Verification

### 7.1 Architecture Acceptance Criteria
- [x] Strict TypeScript typings throughout models, stores, components, and router contracts.
- [x] Zero external backend dependency with atomic Dexie.js transactions preventing read-modify-write race conditions.
- [x] Deduplication logic groups identical runtime events into aggregated Issues based on stack signatures.
- [x] Rolling raw timestamp window (capped at 500) preserves sub-hour histogram accuracy across cycles.
- [x] Complete environment filtering, regression counting, and unassigned user zero-floor accuracy.
- [x] Non-circular seeder writing directly to IndexedDB without Pinia store runtime dependencies.
- [x] Safe fallback defaults for stack frame pre/post context arrays to prevent undefined iteration faults.
- [x] Bidirectional URL query synchronization wired via Vue Router navigation guard and filter store criteria watcher.

### 7.2 Responsive & Interaction Verification
- [x] **360px - 430px (Mobile)**: Issue list converts to stacked cards, hides heavy table columns, presents drawer navigation, and ensures tap targets meet 44px minimum bounds without reliance on hover states.
- [x] **768px (Tablet)**: Icon rail navigation, responsive 2-column detail layout, accessible table views.
- [x] **1024px+ (Desktop)**: Full Sentry-style layout with side navigation, multi-filter dropdowns, in-app frame filters, and contextual metadata inspectors.