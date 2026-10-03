<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useBreakpoints } from '../../composables/useBreakpoints';
import { useIssueStore } from '../../stores/issueStore';

const route = useRoute();
const issueStore = useIssueStore();
const { isMobile, isCompact } = useBreakpoints();

interface TabItem {
  name: string;
  label: string;
  to: string;
  icon: string;
  badge?: () => number;
}

const tabs: TabItem[] = [
  {
    name: 'issues-list',
    label: 'Issues',
    to: '/issues',
    icon: 'M4 6h16M4 12h16M4 18h10',
    badge: () => issueStore.totalUnresolvedCount
  },
  {
    name: 'live-stream',
    label: 'Stream',
    to: '/stream',
    icon: 'M4 12h3l2-6 3 12 2-6h6'
  },
  {
    name: 'settings',
    label: 'Settings',
    to: '/settings',
    icon: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm7.5 3a7.5 7.5 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7.5 7.5 0 0 0-2-1.2l-.3-2.5h-4l-.3 2.5a7.5 7.5 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7.6 7.6 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7.5 7.5 0 0 0 2 1.2l.3 2.5h4l.3-2.5a7.5 7.5 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z'
  }
];

/** Active state follows the detail route back to the Issues tab. */
function isActive(name: string): boolean {
  return route.name === name || (name === 'issues-list' && route.name === 'issue-detail');
}

const showLabels = computed<boolean>(() => !isCompact.value);
</script>

<template>
  <nav
    v-if="isMobile"
    class="safe-area-bottom fixed inset-x-0 bottom-0 z-40 border-t border-surface-800 bg-surface-900/95 backdrop-blur"
    aria-label="Primary"
    data-testid="mobile-nav"
  >
    <ul class="flex items-stretch justify-around">
      <li v-for="tab in tabs" :key="tab.name" class="flex-1">
        <RouterLink
          :to="tab.to"
          class="tap-target flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] transition-colors"
          :class="isActive(tab.name) ? 'text-brand-200' : 'text-slate-400'"
          :aria-current="isActive(tab.name) ? 'page' : undefined"
          data-testid="mobile-nav-link"
        >
          <span class="relative">
            <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" :d="tab.icon" />
            </svg>
            <span
              v-if="tab.badge && tab.badge() > 0"
              class="absolute -right-2 -top-1 min-w-4 rounded-full bg-rose-500 px-1 text-[9px] font-semibold leading-4 text-white"
            >
              {{ tab.badge() }}
            </span>
          </span>
          <span v-if="showLabels">{{ tab.label }}</span>
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>