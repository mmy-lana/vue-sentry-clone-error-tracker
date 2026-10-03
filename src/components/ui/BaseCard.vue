<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  title?: string;
  description?: string;
  /** Removes the default body padding for edge-to-edge content (tables). */
  flush?: boolean;
  /** Adds a subtle hover highlight for interactive cards. */
  interactive?: boolean;
  as?: 'section' | 'article' | 'div';
}

const props = withDefaults(defineProps<Props>(), {
  title: undefined,
  description: undefined,
  flush: false,
  interactive: false,
  as: 'section'
});

const rootClass = computed<string[]>(() => [
  'rounded-lg border border-surface-700/70 bg-surface-900/80 shadow-sm shadow-black/30',
  props.interactive ? 'transition-colors hover:border-brand-500/50 hover:bg-surface-850' : ''
]);
</script>

<template>
  <component :is="as" :class="rootClass">
    <header
      v-if="title || description || $slots.header || $slots.actions"
      class="flex flex-wrap items-start justify-between gap-2 border-b border-surface-700/60 px-3 py-2.5 sm:px-4"
    >
      <div class="min-w-0">
        <slot name="header">
          <h2 v-if="title" class="truncate text-sm font-semibold text-slate-100">
            {{ title }}
          </h2>
          <p v-if="description" class="mt-0.5 text-xs text-slate-400">
            {{ description }}
          </p>
        </slot>
      </div>
      <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
        <slot name="actions" />
      </div>
    </header>

    <div :class="flush ? '' : 'p-3 sm:p-4'">
      <slot />
    </div>

    <footer
      v-if="$slots.footer"
      class="flex flex-wrap items-center justify-between gap-2 border-t border-surface-700/60 px-3 py-2.5 sm:px-4"
    >
      <slot name="footer" />
    </footer>
  </component>
</template>