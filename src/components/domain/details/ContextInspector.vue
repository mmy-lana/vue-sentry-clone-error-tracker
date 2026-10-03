<script setup lang="ts">
import { computed } from 'vue';
import type { ErrorEvent } from '../../../types';
import { formatAbsoluteDateTime } from '../../../utils/date';
import BaseBadge from '../../ui/BaseBadge.vue';

interface Props {
  event: ErrorEvent;
  title?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Event context'
});

interface ContextRow {
  label: string;
  value: string;
}

const deviceRows = computed<ContextRow[]>(() => {
  const device = props.event.device;
  const rows: ContextRow[] = [
    { label: 'Browser', value: `${device.browser} ${device.browser_version}`.trim() },
    { label: 'Operating system', value: `${device.os} ${device.os_version}`.trim() },
    { label: 'Viewport', value: device.viewport }
  ];
  if (device.device_model) rows.splice(1, 0, { label: 'Device', value: device.device_model });
  return rows;
});

const requestRows = computed<ContextRow[]>(() => {
  const request = props.event.request;
  if (!request) return [];
  const query = Object.entries(request.query_params ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  const rows: ContextRow[] = [
    { label: 'Method', value: request.method },
    { label: 'URL', value: request.url }
  ];
  if (query.length > 0) rows.push({ label: 'Query', value: query });
  rows.push({ label: 'Headers', value: Object.entries(request.headers).map(([k, v]) => `${k}: ${v}`).join('\n') });
  if (request.body) rows.push({ label: 'Body', value: request.body });
  return rows;
});

const tagRows = computed<ContextRow[]>(() =>
  Object.entries(props.event.tags).map(([key, value]) => ({ label: key, value }))
);

const userRows = computed<ContextRow[]>(() => {
  const user = props.event.user;
  if (!user) return [];
  return [
    { label: 'ID', value: user.id ?? '—' },
    { label: 'Email', value: user.email ?? '—' },
    { label: 'Username', value: user.username ?? '—' },
    { label: 'IP address', value: user.ip_address ?? '—' }
  ];
});

const metaRows = computed<ContextRow[]>(() => [
  { label: 'Event ID', value: props.event.id },
  { label: 'Issue ID', value: props.event.issue_id },
  { label: 'Fingerprint', value: props.event.fingerprint },
  { label: 'Platform', value: props.event.platform },
  { label: 'Captured', value: formatAbsoluteDateTime(props.event.timestamp) },
  { label: 'SDK', value: `${props.event.sdk.name} ${props.event.sdk.version}` }
]);
</script>

<template>
  <section class="flex min-w-0 flex-col gap-3" aria-label="Event context">
    <header class="flex items-center justify-between gap-2">
      <h3 class="text-sm font-semibold text-slate-100">{{ title }}</h3>
      <BaseBadge :tone="event.level" size="sm" />
    </header>

    <div class="flex flex-col gap-3">
      <section class="rounded-lg border border-surface-700/70 bg-surface-900/60 p-3">
        <h4 class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Device
        </h4>
        <dl class="grid grid-cols-[minmax(0,120px)_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
          <template v-for="row in deviceRows" :key="row.label">
            <dt class="truncate text-slate-500">{{ row.label }}</dt>
            <dd class="break-words text-slate-200">{{ row.value }}</dd>
          </template>
        </dl>
      </section>

      <section class="rounded-lg border border-surface-700/70 bg-surface-900/60 p-3">
        <h4 class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Request
        </h4>
        <dl v-if="requestRows.length > 0" class="grid grid-cols-[minmax(0,120px)_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
          <template v-for="row in requestRows" :key="row.label">
            <dt class="truncate text-slate-500">{{ row.label }}</dt>
            <dd class="break-words font-mono text-[11px] text-slate-200">{{ row.value }}</dd>
          </template>
        </dl>
        <p v-else class="text-xs text-slate-500">No network request captured.</p>
      </section>

      <section class="rounded-lg border border-surface-700/70 bg-surface-900/60 p-3">
        <h4 class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Tags
        </h4>
        <dl v-if="tagRows.length > 0" class="grid grid-cols-[minmax(0,120px)_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
          <template v-for="row in tagRows" :key="row.label">
            <dt class="truncate text-slate-500">{{ row.label }}</dt>
            <dd class="break-words font-mono text-[11px] text-brand-300">{{ row.value }}</dd>
          </template>
        </dl>
        <p v-else class="text-xs text-slate-500">No tags attached to this event.</p>
      </section>

      <section class="rounded-lg border border-surface-700/70 bg-surface-900/60 p-3">
        <h4 class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          User
        </h4>
        <dl v-if="userRows.length > 0" class="grid grid-cols-[minmax(0,120px)_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
          <template v-for="row in userRows" :key="row.label">
            <dt class="truncate text-slate-500">{{ row.label }}</dt>
            <dd class="break-words text-slate-200">{{ row.value }}</dd>
          </template>
        </dl>
        <p v-else class="text-xs text-slate-500">This event is anonymous.</p>
      </section>

      <details class="rounded-lg border border-surface-700/70 bg-surface-900/60 p-3">
        <summary class="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Raw metadata
        </summary>
        <dl class="mt-2 grid grid-cols-[minmax(0,120px)_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
          <template v-for="row in metaRows" :key="row.label">
            <dt class="truncate text-slate-500">{{ row.label }}</dt>
            <dd class="break-all font-mono text-[11px] text-slate-300">{{ row.value }}</dd>
          </template>
        </dl>
      </details>
    </div>
  </section>
</template>