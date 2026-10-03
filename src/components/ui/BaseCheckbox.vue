<script setup lang="ts">
import { ref, useId, watchEffect } from 'vue';

interface Props {
  modelValue: boolean;
  /** Renders the native mixed state (used by the "select all" row). */
  indeterminate?: boolean;
  label?: string;
  disabled?: boolean;
  ariaLabel?: string;
}

const props = withDefaults(defineProps<Props>(), {
  indeterminate: false,
  label: undefined,
  disabled: false,
  ariaLabel: undefined
});

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
  (event: 'change', value: boolean): void;
}>();

const inputRef = ref<HTMLInputElement | null>(null);
const generatedId = useId();
const inputId = `checkbox-${generatedId}`;

// `indeterminate` is a DOM-only property, so it must be synced imperatively.
watchEffect(() => {
  if (inputRef.value) {
    inputRef.value.indeterminate = props.indeterminate && !props.modelValue;
  }
});

function handleChange(event: Event): void {
  const next = (event.target as HTMLInputElement).checked;
  emit('update:modelValue', next);
  emit('change', next);
}
</script>

<template>
  <label
    class="inline-flex select-none items-center gap-2"
    :class="disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'"
  >
    <input
      :id="inputId"
      ref="inputRef"
      type="checkbox"
      :checked="modelValue"
      :disabled="disabled"
      :aria-label="ariaLabel ?? label"
      class="peer size-4 shrink-0 cursor-pointer appearance-none rounded border border-surface-600 bg-surface-950 transition-colors
        checked:border-brand-500 checked:bg-brand-500
        indeterminate:border-brand-500 indeterminate:bg-brand-500
        disabled:cursor-not-allowed"
      @change="handleChange"
    />
    <span class="sr-only">{{ ariaLabel ?? label }}</span>
    <span
      v-if="label"
      class="text-sm text-slate-300 peer-checked:text-slate-100"
    >
      {{ label }}
    </span>
  </label>
</template>

<style scoped>
input[type='checkbox'] {
  background-image: none;
}

input[type='checkbox']:checked {
  background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%23020617' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3e%3cpath d='M3.5 8.5l3 3 6-6'/%3e%3c/svg%3e");
  background-size: 100%;
  background-position: center;
  background-repeat: no-repeat;
}

input[type='checkbox']:indeterminate {
  background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%23020617' stroke-width='2.5' stroke-linecap='round'%3e%3cpath d='M4 8h8'/%3e%3c/svg%3e");
  background-size: 100%;
  background-position: center;
  background-repeat: no-repeat;
}
</style>