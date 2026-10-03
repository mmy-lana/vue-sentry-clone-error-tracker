import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { observeEventsForIssue, observeRecentEvents } from '../services/db';
import type { ErrorEvent } from '../types';

/** Default window for the live stream feed (recent activity only). */
const RECENT_EVENT_WINDOW = 200;

interface Unsubscribable {
  unsubscribe: () => void;
}

export const useEventStore = defineStore('events', () => {
  /** Bounded recent stream used by the live feed. */
  const recentEvents = ref<ErrorEvent[]>([]);
  /** Every event of the issue opened in the detail view, oldest first. */
  const issueEvents = ref<ErrorEvent[]>([]);
  const isLoading = ref<boolean>(true);
  const isIssueLoading = ref<boolean>(false);
  const currentEventIndex = ref<number>(0);
  const showInAppOnly = ref<boolean>(false);
  const expandedFrameIds = ref<string[]>([]);
  const errorMessage = ref<string | null>(null);
  const activeIssueId = ref<string | null>(null);

  let recentSubscription: Unsubscribable | null = null;
  let issueSubscription: Unsubscribable | null = null;

  const currentIssueEvents = computed<ErrorEvent[]>(() => issueEvents.value);

  const currentEvent = computed<ErrorEvent | null>(
    () => issueEvents.value[currentEventIndex.value] ?? null
  );

  const visibleFrames = computed(() => {
    const frames = currentEvent.value?.exception.stacktrace.frames ?? [];
    const ordered = [...frames].reverse();
    return showInAppOnly.value ? ordered.filter((frame) => frame.in_app) : ordered;
  });

  const isFirstEvent = computed<boolean>(() => currentEventIndex.value <= 0);

  const isLastEvent = computed<boolean>(
    () => currentEventIndex.value >= issueEvents.value.length - 1
  );

  function startObserving(limit = RECENT_EVENT_WINDOW): void {
    recentSubscription?.unsubscribe();
    isLoading.value = true;

    recentSubscription = observeRecentEvents(limit).subscribe({
      next: (rows) => {
        recentEvents.value = rows;
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
    recentSubscription?.unsubscribe();
    recentSubscription = null;
    issueSubscription?.unsubscribe();
    issueSubscription = null;
    activeIssueId.value = null;
    issueEvents.value = [];
  }

  function clampCurrentIndex(): void {
    const total = issueEvents.value.length;
    if (total === 0) {
      currentEventIndex.value = 0;
      return;
    }
    if (currentEventIndex.value >= total) currentEventIndex.value = total - 1;
    if (currentEventIndex.value < 0) currentEventIndex.value = 0;
  }

  /**
   * Binds the detail view to an issue-scoped query.
   *
   * The previous implementation filtered a global 500-event window, which hid
   * every event of older issues. This subscription is indexed by `issue_id` and
   * therefore always returns the complete history for the opened issue.
   */
  function loadIssue(issueId: string): void {
    if (activeIssueId.value === issueId && issueSubscription !== null) return;

    issueSubscription?.unsubscribe();
    issueSubscription = null;
    activeIssueId.value = issueId;
    issueEvents.value = [];
    currentEventIndex.value = 0;
    expandedFrameIds.value = [];
    isIssueLoading.value = true;

    issueSubscription = observeEventsForIssue(issueId).subscribe({
      next: (rows) => {
        issueEvents.value = rows;
        isIssueLoading.value = false;
        clampCurrentIndex();
      },
      error: (error: unknown) => {
        isIssueLoading.value = false;
        errorMessage.value = error instanceof Error ? error.message : String(error);
      }
    });
  }

  function clearIssue(): void {
    issueSubscription?.unsubscribe();
    issueSubscription = null;
    activeIssueId.value = null;
    issueEvents.value = [];
    currentEventIndex.value = 0;
  }

  function goToEvent(index: number): void {
    const total = issueEvents.value.length;
    if (total === 0) return;
    currentEventIndex.value = Math.min(Math.max(0, index), total - 1);
  }

  function nextEvent(): void {
    goToEvent(currentEventIndex.value + 1);
  }

  function previousEvent(): void {
    goToEvent(currentEventIndex.value - 1);
  }

  /** Jump to the newest occurrence of an issue (used by the live stream). */
  function focusLatestEvent(issueId: string): void {
    loadIssue(issueId);
    currentEventIndex.value = Math.max(0, issueEvents.value.length - 1);
  }

  function toggleFrame(frameId: string): void {
    expandedFrameIds.value = expandedFrameIds.value.includes(frameId)
      ? expandedFrameIds.value.filter((id) => id !== frameId)
      : [...expandedFrameIds.value, frameId];
  }

  function setInAppOnly(value: boolean): void {
    showInAppOnly.value = value;
  }

  /** Most recent events for the live feed, newest first. */
  function recentEventsForStream(limit = 50): ErrorEvent[] {
    return recentEvents.value.slice(0, limit);
  }

  function clearError(): void {
    errorMessage.value = null;
  }

  return {
    recentEvents,
    issueEvents,
    isLoading,
    isIssueLoading,
    currentEventIndex,
    currentEvent,
    currentIssueEvents,
    visibleFrames,
    isFirstEvent,
    isLastEvent,
    showInAppOnly,
    expandedFrameIds,
    errorMessage,
    activeIssueId,
    startObserving,
    stopObserving,
    loadIssue,
    clearIssue,
    goToEvent,
    nextEvent,
    previousEvent,
    focusLatestEvent,
    toggleFrame,
    setInAppOnly,
    recentEventsForStream,
    clearError
  };
});