<script setup lang="ts">
import { computed } from 'vue';
import type { IngestionLogEntry } from '../../../types';
import { formatTime } from '../../../utils/date';
import BaseBadge, { type BadgeTone } from '../../ui/BaseBadge.vue';
import BaseButton from '../../ui/BaseButton.vue';
import EmptyState from '../../molecules/EmptyState.vue';

interface Props {
  isOpen: boolean;
  entries: IngestionLogEntry[];
  limit?: number;
}

const props = withDefaults(defineProps<Props>(), {
  limit: 60
});

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'clear'): void;
  (event: 'open-issue', issueId: string): void;
}>();

const visibleEntries = computed<IngestionLogEntry[]>(() => props.entries.slice(0, props.limit));

const OUTCOME_TONE: Record<IngestionLogEntry['outcome'], BadgeTone> = {
  created: 'brand',
  merged: 'neutral',
  regressed: 'warning',
  rejected: 'danger' as BadgeTone
};

function outcomeLabel(outcome: IngestionLogEntry['outcome']): string {
  switch (outcome) {
    case 'created':
      return 'new';
    case 'merged':
      return 'merged';
    case 'regressed':
      return 'regressed';
    case 'rejected':
      return 'rejected';
    default:
      return outcome;
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isOpen"
        class="fixed inset-0 z-40 bg-slate-950/60"
        data-testid="ingestion-drawer-backdrop"
        @click="emit('close')"
      />
    </Transition>

    <Transition
      enter-active-class="transition-transform duration-200 ease-out"
      enter-from-class="translate-x-full"
      leave-active-class="transition-transform duration-150 ease-in"
      leave-to-class="translate-x-full"
    >
      <aside
        v-if="isOpen"
        class="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-surface-800 bg-surface-900 shadow-2xl"
        role="dialog"
        aria-modal="false"
        aria-label="Ingestion log"
        data-testid="ingestion-drawer"
      >
        <header class="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-surface-800 px-3">
          <div>
            <h2 class="text-sm font-semibold text-slate-100">Ingestion log</h2>
            <p class="text-[10px] uppercase tracking-wider text-slate-500">
              {{ entries.length }} event{{ entries.length === 1 ? '' : 's' }} this session
            </p>
          </div>
          <BaseButton variant="ghost" size="sm" aria-label="Close ingestion log" @click="emit('close')">
            Close
          </BaseButton>
        </header>

        <div v-if="visibleEntries.length > 0" class="scrollbar-thin flex-1 overflow-y-auto p-2">
          <ul class="flex flex-col gap-1.5">
            <li
              v-for="entry in visibleEntries"
              :key="entry.id"
              class="rounded-md border border-surface-800 bg-surface-950/60 p-2"
              data-testid="ingestion-entry"
            >
              <div class="flex items-center justify-between gap-2">
                <BaseBadge :tone="OUTCOME_TONE[entry.outcome]" :label="outcomeLabel(entry.outcome)" size="sm" />
                <span class="font-mono text-[10px] tabular-nums text-slate-500">
                  {{ formatTime(entry.timestamp) }}
                </span>
              </div>
              <p class="mt-1 truncate text-xs text-slate-200" :title="entry.issue_title">
                {{ entry.issue_title }}
              </p>
              <p class="mt-0.5 text-[10px] text-slate-500">{{ entry.detail }}</p>
              <div class="mt-1 flex items-center justify-between gap-2">
                <span class="truncate font-mono text-[10px] text-slate-600">{{ entry.fingerprint }}</span>
                <button
                  type="button"
                  class="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-brand-300 hover:text-brand-200"
                  @click="emit('open-issue', entry.issue_id)"
                >
                  Open
                </button>
              </div>
            </li>
          </ul>
        </div>

        <EmptyState
          v-else
          compact
          icon="signal"
          title="Nothing ingested yet"
          description="Emit an event from the simulator to populate this log."
        />

        <footer class="flex items-center justify-between gap-2 border-t border-surface-800 px-3 py-2">
          <BaseButton variant="ghost" size="sm" @click="emit('clear')">Clear log</BaseButton>
          <span class="text-[10px] text-slate-600">Newest first</span>
        </footer>
      </aside>
    </Transition>
  </Teleport>
</template>