<script setup lang="ts">
import { computed } from 'vue';
import type { Breadcrumb } from '../../../types';
import BaseBadge from '../../ui/BaseBadge.vue';
import EmptyState from '../../molecules/EmptyState.vue';
import BreadcrumbEntry from './BreadcrumbEntry.vue';

interface Props {
  breadcrumbs: Breadcrumb[];
  title?: string;
  /** Newest first (detail view) or oldest first (chronological reading). */
  order?: 'desc' | 'asc';
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Breadcrumbs',
  order: 'desc'
});

const ordered = computed<Breadcrumb[]>(() =>
  [...props.breadcrumbs].sort((a, b) =>
    props.order === 'desc' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp
  )
);

const errorCount = computed<number>(
  () => props.breadcrumbs.filter((crumb) => crumb.level === 'error' || crumb.level === 'fatal').length
);
</script>

<template>
  <section class="flex min-w-0 flex-col gap-2" aria-label="Breadcrumb timeline">
    <header class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="flex items-center gap-2 text-sm font-semibold text-slate-100">
        {{ title }}
        <BaseBadge tone="neutral" :label="`${breadcrumbs.length}`" size="sm" />
      </h3>
      <BaseBadge
        v-if="errorCount > 0"
        tone="error"
        :label="`${errorCount} failed request${errorCount === 1 ? '' : 's'}`"
        size="sm"
      />
    </header>

    <ol
      v-if="ordered.length > 0"
      class="rounded-lg border border-surface-700/70 bg-surface-900/60 px-3 py-2"
      data-testid="breadcrumb-timeline"
    >
      <BreadcrumbEntry
        v-for="(crumb, index) in ordered"
        :key="crumb.id"
        :breadcrumb="crumb"
        :is-last="index === ordered.length - 1"
      />
    </ol>

    <EmptyState
      v-else
      compact
      icon="signal"
      title="No breadcrumbs recorded"
      description="This event was captured before any UI or network instrumentation ran."
    />
  </section>
</template>