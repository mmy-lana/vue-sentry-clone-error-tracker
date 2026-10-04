<script setup lang="ts">
import { computed } from 'vue';
import type { Issue, IssueSortField } from '../../../types';
import BaseButton from '../../ui/BaseButton.vue';
import BaseCheckbox from '../../ui/BaseCheckbox.vue';
import EmptyState from '../../molecules/EmptyState.vue';
import IssueRow from './IssueRow.vue';

interface Props {
  issues: Issue[];
  selectedIds: string[];
  selectable?: boolean;
  isLoading?: boolean;
  sortBy?: IssueSortField;
  emptyTitle?: string;
  emptyDescription?: string;
}

const props = withDefaults(defineProps<Props>(), {
  selectable: true,
  isLoading: false,
  sortBy: 'last_seen',
  emptyTitle: 'No issues match these filters',
  emptyDescription: 'Adjust the search query, status or time range to see more results.'
});

const emit = defineEmits<{
  (event: 'toggle-select', issueId: string): void;
  (event: 'toggle-select-all', issueIds: string[]): void;
  (event: 'open', issueId: string): void;
  (event: 'reset-filters'): void;
  (event: 'sort', field: IssueSortField): void;
}>();

/**
 * Shared grid tracks for the header and every row:
 * checkbox | level/status | issue identity | 24h sparkline | events | users | last seen.
 *
 * Tablets keep the dense track set so the identity column never collapses
 * below zero; from `xl` up the numeric tracks take their comfortable widths and
 * the identity track is guaranteed a 280px floor before it starts absorbing the
 * remaining container width.
 */
const ISSUE_GRID_CLASSES =
  'md:grid-cols-[auto_72px_minmax(0,1fr)_96px_68px_80px_76px] xl:grid-cols-[auto_80px_minmax(280px,1fr)_128px_76px_96px_84px]';

const COLUMNS: { field: IssueSortField; label: string }[] = [
  { field: 'event_count', label: 'Events' },
  { field: 'user_count', label: 'Users' },
  { field: 'last_seen', label: 'Last seen' }
];

const allIds = computed<string[]>(() => props.issues.map((issue) => issue.id));
const selectedCount = computed<number>(() => props.selectedIds.length);
const allSelected = computed<boolean>(
  () => allIds.value.length > 0 && selectedCount.value === allIds.value.length
);
const isIndeterminate = computed<boolean>(() => selectedCount.value > 0 && !allSelected.value);

function isSelected(issueId: string): boolean {
  return props.selectedIds.includes(issueId);
}
</script>

<template>
  <div class="overflow-hidden rounded-lg border border-surface-700/70 bg-surface-900/60">
    <!-- Column header (tablet and up). Track list is shared with IssueRow so
         every heading sits above the column it describes. -->
    <div
      data-testid="issues-header"
      class="hidden items-center gap-3 border-b border-surface-700/70 bg-surface-850/60 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-500 md:grid"
      :class="ISSUE_GRID_CLASSES"
    >
      <BaseCheckbox
        v-if="selectable"
        :model-value="allSelected"
        :indeterminate="isIndeterminate"
        aria-label="Select all issues on this page"
        @update:model-value="emit('toggle-select-all', allIds)"
      />
      <span v-else aria-hidden="true" />

      <!-- Spacer keeps the fixed level/status track. It must stay in flow:
           `sr-only` is absolutely positioned and would shift every later header
           one column to the left. -->
      <span aria-hidden="true" />

      <button
        type="button"
        class="flex items-center gap-1 text-left transition-colors hover:text-slate-300"
        @click="emit('sort', 'first_seen')"
      >
        Issue
        <span v-if="sortBy === 'first_seen'" class="text-brand-400" aria-hidden="true">↑</span>
      </button>

      <span class="text-center">24h</span>

      <button
        v-for="column in COLUMNS"
        :key="column.field"
        type="button"
        class="text-right transition-colors hover:text-slate-300"
        @click="emit('sort', column.field)"
      >
        {{ column.label }}
        <span v-if="sortBy === column.field" class="text-brand-400" aria-hidden="true">↓</span>
      </button>
    </div>

    <!-- Rows -->
    <div v-if="isLoading" class="space-y-2 p-4" role="status" aria-live="polite">
      <div
        v-for="row in 4"
        :key="row"
        class="h-14 animate-pulse rounded-md bg-surface-800/60"
      />
      <span class="sr-only">Loading issues</span>
    </div>

    <template v-else-if="issues.length > 0">
      <IssueRow
        v-for="issue in issues"
        :key="issue.id"
        :issue="issue"
        :selectable="selectable"
        :selected="isSelected(issue.id)"
        @toggle-select="emit('toggle-select', $event)"
        @open="emit('open', $event)"
      />
    </template>

    <div v-else class="p-4">
      <EmptyState
        icon="filter"
        :title="emptyTitle"
        :description="emptyDescription"
        action-label="Clear filters"
        @action="emit('reset-filters')"
      />
    </div>

    <div
      v-if="!isLoading && allSelected && selectedCount > 0"
      class="flex justify-end border-t border-surface-700/70 bg-surface-850/60 px-4 py-2"
    >
      <BaseButton variant="ghost" size="sm" @click="emit('toggle-select-all', [])">
        Clear selection
      </BaseButton>
    </div>
  </div>
</template>