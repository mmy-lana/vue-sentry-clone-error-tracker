import { computed } from 'vue';
import { parseSearchFilter, type ParsedSearchQuery } from '../utils/analytics';
import type { Issue } from '../types';
import { LEVEL_ORDER, STATUS_ORDER } from '../utils/theme';

/**
 * Search-query interpretation shared by the filter bar and the list view.
 * Operators (`is:`, `level:`, `env:`, `user:`) are parsed out of the query and
 * everything left over becomes free text matched against the issue fields.
 */
export function useSearchFilter(query: () => string) {
  const parsed = computed<ParsedSearchQuery>(() => parseSearchFilter(query()));

  const status = computed(() => parsed.value.status ?? null);
  const level = computed(() => parsed.value.level ?? null);
  const environment = computed(() => parsed.value.environment ?? null);
  const user = computed(() => parsed.value.user ?? null);
  const freeText = computed(() => parsed.value.rawText.trim().toLowerCase());
  const isEmpty = computed(() => query().trim().length === 0);

  const suggestions = computed<string[]>(() => [
    ...STATUS_ORDER.map((status) => `is:${status}`),
    ...LEVEL_ORDER.map((level) => `level:${level}`),
    'env:production',
    'env:staging',
    'env:development'
  ]);

  function matches(issue: Issue): boolean {
    if (status.value && issue.status !== status.value) return false;
    if (level.value && issue.level !== level.value) return false;
    if (environment.value && !issue.environments.includes(environment.value)) return false;
    if (user.value && !issue.unique_users.includes(user.value)) return false;

    if (freeText.value.length === 0) return true;

    const haystack = [
      issue.title,
      issue.culprit,
      issue.fingerprint,
      issue.assigned_to ?? '',
      ...issue.environments,
      ...issue.unique_users,
      ...Object.entries(issue.tags_summary).map(([key, values]) => `${key} ${Object.keys(values).join(' ')}`)
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(freeText.value);
  }

  return { parsed, status, level, environment, user, freeText, isEmpty, suggestions, matches };
}