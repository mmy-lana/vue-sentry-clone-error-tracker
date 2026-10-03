import { computed, nextTick, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import type { LocationQuery } from 'vue-router';
import { router } from '../router';
import type { ErrorLevel, IssueFilterCriteria, IssueSortField, IssueStatus } from '../types';

const TIME_RANGE_OPTIONS = [1, 6, 12, 24, 72, 168] as const;

export const DEFAULT_CRITERIA: IssueFilterCriteria = {
  search_query: '',
  status: 'unresolved',
  level: 'all',
  environment: 'all',
  time_range_hours: 24,
  sort_by: 'last_seen',
  sort_order: 'desc'
};

const STATUS_VALUES: (IssueStatus | 'all')[] = ['all', 'unresolved', 'resolved', 'ignored'];
const LEVEL_VALUES: (ErrorLevel | 'all')[] = ['all', 'fatal', 'error', 'warning', 'info', 'debug'];
const SORT_FIELDS: IssueSortField[] = ['last_seen', 'first_seen', 'event_count', 'user_count'];

export const useFilterStore = defineStore('filter', () => {
  const isHydrating = ref<boolean>(false);
  const criteria = ref<IssueFilterCriteria>({ ...DEFAULT_CRITERIA });
  const availableEnvironments = ref<string[]>([]);

  const timeRangeOptions = TIME_RANGE_OPTIONS;

  const isDefaultState = computed<boolean>(() =>
    (Object.keys(DEFAULT_CRITERIA) as (keyof IssueFilterCriteria)[]).every(
      (key) => criteria.value[key] === DEFAULT_CRITERIA[key]
    )
  );

  function patch(partial: Partial<IssueFilterCriteria>): void {
    criteria.value = { ...criteria.value, ...partial };
  }

  function reset(): void {
    criteria.value = { ...DEFAULT_CRITERIA };
  }

  function setSearchQuery(searchQuery: string): void {
    patch({ search_query: searchQuery });
  }

  function setStatus(status: IssueStatus | 'all'): void {
    patch({ status });
  }

  function setLevel(level: ErrorLevel | 'all'): void {
    patch({ level });
  }

  function setEnvironment(environment: string | 'all'): void {
    patch({ environment });
  }

  function setTimeRange(hours: number): void {
    patch({ time_range_hours: hours });
  }

  /** Clicking the active sort column flips the direction (Sentry behaviour). */
  function toggleSort(field: IssueSortField): void {
    if (criteria.value.sort_by === field) {
      patch({ sort_order: criteria.value.sort_order === 'desc' ? 'asc' : 'desc' });
      return;
    }
    patch({ sort_by: field, sort_order: 'desc' });
  }

  function setEnvironments(environments: string[]): void {
    availableEnvironments.value = [...environments].sort((a, b) => a.localeCompare(b));
  }

  /**
   * Reads the URL into the criteria without echoing a replace back to the URL.
   *
   * The deep watcher is flushed asynchronously on the next tick, so the
   * hydration guard is released in `nextTick()`; clearing it synchronously let
   * the watcher observe the hydrated criteria and replace the route it had just
   * consumed, polluting the history stack.
   */
  function syncFromQueryParams(query: LocationQuery): void {
    isHydrating.value = true;
    try {
      const next: IssueFilterCriteria = { ...DEFAULT_CRITERIA };

      if (typeof query.q === 'string') next.search_query = query.q;
      if (typeof query.status === 'string' && STATUS_VALUES.includes(query.status as IssueStatus | 'all')) {
        next.status = query.status as IssueStatus | 'all';
      }
      if (typeof query.level === 'string' && LEVEL_VALUES.includes(query.level as ErrorLevel | 'all')) {
        next.level = query.level as ErrorLevel | 'all';
      }
      if (typeof query.env === 'string') next.environment = query.env;
      if (typeof query.range === 'string') {
        const hours = Number.parseInt(query.range, 10);
        if (Number.isFinite(hours) && hours > 0) next.time_range_hours = hours;
      }
      if (typeof query.sort === 'string' && SORT_FIELDS.includes(query.sort as IssueSortField)) {
        next.sort_by = query.sort as IssueSortField;
      }
      if (query.order === 'asc' || query.order === 'desc') next.sort_order = query.order;

      criteria.value = next;
    } finally {
      void nextTick(() => {
        isHydrating.value = false;
      });
    }
  }

  /** Serialises the criteria into URL query params (omitting defaults). */
  function toQueryParams(): Record<string, string> {
    const query: Record<string, string> = {};
    if (criteria.value.search_query) query.q = criteria.value.search_query;
    if (criteria.value.status !== 'all') query.status = criteria.value.status;
    if (criteria.value.level !== 'all') query.level = criteria.value.level;
    if (criteria.value.environment !== 'all') query.env = criteria.value.environment;
    if (criteria.value.time_range_hours !== DEFAULT_CRITERIA.time_range_hours) {
      query.range = String(criteria.value.time_range_hours);
    }
    if (criteria.value.sort_by !== 'last_seen') query.sort = criteria.value.sort_by;
    if (criteria.value.sort_order !== 'desc') query.order = criteria.value.sort_order;
    return query;
  }

  let syncTimer: number | null = null;

  function cancelPendingSync(): void {
    if (syncTimer !== null) {
      window.clearTimeout(syncTimer);
      syncTimer = null;
    }
  }

  /**
   * URL synchronisation is debounced so typing in the search field produces a
   * single history entry instead of one replacement per keystroke.
   */
  watch(
    criteria,
    () => {
      if (isHydrating.value) return;
      if (router.currentRoute.value.name !== 'issues-list') return;

      cancelPendingSync();
      syncTimer = window.setTimeout(() => {
        syncTimer = null;
        const query = toQueryParams();
        const current = router.currentRoute.value.query;
        const unchanged =
          Object.keys(query).length === Object.keys(current).length &&
          Object.entries(query).every(([key, value]) => current[key] === value);

        if (unchanged) return;

        void router.replace({ query }).catch(() => undefined);
      }, 250);
    },
    { deep: true }
  );

  return {
    criteria,
    isHydrating,
    cancelPendingSync,
    isDefaultState,
    availableEnvironments,
    timeRangeOptions,
    patch,
    reset,
    setSearchQuery,
    setStatus,
    setLevel,
    setEnvironment,
    setTimeRange,
    toggleSort,
    setEnvironments,
    syncFromQueryParams,
    toQueryParams
  };
});