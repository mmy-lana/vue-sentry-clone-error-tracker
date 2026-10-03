<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { StackFrame } from '../../../types';
import BaseBadge from '../../ui/BaseBadge.vue';
import BaseCheckbox from '../../ui/BaseCheckbox.vue';
import EmptyState from '../../molecules/EmptyState.vue';
import StackFrameItem from './StackFrameItem.vue';

interface Props {
  frames: StackFrame[];
  title?: string;
  /** Show the "in-app only" filter (desktop layouts). */
  showFilter?: boolean;
  /** Frames in this state start expanded. */
  expandInAppByDefault?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Stack trace',
  showFilter: true,
  expandInAppByDefault: true
});

const inAppOnly = ref<boolean>(false);

watch(
  () => props.frames,
  () => {
    inAppOnly.value = false;
  }
);

const orderedFrames = computed<StackFrame[]>(() => [...props.frames].reverse());

const visibleFrames = computed<StackFrame[]>(() =>
  inAppOnly.value ? orderedFrames.value.filter((frame) => frame.in_app) : orderedFrames.value
);

const inAppCount = computed<number>(() => props.frames.filter((frame) => frame.in_app).length);

function positionOf(frame: StackFrame): number {
  return orderedFrames.value.findIndex((candidate) => candidate.id === frame.id) + 1;
}
</script>

<template>
  <section class="flex flex-col gap-2" aria-label="Stack trace">
    <header class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="flex items-center gap-2 text-sm font-semibold text-slate-100">
        {{ title }}
        <BaseBadge tone="neutral" :label="`${visibleFrames.length} frames`" size="sm" />
      </h3>

      <label v-if="showFilter && inAppCount > 0" class="hidden items-center gap-2 text-xs text-slate-400 lg:flex">
        <BaseCheckbox v-model="inAppOnly" label="In-app frames only" />
      </label>
    </header>

    <div v-if="visibleFrames.length > 0" class="flex flex-col gap-1.5" data-testid="stack-frames">
      <StackFrameItem
        v-for="frame in visibleFrames"
        :key="frame.id"
        :frame="frame"
        :position="positionOf(frame)"
        :default-expanded="expandInAppByDefault && frame.in_app"
      />
    </div>

    <EmptyState
      v-else
      compact
      icon="stack"
      :title="inAppOnly ? 'No in-app frames' : 'No stack frames captured'"
      :description="
        inAppOnly
          ? 'Disable the in-app filter to inspect vendor frames for this event.'
          : 'This event was captured without a usable call stack.'
      "
    />
  </section>
</template>