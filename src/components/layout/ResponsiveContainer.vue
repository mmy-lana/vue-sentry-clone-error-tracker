<script setup lang="ts">
import { computed } from 'vue';
import { useBreakpoints } from '../../composables/useBreakpoints';

interface Props {
  /** Removes the bottom padding reserved for the mobile navigation bar. */
  flushBottom?: boolean;
  /** Constrains the content width (detail pages use a wider rail). */
  width?: 'default' | 'wide' | 'full';
  as?: 'section' | 'div' | 'main';
}

const props = withDefaults(defineProps<Props>(), {
  flushBottom: false,
  width: 'default',
  as: 'section'
});

const { isDetailSplit } = useBreakpoints();

const rootClass = computed<string[]>(() => [
  'mx-auto w-full min-w-0',
  props.width === 'full' ? '' : props.width === 'wide' ? 'max-w-[1600px]' : 'max-w-6xl',
  'px-3 py-3 sm:px-4 sm:py-4',
  isDetailSplit.value ? 'lg:px-6' : '',
  props.flushBottom ? '' : 'pb-24 md:pb-8'
]);

/** Two-column split for the detail view from tablet width up. */
const splitClass = computed<string>(() => (isDetailSplit.value ? 'xl:grid xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:gap-4' : ''));
</script>

<template>
  <component :is="as" :class="rootClass">
    <div :class="splitClass"><slot /></div>
  </component>
</template>