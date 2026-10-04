/**
 * Date and number presentation helpers.
 *
 * Every formatter is locale aware through cached `Intl` instances and every
 * function is total: invalid timestamps degrade to a readable placeholder
 * instead of rendering `Invalid Date` into the UI.
 */

export const SECOND_MS = 1_000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;
export const WEEK_MS = 7 * DAY_MS;
export const MONTH_MS = 30 * DAY_MS;

const EMPTY_PLACEHOLDER = '—';

function isValidTimestamp(timestamp: number): boolean {
  return Number.isFinite(timestamp) && timestamp > 0;
}

function createDateFormatter(
  options: Intl.DateTimeFormatOptions,
  locale = 'en-US'
): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale, options);
}

function createNumberFormatter(
  options: Intl.NumberFormatOptions,
  locale = 'en-US'
): Intl.NumberFormat {
  return new Intl.NumberFormat(locale, options);
}

const dateTimeFormatter = createDateFormatter({
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
});

const dateFormatter = createDateFormatter({
  year: 'numeric',
  month: 'short',
  day: '2-digit'
});

const shortDateFormatter = createDateFormatter({
  month: 'short',
  day: 'numeric'
});

const timeFormatter = createDateFormatter({
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
});

const compactNumberFormatter = createNumberFormatter({
  notation: 'compact',
  maximumFractionDigits: 1
});

const exactNumberFormatter = createNumberFormatter({
  maximumFractionDigits: 0
});

/**
 * Human readable "time ago" string, mirroring Sentry's issue stream wording.
 * Future timestamps (clock skew between tabs) render as "in <unit>".
 */
export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  if (!isValidTimestamp(timestamp)) return EMPTY_PLACEHOLDER;

  const delta = now - timestamp;
  const magnitude = Math.abs(delta);

  if (magnitude < 45 * SECOND_MS) return 'just now';

  // Past: "5m ago". Future (clock skew): "in 5m" - never both prepositions.
  const unit =
    magnitude < HOUR_MS
      ? `${Math.floor(magnitude / MINUTE_MS)}m`
      : magnitude < DAY_MS
        ? `${Math.floor(magnitude / HOUR_MS)}h`
        : magnitude < WEEK_MS
          ? `${Math.floor(magnitude / DAY_MS)}d`
          : magnitude < MONTH_MS
            ? `${Math.floor(magnitude / WEEK_MS)}w`
            : null;

  if (unit === null) return formatDate(timestamp);

  return delta >= 0 ? `${unit} ago` : `in ${unit}`;
}

/** Full timestamp used inside tooltips and detail panels. */
export function formatAbsoluteDateTime(timestamp: number): string {
  if (!isValidTimestamp(timestamp)) return EMPTY_PLACEHOLDER;
  return dateTimeFormatter.format(new Date(timestamp));
}

export function formatDate(timestamp: number): string {
  if (!isValidTimestamp(timestamp)) return EMPTY_PLACEHOLDER;
  return dateFormatter.format(new Date(timestamp));
}

export function formatShortDate(timestamp: number): string {
  if (!isValidTimestamp(timestamp)) return EMPTY_PLACEHOLDER;
  return shortDateFormatter.format(new Date(timestamp));
}

export function formatTime(timestamp: number): string {
  if (!isValidTimestamp(timestamp)) return EMPTY_PLACEHOLDER;
  return timeFormatter.format(new Date(timestamp));
}

/** `HH:00`-style axis label for a histogram bucket anchor. */
export function formatHourLabel(hourTimestamp: number): string {
  if (!isValidTimestamp(hourTimestamp)) return EMPTY_PLACEHOLDER;
  const date = new Date(hourTimestamp);
  const hours = String(date.getHours()).padStart(2, '0');
  return `${hours}:00`;
}

/** Elapsed wall time between two anchors, e.g. `3h 12m`. */
export function formatElapsed(startTimestamp: number, endTimestamp: number): string {
  if (!isValidTimestamp(startTimestamp) || !isValidTimestamp(endTimestamp)) {
    return EMPTY_PLACEHOLDER;
  }

  const delta = Math.max(0, endTimestamp - startTimestamp);
  const days = Math.floor(delta / DAY_MS);
  const hours = Math.floor((delta % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((delta % HOUR_MS) / MINUTE_MS);
  const seconds = Math.floor((delta % MINUTE_MS) / SECOND_MS);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** Duration between the event timestamp and "now", rendered as `x ago`. */
export function formatAge(timestamp: number, now: number = Date.now()): string {
  return formatRelativeTime(timestamp, now);
}

/** Compact counter formatting for event/user tallies (`1.2k`). */
export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return compactNumberFormatter.format(Math.max(0, value));
}

export function formatExactNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return exactNumberFormatter.format(value);
}

/** Percentage of `value` inside `total`, clamped to `[0, 100]`. */
export function formatPercentage(value: number, total: number): string {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return '0%';
  const ratio = (value / total) * 100;
  return `${Math.min(100, Math.max(0, ratio)).toFixed(1)}%`;
}

/** True when both anchors land on the same calendar day in local time. */
export function isSameDay(a: number, b: number): boolean {
  if (!isValidTimestamp(a) || !isValidTimestamp(b)) return false;
  const first = new Date(a);
  const second = new Date(b);
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

/** Epoch milliseconds of the most recent completed hour boundary. */
export function floorToHour(timestamp: number): number {
  if (!isValidTimestamp(timestamp)) return 0;
  return Math.floor(timestamp / HOUR_MS) * HOUR_MS;
}