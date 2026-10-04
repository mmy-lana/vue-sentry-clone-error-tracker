<script setup lang="ts">
import { ref, useId } from 'vue';
import type { TabItem } from '../../types';

interface Props {
  modelValue: string;
  tabs: TabItem[];
  ariaLabel?: string;
  /** Stretch tabs to fill the available width (segmented control look). */
  stretch?: boolean;
  /**
   * Optional stable id prefix so consumers can wire real tab panels:
   * `id-prefix="settings"` yields `#settings-tab-0` and `#settings-panel-0`,
   * which they bind to `id`, `role="tabpanel"` and `aria-labelledby`.
   */
  idPrefix?: string;
}

const props = withDefaults(defineProps<Props>(), {
  ariaLabel: 'Tabs',
  stretch: false,
  idPrefix: undefined
});

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
}>();

const baseId = useId();
const tabRefs = ref<HTMLButtonElement[]>([]);

function tabId(index: number): string {
  return props.idPrefix ? `${props.idPrefix}-tab-${index}` : `${baseId}-tab-${index}`;
}

function panelId(index: number): string {
  return props.idPrefix ? `${props.idPrefix}-panel-${index}` : `${baseId}-panel-${index}`;
}

function setActive(index: number): void {
  const tab = props.tabs[index];
  if (!tab) return;
  emit('update:modelValue', tab.key);
  tabRefs.value[index]?.focus();
}

function handleKeydown(event: KeyboardEvent, index: number): void {
  const lastIndex = props.tabs.length - 1;
  if (lastIndex < 0) return;

  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      event.preventDefault();
      setActive(index === lastIndex ? 0 : index + 1);
      break;
    case 'ArrowLeft':
    case 'ArrowUp':
      event.preventDefault();
      setActive(index === 0 ? lastIndex : index - 1);
      break;
    case 'Home':
      event.preventDefault();
      setActive(0);
      break;
    case 'End':
      event.preventDefault();
      setActive(lastIndex);
      break;
    default:
      break;
  }
}
</script>

<template>
  <div
    role="tablist"
    :aria-label="ariaLabel"
    class="scrollbar-thin flex max-w-full gap-1 overflow-x-auto border-b border-surface-700/60"
  >
    <button
      v-for="(tab, index) in tabs"
      :id="tabId(index)"
      :key="tab.key"
      ref="tabRefs"
      type="button"
      role="tab"
      :aria-selected="tab.key === modelValue"
      :aria-controls="panelId(index)"
      :tabindex="tab.key === modelValue ? 0 : -1"
      class="relative flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors"
      :class="
        tab.key === modelValue
          ? 'text-brand-200 after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-brand-500'
          : 'text-slate-400 hover:text-slate-200'
      "
      @click="emit('update:modelValue', tab.key)"
      @keydown="handleKeydown($event, index)"
    >
      {{ tab.label }}
      <span
        v-if="tab.badge !== undefined"
        class="rounded-full bg-surface-700 px-1.5 py-px text-[10px] font-semibold text-slate-200"
      >
        {{ tab.badge }}
      </span>
    </button>
  </div>
</template>

<style scoped>
div[role='tablist'] {
  scrollbar-width: none;
}

div[role='tablist']::-webkit-scrollbar {
  display: none;
}
</style>