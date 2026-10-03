<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  /** 1-based current page. */
  page: number;
  pageSize: number;
  totalItems: number;
  /** Maximum number of numbered buttons rendered before collapsing to ellipses. */
  maxButtons?: number;
  ariaLabel?: string;
}

const props = withDefaults(defineProps<Props>(), {
  maxButtons: 7,
  ariaLabel: 'Pagination'
});

const emit = defineEmits<{
  (event: 'update:page', value: number): void;
}>();

type PageToken = number | 'gap-left' | 'gap-right';

const pageCount = computed<number>(() =>
  Math.max(1, Math.ceil(props.totalItems / Math.max(1, props.pageSize)))
);

const safePage = computed<number>(() => Math.min(Math.max(1, props.page), pageCount.value));

const rangeStart = computed<number>(() =>
  pageCount.value === 0 ? 0 : (safePage.value - 1) * props.pageSize + 1
);

const rangeEnd = computed<number>(() =>
  Math.min(props.totalItems, safePage.value * props.pageSize)
);

const tokens = computed<PageToken[]>(() => {
  const total = pageCount.value;
  const current = safePage.value;
  const maxButtons = Math.max(3, props.maxButtons);

  if (total <= maxButtons) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const sideCount = Math.max(1, Math.floor((maxButtons - 3) / 2));
  let start = Math.max(2, current - sideCount);
  let end = Math.min(total - 1, current + sideCount);

  if (current - 1 < sideCount) end = Math.min(total - 1, maxButtons - 2);
  if (total - current < sideCount) start = Math.max(2, total - (maxButtons - 3));

  const result: PageToken[] = [1];
  if (start > 2) result.push('gap-left');
  for (let page = start; page <= end; page += 1) result.push(page);
  if (end < total - 1) result.push('gap-right');
  result.push(total);
  return result;
});

function goTo(page: number): void {
  const clamped = Math.min(Math.max(1, page), pageCount.value);
  if (clamped !== safePage.value) emit('update:page', clamped);
}

function buttonClass(isActive: boolean): string {
  return [
    'inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-md px-2 text-xs font-medium transition-colors',
    isActive
      ? 'bg-brand-600 text-white'
      : 'text-slate-300 hover:bg-surface-700 hover:text-slate-100'
  ].join(' ');
}
</script>

<template>
  <nav
    :aria-label="ariaLabel"
    class="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400"
  >
    <p class="min-w-0 tabular-nums">
      <span v-if="totalItems > 0">
        Showing <span class="text-slate-200">{{ rangeStart }}–{{ rangeEnd }}</span> of
        <span class="text-slate-200">{{ totalItems }}</span>
      </span>
      <span v-else>No results</span>
    </p>

    <div class="scrollbar-thin flex max-w-full items-center gap-1 overflow-x-auto pb-1">
      <button
        type="button"
        class="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-surface-700 px-2 text-slate-300 transition-colors hover:bg-surface-700 disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="safePage <= 1"
        aria-label="Previous page"
        @click="goTo(safePage - 1)"
      >
        <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 6l-6 6 6 6" />
        </svg>
        Prev
      </button>

      <template v-for="(token, index) in tokens" :key="`${token}-${index}`">
        <span
          v-if="typeof token === 'string'"
          class="px-1 text-slate-600"
          aria-hidden="true"
        >
          …
        </span>
        <button
          v-else
          type="button"
          :class="buttonClass(token === safePage)"
          :aria-current="token === safePage ? 'page' : undefined"
          :aria-label="`Page ${token}`"
          @click="goTo(token)"
        >
          {{ token }}
        </button>
      </template>

      <button
        type="button"
        class="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-surface-700 px-2 text-slate-300 transition-colors hover:bg-surface-700 disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="safePage >= pageCount"
        aria-label="Next page"
        @click="goTo(safePage + 1)"
      >
        Next
        <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 6l6 6-6 6" />
        </svg>
      </button>
    </div>
  </nav>
</template>