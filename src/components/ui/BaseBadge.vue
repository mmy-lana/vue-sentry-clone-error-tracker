<script setup lang="ts">
import { computed } from 'vue';
import type { ErrorLevel, IssueStatus } from '../../types';
import { LEVEL_META, LEVEL_ORDER, STATUS_META } from '../../utils/theme';

export type BadgeTone = ErrorLevel | IssueStatus | 'neutral' | 'brand';

interface Props {
  /** Error level, issue status, or a neutral/brand chip. */
  tone?: BadgeTone;
  label?: string;
  size?: 'sm' | 'md';
  /** Hides the leading status dot for dense layouts. */
  hideDot?: boolean;
  title?: string;
}

const props = withDefaults(defineProps<Props>(), {
  tone: 'neutral',
  label: undefined,
  size: 'md',
  hideDot: false,
  title: undefined
});

const NEUTRAL_CHIP = 'bg-slate-700/40 text-slate-300 border-slate-600/50';
const BRAND_CHIP = 'bg-brand-600/20 text-brand-300 border-brand-500/30';

const isLevelTone = computed<boolean>(() => LEVEL_ORDER.includes(props.tone as ErrorLevel));
const isStatusTone = computed<boolean>(
  () => props.tone === 'unresolved' || props.tone === 'resolved' || props.tone === 'ignored'
);

const dotClass = computed<string | null>(() => {
  if (isLevelTone.value) return LEVEL_META[props.tone as ErrorLevel].dot;
  if (isStatusTone.value) return STATUS_META[props.tone as IssueStatus].dot;
  return null;
});

const chipClass = computed<string>(() => {
  if (isLevelTone.value) return LEVEL_META[props.tone as ErrorLevel].chip;
  if (isStatusTone.value) return STATUS_META[props.tone as IssueStatus].chip;
  return props.tone === 'brand' ? BRAND_CHIP : NEUTRAL_CHIP;
});

const text = computed<string>(() => {
  if (props.label !== undefined) return props.label;
  if (isLevelTone.value) return LEVEL_META[props.tone as ErrorLevel].label;
  if (isStatusTone.value) return STATUS_META[props.tone as IssueStatus].label;
  return props.tone === 'brand' ? 'Active' : 'Unknown';
});

const rootClass = computed<string[]>(() => [
  'inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap',
  props.size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]',
  chipClass.value
]);
</script>

<template>
  <span :class="rootClass" :title="title ?? text">
    <span
      v-if="!hideDot && dotClass"
      class="size-1.5 shrink-0 rounded-full"
      :class="dotClass"
      aria-hidden="true"
    />
    {{ text }}
  </span>
</template>