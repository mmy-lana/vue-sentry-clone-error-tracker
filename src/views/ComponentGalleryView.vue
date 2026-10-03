<script setup lang="ts">
/**
 * Design-system gallery.
 *
 * Renders every atomic primitive in isolation so the primitives can be
 * exercised (keyboard, focus, overflow and a11y) without going through a
 * product screen. The feature components are rendered against the real
 * IndexedDB dataset. It is intentionally not linked from the navigation.
 */
import { computed, ref } from 'vue';
import BaseBadge, { type BadgeTone } from '../components/ui/BaseBadge.vue';
import BaseButton from '../components/ui/BaseButton.vue';
import BaseCard from '../components/ui/BaseCard.vue';
import BaseCheckbox from '../components/ui/BaseCheckbox.vue';
import BaseDropdown from '../components/ui/BaseDropdown.vue';
import BaseInput from '../components/ui/BaseInput.vue';
import BaseModal from '../components/ui/BaseModal.vue';
import BasePagination from '../components/ui/BasePagination.vue';
import BaseTabs from '../components/ui/BaseTabs.vue';
import BaseTooltip from '../components/ui/BaseTooltip.vue';
import EmptyState from '../components/molecules/EmptyState.vue';
import EnvironmentTag from '../components/molecules/EnvironmentTag.vue';
import FilterSearchBar from '../components/molecules/FilterSearchBar.vue';
import SparklineBarGraph from '../components/molecules/SparklineBarGraph.vue';
import TagBadgeGroup from '../components/molecules/TagBadgeGroup.vue';
import TimeAgo from '../components/molecules/TimeAgo.vue';
import UserAvatar from '../components/molecules/UserAvatar.vue';
import IssueBulkBar from '../components/domain/issues/IssueBulkBar.vue';
import IssueRow from '../components/domain/issues/IssueRow.vue';
import IssueStatsCard from '../components/domain/issues/IssueStatsCard.vue';
import IssueTable from '../components/domain/issues/IssueTable.vue';
import BreadcrumbTimeline from '../components/domain/details/BreadcrumbTimeline.vue';
import ContextInspector from '../components/domain/details/ContextInspector.vue';
import EventPaginationHeader from '../components/domain/details/EventPaginationHeader.vue';
import StackTraceViewer from '../components/domain/details/StackTraceViewer.vue';
import TagsBreakdownTable from '../components/domain/details/TagsBreakdownTable.vue';
import { useBreakpoints } from '../composables/useBreakpoints';
import { useIssues } from '../composables/useIssues';
import { useSimulator } from '../composables/useSimulator';
import { useFilterStore } from '../stores/filterStore';
import { useIssueStore } from '../stores/issueStore';
import { useEventStore } from '../stores/eventStore';
import type { BaseDropdownItem, ErrorEvent, Issue, TabItem } from '../types';
import { LEVEL_ORDER, STATUS_ORDER } from '../utils/theme';

const variantNames = ['primary', 'secondary', 'danger', 'ghost'] as const;
const sizeNames = ['sm', 'md', 'lg'] as const;
const badgeTones: BadgeTone[] = [...LEVEL_ORDER, ...STATUS_ORDER, 'brand', 'neutral'];

const searchValue = ref<string>('is:unresolved level:error');
const errorInput = ref<string>('not-an-email');
const checked = ref<boolean>(false);
const selectAll = ref<boolean>(false);
const someSelected = ref<boolean>(true);
const isModalOpen = ref<boolean>(false);
const activeTab = ref<string>('details');
const sortChoice = ref<string>('last_seen');
const page = ref<number>(1);
const toast = ref<string>('');

// Live dataset used by the feature component harness.
const liveIssues = computed<Issue[]>(() => issueStore.issues);
const selectedIssueIds = ref<string[]>([]);
const harnessQuery = ref<string>('');

const SUGGESTIONS = [
  'is:unresolved',
  'is:resolved',
  'level:error',
  'level:fatal',
  'env:production',
  'env:staging',
  'user:usr_9410'
];

const tabs: TabItem[] = [
  { key: 'details', label: 'Details', badge: 12 },
  { key: 'activity', label: 'Activity' },
  { key: 'tags', label: 'Tags' },
  { key: 'similar', label: 'Similar Issues', badge: 3 }
];

const sortItems: BaseDropdownItem[] = [
  { id: 'last_seen', label: 'Last seen' },
  { id: 'first_seen', label: 'First seen' },
  { id: 'event_count', label: 'Event count' },
  { id: 'user_count', label: 'User count' },
  { id: 'clear', label: 'Clear filters', danger: true }
];

const isIndeterminate = computed<boolean>(() => someSelected.value && !selectAll.value);

const sampleIssue = computed<Issue | null>(() => liveIssues.value[0] ?? null);

/** Events of the first issue, oldest first, kept live through the store. */
const liveEvents = computed<ErrorEvent[]>(() => {
  const issueId = sampleIssue.value?.id;
  if (!issueId) return [];
  return [...eventStore.eventsForIssue(issueId)].sort((a, b) => a.timestamp - b.timestamp);
});

const sampleEvent = computed<ErrorEvent | null>(() => liveEvents.value[0] ?? null);

function announce(message: string): void {
  toast.value = message;
  window.setTimeout(() => {
    if (toast.value === message) toast.value = '';
  }, 2000);
}

function toggleIssueSelection(issueId: string): void {
  selectedIssueIds.value = selectedIssueIds.value.includes(issueId)
    ? selectedIssueIds.value.filter((id) => id !== issueId)
    : [...selectedIssueIds.value, issueId];
}

function toggleSelectAll(issueIds: string[]): void {
  selectedIssueIds.value = issueIds.length === selectedIssueIds.value.length ? [] : [...issueIds];
}

const issueStore = useIssueStore();
const eventStore = useEventStore();
const filterStore = useFilterStore();
const simulator = useSimulator();
const issuesFacade = useIssues({ pageSize: 5, syncEnvironments: false });
const { isCompact, isMobile, isTablet, isDesktop, viewportClass, sidebarMode } = useBreakpoints();

const simulatedIssueId = ref<string | null>(null);
const pipelineLog = ref<string[]>([]);

function log(message: string): void {
  pipelineLog.value = [message, ...pipelineLog.value].slice(0, 6);
}

const lastOutcome = computed<string>(() => issueStore.ingestionLog[0]?.outcome ?? 'none');

const simulatedIssue = computed<Issue | null>(
  () => issueStore.issues.find((issue) => issue.id === simulatedIssueId.value) ?? null
);

const simulatedStatus = computed<string>(() => simulatedIssue.value?.status ?? '—');
const simulatedRegressions = computed<number>(() => simulatedIssue.value?.regression_count ?? 0);

const queryPreview = computed<string>(() => {
  const params = filterStore.toQueryParams();
  return Object.keys(params).length === 0 ? '(defaults)' : new URLSearchParams(params).toString();
});

const facetSummary = computed<string>(() => {
  const { effectiveStatus, effectiveLevel, effectiveEnvironment } = issuesFacade;
  return `${effectiveStatus.value} / ${effectiveLevel.value} / ${effectiveEnvironment.value}`;
});

async function emitPreset(presetId: string): Promise<void> {
  const preset = simulator.presets.find((candidate) => candidate.id === presetId);
  if (!preset) return;
  const issueId = await simulator.emit(preset);
  if (issueId) {
    simulatedIssueId.value = issueId;
    log(`${preset.label} -> ${issueStore.ingestionLog[0]?.outcome ?? 'failed'}`);
  } else {
    log(`${preset.label} -> failed: ${simulator.lastError.value ?? 'unknown error'}`);
  }
}

async function resolveSimulated(): Promise<void> {
  if (!simulatedIssueId.value) return;
  await issueStore.updateStatus([simulatedIssueId.value], 'resolved');
  log('resolved simulated issue');
}

async function deleteSimulated(): Promise<void> {
  if (!simulatedIssueId.value) return;
  await issueStore.deleteIssues([simulatedIssueId.value]);
  log('deleted simulated issue');
  simulatedIssueId.value = null;
}


</script>

<template>
  <div class="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 pb-16 sm:p-6">
    <header class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h1 class="text-lg font-semibold text-slate-100">Design system</h1>
        <p class="text-xs text-slate-400">
          Atomic primitives used across the dashboard.
        </p>
      </div>
      <BaseBadge tone="brand" label="Phase 2" />
    </header>

    <BaseCard title="Buttons" description="Variants, sizes and loading state">
      <div class="flex flex-col gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <BaseButton
            v-for="variant in variantNames"
            :key="variant"
            :variant="variant"
            data-testid="gallery-button"
            @click="announce(`${variant} clicked`)"
          >
            {{ variant }}
          </BaseButton>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <BaseButton
            v-for="size in sizeNames"
            :key="size"
            :size="size"
            variant="secondary"
          >
            size {{ size }}
          </BaseButton>
          <BaseButton variant="primary" loading>loading</BaseButton>
          <BaseButton variant="secondary" disabled>disabled</BaseButton>
          <BaseButton variant="ghost" active>active</BaseButton>
        </div>
      </div>
    </BaseCard>

    <BaseCard title="Badges" description="Level, status and neutral tones">
      <div class="flex flex-wrap gap-2">
        <BaseBadge
          v-for="tone in badgeTones"
          :key="tone"
          :tone="tone"
          data-testid="gallery-badge"
        />
        <BaseBadge tone="error" size="sm" />
        <BaseBadge tone="neutral" label="1.2k events" />
      </div>
    </BaseCard>

    <BaseCard title="Inputs" description="Prefix/suffix slots, hints and errors">
      <div class="grid gap-4 sm:grid-cols-2">
        <BaseInput
          v-model="searchValue"
          label="Search issues"
          placeholder="is:unresolved level:error"
          hint="Supports is:, level:, env: and user: operators."
        >
          <template #prefix>
            <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path stroke-linecap="round" d="m20 20-3.5-3.5" />
            </svg>
          </template>
          <template #suffix>
            <span class="text-[10px] uppercase tracking-wide">query</span>
          </template>
        </BaseInput>

        <BaseInput
          v-model="errorInput"
          label="Assigned email"
          type="email"
          required
          error="Enter a valid email address"
        />

        <BaseInput label="Disabled" model-value="read only" disabled />
        <BaseInput label="Read only" model-value="fixed value" readonly />
      </div>
    </BaseCard>

    <BaseCard title="Checkboxes" description="Checked, unchecked and indeterminate">
      <div class="flex flex-wrap items-center gap-4">
        <BaseCheckbox
          v-model="checked"
          label="Only in-app frames"
          data-testid="gallery-checkbox"
        />
        <BaseCheckbox
          v-model="selectAll"
          :indeterminate="isIndeterminate"
          label="Select all issues"
          data-testid="gallery-checkbox-indeterminate"
        />
        <BaseCheckbox :model-value="true" label="Archived" disabled />
      </div>
    </BaseCard>

    <BaseCard title="Dropdown" description="Anchored popover with viewport aware placement">
      <div class="flex flex-wrap items-center gap-3">
        <BaseDropdown
          v-model="sortChoice"
          :items="sortItems"
          trigger-text="Sort by"
          aria-label="Sort issues"
          data-testid="gallery-dropdown"
          @select="announce(`selected ${$event.label}`)"
        />
        <BaseDropdown
          :items="[]"
          trigger-text="Empty"
          aria-label="Empty dropdown"
        />
        <BaseButton variant="primary" data-testid="gallery-modal-open" @click="isModalOpen = true">
          Open modal
        </BaseButton>
      </div>
    </BaseCard>

    <BaseCard title="Tabs" description="Arrow keys move between tabs">
      <BaseTabs v-model="activeTab" :tabs="tabs" aria-label="Issue sections" />
      <p class="pt-3 text-xs text-slate-400">
        Active panel: <span class="text-slate-200">{{ activeTab }}</span>
      </p>
    </BaseCard>

    <BaseCard title="Tooltip" description="Hover, focus and tap">
      <div class="flex flex-wrap gap-3">
        <BaseTooltip content="Top placement" placement="top">
          <BaseButton variant="ghost" size="sm">Top</BaseButton>
        </BaseTooltip>
        <BaseTooltip content="Bottom placement" placement="bottom">
          <BaseButton variant="ghost" size="sm">Bottom</BaseButton>
        </BaseTooltip>
        <BaseTooltip content="Disabled tooltips never render" :disabled="true">
          <BaseButton variant="ghost" size="sm">Disabled</BaseButton>
        </BaseTooltip>
      </div>
    </BaseCard>

    <BaseCard title="Pagination" description="Windowed page buttons with ellipsis">
      <BasePagination v-model:page="page" :page-size="5" :total-items="137" />
    </BaseCard>

    <BaseCard
      title="Issue list harness"
      description="Live seeded data rendered through the issue table, rows, bulk bar and search bar"
      data-testid="issue-harness"
    >
      <div class="flex flex-col gap-3">
        <FilterSearchBar
          v-model="harnessQuery"
          :suggestions="SUGGESTIONS"
          :result-count="liveIssues.length"
        />

        <div class="grid gap-2 sm:grid-cols-3">
          <IssueStatsCard
            label="Total issues"
            :value="liveIssues.length"
            tone="brand"
            hint="Every fingerprint group stored locally"
          />
          <IssueStatsCard
            label="Unresolved"
            :value="liveIssues.filter((issue) => issue.status === 'unresolved').length"
            tone="fatal"
          />
          <IssueStatsCard
            label="Events"
            :value="liveEvents.length"
            tone="info"
            hint="Events attached to the most recent issue"
          />
        </div>

        <IssueTable
          :issues="liveIssues.slice(0, 5)"
          :selected-ids="selectedIssueIds"
          :sort-by="'last_seen'"
          @toggle-select="toggleIssueSelection"
          @toggle-select-all="toggleSelectAll"
          @open="announce(`open ${$event}`)"
          @reset-filters="harnessQuery = ''"
          @sort="announce(`sort by ${$event}`)"
        />

        <IssueBulkBar
          :selected-count="selectedIssueIds.length"
          @resolve="announce('bulk resolve')"
          @ignore="announce('bulk ignore')"
          @delete="announce('bulk delete')"
          @clear="selectedIssueIds = []"
        />

        <IssueTable
          :issues="[]"
          :selected-ids="[]"
          is-loading
          data-testid="issue-table-loading"
        />

        <IssueTable
          :issues="[]"
          :selected-ids="[]"
          data-testid="issue-table-empty"
          empty-title="No issues match these filters"
          empty-description="Widen the time range or clear the active operators."
          @reset-filters="announce('filters reset')"
        />

        <div v-if="liveIssues.length === 0" class="pt-2">
          <EmptyState
            compact
            icon="inbox"
            title="Waiting for the first issue"
            description="Trigger an error from the simulator to populate this harness."
          />
        </div>
      </div>
    </BaseCard>

    <BaseCard
      title="Molecules"
      description="Relative time, avatars, environments and tag chips"
      data-testid="molecule-harness"
    >
      <div class="flex flex-wrap items-center gap-4">
        <span class="flex items-center gap-2 text-xs text-slate-400">
          <TimeAgo :timestamp="Date.now() - 45 * 60_000" />
          <TimeAgo :timestamp="Date.now() - 3 * 86_400_000" />
          <TimeAgo :timestamp="0" fallback="never" />
        </span>

        <div class="flex items-center -space-x-1.5">
          <UserAvatar user-id="usr_9410" email="alex@example.com" username="alex" />
          <UserAvatar email="sam@example.com" username="sam r" size="md" />
          <UserAvatar />
        </div>

        <div class="flex flex-wrap items-center gap-1.5">
          <EnvironmentTag environment="production" />
          <EnvironmentTag environment="staging" />
          <EnvironmentTag environment="development" size="sm" />
          <EnvironmentTag environment="local" />
        </div>

        <TagBadgeGroup
          :tags="{ environment: 'production', browser: 'Chrome 122', release: 'dashboard@1.0.0' }"
          :max="2"
        />

        <SparklineBarGraph
          v-if="sampleIssue"
          :buckets="sampleIssue.histogram_24h"
          :tone="sampleIssue.level"
          height-class="h-10"
        />

        <div v-if="sampleIssue" class="w-full min-w-0 basis-full">
          <IssueRow :issue="sampleIssue" :selectable="false" @open="announce(`open ${$event}`)" />
        </div>
      </div>
    </BaseCard>

    <BaseCard
      title="Detail harness"
      description="Stack frames, breadcrumbs, context inspector and tag distribution"
      data-testid="detail-harness"
    >
      <div v-if="sampleIssue && sampleEvent" class="grid min-w-0 gap-4 lg:grid-cols-2">
        <div class="flex min-w-0 flex-col gap-4">
          <EventPaginationHeader
            :index="liveEvents.length"
            :total="liveEvents.length"
            :timestamp="sampleEvent.timestamp"
            :level="sampleEvent.level"
            is-newest
          />
          <StackTraceViewer :frames="sampleEvent.exception.stacktrace.frames" />
          <BreadcrumbTimeline :breadcrumbs="sampleEvent.breadcrumbs" />
        </div>
        <div class="flex min-w-0 flex-col gap-4">
          <ContextInspector :event="sampleEvent" />
          <TagsBreakdownTable :tags-summary="sampleIssue.tags_summary" />
        </div>
      </div>

      <EmptyState
        v-else
        icon="inbox"
        title="No event selected"
        description="The seeded dataset has not produced an event yet."
      />
    </BaseCard>

    <BaseCard
      title="State pipeline harness"
      description="Live Pinia stores, Dexie ingestion transactions and breakpoint classification"
      data-testid="pipeline-harness"
    >
      <div class="flex flex-col gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <BaseButton
            v-for="preset in simulator.presets"
            :key="preset.id"
            size="sm"
            variant="secondary"
            :data-testid="`emit-${preset.id}`"
            @click="emitPreset(preset.id)"
          >
            Emit {{ preset.label }}
          </BaseButton>
          <BaseButton
            size="sm"
            variant="ghost"
            data-testid="resolve-simulated"
            @click="resolveSimulated"
          >
            Resolve last
          </BaseButton>
          <BaseButton
            size="sm"
            variant="danger"
            data-testid="delete-simulated"
            @click="deleteSimulated"
          >
            Delete last
          </BaseButton>
          <BaseButton
            size="sm"
            variant="primary"
            data-testid="toggle-filter-status"
            @click="filterStore.setStatus(filterStore.criteria.status === 'unresolved' ? 'all' : 'unresolved')"
          >
            Toggle status facet
          </BaseButton>
        </div>

        <div class="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <IssueStatsCard
            label="Issues"
            :value="issueStore.issues.length"
            tone="brand"
          />
          <IssueStatsCard
            label="Unresolved"
            :value="issueStore.totalUnresolvedCount"
            tone="fatal"
          />
          <IssueStatsCard
            label="Events"
            :value="issueStore.totalEventCount"
            tone="info"
          />
          <IssueStatsCard
            label="Stored events"
            :value="eventStore.events.length"
            tone="info"
          />
          <IssueStatsCard
            label="Last outcome"
            :value="lastOutcome"
            tone="neutral"
          />
          <IssueStatsCard
            label="Viewport"
            :value="viewportClass"
            tone="brand"
            :hint="`sidebar: ${sidebarMode}`"
          />
        </div>

        <dl class="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div class="rounded border border-surface-800 bg-surface-950/60 p-2">
            <dt class="text-slate-500">Effective facets</dt>
            <dd class="mt-0.5 text-slate-200" data-testid="facet-summary">{{ facetSummary }}</dd>
          </div>
          <div class="rounded border border-surface-800 bg-surface-950/60 p-2">
            <dt class="text-slate-500">Filtered / total</dt>
            <dd class="mt-0.5 tabular-nums text-slate-200" data-testid="filtered-summary">
              {{ issuesFacade.sortedIssues.value.length }} / {{ issuesFacade.issues.value.length }}
            </dd>
          </div>
          <div class="rounded border border-surface-800 bg-surface-950/60 p-2">
            <dt class="text-slate-500">Serialised query</dt>
            <dd class="mt-0.5 break-all font-mono text-[11px] text-slate-200" data-testid="query-preview">
              {{ queryPreview }}
            </dd>
          </div>
          <div class="rounded border border-surface-800 bg-surface-950/60 p-2">
            <dt class="text-slate-500">Simulated issue</dt>
            <dd class="mt-0.5 text-slate-200" data-testid="simulated-status">
              {{ simulatedStatus }} · regressions {{ simulatedRegressions }}
            </dd>
          </div>
        </dl>

        <div class="flex flex-wrap gap-1.5">
          <BaseBadge
            v-for="(entry, index) in pipelineLog"
            :key="`${entry}-${index}`"
            tone="neutral"
            :label="entry"
            size="sm"
          />
          <BaseBadge
            v-if="pipelineLog.length === 0"
            tone="neutral"
            label="no pipeline activity yet"
            size="sm"
          />
        </div>

        <p class="text-[11px] text-slate-500">
          Breakpoints — compact: {{ isCompact }} · mobile: {{ isMobile }} · tablet: {{ isTablet }} ·
          desktop: {{ isDesktop }}
        </p>
      </div>
    </BaseCard>

    <p
      v-if="toast"
      class="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md border border-surface-700 bg-surface-900 px-3 py-2 text-xs text-slate-200 shadow-xl"
      role="status"
    >
      {{ toast }}
    </p>

    <BaseModal
      :is-open="isModalOpen"
      title="Base modal"
      description="Focus is trapped inside the dialog until it closes."
      data-testid="gallery-modal"
      @close="isModalOpen = false"
    >
      <div class="flex flex-col gap-3 text-sm text-slate-300">
        <p>
          The dialog traps Tab navigation, closes on <kbd class="rounded bg-surface-800 px-1">Esc</kbd>
          and restores focus to the trigger.
        </p>
        <BaseInput label="Field inside modal" model-value="editable" />
      </div>
      <template #footer>
        <BaseButton variant="ghost" @click="isModalOpen = false">Cancel</BaseButton>
        <BaseButton variant="primary" @click="isModalOpen = false">Confirm</BaseButton>
      </template>
    </BaseModal>
  </div>
</template>