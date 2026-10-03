<script setup lang="ts">
import { computed } from 'vue';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface Props {
  variant?: ButtonVariant;
  size?: ButtonSize;
  type?: 'button' | 'submit' | 'reset';
  loading?: boolean;
  disabled?: boolean;
  block?: boolean;
  /** Adds a highlight ring — used for active toolbar toggles. */
  active?: boolean;
  ariaLabel?: string;
  ariaExpanded?: boolean;
  ariaControls?: string;
  title?: string;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'secondary',
  size: 'md',
  type: 'button',
  loading: false,
  disabled: false,
  block: false,
  active: false,
  ariaLabel: undefined,
  ariaExpanded: undefined,
  ariaControls: undefined,
  title: undefined
});

const emit = defineEmits<{
  (event: 'click', payload: MouseEvent): void;
}>();

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white border border-brand-600 hover:bg-brand-500 hover:border-brand-500 active:bg-brand-700',
  secondary:
    'bg-surface-800 text-slate-100 border border-surface-700 hover:bg-surface-700 hover:border-surface-600',
  danger:
    'bg-rose-600/90 text-white border border-rose-500/60 hover:bg-rose-500 hover:border-rose-400',
  ghost:
    'bg-transparent text-slate-300 border border-transparent hover:bg-surface-800 hover:text-slate-100'
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-2.5 text-xs gap-1.5 rounded-md',
  md: 'h-9 px-3 text-sm gap-2 rounded-md',
  lg: 'h-11 px-4 text-sm gap-2 rounded-lg'
};

const rootClass = computed<string[]>(() => [
  'inline-flex items-center justify-center font-medium whitespace-nowrap',
  'transition-colors duration-150 select-none',
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent',
  VARIANT_CLASSES[props.variant],
  SIZE_CLASSES[props.size],
  props.block ? 'w-full' : '',
  props.active ? 'ring-1 ring-brand-400/70' : ''
]);

function handleClick(event: MouseEvent): void {
  if (props.disabled || props.loading) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  emit('click', event);
}
</script>

<template>
  <button
    :type="type"
    :class="rootClass"
    :disabled="disabled || loading"
    :aria-busy="loading"
    :aria-label="ariaLabel"
    :aria-expanded="ariaExpanded"
    :aria-controls="ariaControls"
    :title="title"
    @click="handleClick"
  >
    <span
      v-if="loading"
      class="inline-block size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
      aria-hidden="true"
    />
    <slot name="icon" />
    <span class="inline-flex items-center gap-1.5">
      <slot />
    </span>
    <slot name="trailing" />
  </button>
</template>