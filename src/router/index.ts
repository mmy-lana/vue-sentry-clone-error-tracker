import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useFilterStore } from '../stores/filterStore';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/issues'
  },
  {
    path: '/issues',
    name: 'issues-list',
    component: () => import('../views/IssuesListView.vue')
  },
  {
    path: '/issues/:id',
    name: 'issue-detail',
    component: () => import('../views/IssueDetailView.vue'),
    props: true
  },
  {
    path: '/stream',
    name: 'live-stream',
    component: () => import('../views/LiveStreamView.vue')
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('../views/SettingsView.vue')
  },
  {
    // Design-system gallery: deliberately unlinked from the navigation so the
    // primitives can be exercised in isolation.
    path: '/ui-kit',
    name: 'ui-kit',
    component: () => import('../views/ComponentGalleryView.vue')
  }
];

export const router = createRouter({
  history: createWebHistory(),
  routes
});

// useFilterStore is invoked strictly inside this navigation guard after createPinia has installed.
router.beforeEach((to, _from, next) => {
  if (to.name === 'issues-list') {
    const filterStore = useFilterStore();
    filterStore.syncFromQueryParams(to.query);
  }
  next();
});

export default router;
