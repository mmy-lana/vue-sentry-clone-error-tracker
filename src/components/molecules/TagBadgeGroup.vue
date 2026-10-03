<script setup lang="ts">
import { computed } from 'vue';
import BaseTooltip from '../ui/BaseTooltip.vue';

interface Props {
  tags: Record<string, string>;
  /** Number of chips rendered before collapsing into a "+N" counter. */
  max?: number;
  size?: 'sm' | 'md';
  /** Hide the `key:` prefix to render plain values. */
  valuesOnly?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  max: 3,
  size: 'md',
  valuesOnly: false
});

interface TagChip {
  key: string;
  value: string;
}

const chips = computed<TagChip[]>(() =>
  Object.entries(props.tags)
    .filter(([key, value]) => key.length > 0 && typeof value === 'string')
    .map(([key, value]) => ({ key, value }))
);

const visibleChips = computed<TagChip[]>(() => chips.value.slice(0, Math.max(0, props.max)));
const overflow = computed<TagChip[]>(() => chips.value.slice(Math.max(0, props.max)));

const rootChipClass = computed<string>(() =>
  props.size === 'sm'
    ? 'inline-flex max-w-[10rem] items-center gap-1 rounded border border-surface-700 bg-surface-800/80 px-1.5 py-0.5 text-[10px] text-slate-300'
    : 'inline-flex max-w-[14rem] items-center gap-1 rounded border border-surface-700 bg-surface-800/80 px-2 py-0.5 text-[11px] text-slate-300'
);
</script>

<template>
  <div v-if="chips.length > 0" class="flex flex-wrap items-center gap-1">
    <span
      v-for="chip in visibleChips"
      :key="`${chip.key}:${chip.value}`"
      :class="rootChipClass"
      :title="`${chip.key}: ${chip.value}`"
    >
      <span v-if="!valuesOnly" class="text-slate-500">{{ chip.key }}:</span>
      <span class="truncate text-slate-200">{{ chip.value }}</span>
    </span>

    <BaseTooltip
      v-if="overflow.length > 0"
      :content="overflow.map((chip) => `${chip.key}: ${chip.value}`).join('\n')"
      placement="top"
    >
      <span
        class="inline-flex cursor-default items-center rounded border border-surface-700 bg-surface-800/80 px-1.5 py-0.5 text-[10px] text-slate-400"
      >
        +{{ overflow.length }}
      </span>
    </BaseTooltip>
  </div>
</template>