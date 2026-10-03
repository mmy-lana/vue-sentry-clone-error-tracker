<script setup lang="ts">
/**
 * Issue detail: resolution toolbar, event stepper, stack frame explorer,
 * breadcrumb timeline, tag frequency breakdown and the context inspector.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import ResponsiveContainer from '../components/layout/ResponsiveContainer.vue';
import BaseBadge from '../components/ui/BaseBadge.vue';
import BaseButton from '../components/ui/BaseButton.vue';
import BaseModal from '../components/ui/BaseModal.vue';
import EnvironmentTag from '../components/molecules/EnvironmentTag.vue';
import EmptyState from '../components/molecules/EmptyState.vue';
import TimeAgo from '../components/molecules/TimeAgo.vue';
import UserAvatar from '../components/molecules/UserAvatar.vue';
import BreadcrumbTimeline from '../components/domain/details/BreadcrumbTimeline.vue';
import ContextInspector from '../components/domain/details/ContextInspector.vue';
import EventPaginationHeader from '../components/domain/details/EventPaginationHeader.vue';
import StackTraceViewer from '../components/domain/details/StackTraceViewer.vue';
import TagsBreakdownTable from '../components/domain/details/TagsBreakdownTable.vue';
import IssueStatsCard from '../components/domain/issues/IssueStatsCard.vue';
import { useErrorEvent } from '../composables/useErrorEvent';
import { useIssueStore } from '../stores/issueStore';
import { formatAbsoluteDateTime, formatCompactNumber, formatElapsed } from '../utils/date';
import type { IssueStatus } from '../types';

const props = defineProps<{
  id: string;
}>();

const router = useRouter();
const issueStore = useIssueStore();

const {
  issue,
  events,
  currentEvent,
  frames,
  breadcrumbs,
  context,
  position,
  total,
  hasPrevious,
  hasNext,
  showInAppOnly,
  load,
  previous,
  next,
  goTo,
  toggleInAppOnly
} = useErrorEvent(() => props.id);

const isDeleteConfirmOpen = ref<boolean>(false);
const isBusy = ref<boolean>(false);

const durationLabel = computed<string>(() =>
  issue.value ? formatElapsed(issue.value.first_seen, issue.value.last_seen) : '—'
);

const statusLabel = computed<string>(() => {
  switch (issue.value?.status) {
    case 'resolved':
      return 'Resolved';
    case 'ignored':
      return 'Ignored';
    default:
      return 'Unresolved';
  }
});

function syncIssue(): void {
  issueStore.selectIssue(props.id);
  load();
}

onMounted(syncIssue);
watch(() => props.id, syncIssue);

async function setStatus(status: IssueStatus): Promise<void> {
  isBusy.value = true;
  try {
    await issueStore.updateStatus([props.id], status);
  } finally {
    isBusy.value = false;
  }
}

async function confirmDelete(): Promise<void> {
  isBusy.value = true;
  try {
    await issueStore.deleteIssues([props.id]);
    isDeleteConfirmOpen.value = false;
    await router.push('/issues');
  } finally {
    isBusy.value = false;
  }
}
</script>

<template>
  <ResponsiveContainer flush-bottom width="wide" data-testid="issue-detail-view">
    <EmptyState
      v-if="!issue"
      icon="search"
      title="Issue not found"
      description="This issue may have been deleted or belongs to another project."
      action-label="Back to issues"
      action-variant="primary"
      @action="router.push('/issues')"
    />

    <div v-else class="flex flex-col gap-3">
      <section class="rounded-lg border border-surface-700/70 bg-surface-900/70 p-3">
        <div class="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-1.5">
              <BaseBadge :tone="issue.level" />
              <BaseBadge :tone="issue.status" />
              <EnvironmentTag v-for="env in issue.environments" :key="env" :environment="env" />
              <BaseBadge
                v-if="issue.regression_count > 0"
                tone="warning"
                :label="`${issue.regression_count} regression${issue.regression_count === 1 ? '' : 's'}`"
              />
            </div>

            <h2 class="mt-2 break-words text-base font-semibold text-slate-100">{{ issue.title }}</h2>
            <p class="mt-1 break-all font-mono text-[11px] text-slate-500">{{ issue.culprit }}</p>
            <p class="mt-1 text-[11px] text-slate-500">
              First seen {{ formatAbsoluteDateTime(issue.first_seen) }} · last seen
              <TimeAgo :timestamp="issue.last_seen" /> · active for {{ durationLabel }} · fingerprint
              <span class="font-mono">{{ issue.fingerprint }}</span>
            </p>
          </div>

          <div class="flex shrink-0 flex-wrap items-center gap-2">
            <BaseButton
              v-if="issue.status !== 'resolved'"
              variant="primary"
              size="sm"
              :loading="isBusy"
              data-testid="resolve-issue"
              @click="setStatus('resolved')"
            >
              Resolve
            </BaseButton>
            <BaseButton
              v-else
              variant="secondary"
              size="sm"
              :loading="isBusy"
              data-testid="unresolve-issue"
              @click="setStatus('unresolved')"
            >
              Reopen
            </BaseButton>
            <BaseButton
              variant="ghost"
              size="sm"
              :loading="isBusy"
              data-testid="ignore-issue"
              @click="setStatus('ignored')"
            >
              Ignore
            </BaseButton>
            <BaseButton
              variant="danger"
              size="sm"
              :loading="isBusy"
              data-testid="delete-issue"
              @click="isDeleteConfirmOpen = true"
            >
              Delete
            </BaseButton>
          </div>
        </div>

        <div class="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <IssueStatsCard label="Status" :value="statusLabel" tone="brand" />
          <IssueStatsCard label="Events" :value="formatCompactNumber(issue.event_count)" tone="info" />
          <IssueStatsCard label="Users" :value="issue.user_count" tone="warning" />
          <IssueStatsCard label="Assignee" :value="issue.assigned_to ?? 'unassigned'" tone="neutral" />
        </div>

        <div v-if="issue.unique_users.length > 0" class="mt-3 flex flex-wrap items-center gap-2">
          <span class="text-[11px] uppercase tracking-wider text-slate-500">Affected users</span>
          <UserAvatar
            v-for="userId in issue.unique_users.slice(0, 8)"
            :key="userId"
            :user-id="userId"
            size="sm"
          />
          <span v-if="issue.unique_users.length > 8" class="text-[11px] text-slate-500">
            +{{ issue.unique_users.length - 8 }} more
          </span>
        </div>
      </section>

      <EventPaginationHeader
        :index="position"
        :total="total"
        :timestamp="currentEvent?.timestamp ?? issue.last_seen"
        :level="currentEvent?.level"
        :is-newest="position === total && total > 0"
        :is-oldest="position === 1 && total > 1"
        @previous="previous()"
        @next="next()"
      />

      <div class="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div class="flex min-w-0 flex-col gap-3">
          <section class="rounded-lg border border-surface-700/70 bg-surface-900/60 p-3">
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 class="text-sm font-semibold text-slate-100">Exception</h3>
              <button
                type="button"
                class="text-[11px] font-semibold uppercase tracking-wider text-slate-400 hover:text-brand-300"
                data-testid="toggle-in-app"
                @click="toggleInAppOnly()"
              >
                {{ showInAppOnly ? 'Show all frames' : 'In-app only' }}
              </button>
            </div>
            <p class="break-words font-mono text-xs text-slate-200">
              <span class="text-rose-300">{{ currentEvent?.exception.type ?? '—' }}</span>:
              {{ currentEvent?.exception.value ?? 'No event selected' }}
            </p>
          </section>

          <section class="rounded-lg border border-surface-700/70 bg-surface-900/60 p-3">
            <StackTraceViewer :frames="frames" />
          </section>

          <section class="rounded-lg border border-surface-700/70 bg-surface-900/60 p-3">
            <BreadcrumbTimeline :breadcrumbs="breadcrumbs" />
          </section>
        </div>

        <div class="flex min-w-0 flex-col gap-3">
          <section class="rounded-lg border border-surface-700/70 bg-surface-900/60 p-3">
            <ContextInspector v-if="currentEvent" :event="currentEvent" />
            <EmptyState
              v-else
              compact
              icon="inbox"
              title="No event selected"
              description="Use the stepper above to inspect another occurrence."
            />
          </section>

          <section class="rounded-lg border border-surface-700/70 bg-surface-900/60 p-3">
            <TagsBreakdownTable :tags-summary="issue.tags_summary" />
          </section>

          <section class="rounded-lg border border-surface-700/70 bg-surface-900/60 p-3">
            <h3 class="mb-2 text-sm font-semibold text-slate-100">Occurrences</h3>
            <ol
              v-if="events.length > 0"
              class="scrollbar-thin flex max-h-64 flex-col gap-1 overflow-y-auto"
            >
              <li v-for="(event, index) in events" :key="event.id">
                <button
                  type="button"
                  class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] transition-colors"
                  :class="
                    index === position - 1
                      ? 'bg-brand-600/15 text-brand-200'
                      : 'text-slate-400 hover:bg-surface-800'
                  "
                  data-testid="event-list-item"
                  @click="goTo(index)"
                >
                  <BaseBadge :tone="event.level" size="sm" hide-dot />
                  <span class="tabular-nums text-slate-500">
                    {{ formatAbsoluteDateTime(event.timestamp) }}
                  </span>
                  <span class="ml-auto"><TimeAgo :timestamp="event.timestamp" /></span>
                </button>
              </li>
            </ol>
            <p v-else class="text-xs text-slate-500">No events stored for this issue.</p>
            <p v-if="context.fingerprint" class="mt-2 truncate font-mono text-[10px] text-slate-600">
              {{ context.fingerprint }}
            </p>
            <p class="mt-2 text-[10px] text-slate-600">
              Stepper: {{ hasPrevious ? 'previous available' : 'first event' }} ·
              {{ hasNext ? 'next available' : 'last event' }}
            </p>
          </section>
        </div>
      </div>
    </div>

    <BaseModal
      :is-open="isDeleteConfirmOpen"
      title="Delete this issue?"
      description="The issue and every event grouped under it will be removed from local storage."
      size="sm"
      persistent
      @close="isDeleteConfirmOpen = false"
    >
      <p class="text-sm text-slate-300">
        This cannot be undone. {{ formatCompactNumber(issue?.event_count ?? 0) }} events will be deleted.
      </p>
      <template #footer>
        <BaseButton variant="ghost" @click="isDeleteConfirmOpen = false">Cancel</BaseButton>
        <BaseButton variant="danger" :loading="isBusy" @click="confirmDelete">Delete issue</BaseButton>
      </template>
    </BaseModal>
  </ResponsiveContainer>
</template>