<script setup lang="ts">
import { computed } from 'vue';
import type { ErrorLevel, HourlyBucket } from '../../types';
import { formatHourLabel } from '../../utils/date';
import { LEVEL_HEX } from '../../utils/theme';

interface Props {
  buckets: HourlyBucket[];
  /** Height utility for the bar track. */
  heightClass?: string;
  tone?: ErrorLevel;
  ariaLabel?: string;
  /** Paints the newest bucket in the level colour. */
  showLastBucket?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  heightClass: 'h-8',
  tone: 'error',
  ariaLabel: '24 hour frequency histogram',
  showLastBucket: true
});

const maxCount = computed<number>(() =>
  props.buckets.reduce((max, bucket) => Math.max(max, bucket.count), 0)
);

const totalCount = computed<number>(() =>
  props.buckets.reduce((sum, bucket) => sum + bucket.count, 0)
);

const lastIndex = computed<number>(() => props.buckets.length - 1);

const accentColor = computed<string>(() => LEVEL_HEX[props.tone] ?? LEVEL_HEX.error);

function barHeight(count: number): string {
  if (count <= 0) return '12%';
  const ratio = maxCount.value === 0 ? 0 : count / maxCount.value;
  return `${Math.max(16, Math.round(ratio * 100))}%`;
}

function barStyle(bucket: HourlyBucket, index: number): Record<string, string> {
  return {
    height: barHeight(bucket.count),
    ...(props.showLastBucket && index === lastIndex.value
      ? { backgroundColor: accentColor.value }
      : {})
  };
}

function barClass(bucket: HourlyBucket, index: number): string {
  if (props.showLastBucket && index === lastIndex.value) return '';
  return bucket.count > 0
    ? 'bg-surface-700 hover:bg-brand-400'
    : 'bg-surface-800 hover:bg-surface-700';
}

function bucketLabel(bucket: HourlyBucket): string {
  return `${formatHourLabel(bucket.hour_timestamp)} · ${bucket.count} ${bucket.count === 1 ? 'event' : 'events'}`;
}
</script>

<template>
  <div
    class="hidden w-full min-w-[80px] items-end gap-[2px] sm:flex"
    :class="heightClass"
    role="img"
    :aria-label="`${ariaLabel}, ${totalCount} events across 24 hours`"
    data-testid="sparkline"
  >
    <div
      v-for="(bucket, index) in buckets"
      :key="bucket.hour_timestamp || index"
      class="group relative min-w-[2px] flex-1 rounded-[1px] transition-colors"
      :class="barClass(bucket, index)"
      :style="barStyle(bucket, index)"
      :title="bucketLabel(bucket)"
      :aria-label="bucketLabel(bucket)"
      role="presentation"
    >
      <span
        class="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded border border-surface-700 bg-surface-900 px-2 py-0.5 font-mono text-[10px] text-slate-200 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 sm:block"
      >
        {{ bucketLabel(bucket) }}
      </span>
    </div>
  </div>
</template>