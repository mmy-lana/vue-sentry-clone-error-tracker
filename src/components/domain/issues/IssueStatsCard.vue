<script setup lang="ts">
import { computed } from 'vue';
import type { ErrorLevel } from '../../../types';
import { formatCompactNumber } from '../../../utils/date';
import { levelMeta } from '../../../utils/theme';
import BaseTooltip from '../../ui/BaseTooltip.vue';

interface Props {
  label: string;
  value: number | string;
  hint?: string;
  tone?: ErrorLevel | 'neutral' | 'brand';
  /** Optional delta rendered next to the value (e.g. `+12%`). */
  trend?: number;
}

const props = withDefaults(defineProps<Props>(), {
  hint: undefined,
  tone: 'neutral',
  trend: undefined
});

const displayValue = computed<string>(() =>
  typeof props.value === 'number' ? formatCompactNumber(props.value) : props.value
);

const accentClass = computed<string>(() => {
  switch (props.tone) {
    case 'neutral':
      return 'bg-surface-700';
    case 'brand':
      return 'bg-brand-500';
    default:
      return levelMeta(props.tone).dot;
  }
});

const trendLabel = computed<string | null>(() => {
  if (props.trend === undefined || props.trend === 0) return null;
  const prefix = props.trend > 0 ? '+' : '';
  return `${prefix}${props.trend}%`;
});

const trendClass = computed<string>(() => {
  if (props.trend === undefined || props.trend === 0) return 'text-slate-500';
  return props.trend > 0 ? 'text-rose-300' : 'text-emerald-300';
});
</script>

<template>
  <div class="relative flex items-center gap-3 overflow-hidden rounded-lg border border-surface-700/70 bg-surface-900/70 px-3 py-2.5">
    <span class="absolute inset-y-0 left-0 w-1" :class="accentClass" aria-hidden="true" />

    <div class="min-w-0 pl-1">
      <p class="truncate text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {{ label }}
      </p>
      <p class="mt-0.5 flex items-baseline gap-1.5">
        <span class="text-lg font-semibold tabular-nums text-slate-100">{{ displayValue }}</span>
        <span v-if="trendLabel" class="text-[11px] tabular-nums" :class="trendClass">
          {{ trendLabel }}
        </span>
      </p>
    </div>

    <BaseTooltip v-if="hint" :content="hint" placement="top">
      <button
        type="button"
        class="-mr-1 ml-auto shrink-0 cursor-help rounded p-1 text-slate-600 transition-colors hover:text-slate-300 focus:border-brand-500 focus:outline-none"
        :aria-label="`More information: ${hint}`"
        data-testid="stats-card-hint"
      >
        <svg
          class="size-3.5"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="6.4" />
          <path stroke-linecap="round" d="M8 7.4v3.4" />
          <circle cx="8" cy="5" r="0.8" fill="currentColor" stroke="none" />
        </svg>
      </button>
    </BaseTooltip>
  </div>
</template>