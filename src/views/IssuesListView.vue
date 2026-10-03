<script setup lang="ts">
/**
 * Issue stream: facets, search operators, responsive rows, bulk actions and
 * pagination. All state lives in the filter/issue stores so the URL stays in
 * sync with the visible result set.
 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import ResponsiveContainer from '../components/layout/ResponsiveContainer.vue';
import BaseDropdown from '../components/ui/BaseDropdown.vue';
import BasePagination from '../components/ui/BasePagination.vue';
import IssueBulkBar from '../components/domain/issues/IssueBulkBar.vue';
import IssueStatsCard from '../components/domain/issues/IssueStatsCard.vue';
import IssueTable from '../components/domain/issues/IssueTable.vue';
import FilterSearchBar from '../components/molecules/FilterSearchBar.vue';
import { useBreakpoints } from '../composables/useBreakpoints';
import { useIssues } from '../composables/useIssues';
import { useFilterStore } from '../stores/filterStore';
import type { BaseDropdownItem, ErrorLevel, IssueStatus } from '../types';
import { LEVEL_META, STATUS_META } from '../utils/theme';

const router = useRouter();
const filterStore = useFilterStore();
const { isTableLayout } = useBreakpoints();

const {
  issues,
  criteria,
  page,
  pageSize,
  isLoading,
  isProcessing,
  selectedIssueIds,
  filteredIssues,
  paginatedIssues,
  summary,
  environments,
  suggestions,
  setPage,
  runBulkAction,
  toggleSelection,
  toggleSelectAll,
  clearSelection,
  resetFilters
} = useIssues({ pageSize: 20 });

const statusItems = computed<BaseDropdownItem[]>(() =>
  (['unresolved', 'resolved', 'ignored', 'all'] as const).map((status) => ({
    id: status,
    label: status === 'all' ? 'Any status' : STATUS_META[status].label
  }))
);

const levelItems = computed<BaseDropdownItem[]>(() =>
  (['all', 'fatal', 'error', 'warning', 'info', 'debug'] as const).map((level) => ({
    id: level,
    label: level === 'all' ? 'Any level' : LEVEL_META[level].label
  }))
);

const environmentItems = computed<BaseDropdownItem[]>(() => [
  { id: 'all', label: 'Any environment' },
  ...environments.value.map((environment) => ({ id: environment, label: environment }))
]);

const timeRangeItems = computed<BaseDropdownItem[]>(() =>
  filterStore.timeRangeOptions.map((hours) => ({
    id: String(hours),
    label: hours >= 168 ? 'Last 7 days' : `Last ${hours}h`
  }))
);

const timeRangeLabel = computed<string>(() => {
  const hours = criteria.value.time_range_hours;
  return timeRangeItems.value.find((item) => item.id === String(hours))?.label ?? `Last ${hours}h`;
});

const statusLabel = computed<string>(
  () => statusItems.value.find((item) => item.id === criteria.value.status)?.label ?? 'Any status'
);
const levelLabel = computed<string>(
  () => levelItems.value.find((item) => item.id === criteria.value.level)?.label ?? 'Any level'
);
const environmentLabel = computed<string>(
  () =>
    environmentItems.value.find((item) => item.id === criteria.value.environment)?.label ??
    'Any environment'
);

function onSearch(value: string): void {
  filterStore.setSearchQuery(value);
}

function onSelectSuggestion(value: string): void {
  filterStore.setSearchQuery(value);
}

function onBulkAction(action: 'resolve' | 'ignore' | 'delete'): void {
  void runBulkAction(action);
}

function openIssue(issueId: string): void {
  void router.push(`/issues/${issueId}`);
}
</script>

<template>
  <ResponsiveContainer flush-bottom data-testid="issues-view">
    <div class="flex flex-col gap-3">
      <section class="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <IssueStatsCard
          label="Unresolved"
          :value="summary.unresolved"
          tone="fatal"
          hint="Issues still awaiting triage"
        />
        <IssueStatsCard
          label="Tracked"
          :value="summary.total"
          tone="brand"
          hint="Every fingerprint group stored locally"
        />
        <IssueStatsCard
          label="Events"
          :value="summary.events"
          tone="info"
          hint="Sum of events across all issues"
        />
        <IssueStatsCard
          label="Affected users"
          :value="summary.users"
          tone="warning"
          :hint="`${summary.filtered} match the current filters`"
        />
      </section>

      <section class="flex flex-col gap-2 rounded-lg border border-surface-700/70 bg-surface-900/70 p-3">
        <div class="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div class="min-w-0 flex-1">
            <FilterSearchBar
              :model-value="criteria.search_query"
              :suggestions="suggestions"
              :result-count="filteredIssues.length"
              @update:model-value="onSearch"
              @select="onSelectSuggestion"
            />
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <BaseDropdown
              :items="statusItems"
              :model-value="criteria.status"
              :trigger-text="statusLabel"
              width-class="w-44"
              aria-label="Filter by status"
              data-testid="status-filter"
              @update:model-value="filterStore.setStatus($event as IssueStatus | 'all')"
            />
            <BaseDropdown
              :items="levelItems"
              :model-value="criteria.level"
              :trigger-text="levelLabel"
              width-class="w-44"
              aria-label="Filter by level"
              data-testid="level-filter"
              @update:model-value="filterStore.setLevel($event as ErrorLevel | 'all')"
            />
            <BaseDropdown
              :items="environmentItems"
              :model-value="criteria.environment"
              :trigger-text="environmentLabel"
              width-class="w-48"
              aria-label="Filter by environment"
              data-testid="environment-filter"
              @update:model-value="filterStore.setEnvironment($event)"
            />
            <BaseDropdown
              :items="timeRangeItems"
              :model-value="String(criteria.time_range_hours)"
              :trigger-text="timeRangeLabel"
              width-class="w-40"
              aria-label="Filter by time range"
              data-testid="time-filter"
              @update:model-value="filterStore.setTimeRange(Number($event))"
            />
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <span data-testid="issues-summary">
            {{ filteredIssues.length }} of {{ issues.length }} issues ·
            {{ summary.events }} events in range
          </span>
          <button
            v-if="!filterStore.isDefaultState"
            type="button"
            class="font-semibold uppercase tracking-wider text-brand-300 hover:text-brand-200"
            data-testid="reset-filters"
            @click="resetFilters()"
          >
            Reset filters
          </button>
        </div>
      </section>

      <IssueTable
        :issues="paginatedIssues"
        :selected-ids="selectedIssueIds"
        :is-loading="isLoading"
        :sort-by="criteria.sort_by"
        empty-title="No issues match these filters"
        empty-description="Widen the time range, switch the status facet or clear the search operators."
        @toggle-select="toggleSelection"
        @toggle-select-all="toggleSelectAll"
        @open="openIssue"
        @reset-filters="resetFilters()"
        @sort="filterStore.toggleSort($event)"
      />

      <BasePagination
        v-if="paginatedIssues.length > 0"
        :page="page"
        :page-size="pageSize"
        :total-items="filteredIssues.length"
        @update:page="setPage"
      />

      <p v-if="isTableLayout" class="text-[11px] text-slate-600">
        Sorted by {{ criteria.sort_by }} ({{ criteria.sort_order }})
      </p>
    </div>

    <IssueBulkBar
      :selected-count="selectedIssueIds.length"
      :is-processing="isProcessing"
      @resolve="onBulkAction('resolve')"
      @ignore="onBulkAction('ignore')"
      @delete="onBulkAction('delete')"
      @clear="clearSelection()"
    />
  </ResponsiveContainer>
</template>