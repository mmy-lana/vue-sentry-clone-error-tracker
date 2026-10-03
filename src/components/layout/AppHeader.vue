<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useBreakpoints } from '../../composables/useBreakpoints';
import BaseBadge from '../ui/BaseBadge.vue';
import BaseButton from '../ui/BaseButton.vue';

interface Props {
  title: string;
  subtitle?: string;
  isDrawerOpen?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  subtitle: undefined,
  isDrawerOpen: false
});

const emit = defineEmits<{
  (event: 'toggle-drawer'): void;
  (event: 'open-simulator'): void;
}>();

const route = useRoute();
const { isMobile, viewportClass } = useBreakpoints();

const showDrawerToggle = computed<boolean>(() => isMobile.value);

const crumb = computed<string>(() => {
  switch (route.name) {
    case 'issue-detail':
      return 'Issues / Detail';
    case 'live-stream':
      return 'Live stream';
    case 'settings':
      return 'Settings';
    case 'ui-kit':
      return 'Design system';
    default:
      return 'Issues';
  }
});
</script>

<template>
  <header
    class="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-surface-800 bg-surface-900/95 px-3 backdrop-blur sm:px-4"
    data-testid="app-header"
  >
    <BaseButton
      v-if="showDrawerToggle"
      variant="ghost"
      size="md"
      :aria-label="isDrawerOpen ? 'Close navigation' : 'Open navigation'"
      :aria-expanded="isDrawerOpen"
      aria-controls="app-sidebar"
      data-testid="drawer-toggle"
      @click="emit('toggle-drawer')"
    >
      <template #icon>
        <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </template>
    </BaseButton>

    <div class="min-w-0 flex-1">
      <p class="truncate text-[10px] uppercase tracking-wider text-slate-500">{{ crumb }}</p>
      <h1 class="truncate text-sm font-semibold text-slate-100">{{ title }}</h1>
      <p v-if="subtitle" class="hidden truncate text-[11px] text-slate-500 sm:block">{{ subtitle }}</p>
    </div>

    <BaseBadge :tone="'brand'" :label="viewportClass" size="sm" hide-dot class="hidden sm:inline-flex" />

    <BaseButton variant="secondary" size="sm" data-testid="open-simulator" @click="emit('open-simulator')">
      <template #icon>
        <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="m13 2-8 12h6l-2 8 8-12h-6l2-8Z" />
        </svg>
      </template>
      <span class="hidden sm:inline">Simulate</span>
      <span class="sm:hidden">Emit</span>
    </BaseButton>

    <slot name="actions" />
  </header>
</template>