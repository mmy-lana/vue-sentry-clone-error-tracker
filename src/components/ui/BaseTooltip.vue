<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

interface Props {
  content: string;
  placement?: TooltipPlacement;
  /** Milliseconds to wait before showing on hover/focus. */
  delay?: number;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  placement: 'top',
  delay: 160,
  disabled: false
});

const isVisible = ref<boolean>(false);
const wasTapped = ref<boolean>(false);
let timer: number | null = null;

const hasCoarsePointer = computed<boolean>(() => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(hover: none)').matches;
});

function clearTimer(): void {
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
}

function show(immediate = false): void {
  if (props.disabled) return;
  clearTimer();
  if (immediate || props.delay === 0) {
    isVisible.value = true;
    return;
  }
  timer = window.setTimeout(() => {
    isVisible.value = true;
    timer = null;
  }, props.delay);
}

function hide(): void {
  clearTimer();
  isVisible.value = false;
  wasTapped.value = false;
}

/** Touch devices have no hover: the first tap reveals the bubble. */
function handleClick(): void {
  if (!hasCoarsePointer.value) return;
  wasTapped.value = !wasTapped.value;
  isVisible.value = wasTapped.value;
}

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) hide();
  }
);

onBeforeUnmount(clearTimer);

const positionClass = computed<string>(() => {
  switch (props.placement) {
    case 'bottom':
      return 'top-full left-1/2 mt-1.5 -translate-x-1/2';
    case 'left':
      return 'right-full top-1/2 mr-1.5 -translate-y-1/2';
    case 'right':
      return 'left-full top-1/2 ml-1.5 -translate-y-1/2';
    case 'top':
    default:
      return 'bottom-full left-1/2 mb-1.5 -translate-x-1/2';
  }
});
</script>

<template>
  <span
    class="relative inline-flex"
    @mouseenter="show()"
    @mouseleave="hide()"
    @focusin="show(true)"
    @focusout="hide()"
    @click.stop="handleClick"
    @keydown.esc="hide"
  >
    <slot />
    <Transition
      enter-active-class="transition-opacity duration-100"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-75"
      leave-to-class="opacity-0"
    >
      <span
        v-if="isVisible && content"
        role="tooltip"
        class="pointer-events-none absolute z-50 w-max max-w-[min(18rem,calc(100vw-2rem))] rounded-md border border-surface-700 bg-surface-900 px-2 py-1 text-left text-[11px] leading-snug text-slate-200 shadow-xl"
        :class="positionClass"
      >
        {{ content }}
      </span>
    </Transition>
  </span>
</template>