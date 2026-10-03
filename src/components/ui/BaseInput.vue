<script setup lang="ts">
import { computed, useId } from 'vue';

interface Props {
  modelValue: string;
  label?: string;
  placeholder?: string;
  type?: 'text' | 'search' | 'email' | 'number' | 'url' | 'password';
  hint?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  readonly?: boolean;
  autocomplete?: string;
  name?: string;
  maxlength?: number;
}

const props = withDefaults(defineProps<Props>(), {
  label: undefined,
  placeholder: undefined,
  type: 'text',
  hint: undefined,
  error: undefined,
  disabled: false,
  required: false,
  readonly: false,
  autocomplete: undefined,
  name: undefined,
  maxlength: undefined
});

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
  (event: 'focus', payload: FocusEvent): void;
  (event: 'blur', payload: FocusEvent): void;
  (event: 'keydown', payload: KeyboardEvent): void;
  (event: 'enter', payload: KeyboardEvent): void;
}>();

const generatedId = useId();
const inputId = computed<string>(() => props.name ?? `input-${generatedId}`);
const describedById = computed<string>(() => `${inputId.value}-description`);

const inputClass = computed<string[]>(() => [
  'w-full bg-surface-950/70 text-sm text-slate-100 placeholder:text-slate-500',
  'border rounded-md px-3 py-1.5 transition-colors',
  'disabled:opacity-50 disabled:cursor-not-allowed',
  props.error
    ? 'border-rose-500/60 focus:border-rose-400'
    : 'border-surface-700 hover:border-surface-600 focus:border-brand-500'
]);

function handleInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).value);
}

function handleKeydown(event: KeyboardEvent): void {
  emit('keydown', event);
  if (event.key === 'Enter') emit('enter', event);
}
</script>

<template>
  <div class="w-full">
    <label
      v-if="label"
      :for="inputId"
      class="mb-1 block text-xs font-medium text-slate-300"
    >
      {{ label }}
      <span v-if="required" class="text-rose-400" aria-hidden="true">*</span>
    </label>

    <div class="relative flex items-center">
      <span
        v-if="$slots.prefix"
        class="pointer-events-none absolute left-2.5 flex items-center text-slate-500"
        aria-hidden="true"
      >
        <slot name="prefix" />
      </span>

      <input
        :id="inputId"
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :required="required"
        :readonly="readonly"
        :autocomplete="autocomplete"
        :name="name"
        :maxlength="maxlength"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="hint || error ? describedById : undefined"
        :class="[
          inputClass,
          $slots.prefix ? 'pl-8' : '',
          $slots.suffix ? 'pr-9' : ''
        ]"
        @input="handleInput"
        @focus="emit('focus', $event)"
        @blur="emit('blur', $event)"
        @keydown="handleKeydown"
      />

      <span
        v-if="$slots.suffix"
        class="absolute right-2 flex items-center text-slate-500"
      >
        <slot name="suffix" />
      </span>
    </div>

    <p
      v-if="error"
      :id="describedById"
      class="mt-1 text-xs text-rose-300"
      role="alert"
    >
      {{ error }}
    </p>
    <p v-else-if="hint" :id="describedById" class="mt-1 text-xs text-slate-500">
      {{ hint }}
    </p>
  </div>
</template>