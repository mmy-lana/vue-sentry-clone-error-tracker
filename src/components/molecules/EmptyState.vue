<script setup lang="ts">
import BaseButton from '../ui/BaseButton.vue';

export type EmptyStateIcon = 'search' | 'inbox' | 'stack' | 'signal' | 'filter';

interface Props {
  title: string;
  description?: string;
  icon?: EmptyStateIcon;
  actionLabel?: string;
  actionVariant?: 'primary' | 'secondary' | 'ghost';
  compact?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  description: undefined,
  icon: 'inbox',
  actionLabel: undefined,
  actionVariant: 'secondary',
  compact: false
});

const emit = defineEmits<{
  (event: 'action'): void;
}>();

const ICON_PATHS: Record<EmptyStateIcon, string> = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4.35-4.35',
  inbox: 'M3 12h4l2 3h6l2-3h4M5 5h14l2 7v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5l2-7Z',
  stack: 'M4 6h16M4 12h16M4 18h10',
  signal: 'M4 18V9m5 9V5m5 13v-6m5 6V8',
  filter: 'M4 5h16l-6 7v6l-4 2v-8L4 5Z'
};
</script>

<template>
  <div
    class="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-surface-700 bg-surface-900/40 text-center"
    :class="compact ? 'px-4 py-6' : 'px-6 py-10'"
    role="status"
  >
    <span
      class="flex size-10 items-center justify-center rounded-full border border-surface-700 bg-surface-800/70 text-slate-400"
      aria-hidden="true"
    >
      <svg
        class="size-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path :d="ICON_PATHS[icon]" />
      </svg>
    </span>

    <div class="space-y-1">
      <p class="text-sm font-semibold text-slate-200">{{ title }}</p>
      <p v-if="description" class="mx-auto max-w-md text-xs text-slate-400">
        {{ description }}
      </p>
    </div>

    <BaseButton v-if="actionLabel" :variant="actionVariant" size="sm" @click="emit('action')">
      {{ actionLabel }}
    </BaseButton>

    <slot />
  </div>
</template>