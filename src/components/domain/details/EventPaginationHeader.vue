<script setup lang="ts">
import { computed } from 'vue';
import { formatAbsoluteDateTime, formatRelativeTime } from '../../../utils/date';
import BaseBadge from '../../ui/BaseBadge.vue';
import BaseButton from '../../ui/BaseButton.vue';

interface Props {
  /** 1-based index of the currently displayed event. */
  index: number;
  total: number;
  timestamp: number;
  level?: string;
  isNewest?: boolean;
  isOldest?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  level: undefined,
  isNewest: false,
  isOldest: false
});

const emit = defineEmits<{
  (event: 'previous'): void;
  (event: 'next'): void;
}>();

const label = computed<string>(() =>
  props.total > 0 ? `Event ${props.index} of ${props.total}` : 'No events'
);

const relative = computed<string>(() => formatRelativeTime(props.timestamp));
const absolute = computed<string>(() => formatAbsoluteDateTime(props.timestamp));
</script>

<template>
  <header
    class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-surface-700/70 bg-surface-900/70 px-3 py-2"
    data-testid="event-pagination-header"
  >
    <div class="flex min-w-0 items-center gap-2">
      <BaseBadge v-if="level" :tone="level as never" size="sm" />
      <div class="min-w-0">
        <p class="truncate text-sm font-medium text-slate-100">{{ label }}</p>
        <p class="truncate text-[11px] text-slate-500" :title="absolute">
          {{ relative }} · {{ absolute }}
        </p>
      </div>
    </div>

    <div class="flex items-center gap-1.5">
      <BaseBadge v-if="isOldest" tone="neutral" label="oldest" size="sm" hide-dot />
      <BaseBadge v-if="isNewest" tone="brand" label="latest" size="sm" hide-dot />

      <BaseButton
        variant="ghost"
        size="sm"
        aria-label="Previous event"
        :disabled="index <= 1"
        @click="emit('previous')"
      >
        <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 6l-6 6 6 6" />
        </svg>
        Prev
      </BaseButton>
      <BaseButton
        variant="ghost"
        size="sm"
        aria-label="Next event"
        :disabled="index >= total"
        @click="emit('next')"
      >
        Next
        <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 6l6 6-6 6" />
        </svg>
      </BaseButton>
    </div>
  </header>
</template>