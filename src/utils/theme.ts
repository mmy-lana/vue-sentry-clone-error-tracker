import type { ErrorLevel, IssueStatus } from '../types';

/**
 * Shared visual vocabulary for error levels and issue statuses.
 * Keeping the mappings in one typed module prevents colour drift between the
 * badge primitive, issue rows, breadcrumbs and the detail timeline.
 */

export interface LevelMeta {
  label: string;
  /** Solid swatch used for dots, bars and chart segments. */
  dot: string;
  /** Foreground + border pair for badges and chips. */
  chip: string;
  /** Soft background used for row highlights. */
  surface: string;
}

export const LEVEL_META: Record<ErrorLevel, LevelMeta> = {
  fatal: {
    label: 'Fatal',
    dot: 'bg-rose-500',
    chip: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    surface: 'bg-rose-500/10'
  },
  error: {
    label: 'Error',
    dot: 'bg-rose-400',
    chip: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
    surface: 'bg-orange-500/10'
  },
  warning: {
    label: 'Warning',
    dot: 'bg-amber-400',
    chip: 'bg-amber-400/15 text-amber-200 border-amber-400/30',
    surface: 'bg-amber-400/10'
  },
  info: {
    label: 'Info',
    dot: 'bg-sky-400',
    chip: 'bg-sky-400/15 text-sky-200 border-sky-400/30',
    surface: 'bg-sky-400/10'
  },
  debug: {
    label: 'Debug',
    dot: 'bg-slate-400',
    chip: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
    surface: 'bg-slate-500/10'
  }
};

export const LEVEL_ORDER: ErrorLevel[] = ['fatal', 'error', 'warning', 'info', 'debug'];

export interface StatusMeta {
  label: string;
  chip: string;
  dot: string;
}

export const STATUS_META: Record<IssueStatus, StatusMeta> = {
  unresolved: {
    label: 'Unresolved',
    chip: 'bg-rose-500/15 text-rose-200 border-rose-500/30',
    dot: 'bg-rose-400'
  },
  resolved: {
    label: 'Resolved',
    chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    dot: 'bg-emerald-400'
  },
  ignored: {
    label: 'Ignored',
    chip: 'bg-slate-600/30 text-slate-300 border-slate-500/40',
    dot: 'bg-slate-400'
  }
};

export const STATUS_ORDER: IssueStatus[] = ['unresolved', 'resolved', 'ignored'];

export function levelMeta(level: ErrorLevel): LevelMeta {
  return LEVEL_META[level] ?? LEVEL_META.error;
}

export function statusMeta(status: IssueStatus): StatusMeta {
  return STATUS_META[status] ?? STATUS_META.unresolved;
}

/** `rgb()`/`rgba()` text colour for a level, used by inline SVG charts. */
export const LEVEL_HEX: Record<ErrorLevel, string> = {
  fatal: '#f43f5e',
  error: '#fb923c',
  warning: '#fbbf24',
  info: '#38bdf8',
  debug: '#94a3b8'
};

/** Neutral chip styling for non-level badges (platforms, counts, tags). */
export const NEUTRAL_CHIP = 'bg-slate-700/40 text-slate-300 border-slate-600/50';