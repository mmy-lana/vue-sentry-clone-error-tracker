<script setup lang="ts">
import BaseButton from '../../ui/BaseButton.vue';

interface Props {
  selectedCount: number;
  isProcessing?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isProcessing: false
});

const emit = defineEmits<{
  (event: 'resolve'): void;
  (event: 'ignore'): void;
  (event: 'delete'): void;
  (event: 'clear'): void;
}>();
</script>

<template>
  <Transition
    enter-active-class="transition duration-150 ease-out"
    enter-from-class="opacity-0 translate-y-3"
    leave-active-class="transition duration-100 ease-in"
    leave-to-class="opacity-0 translate-y-3"
  >
    <div
      v-if="selectedCount > 0"
      data-testid="issue-bulk-bar"
      class="safe-area-bottom pointer-events-auto fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3"
      role="region"
      aria-label="Bulk issue actions"
    >
      <div
        class="pointer-events-auto flex w-full max-w-[calc(100vw-1.5rem)] flex-wrap items-center gap-2 rounded-xl border border-surface-700 bg-surface-900/95 px-3 py-2 shadow-2xl shadow-black/50 backdrop-blur"
      >
        <span class="whitespace-nowrap text-xs font-medium text-slate-200" data-testid="bulk-count">
          {{ selectedCount }} selected
        </span>

        <span class="hidden h-4 w-px bg-surface-700 sm:block" aria-hidden="true" />

        <div class="flex flex-1 items-center justify-end gap-2">
          <BaseButton
            variant="secondary"
            size="sm"
            :disabled="props.isProcessing"
            @click="emit('resolve')"
          >
            Resolve
          </BaseButton>
          <BaseButton
            variant="ghost"
            size="sm"
            :disabled="props.isProcessing"
            @click="emit('ignore')"
          >
            Ignore
          </BaseButton>
          <BaseButton
            variant="danger"
            size="sm"
            :disabled="props.isProcessing"
            @click="emit('delete')"
          >
            Delete
          </BaseButton>
          <BaseButton
            variant="ghost"
            size="sm"
            aria-label="Clear selection"
            :disabled="props.isProcessing"
            @click="emit('clear')"
          >
            ✕
          </BaseButton>
        </div>
      </div>
    </div>
  </Transition>
</template>