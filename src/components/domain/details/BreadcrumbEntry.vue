<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Breadcrumb } from '../../../types';
import BaseBadge from '../../ui/BaseBadge.vue';
import TimeAgo from '../../molecules/TimeAgo.vue';

interface Props {
  breadcrumb: Breadcrumb;
  /** Renders the connector line under the entry. */
  isLast?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isLast: false
});

const isExpanded = ref<boolean>(false);

const TYPE_DOT_CLASSES: Record<Breadcrumb['type'], string> = {
  default: 'bg-slate-500',
  http: 'bg-sky-400',
  navigation: 'bg-violet-400',
  'ui.click': 'bg-brand-400',
  console: 'bg-amber-400',
  system: 'bg-slate-400'
};

const dotClass = computed<string>(() => TYPE_DOT_CLASSES[props.breadcrumb.type] ?? 'bg-slate-500');

const payloadEntries = computed<[string, unknown][]>(() => Object.entries(props.breadcrumb.data ?? {}));

function renderValue(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}
</script>

<template>
  <li class="relative pl-6" data-testid="breadcrumb-entry">
    <span
      v-if="!isLast"
      class="absolute left-[7px] top-4 h-full w-px bg-surface-800"
      aria-hidden="true"
    />
    <span
      class="absolute left-0 top-1.5 size-3.5 rounded-full border-2 border-surface-900"
      :class="dotClass"
      aria-hidden="true"
    />

    <div class="pb-3">
      <div class="flex flex-wrap items-center gap-2">
        <BaseBadge tone="neutral" :label="breadcrumb.category" size="sm" hide-dot />
        <BaseBadge :tone="breadcrumb.level" size="sm" hide-dot />
        <span class="text-[11px] text-slate-500">
          <TimeAgo :timestamp="breadcrumb.timestamp" />
        </span>
      </div>

      <p class="mt-1 break-words font-mono text-[11px] text-slate-300">{{ breadcrumb.message }}</p>

      <button
        v-if="payloadEntries.length > 0"
        type="button"
        class="mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 transition-colors hover:text-brand-300"
        :aria-expanded="isExpanded"
        @click="isExpanded = !isExpanded"
      >
        {{ isExpanded ? 'Hide payload' : `Show payload (${payloadEntries.length})` }}
      </button>

      <dl
        v-if="isExpanded"
        class="mt-1.5 space-y-1 rounded border border-surface-800 bg-surface-950/70 p-2 font-mono text-[10px]"
      >
        <div v-for="[key, value] in payloadEntries" :key="key" class="grid grid-cols-[minmax(0,90px)_minmax(0,1fr)] gap-2">
          <dt class="truncate text-brand-300">{{ key }}</dt>
          <dd class="break-all whitespace-pre-wrap text-slate-400">{{ renderValue(value) }}</dd>
        </div>
      </dl>
    </div>
  </li>
</template>