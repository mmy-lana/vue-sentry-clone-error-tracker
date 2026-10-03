<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { formatAbsoluteDateTime, formatRelativeTime } from '../../utils/date';

interface Props {
  timestamp: number;
  /** Re-renders on an interval so the value never goes stale. */
  live?: boolean;
  refreshMs?: number;
  prefix?: string;
  fallback?: string;
}

const props = withDefaults(defineProps<Props>(), {
  live: true,
  refreshMs: 30_000,
  prefix: '',
  fallback: 'unknown time'
});

const now = ref<number>(Date.now());
let timer: number | null = null;

const label = computed<string>(() => {
  if (!Number.isFinite(props.timestamp) || props.timestamp <= 0) return props.fallback;
  return `${props.prefix}${formatRelativeTime(props.timestamp, now.value)}`;
});

const title = computed<string>(() => formatAbsoluteDateTime(props.timestamp));

function stop(): void {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
}

function start(): void {
  stop();
  now.value = Date.now();
  if (props.live) {
    timer = window.setInterval(() => {
      now.value = Date.now();
    }, Math.max(5_000, props.refreshMs));
  }
}

watch(
  () => [props.live, props.refreshMs, props.timestamp] as const,
  () => start(),
  { immediate: true }
);

onBeforeUnmount(stop);
</script>

<template>
  <time :datetime="new Date(timestamp || 0).toISOString()" :title="title" class="tabular-nums">
    {{ label }}
  </time>
</template>