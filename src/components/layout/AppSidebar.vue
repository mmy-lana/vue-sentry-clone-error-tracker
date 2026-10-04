<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useBreakpoints } from '../../composables/useBreakpoints';
import { useIssueStore } from '../../stores/issueStore';

interface Props {
  /** Mobile drawer visibility (the header owns the trigger). */
  isDrawerOpen?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isDrawerOpen: false
});

const emit = defineEmits<{
  (event: 'close'): void;
}>();

const route = useRoute();
const issueStore = useIssueStore();
const { sidebarMode, width } = useBreakpoints();

interface NavItem {
  name: string;
  label: string;
  to: string;
  icon: string;
  badge?: () => number;
}

const items: NavItem[] = [
  {
    name: 'issues-list',
    label: 'Issues',
    to: '/issues',
    icon: 'M4 6h16M4 12h16M4 18h10',
    badge: () => issueStore.totalUnresolvedCount
  },
  {
    name: 'issue-detail',
    label: 'Issues',
    to: '/issues',
    icon: 'M4 6h16M4 12h16M4 18h10'
  },
  {
    name: 'live-stream',
    label: 'Live stream',
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

/** Detail routes reuse the Issues nav entry; dedupe to a single active item. */
const visibleItems = computed<NavItem[]>(() => items.filter((item) => item.name !== 'issue-detail'));

const isRail = computed<boolean>(() => sidebarMode.value === 'rail');
const isDrawer = computed<boolean>(() => sidebarMode.value === 'hidden');
const isVisible = computed<boolean>(() => !isDrawer.value || props.isDrawerOpen);

function isActive(name: string): boolean {
  if (route.name === name) return true;
  // Detail routes keep their parent entry highlighted.
  return name === 'issues-list' && route.name === 'issue-detail';
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isDrawer && isDrawerOpen"
      class="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm md:hidden"
      data-testid="sidebar-backdrop"
      @click="emit('close')"
    />
  </Teleport>

  <aside
    v-if="isVisible"
    class="flex h-dvh shrink-0 flex-col border-r border-surface-800 bg-surface-900"
    :class="[
      isRail ? 'w-16' : 'w-60',
      isDrawer
        ? 'fixed inset-y-0 left-0 z-50 shadow-2xl'
        : 'sticky top-0 z-30'
    ]"
    data-testid="app-sidebar"
    :data-mode="sidebarMode"
    :aria-label="isDrawer ? 'Navigation drawer' : 'Primary navigation'"
  >
    <div class="flex h-14 items-center gap-2 border-b border-surface-800 px-3">
      <span class="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-600/20 text-brand-300">
        <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4l8 15H4L12 4Z" />
          <path stroke-linecap="round" d="M12 10v4" />
        </svg>
      </span>
      <span v-if="!isRail" class="min-w-0">
        <span class="block truncate text-sm font-semibold text-slate-100">Error Tracker</span>
        <span class="block truncate text-[10px] uppercase tracking-wider text-slate-500">default project</span>
      </span>
      <button
        v-if="isDrawer"
        type="button"
        class="ml-auto rounded-md p-1.5 text-slate-400 transition-colors hover:bg-surface-800 hover:text-slate-100"
        aria-label="Close navigation"
        data-testid="sidebar-close"
        @click="emit('close')"
      >
        <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>

    <nav class="flex-1 overflow-y-auto p-2">
      <ul class="flex flex-col gap-1">
        <li v-for="item in visibleItems" :key="item.name">
          <RouterLink
            :to="item.to"
            class="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors"
            :class="
              isActive(item.name)
                ? 'bg-brand-600/15 text-brand-200'
                : 'text-slate-400 hover:bg-surface-800 hover:text-slate-100'
            "
            :title="isRail ? item.label : undefined"
            :aria-current="isActive(item.name) ? 'page' : undefined"
            data-testid="sidebar-link"
            @click="emit('close')"
          >
            <svg class="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" :d="item.icon" />
            </svg>
            <span v-if="!isRail" class="truncate">{{ item.label }}</span>
            <span
              v-if="!isRail && item.badge && item.badge() > 0"
              class="ml-auto rounded-full bg-surface-700 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-200"
              data-testid="sidebar-badge"
            >
              {{ item.badge() }}
            </span>
          </RouterLink>
        </li>
      </ul>

      <div v-if="!isRail" class="mt-4 rounded-lg border border-surface-800 bg-surface-950/60 p-2.5">
        <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Issue status</p>
        <ul class="mt-2 space-y-1 text-xs">
          <li class="flex items-center justify-between">
            <span class="flex items-center gap-1.5 text-slate-400">
              <span class="size-1.5 rounded-full bg-rose-400" aria-hidden="true" /> Unresolved
            </span>
            <span class="tabular-nums text-slate-200">{{ issueStore.statusTallies.unresolved }}</span>
          </li>
          <li class="flex items-center justify-between">
            <span class="flex items-center gap-1.5 text-slate-400">
              <span class="size-1.5 rounded-full bg-emerald-400" aria-hidden="true" /> Resolved
            </span>
            <span class="tabular-nums text-slate-200">{{ issueStore.statusTallies.resolved }}</span>
          </li>
          <li class="flex items-center justify-between">
            <span class="flex items-center gap-1.5 text-slate-400">
              <span class="size-1.5 rounded-full bg-slate-400" aria-hidden="true" /> Ignored
            </span>
            <span class="tabular-nums text-slate-200">{{ issueStore.statusTallies.ignored }}</span>
          </li>
        </ul>
      </div>
    </nav>

    <p v-if="!isRail" class="border-t border-surface-800 px-3 py-2 text-[10px] text-slate-600">
      IndexedDB · {{ width }}px viewport
    </p>
  </aside>
</template>