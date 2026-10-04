<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { onClickOutside } from '@vueuse/core';

interface Props {
  modelValue: string;
  /** Operator shortcuts rendered inside the dropdown. */
  suggestions: string[];
  placeholder?: string;
  ariaLabel?: string;
  resultCount?: number;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Filter issues — try is:unresolved level:error',
  ariaLabel: 'Filter issues',
  resultCount: undefined
});

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
  (event: 'select', value: string): void;
  (event: 'clear'): void;
}>();

const rootRef = ref<HTMLDivElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);
const isOpen = ref<boolean>(false);
const highlightedIndex = ref<number>(-1);

/**
 * Token the caret currently sits in.
 *
 * Matching the whole query string hid every chip as soon as a free-text term
 * was present ("checkout level:" matched nothing); narrowing by the active token
 * keeps the operators reachable inside multi-term queries.
 */
const activeToken = computed<string>(() => {
  const caret = inputRef.value?.selectionStart ?? props.modelValue.length;
  const before = props.modelValue.slice(0, caret);
  return (before.match(/\S*$/)?.[0] ?? '').toLowerCase();
});

const filteredSuggestions = computed<string[]>(() => {
  const needle = activeToken.value.trim();
  if (props.suggestions.length === 0) return [];
  if (needle.length === 0) return props.suggestions;
  return props.suggestions.filter((item) => item.toLowerCase().includes(needle));
});

function handleInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).value);
  isOpen.value = true;
  highlightedIndex.value = -1;
}

/**
 * Replaces only the token the caret sits in and preserves every other fragment.
 *
 * A blind assignment wiped free-text searches whenever an operator chip was
 * clicked; replacing the partially typed token keeps multi-term queries intact.
 */
function applySuggestion(value: string): void {
  const input = inputRef.value;
  const current = props.modelValue;

  if (!input) {
    emit('select', value);
    emit('update:modelValue', value);
    isOpen.value = false;
    highlightedIndex.value = -1;
    return;
  }

  const caret = Math.min(Math.max(input.selectionStart ?? current.length, 0), current.length);
  const before = current.slice(0, caret);
  const after = current.slice(caret);

  const partialBefore = before.match(/(\S*)$/)?.[1] ?? '';
  const partialAfter = after.match(/^(\S*)/)?.[1] ?? '';

  const head = before.slice(0, before.length - partialBefore.length).trimEnd();
  const tail = after.slice(partialAfter.length).trimStart();

  const next = [head, value, tail].filter((part) => part.length > 0).join(' ');

  emit('select', value);
  emit('update:modelValue', next);
  isOpen.value = false;
  highlightedIndex.value = -1;

  void nextTick(() => {
    const field = inputRef.value;
    if (!field) return;
    field.focus();
    const caretPosition = (head.length > 0 ? head.length + 1 : 0) + value.length;
    field.setSelectionRange(caretPosition, caretPosition);
  });
}

function clearQuery(): void {
  emit('update:modelValue', '');
  emit('clear');
  isOpen.value = false;
  void nextTick(() => inputRef.value?.focus());
}

function handleKeydown(event: KeyboardEvent): void {
  const options = filteredSuggestions.value;

  if (event.key === 'Escape') {
    if (isOpen.value) {
      event.stopPropagation();
      isOpen.value = false;
    }
    return;
  }

  if (event.key === 'ArrowDown' && options.length > 0) {
    event.preventDefault();
    isOpen.value = true;
    highlightedIndex.value = (highlightedIndex.value + 1) % options.length;
    return;
  }

  if (event.key === 'ArrowUp' && options.length > 0) {
    event.preventDefault();
    isOpen.value = true;
    highlightedIndex.value =
      highlightedIndex.value <= 0 ? options.length - 1 : highlightedIndex.value - 1;
    return;
  }

  if (event.key === 'Enter') {
    const highlighted = options[highlightedIndex.value];
    if (isOpen.value && highlighted) {
      event.preventDefault();
      applySuggestion(highlighted);
    }
  }
}

function blurToSuggestion(value: string): void {
  highlightedIndex.value = filteredSuggestions.value.indexOf(value);
  isOpen.value = true;
}

onClickOutside(rootRef, () => {
  isOpen.value = false;
});

watch(filteredSuggestions, () => {
  if (highlightedIndex.value >= filteredSuggestions.value.length) {
    highlightedIndex.value = -1;
  }
});
</script>

<template>
  <div ref="rootRef" class="relative w-full">
    <div class="flex items-center gap-2 rounded-md border border-surface-700 bg-surface-900 px-3 py-1.5 transition-colors focus-within:border-brand-500">
      <svg
        class="size-4 shrink-0 text-slate-500"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path stroke-linecap="round" d="m20 20-3.5-3.5" />
      </svg>

      <input
        ref="inputRef"
        type="search"
        :value="modelValue"
        :placeholder="placeholder"
        :aria-label="ariaLabel"
        aria-autocomplete="list"
        :aria-expanded="isOpen"
        aria-controls="filter-search-suggestions"
        role="combobox"
        class="w-full min-w-0 bg-transparent py-0.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
        @input="handleInput"
        @focus="isOpen = true"
        @keydown="handleKeydown"
      />

      <span
        v-if="resultCount !== undefined"
        class="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-slate-500"
        data-testid="filter-result-count"
      >
        {{ resultCount }} {{ resultCount === 1 ? 'issue' : 'issues' }}
      </span>

      <button
        v-if="modelValue.length > 0"
        type="button"
        class="shrink-0 rounded p-0.5 text-slate-500 transition-colors hover:text-slate-200"
        aria-label="Clear filter"
        @click="clearQuery"
      >
        <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>

    <div
      v-if="isOpen && filteredSuggestions.length > 0"
      id="filter-search-suggestions"
      role="listbox"
      class="scrollbar-thin absolute left-0 right-0 top-full z-50 mt-1 max-h-60 w-full overflow-y-auto overscroll-contain rounded-md border border-surface-700 bg-surface-900 shadow-2xl sm:right-auto sm:w-80"
      style="max-width: calc(100vw - 2rem)"
    >
      <button
        v-for="(item, index) in filteredSuggestions"
        :key="item"
        type="button"
        role="option"
        :aria-selected="index === highlightedIndex"
        class="flex w-full items-center justify-between gap-2 border-b border-surface-800 px-3 py-2 text-left font-mono text-xs text-slate-300 transition-colors last:border-b-0 hover:bg-surface-800 hover:text-slate-100"
        :class="{ 'bg-brand-600/15 text-brand-200': index === highlightedIndex }"
        @click="applySuggestion(item)"
        @mousemove="blurToSuggestion(item)"
      >
        <span class="truncate">{{ item }}</span>
        <span class="shrink-0 text-[10px] uppercase tracking-wide text-slate-500">
          {{ item.split(':')[0] }}
        </span>
      </button>
    </div>
  </div>
</template>