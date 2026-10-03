<script setup lang="ts">
/**
 * Live ingestion feed: newest-first event stream with pause/resume, manual
 * triggers and the session ingestion audit log.
 */
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import ResponsiveContainer from '../components/layout/ResponsiveContainer.vue';
import BaseBadge from '../components/ui/BaseBadge.vue';
import BaseButton from '../components/ui/BaseButton.vue';
import IngestionLogDrawer from '../components/domain/simulator/IngestionLogDrawer.vue';
import EmptyState from '../components/molecules/EmptyState.vue';
import TimeAgo from '../components/molecules/TimeAgo.vue';
import UserAvatar from '../components/molecules/UserAvatar.vue';
import { useSimulator } from '../composables/useSimulator';
import { useEventStore } from '../stores/eventStore';
import { useIssueStore } from '../stores/issueStore';
import { formatAbsoluteDateTime } from '../utils/date';
import type { ErrorEvent } from '../types';

const router = useRouter();
const eventStore = useEventStore();
const issueStore = useIssueStore();
const simulator = useSimulator();

const isPaused = ref<boolean>(false);
const isLogOpen = ref<boolean>(false);
const maxRows = ref<number>(50);
const feedRef = ref<HTMLDivElement | null>(null);

const feed = computed<ErrorEvent[]>(() => eventStore.events.slice(0, maxRows.value));

const lastEventId = computed<string>(() => feed.value[0]?.id ?? '');

function issueTitleFor(event: ErrorEvent): string {
  return (
    issueStore.issues.find((issue) => issue.id === event.issue_id)?.title ??
    `${event.exception.type}: ${event.message}`
  );
}

function issueLevelFor(event: ErrorEvent): ErrorEvent['level'] {
  return issueStore.issues.find((issue) => issue.id === event.issue_id)?.level ?? event.level;
}

function openIssue(issueId: string): void {
  void router.push(`/issues/${issueId}`);
}

async function emitOnce(): Promise<void> {
  await simulator.emit();
}

function togglePause(): void {
  isPaused.value = !isPaused.value;
}

function clearLog(): void {
  issueStore.clearIngestionLog();
}

/** Auto-scroll keeps the newest row visible while the feed is running. */
watch(lastEventId, async () => {
  if (isPaused.value) return;
  await new Promise((done) => setTimeout(done, 50));
  if (feedRef.value) feedRef.value.scrollTop = 0;
});

onMounted(() => {
  simulator.reset();
});

onBeforeUnmount(() => {
  simulator.stop();
});
</script>

<template>
  <ResponsiveContainer flush-bottom data-testid="live-stream-view">
    <div class="flex flex-col gap-3">
      <section class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-surface-700/70 bg-surface-900/70 p-3">
        <div class="flex items-center gap-2">
          <span
            class="flex size-2.5 rounded-full"
            :class="isPaused ? 'bg-amber-400' : 'animate-pulse bg-emerald-400'"
            aria-hidden="true"
          />
          <div>
            <p class="text-sm font-medium text-slate-100">
              {{ isPaused ? 'Feed paused' : 'Listening for events' }}
            </p>
            <p class="text-[11px] text-slate-500" data-testid="stream-counter">
              {{ feed.length }} of {{ eventStore.events.length }} stored events shown
            </p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <BaseButton
            :variant="isPaused ? 'primary' : 'secondary'"
            size="sm"
            data-testid="stream-pause"
            @click="togglePause"
          >
            {{ isPaused ? 'Resume' : 'Pause' }}
          </BaseButton>
          <BaseButton variant="secondary" size="sm" data-testid="stream-emit" @click="emitOnce">
            Emit event
          </BaseButton>
          <BaseButton
            variant="ghost"
            size="sm"
            data-testid="stream-toggle-stream"
            @click="simulator.toggle()"
          >
            {{ simulator.isRunning ? 'Stop auto' : 'Auto stream' }}
          </BaseButton>
          <BaseButton variant="ghost" size="sm" data-testid="stream-open-log" @click="isLogOpen = true">
            Ingestion log
          </BaseButton>
        </div>
      </section>

      <section class="rounded-lg border border-surface-700/70 bg-surface-900/60">
        <header class="flex flex-wrap items-center justify-between gap-2 border-b border-surface-800 px-3 py-2">
          <h2 class="text-sm font-semibold text-slate-100">Incoming events</h2>
          <label class="flex items-center gap-2 text-[11px] text-slate-400">
            Rows
            <select
              v-model.number="maxRows"
              class="h-7 rounded border border-surface-700 bg-surface-900 px-1.5 text-[11px] text-slate-200"
              data-testid="stream-rows"
            >
              <option :value="25">25</option>
              <option :value="50">50</option>
              <option :value="100">100</option>
            </select>
          </label>
        </header>

        <div
          ref="feedRef"
          class="scrollbar-thin max-h-[60vh] overflow-y-auto"
          role="log"
          aria-live="polite"
          data-testid="stream-feed"
        >
          <ol v-if="feed.length > 0" class="divide-y divide-surface-800/80">
            <li
              v-for="event in feed"
              :key="event.id"
              class="flex flex-col gap-1.5 px-3 py-2 transition-colors hover:bg-surface-850/60 sm:flex-row sm:items-center sm:gap-3"
              data-testid="stream-row"
            >
              <div class="flex w-28 shrink-0 items-center gap-2">
                <BaseBadge :tone="issueLevelFor(event)" size="sm" />
                <span class="text-[11px] text-slate-500"><TimeAgo :timestamp="event.timestamp" /></span>
              </div>

              <button
                type="button"
                class="min-w-0 flex-1 text-left"
                @click="openIssue(event.issue_id)"
              >
                <span class="block truncate text-xs font-medium text-slate-100">
                  {{ issueTitleFor(event) }}
                </span>
                <span class="block truncate font-mono text-[10px] text-slate-500">
                  {{ event.culprit }} · {{ formatAbsoluteDateTime(event.timestamp) }}
                </span>
              </button>

              <div class="flex shrink-0 items-center gap-2">
                <UserAvatar
                  v-if="event.user?.id"
                  :user-id="event.user.id"
                  :email="event.user.email"
                  size="xs"
                />
                <BaseBadge
                  v-for="(tag, key) in Object.entries(event.tags).slice(0, 2)"
                  :key="key"
                  tone="neutral"
                  :label="`${key}:${tag}`"
                  size="sm"
                  hide-dot
                />
              </div>
            </li>
          </ol>

          <div v-else class="p-4">
            <EmptyState
              icon="signal"
              title="No events ingested yet"
              description="Start the auto stream or emit a single event to watch it arrive here."
              action-label="Emit an event"
              action-variant="primary"
              @action="emitOnce"
            />
          </div>
        </div>
      </section>
    </div>

    <IngestionLogDrawer
      :is-open="isLogOpen"
      :entries="issueStore.ingestionLog"
      @close="isLogOpen = false"
      @clear="clearLog"
      @open-issue="openIssue"
    />
  </ResponsiveContainer>
</template>