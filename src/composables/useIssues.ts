import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { HOUR_MS } from '../utils/date';
import type { BulkActionType, Issue, IssueSortField } from '../types';
import { useFilterStore } from '../stores/filterStore';
import { useIssueStore } from '../stores/issueStore';
import { useSearchFilter } from './useSearchFilter';

export interface UseIssuesOptions {
  pageSize?: number;
  /** Skip the environment facet derived from the issues themselves. */
  syncEnvironments?: boolean;
}

/**
 * Domain facade for the issue list: merges live Dexie issues with the filter
 * store criteria, applies the parsed search query, sorts and paginates.
 */
export function useIssues(options: UseIssuesOptions = {}) {
  const { pageSize = 25, syncEnvironments = true } = options;

  const issueStore = useIssueStore();
  const filterStore = useFilterStore();
  const { issues, isLoading, isProcessing, selectedIssueIds, errorMessage } = storeToRefs(issueStore);
  const { criteria } = storeToRefs(filterStore);

  const page = ref<number>(1);

  const search = useSearchFilter(() => criteria.value.search_query);

  const environments = computed<string[]>(() => {
    const values = new Set<string>();
    for (const issue of issues.value) {
      for (const environment of issue.environments) values.add(environment);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  });

  /** Operator values from the query win over the explicit facet selections. */
  const effectiveStatus = computed(() => search.status.value ?? criteria.value.status);
  const effectiveLevel = computed(() => search.level.value ?? criteria.value.level);
  const effectiveEnvironment = computed(() =>
    search.environment.value ?? criteria.value.environment
  );

  const filteredIssues = computed<Issue[]>(() => {
    const cutoff = criteria.value.time_range_hours * HOUR_MS;
    const now = Date.now();

    return issues.value.filter((issue) => {
      if (effectiveStatus.value !== 'all' && issue.status !== effectiveStatus.value) return false;
      if (effectiveLevel.value !== 'all' && issue.level !== effectiveLevel.value) return false;
      if (
        effectiveEnvironment.value !== 'all' &&
        !issue.environments.includes(effectiveEnvironment.value)
      ) {
        return false;
      }
      if (Number.isFinite(cutoff) && now - issue.last_seen > cutoff) return false;
      return search.matches(issue);
    });
  });

  const sortedIssues = computed<Issue[]>(() => {
    const field = criteria.value.sort_by as IssueSortField;
    const direction = criteria.value.sort_order === 'asc' ? 1 : -1;

    return [...filteredIssues.value].sort((a, b) => {
      switch (field) {
        case 'event_count':
          return (a.event_count - b.event_count) * direction;
        case 'user_count':
          return (a.user_count - b.user_count) * direction;
        case 'first_seen':
          return (a.first_seen - b.first_seen) * direction;
        case 'last_seen':
        default:
          return (a.last_seen - b.last_seen) * direction;
      }
    });
  });

  const totalPages = computed<number>(() =>
    Math.max(1, Math.ceil(sortedIssues.value.length / Math.max(1, pageSize)))
  );

  const paginatedIssues = computed<Issue[]>(() => {
    const start = (page.value - 1) * pageSize;
    return sortedIssues.value.slice(start, start + pageSize);
  });

  const paginatedIds = computed<string[]>(() => paginatedIssues.value.map((issue) => issue.id));

  const summary = computed(() => ({
    total: issues.value.length,
    filtered: sortedIssues.value.length,
    unresolved: issues.value.filter((issue) => issue.status === 'unresolved').length,
    events: issues.value.reduce((sum, issue) => sum + issue.event_count, 0),
    users: new Set(issues.value.flatMap((issue) => issue.unique_users)).size
  }));

  // Any criteria change resets pagination to the first page.
  watch(
    () => [criteria.value, issues.value.length] as const,
    () => {
      page.value = 1;
    }
  );

  watch(page, (value) => {
    if (value > totalPages.value) page.value = totalPages.value;
  });

  if (syncEnvironments) {
    watch(
      environments,
      (values) => filterStore.setEnvironments(values),
      { immediate: true }
    );
  }

  function setPage(next: number): void {
    page.value = Math.min(Math.max(1, next), totalPages.value);
  }

  async function runBulkAction(action: BulkActionType): Promise<void> {
    await issueStore.applyBulkAction({ issue_ids: [...selectedIssueIds.value], action });
  }

  return {
    issues,
    criteria,
    page,
    pageSize,
    isLoading,
    isProcessing,
    selectedIssueIds,
    errorMessage,
    environments,
    effectiveStatus,
    effectiveLevel,
    effectiveEnvironment,
    filteredIssues,
    sortedIssues,
    paginatedIssues,
    paginatedIds,
    totalPages,
    summary,
    suggestions: search.suggestions,
    setPage,
    runBulkAction,
    toggleSelection: issueStore.toggleSelection,
    toggleSelectAll: issueStore.toggleSelectAll,
    clearSelection: issueStore.clearSelection,
    resetFilters: filterStore.reset
  };
}