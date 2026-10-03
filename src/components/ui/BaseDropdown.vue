<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { onClickOutside } from '@vueuse/core';
import type { BaseDropdownItem, BaseDropdownProps } from '../../types';

interface Props extends Partial<BaseDropdownProps> {
  items: BaseDropdownItem[];
  /** Currently selected item id; renders inside the trigger. */
  modelValue?: string;
  align?: 'left' | 'right';
  widthClass?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  triggerText: 'Select',
  modelValue: undefined,
  align: 'left',
  widthClass: 'w-56',
  ariaLabel: 'Options',
  disabled: false
});

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
  (event: 'select', item: BaseDropdownItem): void;
}>();

const isOpen = ref<boolean>(false);
const triggerRef = ref<HTMLButtonElement | null>(null);
const panelRef = ref<HTMLDivElement | null>(null);
const shouldFlipUp = ref<boolean>(false);

const selectedLabel = computed<string>(() => {
  const match = props.items.find((item) => item.id === props.modelValue);
  return match ? match.label : props.triggerText;
});

const panelStyle = computed<Record<string, string>>(() => ({
  maxWidth: 'calc(100vw - 2rem)'
}));

/** Flip above the trigger when the space below cannot fit the panel. */
async function updatePlacement(): Promise<void> {
  const trigger = triggerRef.value;
  const panel = panelRef.value;
  if (!trigger || !panel) return;

  const triggerRect = trigger.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const margin = 8;

  panel.style.top = 'auto';
  panel.style.bottom = 'auto';

  const spaceBelow = viewportHeight - triggerRect.bottom - margin;
  const spaceAbove = triggerRect.top - margin;
  const panelHeight = panel.offsetHeight;
  shouldFlipUp.value = spaceBelow < Math.min(panelHeight, 240) && spaceAbove > spaceBelow;
}

function open(): void {
  if (props.disabled) return;
  isOpen.value = true;
  void nextTick(updatePlacement);
}

function close(focusTrigger = false): void {
  isOpen.value = false;
  if (focusTrigger) triggerRef.value?.focus();
}

function toggle(): void {
  if (isOpen.value) close();
  else open();
}

function selectItem(item: BaseDropdownItem): void {
  emit('select', item);
  if (props.modelValue !== undefined) emit('update:modelValue', item.id);
  close(true);
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && isOpen.value) {
    event.stopPropagation();
    close(true);
  }
}

onClickOutside(panelRef, () => close(), { ignore: [triggerRef] });

watch(
  () => props.items.length,
  () => {
    if (isOpen.value) void nextTick(updatePlacement);
  }
);

onBeforeUnmount(() => {
  isOpen.value = false;
});

const menuId = `dropdown-menu-${Math.random().toString(36).slice(2, 9)}`;
</script>

<template>
  <div class="relative inline-block" @keydown="handleKeydown">
    <button
      ref="triggerRef"
      type="button"
      class="inline-flex h-9 max-w-full items-center justify-between gap-2 rounded-md border border-surface-700 bg-surface-800 px-3 text-sm text-slate-100 transition-colors hover:border-surface-600 hover:bg-surface-700 disabled:cursor-not-allowed disabled:opacity-50"
      :aria-label="ariaLabel"
      :aria-haspopup="'listbox'"
      :aria-expanded="isOpen"
      :aria-controls="isOpen ? menuId : undefined"
      :disabled="disabled"
      @click="toggle"
    >
      <span class="truncate">{{ selectedLabel }}</span>
      <svg
        class="size-3.5 shrink-0 text-slate-400 transition-transform"
        :class="{ 'rotate-180': isOpen }"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        aria-hidden="true"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 9l6 6 6-6" />
      </svg>
    </button>

    <Transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="opacity-0 scale-95"
      leave-active-class="transition duration-75 ease-in"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="isOpen"
        :id="menuId"
        ref="panelRef"
        role="listbox"
        :aria-label="ariaLabel"
        :style="panelStyle"
        class="scrollbar-thin absolute z-50 max-h-[min(20rem,60dvh)] overflow-y-auto overscroll-contain rounded-md border border-surface-700 bg-surface-900 p-1 shadow-2xl"
        :class="[
          widthClass,
          align === 'right' ? 'right-0' : 'left-0',
          shouldFlipUp ? 'bottom-full mb-1' : 'top-full mt-1'
        ]"
      >
        <button
          v-for="item in items"
          :key="item.id"
          type="button"
          role="option"
          :aria-selected="item.id === modelValue"
          class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors"
          :class="[
            item.danger
              ? 'text-rose-300 hover:bg-rose-500/15'
              : 'text-slate-200 hover:bg-surface-700/70',
            item.id === modelValue ? 'bg-brand-600/15 text-brand-200' : ''
          ]"
          @click="selectItem(item)"
        >
          <span v-if="item.icon" class="shrink-0 text-slate-400" aria-hidden="true">{{ item.icon }}</span>
          <span class="truncate">{{ item.label }}</span>
          <svg
            v-if="item.id === modelValue"
            class="ml-auto size-3.5 shrink-0 text-brand-300"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            aria-hidden="true"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </button>

        <p v-if="items.length === 0" class="px-2 py-3 text-center text-xs text-slate-500">
          No options available
        </p>
      </div>
    </Transition>
  </div>
</template>