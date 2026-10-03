<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useAttrs, watch } from 'vue';

interface Props {
  isOpen: boolean;
  title?: string;
  description?: string;
  /** Tailwind max-width class for the dialog shell. */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Disables backdrop dismissal for destructive confirmations. */
  persistent?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  title: undefined,
  description: undefined,
  size: 'md',
  persistent: false
});

const emit = defineEmits<{
  (event: 'close'): void;
}>();

const SIZE_CLASSES: Record<NonNullable<Props['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl'
};

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const dialogRef = ref<HTMLDivElement | null>(null);

// The component root is a Teleport, so fallthrough attributes are bound to the
// dialog panel explicitly (keeps `data-testid` and ARIA hints on the dialog).
const attrs = useAttrs();
let previouslyFocused: HTMLElement | null = null;

function focusableElements(): HTMLElement[] {
  if (!dialogRef.value) return [];
  return Array.from(dialogRef.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.offsetParent !== null || element === document.activeElement
  );
}

function handleKeydown(event: KeyboardEvent): void {
  if (!props.isOpen) return;

  if (event.key === 'Escape') {
    event.stopPropagation();
    emit('close');
    return;
  }

  if (event.key !== 'Tab') return;

  const focusables = focusableElements();
  if (focusables.length === 0) {
    event.preventDefault();
    return;
  }

  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement as HTMLElement | null;

  if (event.shiftKey && (active === first || !dialogRef.value?.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

function lockScroll(locked: boolean): void {
  if (locked) {
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
  }
}

watch(
  () => props.isOpen,
  async (open) => {
    lockScroll(open);
    if (open) {
      previouslyFocused = document.activeElement as HTMLElement | null;
      await nextTick();
      const [first] = focusableElements();
      (first ?? dialogRef.value)?.focus();
      document.addEventListener('keydown', handleKeydown, true);
    } else {
      document.removeEventListener('keydown', handleKeydown, true);
      previouslyFocused?.focus();
      previouslyFocused = null;
    }
  }
);

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown, true);
  lockScroll(false);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 backdrop-blur-sm sm:items-center sm:p-4"
      :aria-hidden="undefined"
      @click.self="!persistent && emit('close')"
    >
      <div
        v-bind="attrs"
        ref="dialogRef"
        role="dialog"
        aria-modal="true"
        :aria-label="title ?? 'Dialog'"
        tabindex="-1"
        class="flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-xl border border-surface-700 bg-surface-900 shadow-2xl sm:rounded-xl"
        :class="SIZE_CLASSES[size]"
      >
        <header
          v-if="title || description || $slots.header || $slots.actions"
          class="flex shrink-0 items-start justify-between gap-3 border-b border-surface-700/60 px-4 py-3"
        >
          <div class="min-w-0">
            <slot name="header">
              <h2 v-if="title" class="text-base font-semibold text-slate-100">
                {{ title }}
              </h2>
              <p v-if="description" class="mt-0.5 text-xs text-slate-400">
                {{ description }}
              </p>
            </slot>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <slot name="actions" />
            <button
              type="button"
              class="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-surface-800 hover:text-slate-100"
              aria-label="Close dialog"
              @click="emit('close')"
            >
              <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </header>

        <div class="scrollbar-thin flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          <slot />
        </div>

        <footer
          v-if="$slots.footer"
          class="safe-area-bottom flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-surface-700/60 px-4 py-3"
        >
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>