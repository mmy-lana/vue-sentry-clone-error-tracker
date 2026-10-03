import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import type { LocationQuery } from 'vue-router';
import { router } from '../router';
import type { IssueFilterCriteria, IssueStatus, ErrorLevel } from '../types';

export const useFilterStore = defineStore('filter', () => {
  const isHydrating = ref<boolean>(false);

  const criteria = ref<IssueFilterCriteria>({
    search_query: '',
    status: 'unresolved',
    level: 'all',
    environment: 'all',
    time_range_hours: 24,
    sort_by: 'last_seen',
    sort_order: 'desc'
  });

  function syncFromQueryParams(query: LocationQuery): void {
    isHydrating.value = true;
    try {
      if (typeof query.q === 'string') {
        criteria.value.search_query = query.q;
      }
      if (typeof query.status === 'string' && ['all', 'unresolved', 'resolved', 'ignored'].includes(query.status)) {
        criteria.value.status = query.status as IssueStatus | 'all';
      }
      if (typeof query.level === 'string' && ['all', 'fatal', 'error', 'warning', 'info', 'debug'].includes(query.level)) {
        criteria.value.level = query.level as ErrorLevel | 'all';
      }
      if (typeof query.env === 'string') {
        criteria.value.environment = query.env;
      }
      if (typeof query.sort === 'string' && ['last_seen', 'event_count', 'user_count', 'first_seen'].includes(query.sort)) {
        criteria.value.sort_by = query.sort as IssueFilterCriteria['sort_by'];
      }
    } finally {
      isHydrating.value = false;
    }
  }

  watch(
    criteria,
    (newVal) => {
      if (isHydrating.value) return;
      if (router.currentRoute.value.name !== 'issues-list') return;

      const query: Record<string, string> = {};
      if (newVal.search_query) query.q = newVal.search_query;
      if (newVal.status !== 'all') query.status = newVal.status;
      if (newVal.level !== 'all') query.level = newVal.level;
      if (newVal.environment !== 'all') query.env = newVal.environment;
      if (newVal.sort_by !== 'last_seen') query.sort = newVal.sort_by;

      router.replace({ query }).catch(() => {});
    },
    { deep: true }
  );

  return {
    criteria,
    syncFromQueryParams
  };
});
