<script setup lang="ts">
/**
 * Settings: persisted preferences stored in IndexedDB plus destructive
 * maintenance actions (clear dataset, reseed demo data).
 */
import { computed, onMounted, ref, watch } from 'vue';
import ResponsiveContainer from '../components/layout/ResponsiveContainer.vue';
import BaseBadge from '../components/ui/BaseBadge.vue';
import BaseButton from '../components/ui/BaseButton.vue';
import BaseModal from '../components/ui/BaseModal.vue';
import BaseTabs from '../components/ui/BaseTabs.vue';
import EmptyState from '../components/molecules/EmptyState.vue';
import { db, readSetting, resetDatabase, writeSetting } from '../services/db';
import { seedInitialErrors } from '../services/seeder';
import { useIssueStore } from '../stores/issueStore';
import { useFilterStore } from '../stores/filterStore';
import { formatCompactNumber, formatAbsoluteDateTime } from '../utils/date';
import type { AppPreferences, TabItem } from '../types';

const SETTINGS_KEY = 'preferences';

const DEFAULT_PREFERENCES: AppPreferences = {
  project_id: 'default',
  default_environment: 'production',
  default_time_range_hours: 24,
  auto_seed_on_boot: true,
  live_stream_paused_by_default: false,
  live_stream_max_rows: 50,
  reduced_motion: false
};

const issueStore = useIssueStore();
const filterStore = useFilterStore();

const preferences = ref<AppPreferences>({ ...DEFAULT_PREFERENCES });
const isLoaded = ref<boolean>(false);
const isBusy = ref<boolean>(false);
const saveState = ref<'idle' | 'saved' | 'error'>('idle');
const confirmAction = ref<'reset' | 'clear' | null>(null);
const activeTab = ref<string>('preferences');

const tabs: TabItem[] = [
  { key: 'preferences', label: 'Preferences' },
  { key: 'storage', label: 'Storage' }
];

const storageStats = computed(() => ({
  issues: issueStore.issues.length,
  events: issueStore.totalEventCount,
  environments: new Set(issueStore.issues.flatMap((issue) => issue.environments)).size,
  fingerprints: new Set(issueStore.issues.map((issue) => issue.fingerprint)).size
}));

const projectIdValid = computed<boolean>(() => /^[a-z0-9-_]{1,32}$/i.test(preferences.value.project_id));

async function loadPreferences(): Promise<void> {
  const stored = await readSetting<Partial<AppPreferences>>(SETTINGS_KEY, {});
  preferences.value = { ...DEFAULT_PREFERENCES, ...stored };
  isLoaded.value = true;
}

async function persist(): Promise<void> {
  saveState.value = 'idle';
  if (!projectIdValid.value) {
    saveState.value = 'error';
    return;
  }
  try {
    await writeSetting(SETTINGS_KEY, { ...preferences.value });
    filterStore.setEnvironment(preferences.value.default_environment);
    saveState.value = 'saved';
    window.setTimeout(() => {
      if (saveState.value === 'saved') saveState.value = 'idle';
    }, 2000);
  } catch {
    saveState.value = 'error';
  }
}

async function resetDatabaseAndReseed(): Promise<void> {
  isBusy.value = true;
  try {
    await resetDatabase();
    await seedInitialErrors();
    confirmAction.value = null;
  } finally {
    isBusy.value = false;
  }
}

async function clearDataset(): Promise<void> {
  isBusy.value = true;
  try {
    await db.transaction('rw', [db.issues, db.events], async () => {
      await db.issues.clear();
      await db.events.clear();
    });
    confirmAction.value = null;
  } finally {
    isBusy.value = false;
  }
}

watch(
  () => preferences.value.project_id,
  () => {
    if (saveState.value === 'error' && projectIdValid.value) saveState.value = 'idle';
  }
);

onMounted(loadPreferences);
</script>

<template>
  <ResponsiveContainer data-testid="settings-view">
    <div class="flex flex-col gap-3">
      <BaseTabs v-model="activeTab" :tabs="tabs" aria-label="Settings sections" />

      <section
        v-if="activeTab === 'preferences'"
        class="flex flex-col gap-4 rounded-lg border border-surface-700/70 bg-surface-900/70 p-3 sm:p-4"
      >
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="flex flex-col gap-1 text-xs text-slate-400">
            <span class="font-medium text-slate-300">Project id</span>
            <input
              v-model="preferences.project_id"
              type="text"
              class="h-9 rounded-md border border-surface-700 bg-surface-950 px-2 font-mono text-sm text-slate-100 focus:border-brand-500 focus:outline-none"
              :aria-invalid="!projectIdValid"
              data-testid="settings-project-id"
            />
            <span v-if="!projectIdValid" class="text-rose-300" role="alert">
              Use 1–32 letters, digits, dashes or underscores.
            </span>
          </label>

          <label class="flex flex-col gap-1 text-xs text-slate-400">
            <span class="font-medium text-slate-300">Default environment</span>
            <select
              v-model="preferences.default_environment"
              class="h-9 rounded-md border border-surface-700 bg-surface-950 px-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none"
              data-testid="settings-environment"
            >
              <option value="production">production</option>
              <option value="staging">staging</option>
              <option value="development">development</option>
            </select>
          </label>

          <label class="flex flex-col gap-1 text-xs text-slate-400">
            <span class="font-medium text-slate-300">Default time range (hours)</span>
            <input
              v-model.number="preferences.default_time_range_hours"
              type="number"
              min="1"
              max="720"
              class="h-9 rounded-md border border-surface-700 bg-surface-950 px-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none"
              data-testid="settings-time-range"
            />
          </label>

          <label class="flex flex-col gap-1 text-xs text-slate-400">
            <span class="font-medium text-slate-300">Live stream rows</span>
            <input
              v-model.number="preferences.live_stream_max_rows"
              type="number"
              min="10"
              max="500"
              step="10"
              class="h-9 rounded-md border border-surface-700 bg-surface-950 px-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none"
              data-testid="settings-stream-rows"
            />
          </label>
        </div>

        <fieldset class="flex flex-col gap-2">
          <legend class="mb-1 text-xs font-medium text-slate-300">Behaviour</legend>
          <label class="flex items-center gap-2 text-xs text-slate-400">
            <input
              v-model="preferences.auto_seed_on_boot"
              type="checkbox"
              class="size-4 accent-brand-500"
              data-testid="settings-auto-seed"
            />
            Seed demo data when the database is empty
          </label>
          <label class="flex items-center gap-2 text-xs text-slate-400">
            <input
              v-model="preferences.live_stream_paused_by_default"
              type="checkbox"
              class="size-4 accent-brand-500"
              data-testid="settings-paused"
            />
            Open the live stream paused
          </label>
          <label class="flex items-center gap-2 text-xs text-slate-400">
            <input
              v-model="preferences.reduced_motion"
              type="checkbox"
              class="size-4 accent-brand-500"
              data-testid="settings-reduced-motion"
            />
            Reduce motion (disables pulse animations)
          </label>
        </fieldset>

        <div class="flex flex-wrap items-center gap-2">
          <BaseButton variant="primary" size="sm" data-testid="settings-save" @click="persist">
            Save preferences
          </BaseButton>
          <BaseBadge v-if="saveState === 'saved'" tone="resolved" label="Saved to IndexedDB" size="sm" />
          <BaseBadge v-else-if="saveState === 'error'" tone="fatal" label="Fix the highlighted field" size="sm" />
          <span v-if="isLoaded" class="text-[11px] text-slate-600">Settings key: {{ SETTINGS_KEY }}</span>
        </div>
      </section>

      <section
        v-else
        class="flex flex-col gap-4 rounded-lg border border-surface-700/70 bg-surface-900/70 p-3 sm:p-4"
      >
        <dl class="grid grid-cols-2 gap-2 text-xs lg:grid-cols-4">
          <div class="rounded border border-surface-800 bg-surface-950/60 p-2">
            <dt class="text-slate-500">Issues</dt>
            <dd class="tabular-nums text-slate-100" data-testid="storage-issues">
              {{ formatCompactNumber(storageStats.issues) }}
            </dd>
          </div>
          <div class="rounded border border-surface-800 bg-surface-950/60 p-2">
            <dt class="text-slate-500">Events</dt>
            <dd class="tabular-nums text-slate-100" data-testid="storage-events">
              {{ formatCompactNumber(storageStats.events) }}
            </dd>
          </div>
          <div class="rounded border border-surface-800 bg-surface-950/60 p-2">
            <dt class="text-slate-500">Fingerprints</dt>
            <dd class="tabular-nums text-slate-100">{{ storageStats.fingerprints }}</dd>
          </div>
          <div class="rounded border border-surface-800 bg-surface-950/60 p-2">
            <dt class="text-slate-500">Environments</dt>
            <dd class="tabular-nums text-slate-100">{{ storageStats.environments }}</dd>
          </div>
        </dl>

        <p class="text-[11px] text-slate-500">
          Last write {{ formatAbsoluteDateTime(Date.now()) }} · database
          <span class="font-mono">vue_sentry_clone_db</span>
        </p>

        <div class="flex flex-wrap items-center gap-2">
          <BaseButton
            variant="secondary"
            size="sm"
            data-testid="settings-clear"
            @click="confirmAction = 'clear'"
          >
            Clear events
          </BaseButton>
          <BaseButton
            variant="danger"
            size="sm"
            data-testid="settings-reset"
            @click="confirmAction = 'reset'"
          >
            Reset and reseed
          </BaseButton>
        </div>

        <EmptyState
          compact
          icon="inbox"
          title="Everything is stored locally"
          description="No network calls leave the browser: issues, events and settings live in IndexedDB."
        />
      </section>
    </div>

    <BaseModal
      :is-open="confirmAction !== null"
      :title="confirmAction === 'reset' ? 'Reset the database?' : 'Delete every event?'"
      :description="
        confirmAction === 'reset'
          ? 'All issues and events are dropped, then the deterministic demo dataset is re-seeded.'
          : 'Every event is removed; the issue groups are kept with their counters intact.'
      "
      size="sm"
      persistent
      @close="confirmAction = null"
    >
      <p class="text-sm text-slate-300">
        {{ storageStats.issues }} issues and {{ storageStats.events }} events are currently stored.
      </p>
      <template #footer>
        <BaseButton variant="ghost" @click="confirmAction = null">Cancel</BaseButton>
        <BaseButton
          variant="danger"
          :loading="isBusy"
          data-testid="settings-confirm"
          @click="confirmAction === 'reset' ? resetDatabaseAndReseed() : clearDataset()"
        >
          {{ confirmAction === 'reset' ? 'Reset and reseed' : 'Delete events' }}
        </BaseButton>
      </template>
    </BaseModal>
  </ResponsiveContainer>
</template>