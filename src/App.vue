<script setup lang="ts">
/**
 * Application shell.
 *
 * Owns the lifetime of the Dexie liveQuery subscriptions so every route sees a
 * warm, reactive dataset. The responsive chrome (sidebar, header, mobile nav)
 * is assembled in the shell components.
 */
import { onBeforeUnmount, onMounted } from 'vue';
import { RouterView } from 'vue-router';
import { useEventStore } from './stores/eventStore';
import { useIssueStore } from './stores/issueStore';

const issueStore = useIssueStore();
const eventStore = useEventStore();

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
  <div class="flex min-h-dvh flex-col bg-surface-950 text-slate-100">
    <RouterView />
  </div>
</template>