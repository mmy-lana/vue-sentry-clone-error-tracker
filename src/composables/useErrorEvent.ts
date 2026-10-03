import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useEventStore } from '../stores/eventStore';
import { useIssueStore } from '../stores/issueStore';

/**
 * Read model for one issue: the event stepper, the resolved frames and the
 * event context rendered by the detail view.
 */
export function useErrorEvent(issueId: () => string) {
  const eventStore = useEventStore();
  const issueStore = useIssueStore();
  const { showInAppOnly, currentEventIndex, errorMessage } = storeToRefs(eventStore);

  const issue = computed(() =>
    issueStore.issues.find((candidate) => candidate.id === issueId()) ?? null
  );

  // Issue-scoped query bound by `load()`: complete history, oldest first.
  const events = computed(() => eventStore.issueEvents);
  const currentEvent = computed(() => events.value[currentEventIndex.value] ?? null);

  const frames = computed(() => currentEvent.value?.exception.stacktrace.frames ?? []);
  const orderedFrames = computed(() => [...frames.value].reverse());
  const visibleFrames = computed(() =>
    showInAppOnly.value ? orderedFrames.value.filter((frame) => frame.in_app) : orderedFrames.value
  );

  const breadcrumbs = computed(() =>
    [...(currentEvent.value?.breadcrumbs ?? [])].sort((a, b) => b.timestamp - a.timestamp)
  );

  const tags = computed(() => currentEvent.value?.tags ?? {});
  const context = computed(() => ({
    device: currentEvent.value?.device ?? null,
    request: currentEvent.value?.request ?? null,
    user: currentEvent.value?.user ?? null,
    sdk: currentEvent.value?.sdk ?? null,
    fingerprint: currentEvent.value?.fingerprint ?? ''
  }));

  const position = computed<number>(() => (events.value.length === 0 ? 0 : currentEventIndex.value + 1));
  const total = computed<number>(() => events.value.length);
  const hasPrevious = computed<boolean>(() => currentEventIndex.value > 0);
  const hasNext = computed<boolean>(() => currentEventIndex.value < events.value.length - 1);

  function load(): void {
    eventStore.loadIssue(issueId());
  }

  function goTo(index: number): void {
    eventStore.goToEvent(index);
  }

  function previous(): void {
    eventStore.previousEvent();
  }

  function next(): void {
    eventStore.nextEvent();
  }

  function toggleInAppOnly(value?: boolean): void {
    eventStore.setInAppOnly(value ?? !showInAppOnly.value);
  }

  function toggleFrame(frameId: string): void {
    eventStore.toggleFrame(frameId);
  }

  return {
    issue,
    events,
    currentEvent,
    frames: visibleFrames,
    breadcrumbs,
    tags,
    context,
    position,
    total,
    hasPrevious,
    hasNext,
    showInAppOnly,
    expandedFrameIds: eventStore.expandedFrameIds,
    errorMessage,
    load,
    goTo,
    previous,
    next,
    toggleInAppOnly,
    toggleFrame
  };
}