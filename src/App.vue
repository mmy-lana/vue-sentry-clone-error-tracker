<script setup lang="ts">
/**
 * Application shell.
 *
 * Owns the lifetime of the Dexie liveQuery subscriptions and the responsive
 * chrome: icon rail on tablets, full sidebar on desktop, drawer + bottom bar on
 * phones. The simulator modal is reachable from every screen.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import AppHeader from './components/layout/AppHeader.vue';
import AppSidebar from './components/layout/AppSidebar.vue';
import MobileNavBar from './components/layout/MobileNavBar.vue';
import ErrorSimulatorModal from './components/domain/simulator/ErrorSimulatorModal.vue';
import { useSimulator } from './composables/useSimulator';
import { useEventStore } from './stores/eventStore';
import { useIssueStore } from './stores/issueStore';

const issueStore = useIssueStore();
const eventStore = useEventStore();
const simulator = useSimulator();
const {
  presets,
  environments,
  isRunning,
  ratePerMinute,
  environment,
  emittedCount,
  lastError,
  emit,
  toggle,
  setRate,
  setEnvironment
} = simulator;
const route = useRoute();

const isDrawerOpen = ref<boolean>(false);
const isSimulatorOpen = ref<boolean>(false);
const customPayloadError = ref<string | null>(null);

const PAGE_TITLES: Record<string, string> = {
  'issues-list': 'Issues',
  'issue-detail': 'Issue detail',
  'live-stream': 'Live stream',
  settings: 'Settings',
  'ui-kit': 'Design system'
};

function currentTitle(): string {
  const name = typeof route.name === 'string' ? route.name : 'issues-list';
  return PAGE_TITLES[name] ?? 'Issues';
}

function currentSubtitle(): string {
  if (route.name === 'issue-detail') return 'Stack traces, breadcrumbs and context';
  if (route.name === 'issues-list') {
    return `${issueStore.totalUnresolvedCount} unresolved · ${issueStore.issues.length} tracked`;
  }
  if (route.name === 'live-stream') return 'Real-time ingestion feed';
  if (route.name === 'settings') return 'Local database and defaults';
  return 'Component harness';
}

async function submitCustomPayload(payload: string): Promise<void> {
  const result = await simulator.emitCustom(payload);
  customPayloadError.value = result.ok ? null : result.error;
}

onMounted(() => {
  issueStore.startObserving();
  eventStore.startObserving();
});

onBeforeUnmount(() => {
  issueStore.stopObserving();
  eventStore.stopObserving();
});
</script>

<template>
  <div class="flex min-h-dvh bg-surface-950 text-slate-100">
    <AppSidebar id="app-sidebar" :is-drawer-open="isDrawerOpen" @close="isDrawerOpen = false" />

    <div class="flex min-w-0 flex-1 flex-col">
      <AppHeader
        :title="currentTitle()"
        :subtitle="currentSubtitle()"
        :is-drawer-open="isDrawerOpen"
        @toggle-drawer="isDrawerOpen = !isDrawerOpen"
        @open-simulator="isSimulatorOpen = true"
      />

      <main class="min-w-0 flex-1">
        <RouterView />
      </main>
    </div>

    <MobileNavBar />

    <ErrorSimulatorModal
      :is-open="isSimulatorOpen"
      :presets="presets"
      :environments="environments"
      :is-running="isRunning"
      :rate-per-minute="ratePerMinute"
      :environment="environment"
      :emitted-count="emittedCount"
      :last-error="lastError"
      :custom-error="customPayloadError"
      @close="isSimulatorOpen = false"
      @emit="(presetId) => void emit(presets.find((preset) => preset.id === presetId))"
      @toggle-run="() => void toggle()"
      @update:rate="setRate"
      @update:environment="setEnvironment"
      @submit-custom="submitCustomPayload"
    />
  </div>
</template>