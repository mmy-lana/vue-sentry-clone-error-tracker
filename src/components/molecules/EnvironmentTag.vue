<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  environment: string;
  size?: 'sm' | 'md';
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md'
});

type EnvironmentTone = 'rose' | 'amber' | 'sky' | 'emerald' | 'slate' | 'violet';

const TONE_CLASSES: Record<EnvironmentTone, string> = {
  rose: 'bg-rose-500/15 text-rose-200 border-rose-500/30',
  amber: 'bg-amber-400/15 text-amber-200 border-amber-400/30',
  sky: 'bg-sky-400/15 text-sky-200 border-sky-400/30',
  emerald: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30',
  slate: 'bg-slate-600/30 text-slate-300 border-slate-500/40',
  violet: 'bg-violet-500/20 text-violet-200 border-violet-500/40'
};

const KNOWN_TONES: Record<string, EnvironmentTone> = {
  production: 'rose',
  prod: 'rose',
  staging: 'amber',
  stage: 'amber',
  development: 'sky',
  dev: 'sky',
  local: 'slate',
  preview: 'violet',
  canary: 'emerald'
};

const tone = computed<EnvironmentTone>(() => KNOWN_TONES[props.environment.toLowerCase()] ?? 'slate');

const rootClass = computed<string[]>(() => [
  'inline-flex items-center gap-1 rounded border font-medium uppercase tracking-wide',
  props.size === 'sm' ? 'px-1.5 py-px text-[9px]' : 'px-2 py-0.5 text-[10px]',
  TONE_CLASSES[tone.value]
]);
</script>

<template>
  <span :class="rootClass" :title="`Environment: ${environment}`">{{ environment }}</span>
</template>