<script setup lang="ts">
import { computed } from 'vue';
import type { Issue } from '../../../types';
import { formatCompactNumber, formatElapsed } from '../../../utils/date';
import BaseBadge from '../../ui/BaseBadge.vue';
import BaseCheckbox from '../../ui/BaseCheckbox.vue';
import BaseTooltip from '../../ui/BaseTooltip.vue';
import EnvironmentTag from '../../molecules/EnvironmentTag.vue';
import SparklineBarGraph from '../../molecules/SparklineBarGraph.vue';
import TagBadgeGroup from '../../molecules/TagBadgeGroup.vue';
import TimeAgo from '../../molecules/TimeAgo.vue';
import UserAvatar from '../../molecules/UserAvatar.vue';

interface Props {
  issue: Issue;
  selectable?: boolean;
  selected?: boolean;
  /** Highlights the row currently open in the detail view. */
  isActive?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  selectable: true,
  selected: false,
  isActive: false
});

const emit = defineEmits<{
  (event: 'toggle-select', issueId: string): void;
  (event: 'open', issueId: string): void;
}>();

const regressionLabel = computed<string>(() =>
  props.issue.regression_count > 0
    ? `${props.issue.regression_count} ${props.issue.regression_count === 1 ? 'regression' : 'regressions'}`
    : 'No regressions'
);

const durationLabel = computed<string>(() =>
  formatElapsed(props.issue.first_seen, props.issue.last_seen)
);

/** Most frequent value per tag key, used for the compact row preview. */
const tagPreview = computed<Record<string, string>>(() => {
  const preview: Record<string, string> = {};
  for (const [key, values] of Object.entries(props.issue.tags_summary)) {
    const top = Object.entries(values).sort((a, b) => b[1] - a[1])[0];
    if (top) preview[key] = top[0];
  }
  return preview;
});

function open(): void {
  emit('open', props.issue.id);
}
</script>

<template>
  <article
    data-issue-row
    :data-issue-id="issue.id"
    :class="[
      'group relative w-full min-w-0 border-b border-surface-800/80 transition-colors last:border-b-0',
      isActive ? 'bg-brand-600/10' : 'hover:bg-surface-850/70',
      selected ? 'bg-brand-600/[0.07]' : ''
    ]"
  >
    <!-- Mobile: stacked card -->
    <div class="flex flex-col gap-2 p-3 md:hidden">
      <div class="flex items-start gap-2">
        <BaseCheckbox
          v-if="selectable"
          :model-value="selected"
          :aria-label="`Select ${issue.title}`"
          class="mt-1"
          @update:model-value="emit('toggle-select', issue.id)"
        />
        <button
          type="button"
          class="min-w-0 flex-1 text-left"
          :aria-label="`Open issue ${issue.title}`"
          @click="open"
        >
          <span class="flex items-center gap-1.5">
            <BaseBadge :tone="issue.level" size="sm" />
            <BaseBadge v-if="issue.status !== 'unresolved'" :tone="issue.status" size="sm" />
          </span>
          <span class="mt-1 block truncate text-sm font-medium text-slate-100">
            {{ issue.title }}
          </span>
          <span class="mt-0.5 block truncate font-mono text-[11px] text-slate-500">
            {{ issue.culprit }}
          </span>
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-[11px] text-slate-400">
        <span class="tabular-nums">{{ formatCompactNumber(issue.event_count) }} events</span>
        <span class="tabular-nums">{{ issue.user_count }} users</span>
        <EnvironmentTag :environment="issue.environments[0] ?? 'unknown'" size="sm" />
        <span class="ml-auto"><TimeAgo :timestamp="issue.last_seen" /></span>
      </div>

      <div class="pl-6">
        <TagBadgeGroup :tags="tagPreview" :max="2" size="sm" values-only />
      </div>
    </div>

    <!-- Tablet and up: grid row -->
    <div class="hidden items-center gap-3 px-3 py-2.5 md:grid md:grid-cols-[auto_88px_minmax(0,1fr)_120px_72px_110px] md:px-4">
      <BaseCheckbox
        v-if="selectable"
        :model-value="selected"
        :aria-label="`Select ${issue.title}`"
        @update:model-value="emit('toggle-select', issue.id)"
      />
      <span v-else aria-hidden="true" />

      <div class="flex flex-col items-start gap-1">
        <BaseBadge :tone="issue.level" size="sm" />
        <BaseBadge
          v-if="issue.status !== 'unresolved'"
          :tone="issue.status"
          size="sm"
          hide-dot
        />
      </div>

      <div class="min-w-0">
        <button
          type="button"
          class="block w-full truncate text-left text-sm font-medium text-slate-100 transition-colors hover:text-brand-200"
          :aria-label="`Open issue ${issue.title}`"
          @click="open"
        >
          {{ issue.title }}
        </button>
        <p class="mt-0.5 flex items-center gap-2 truncate font-mono text-[11px] text-slate-500">
          <span class="truncate">{{ issue.culprit }}</span>
          <BaseTooltip :content="`First seen ${durationLabel} before the latest event`" placement="top">
            <span class="shrink-0 text-slate-600">·</span>
          </BaseTooltip>
          <span class="shrink-0 text-slate-600">{{ durationLabel }}</span>
        </p>
        <div class="mt-1.5 hidden lg:block">
          <TagBadgeGroup :tags="tagPreview" :max="3" size="sm" values-only />
        </div>
      </div>

      <div class="min-w-0">
        <SparklineBarGraph :buckets="issue.histogram_24h" :tone="issue.level" height-class="h-7" />
      </div>

      <div class="flex flex-col items-end gap-1 text-right">
        <span class="text-xs tabular-nums text-slate-300">
          {{ formatCompactNumber(issue.event_count) }}
        </span>
        <span class="text-[11px] tabular-nums text-slate-500">
          {{ issue.user_count }} {{ issue.user_count === 1 ? 'user' : 'users' }}
        </span>
      </div>

      <div class="flex flex-col items-end gap-1">
        <span class="text-xs text-slate-300">
          <TimeAgo :timestamp="issue.last_seen" />
        </span>
        <span
          class="text-[11px]"
          :class="issue.regression_count > 0 ? 'text-amber-400' : 'text-slate-600'"
          :title="regressionLabel"
        >
          {{ issue.regression_count > 0 ? `↻ ${issue.regression_count}` : '—' }}
        </span>
      </div>

      <div class="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 items-center gap-1 lg:flex">
        <div class="flex -space-x-1.5">
          <UserAvatar
            v-for="userId in issue.unique_users.slice(0, 3)"
            :key="userId"
            :user-id="userId"
            size="xs"
          />
          <span
            v-if="issue.unique_users.length > 3"
            class="inline-flex size-5 items-center justify-center rounded-full border border-surface-600 bg-surface-800 text-[9px] text-slate-400"
          >
            +{{ issue.unique_users.length - 3 }}
          </span>
        </div>
      </div>
    </div>
  </article>
</template>