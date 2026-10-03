import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { observeRecentEvents } from '../services/db';
import type { ErrorEvent } from '../types';

/** Newest-first ordering, matching the live stream and detail stepper. */
function sortDescending(events: ErrorEvent[]): ErrorEvent[] {
  return [...events].sort((a, b) => b.timestamp - a.timestamp);
}

export const useEventStore = defineStore('events', () => {
  const events = ref<ErrorEvent[]>([]);
  const isLoading = ref<boolean>(true);
  const currentEventIndex = ref<number>(0);
  const showInAppOnly = ref<boolean>(false);
  const expandedFrameIds = ref<string[]>([]);
  const errorMessage = ref<string | null>(null);
  const activeIssueId = ref<string | null>(null);

  let subscription: { unsubscribe: () => void } | null = null;

  const eventsByIssueId = computed<Record<string, ErrorEvent[]>>(() => {
    const grouped: Record<string, ErrorEvent[]> = {};
    for (const event of events.value) {
      const bucket = grouped[event.issue_id] ?? (grouped[event.issue_id] = []);
      bucket.push(event);
    }
    return grouped;
  });

  const currentIssueEvents = computed<ErrorEvent[]>(() =>
    events.value.filter((event) => event.issue_id === activeIssueId.value)
  );

  const currentEvent = computed<ErrorEvent | null>(() => currentIssueEvents.value[currentEventIndex.value] ?? null);

  const visibleFrames = computed(() => {
    const frames = currentEvent.value?.exception.stacktrace.frames ?? [];
    const ordered = [...frames].reverse();
    return showInAppOnly.value ? ordered.filter((frame) => frame.in_app) : ordered;
  });

  const isFirstEvent = computed<boolean>(() => currentEventIndex.value <= 0);
  const isLastEvent = computed<boolean>(() => currentEventIndex.value >= currentIssueEvents.value.length - 1);

  function startObserving(limit = 500): void {
    subscription?.unsubscribe();
    isLoading.value = true;

    subscription = observeRecentEvents(limit).subscribe({
      next: (rows) => {
        events.value = rows;
        isLoading.value = false;
        clampCurrentIndex();
      },
      error: (error: unknown) => {
        isLoading.value = false;
        errorMessage.value = error instanceof Error ? error.message : String(error);
      }
    });
  }

  function stopObserving(): void {
    subscription?.unsubscribe();
    subscription = null;
  }

  function clampCurrentIndex(): void {
    const total = currentIssueEvents.value.length;
    if (total === 0) {
      currentEventIndex.value = 0;
      return;
    }
    if (currentEventIndex.value >= total) currentEventIndex.value = total - 1;
    if (currentEventIndex.value < 0) currentEventIndex.value = 0;
  }

  function loadIssue(issueId: string): void {
    activeIssueId.value = issueId;
    currentEventIndex.value = 0;
    expandedFrameIds.value = [];
  }

  function goToEvent(index: number): void {
    const total = currentIssueEvents.value.length;
    if (total === 0) return;
    currentEventIndex.value = Math.min(Math.max(0, index), total - 1);
  }

  function nextEvent(): void {
    goToEvent(currentEventIndex.value + 1);
  }

  function previousEvent(): void {
    goToEvent(currentEventIndex.value - 1);
  }

  /** Jump to the newest event matching an issue (used by the live stream). */
  function focusLatestEvent(issueId: string): void {
    loadIssue(issueId);
    currentEventIndex.value = 0;
  }

  function toggleFrame(frameId: string): void {
    expandedFrameIds.value = expandedFrameIds.value.includes(frameId)
      ? expandedFrameIds.value.filter((id) => id !== frameId)
      : [...expandedFrameIds.value, frameId];
  }

  function setInAppOnly(value: boolean): void {
    showInAppOnly.value = value;
  }

  function eventsForIssue(issueId: string): ErrorEvent[] {
    return eventsByIssueId.value[issueId] ?? [];
  }

  function recentEvents(limit = 50): ErrorEvent[] {
    return sortDescending(events.value).slice(0, limit);
  }

  function clearError(): void {
    errorMessage.value = null;
  }

  return {
    events,
    isLoading,
    currentEventIndex,
    currentEvent,
    currentIssueEvents,
    eventsByIssueId,
    visibleFrames,
    isFirstEvent,
    isLastEvent,
    showInAppOnly,
    expandedFrameIds,
    errorMessage,
    startObserving,
    stopObserving,
    loadIssue,
    goToEvent,
    nextEvent,
    previousEvent,
    focusLatestEvent,
    toggleFrame,
    setInAppOnly,
    eventsForIssue,
    recentEvents,
    clearError
  };
});