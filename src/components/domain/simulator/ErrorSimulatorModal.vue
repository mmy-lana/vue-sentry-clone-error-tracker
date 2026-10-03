<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import BaseBadge from '../../ui/BaseBadge.vue';
import BaseButton from '../../ui/BaseButton.vue';
import BaseModal from '../../ui/BaseModal.vue';
import type { SimulatorPreset } from '../../../composables/useSimulator';
import type { ErrorLevel } from '../../../types';

interface Props {
  isOpen: boolean;
  presets: SimulatorPreset[];
  isRunning: boolean;
  ratePerMinute: number;
  environment: string;
  environments: string[];
  emittedCount: number;
  lastError: string | null;
  /** Validation message for the custom JSON payload (owned by the parent). */
  customError?: string | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'emit', presetId: string): void;
  (event: 'toggle-run'): void;
  (event: 'update:rate', value: number): void;
  (event: 'update:environment', value: string): void;
  (event: 'submit-custom', payload: string): void;
}>();

const selectedPresetId = ref<string>(props.presets[0]?.id ?? '');
const customJson = ref<string>(
  JSON.stringify(
    {
      level: 'error',
      message: 'Custom simulator payload',
      culprit: 'manual/simulator in submit',
      exception: {
        type: 'CustomError',
        value: 'Custom simulator payload',
        stacktrace: { frames: [] }
      },
      tags: { origin: 'simulator' }
    },
    null,
    2
  )
);
watch(
  () => props.presets,
  (presets) => {
    if (presets.length > 0 && !presets.some((preset) => preset.id === selectedPresetId.value)) {
      selectedPresetId.value = presets[0].id;
    }
  }
);

const rateBounds = computed<string>(() => {
  const rate = props.ratePerMinute;
  return `${rate} events per minute`;
});

function selectPreset(presetId: string): void {
  selectedPresetId.value = presetId;
}

function submitCustom(): void {
  emit('submit-custom', customJson.value);
}

const LEVELS: ErrorLevel[] = ['fatal', 'error', 'warning', 'info', 'debug'];
</script>

<template>
  <BaseModal
    :is-open="isOpen"
    title="Error simulator"
    description="Emit real events into the local ingestion pipeline."
    size="lg"
    data-testid="simulator-modal"
    @close="emit('close')"
  >
    <div class="flex flex-col gap-4">
      <section class="rounded-lg border border-surface-700/70 bg-surface-950/40 p-3">
        <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-500">Presets</h3>
        <ul class="mt-2 grid gap-2 sm:grid-cols-3">
          <li v-for="preset in presets" :key="preset.id">
            <button
              type="button"
              class="flex h-full w-full flex-col gap-1 rounded-md border p-2 text-left transition-colors"
              :class="
                selectedPresetId === preset.id
                  ? 'border-brand-500/60 bg-brand-600/10'
                  : 'border-surface-700 hover:border-surface-600 hover:bg-surface-800'
              "
              :data-testid="`simulator-preset-${preset.id}`"
              @click="selectPreset(preset.id)"
            >
              <span class="flex items-center justify-between gap-2">
                <span class="text-sm font-medium text-slate-100">{{ preset.label }}</span>
                <BaseBadge :tone="preset.level" size="sm" hide-dot />
              </span>
              <span class="text-[11px] leading-snug text-slate-400">{{ preset.description }}</span>
            </button>
          </li>
        </ul>

        <div class="mt-3 flex flex-wrap items-center gap-2">
          <BaseButton
            variant="primary"
            size="sm"
            data-testid="simulator-emit"
            @click="emit('emit', selectedPresetId)"
          >
            Emit once
          </BaseButton>
          <BaseButton
            :variant="isRunning ? 'danger' : 'secondary'"
            size="sm"
            data-testid="simulator-toggle"
            @click="emit('toggle-run')"
          >
            {{ isRunning ? 'Pause stream' : 'Start stream' }}
          </BaseButton>
          <span class="text-[11px] text-slate-400" data-testid="simulator-rate">{{ rateBounds }}</span>
        </div>
      </section>

      <section class="rounded-lg border border-surface-700/70 bg-surface-950/40 p-3">
        <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-500">Stream settings</h3>
        <div class="mt-2 grid gap-3 sm:grid-cols-2">
          <label class="flex flex-col gap-1 text-xs text-slate-400">
            <span>Events per minute: {{ ratePerMinute }}</span>
            <input
              type="range"
              min="1"
              max="60"
              step="1"
              :value="ratePerMinute"
              class="accent-brand-500"
              data-testid="simulator-rate-slider"
              @input="emit('update:rate', Number(($event.target as HTMLInputElement).value))"
            />
          </label>

          <label class="flex flex-col gap-1 text-xs text-slate-400">
            <span>Environment</span>
            <select
              class="h-9 rounded-md border border-surface-700 bg-surface-900 px-2 text-sm text-slate-100"
              :value="environment"
              data-testid="simulator-environment"
              @change="emit('update:environment', ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="option in environments" :key="option" :value="option">{{ option }}</option>
            </select>
          </label>
        </div>

        <dl class="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          <div class="rounded border border-surface-800 bg-surface-900 p-2">
            <dt class="text-slate-500">Emitted this session</dt>
            <dd class="tabular-nums text-slate-200" data-testid="simulator-emitted">{{ emittedCount }}</dd>
          </div>
          <div class="rounded border border-surface-800 bg-surface-900 p-2">
            <dt class="text-slate-500">Levels</dt>
            <dd class="flex flex-wrap gap-1">
              <BaseBadge v-for="level in LEVELS" :key="level" :tone="level" size="sm" hide-dot />
            </dd>
          </div>
        </dl>
      </section>

      <section class="rounded-lg border border-surface-700/70 bg-surface-950/40 p-3">
        <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-500">Custom payload</h3>
        <p class="mt-1 text-[11px] text-slate-500">
          Paste a JSON object. <code class="text-slate-400">level</code> and either
          <code class="text-slate-400">message</code> or
          <code class="text-slate-400">exception</code> are required.
        </p>
        <textarea
          v-model="customJson"
          rows="8"
          spellcheck="false"
          class="code-scroll mt-2 w-full resize-y rounded-md border border-surface-700 bg-surface-950 p-2 font-mono text-[11px] text-slate-200 focus:border-brand-500 focus:outline-none"
          data-testid="simulator-json"
        />
        <p
          v-if="customError"
          class="mt-1 text-[11px] text-rose-300"
          role="alert"
          data-testid="simulator-json-error"
        >
          {{ customError }}
        </p>
        <div class="mt-2 flex items-center gap-2">
          <BaseButton variant="secondary" size="sm" data-testid="simulator-submit" @click="submitCustom">
            Submit payload
          </BaseButton>
          <span class="text-[11px] text-slate-500">Ingested with the selected environment tag.</span>
        </div>
      </section>

      <p v-if="lastError" class="text-[11px] text-rose-300" role="alert">Last failure: {{ lastError }}</p>
    </div>

    <template #footer>
      <BaseButton variant="ghost" @click="emit('close')">Close</BaseButton>
    </template>
  </BaseModal>
</template>