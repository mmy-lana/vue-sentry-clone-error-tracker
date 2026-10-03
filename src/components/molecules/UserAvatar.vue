<script setup lang="ts">
import { computed } from 'vue';
import BaseTooltip from '../ui/BaseTooltip.vue';

interface Props {
  userId?: string;
  email?: string;
  username?: string;
  size?: 'xs' | 'sm' | 'md';
}

const props = withDefaults(defineProps<Props>(), {
  userId: undefined,
  email: undefined,
  username: undefined,
  size: 'sm'
});

const PALETTES: string[] = [
  'bg-indigo-500/20 text-indigo-200 border-indigo-500/40',
  'bg-emerald-500/20 text-emerald-200 border-emerald-500/40',
  'bg-amber-500/20 text-amber-200 border-amber-500/40',
  'bg-sky-500/20 text-sky-200 border-sky-500/40',
  'bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-500/40',
  'bg-rose-500/20 text-rose-200 border-rose-500/40'
];

const SIZE_CLASSES: Record<NonNullable<Props['size']>, string> = {
  xs: 'size-5 text-[9px]',
  sm: 'size-6 text-[10px]',
  md: 'size-8 text-xs'
};

const identity = computed<string>(() => props.userId ?? props.email ?? props.username ?? 'anonymous');

const initials = computed<string>(() => {
  const source = props.username ?? props.email ?? props.userId ?? '?';
  const cleaned = source.replace(/[._-]+/g, ' ').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return cleaned.slice(0, 2).toUpperCase() || '?';
});

const palette = computed<string>(() => {
  const hash = Array.from(identity.value).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return PALETTES[hash % PALETTES.length];
});

const label = computed<string>(() => props.email ?? props.username ?? props.userId ?? 'Anonymous user');

const sizeClass = computed<string>(() => [
  'inline-flex shrink-0 items-center justify-center rounded-full border font-semibold uppercase',
  SIZE_CLASSES[props.size],
  palette.value
].join(' '));
</script>

<template>
  <BaseTooltip :content="label" placement="top">
    <span :class="sizeClass" role="img" :aria-label="`User ${label}`">{{ initials }}</span>
  </BaseTooltip>
</template>