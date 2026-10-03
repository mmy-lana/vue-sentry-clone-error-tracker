import {
  breakpointsTailwind,
  useBreakpoints as useVueUseBreakpoints,
  useWindowSize
} from '@vueuse/core';
import { computed } from 'vue';

export type ViewportClass = 'compact' | 'mobile' | 'tablet' | 'desktop';
export type SidebarMode = 'hidden' | 'rail' | 'full';

/**
 * Screen classification used by the shell and every responsive branch.
 *
 * Widths follow the project breakpoint matrix:
 *   <=430px  compact phone (single-column cards, bottom navigation)
 *   <768px   phone / large phone
 *   <1024px  tablet (icon rail, two-column detail)
 *   >=1024px desktop (full 240px sidebar, grid table)
 */
export function useBreakpoints() {
  const breakpoints = useVueUseBreakpoints(breakpointsTailwind);
  const { width } = useWindowSize();

  const viewportClass = computed<ViewportClass>(() => {
    if (width.value <= 430) return 'compact';
    if (width.value < 768) return 'mobile';
    if (width.value < 1024) return 'tablet';
    return 'desktop';
  });

  const isCompact = computed<boolean>(() => viewportClass.value === 'compact');
  const isMobile = computed<boolean>(() => width.value < 768);
  const isTablet = computed<boolean>(() => width.value >= 768 && width.value < 1024);
  const isDesktop = computed<boolean>(() => width.value >= 1024);

  const sidebarMode = computed<SidebarMode>(() => {
    if (width.value < 768) return 'hidden';
    if (width.value < 1024) return 'rail';
    return 'full';
  });

  /** Detail view splits into stack + context columns from tablet width up. */
  const isDetailSplit = computed<boolean>(() => width.value >= 768);

  /** The issue table renders as cards below the `md` breakpoint. */
  const isTableLayout = computed<boolean>(() => width.value >= 768);

  return {
    breakpoints,
    width,
    viewportClass,
    isCompact,
    isMobile,
    isTablet,
    isDesktop,
    sidebarMode,
    isDetailSplit,
    isTableLayout
  };
}