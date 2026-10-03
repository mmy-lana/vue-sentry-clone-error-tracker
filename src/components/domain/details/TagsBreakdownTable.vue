<script setup lang="ts">
import { computed } from 'vue';
import type { ErrorLevel } from '../../../types';
import { formatExactNumber, formatPercentage } from '../../../utils/date';
import BaseBadge from '../../ui/BaseBadge.vue';
import EmptyState from '../../molecules/EmptyState.vue';

interface Props {
  tagsSummary: Record<string, Record<string, number>>;
  /** Maximum tag keys rendered before collapsing into a "+N keys" row. */
  maxKeys?: number;
}

const props = withDefaults(defineProps<Props>(), {
  maxKeys: 8
});

interface TagRow {
  key: string;
  value: string;
  count: number;
  share: number;
}

const rows = computed<TagRow[]>(() => {
  const entries = Object.entries(props.tagsSummary ?? {});
  const flattened: TagRow[] = [];

  for (const [key, values] of entries) {
    // Shares are relative to this key's own event total: a browser
    // distribution and an OS distribution are independent dimensions and must
    // not be normalised against a global maximum.
    const keyTotal = Object.values(values).reduce(
      (sum, count) => sum + (Number(count) || 0),
      0
    );

    for (const [value, rawCount] of Object.entries(values)) {
      const count = Number(rawCount) || 0;
      flattened.push({
        key,
        value,
        count,
        share: keyTotal > 0 ? Math.round((count / keyTotal) * 100) : 0
      });
    }
  }

  return flattened.sort((a, b) => (a.key === b.key ? b.count - a.count : a.key.localeCompare(b.key)));
});

const visibleKeys = computed<string[]>(() => {
  const keys = Array.from(new Set(rows.value.map((row) => row.key)));
  return keys.slice(0, Math.max(0, props.maxKeys));
});

const hiddenKeyCount = computed<number>(() =>
  Math.max(0, new Set(rows.value.map((row) => row.key)).size - visibleKeys.value.length)
);

const visibleRows = computed<TagRow[]>(() =>
  rows.value.filter((row) => visibleKeys.value.includes(row.key))
);

const totalCount = computed<number>(() => rows.value.reduce((sum, row) => sum + row.count, 0));

const worstLevel = computed<ErrorLevel | null>(() => {
  if (visibleRows.value.some((row) => row.share >= 100)) return 'fatal';
  return null;
});
</script>

<template>
  <section class="flex min-w-0 flex-col gap-2" aria-label="Tag distribution">
    <header class="flex items-center justify-between gap-2">
      <h3 class="text-sm font-semibold text-slate-100">Tag distribution</h3>
      <BaseBadge tone="neutral" :label="formatExactNumber(totalCount) + ' events'" size="sm" />
    </header>

    <div
      v-if="visibleRows.length > 0"
      class="code-scroll overflow-x-auto rounded-lg border border-surface-700/70"
      data-testid="tags-table"
    >
      <table class="w-full min-w-[22rem] table-fixed border-collapse text-left text-xs">
        <thead class="bg-surface-850/70 text-[10px] uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" class="w-1/4 px-3 py-2 font-medium">Key</th>
            <th scope="col" class="w-1/3 px-3 py-2 font-medium">Value</th>
            <th scope="col" class="w-1/4 px-3 py-2 font-medium">Share</th>
            <th scope="col" class="w-1/6 px-3 py-2 text-right font-medium">Events</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in visibleRows"
            :key="`${row.key}:${row.value}`"
            class="border-t border-surface-800/80 hover:bg-surface-850/60"
          >
            <td class="truncate px-3 py-1.5 text-slate-400">{{ row.key }}</td>
            <td class="truncate px-3 py-1.5 font-mono text-brand-300" :title="row.value">{{ row.value }}</td>
            <td class="px-3 py-1.5">
              <span class="flex items-center gap-2">
                <span class="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-800">
                  <span
                    class="block h-full rounded-full bg-brand-500"
                    :style="{ width: `${row.share}%` }"
                  />
                </span>
                <span class="w-10 shrink-0 text-right tabular-nums text-slate-500">
                  {{ row.share }}%
                </span>
              </span>
            </td>
            <td class="px-3 py-1.5 text-right tabular-nums text-slate-300">
              {{ formatExactNumber(row.count) }}
              <span class="block text-[10px] text-slate-600">
                {{ formatPercentage(row.count, totalCount) }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <EmptyState
      v-else
      compact
      icon="filter"
      title="No tag data"
      description="This issue has not recorded any tags yet."
    />

    <p v-if="hiddenKeyCount > 0" class="text-[11px] text-slate-500">
      +{{ hiddenKeyCount }} more tag {{ hiddenKeyCount === 1 ? 'key' : 'keys' }} not shown
    </p>

    <BaseBadge v-if="worstLevel" tone="fatal" label="One value explains every event" size="sm" />
  </section>
</template>