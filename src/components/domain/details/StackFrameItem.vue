<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { StackFrame } from '../../../types';

interface Props {
  frame: StackFrame;
  defaultExpanded?: boolean;
  /** Frame index rendered in the header for orientation. */
  position?: number;
}

const props = withDefaults(defineProps<Props>(), {
  defaultExpanded: undefined,
  position: undefined
});

const isExpanded = ref<boolean>(props.defaultExpanded ?? props.frame.in_app);
const showVariables = ref<boolean>(false);

watch(
  () => props.frame.id,
  () => {
    isExpanded.value = props.defaultExpanded ?? props.frame.in_app;
    showVariables.value = false;
  }
);

const preContext = computed<string[]>(() => props.frame.pre_context ?? []);
const postContext = computed<string[]>(() => props.frame.post_context ?? []);
const variables = computed<[string, unknown][]>(() => Object.entries(props.frame.vars ?? {}));

const preStartLine = computed<number>(() => props.frame.lineno - preContext.value.length);

function toggleExpanded(): void {
  isExpanded.value = !isExpanded.value;
}

function renderValue(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
</script>

<template>
  <div
    :data-frame-id="frame.id"
    class="overflow-hidden rounded-md border transition-colors"
    :class="frame.in_app ? 'border-surface-700 bg-surface-900' : 'border-surface-800/70 bg-surface-950/60'"
  >
    <button
      type="button"
      class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left font-mono text-xs transition-colors hover:bg-surface-800/60"
      :aria-expanded="isExpanded"
      @click="toggleExpanded"
    >
      <span class="flex min-w-0 items-center gap-2">
        <span
          v-if="position !== undefined"
          class="shrink-0 text-[10px] tabular-nums text-slate-600"
        >
          #{{ position }}
        </span>
        <span
          v-if="frame.in_app"
          class="shrink-0 rounded border border-brand-500/40 bg-brand-600/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-brand-200"
        >
          in-app
        </span>
        <span class="min-w-0 truncate text-slate-200" :title="frame.filename">
          <span class="hidden sm:inline">{{ frame.filename }}</span>
          <span class="sm:hidden">{{ frame.filename.split('/').slice(-2).join('/') }}</span>
        </span>
        <span class="shrink-0 text-slate-500">in</span>
        <span class="min-w-0 truncate text-brand-300">
          {{ frame.function || '(anonymous)' }}
        </span>
      </span>

      <span class="flex shrink-0 items-center gap-2 text-slate-500">
        <span class="tabular-nums">{{ frame.lineno }}:{{ frame.colno }}</span>
        <svg
          class="size-4 transition-transform"
          :class="{ 'rotate-180': isExpanded }"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </span>
    </button>

    <div v-if="isExpanded" class="code-scroll border-t border-surface-800 bg-surface-950 font-mono text-[11px] leading-relaxed">
      <div class="min-w-max">
        <div
          v-for="(line, index) in preContext"
          :key="`pre-${index}`"
          class="flex items-start gap-3 px-2 py-px text-slate-500 hover:bg-surface-900/60"
        >
          <span class="w-10 shrink-0 select-none text-right tabular-nums text-slate-700">
            {{ preStartLine + index }}
          </span>
          <pre class="whitespace-pre text-slate-400">{{ line }}</pre>
        </div>

        <div class="flex items-start gap-3 border-y border-rose-900/60 bg-rose-950/40 px-2 py-0.5 font-semibold text-rose-200">
          <span class="w-10 shrink-0 select-none text-right tabular-nums text-rose-400/80">
            {{ frame.lineno }}
          </span>
          <pre class="whitespace-pre">{{ frame.context_line || ' ' }}</pre>
        </div>

        <div
          v-for="(line, index) in postContext"
          :key="`post-${index}`"
          class="flex items-start gap-3 px-2 py-px text-slate-500 hover:bg-surface-900/60"
        >
          <span class="w-10 shrink-0 select-none text-right tabular-nums text-slate-700">
            {{ frame.lineno + index + 1 }}
          </span>
          <pre class="whitespace-pre text-slate-400">{{ line }}</pre>
        </div>
      </div>

      <div v-if="variables.length > 0" class="border-t border-surface-800/80 bg-surface-900/40 px-3 py-2">
        <button
          type="button"
          class="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 transition-colors hover:text-slate-200"
          :aria-expanded="showVariables"
          @click="showVariables = !showVariables"
        >
          <span>Local variables ({{ variables.length }})</span>
          <span class="text-slate-600">{{ showVariables ? '−' : '+' }}</span>
        </button>

        <dl v-if="showVariables" class="mt-2 space-y-1">
          <div
            v-for="[name, value] in variables"
            :key="name"
            class="grid grid-cols-[minmax(0,120px)_minmax(0,1fr)] gap-2 text-[11px]"
          >
            <dt class="truncate font-semibold text-brand-300">{{ name }}</dt>
            <dd class="break-all text-slate-300">{{ renderValue(value) }}</dd>
          </div>
        </dl>
      </div>
    </div>
  </div>
</template>