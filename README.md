# Bug & Error Tracking Logger Dashboard

A Sentry-style error tracking dashboard built with Vue 3, TypeScript, Pinia, Vue Router,
Dexie (IndexedDB) and Tailwind CSS v4. Everything runs entirely in the browser — issues,
events and preferences are stored locally, no backend required.

## Scripts

```bash
pnpm install          # install dependencies
pnpm run dev          # Vite dev server
pnpm run build        # vue-tsc --noEmit && vite build
pnpm run typecheck    # vue-tsc only
pnpm run preview      # serve the production build
pnpm run verify       # headless-Chrome verification of all five phases
pnpm run verify phase3   # run a single phase suite
```

`pnpm run verify` builds nothing by itself: run `pnpm run build` first. The harness starts
`vite preview`, drives the app in a real headless Google Chrome instance with a throwaway
profile (your own browsers are never touched) and asserts behaviour, responsive layout and
runtime errors. Screenshots land in `.verify/`.

Suites run in this order:

| Suite | Scope |
| --- | --- |
| `phase1` | Storage schema, seeding, histogram integrity, routing |
| `phase2` | Atomic primitives (focus trap, keyboard, dropdowns, pagination) |
| `phase3` | Feature components (rows, sparkline, stack frames, breadcrumbs, tags) |
| `phase4` | Ingestion pipeline: create, merge, regression, delete, orphan guard |
| `phase5` | Product screens plus the 360/390/430/768/1280 responsive matrix |
| `logic` | Hydration race, scoped metrics, hour-aligned buckets, tag shares, tag labels |
| `accessibility` | Grid alignment, row activation targets, tab panels, relative time |
| `security` | Fingerprint width, credential redaction, issue-scoped queries, singleton engine |

## Architecture

| Layer | Location | Responsibility |
| --- | --- | --- |
| Types | `src/types/index.ts` | Pure domain contracts (issues, events, frames, breadcrumbs, filters) |
| Storage | `src/services/db.ts` | Dexie schema plus `liveQuery` observables for issues, events, settings |
| Seeding | `src/services/seeder.ts` | Deterministic, idempotent demo dataset written straight to IndexedDB |
| Domain utils | `src/utils/analytics.ts` | Fingerprinting, 24h bucketing, search-query lexer |
| Presentation utils | `src/utils/date.ts`, `src/utils/theme.ts` | Relative time, counters, level/status visual vocabulary |
| State | `src/stores/*` | Atomic ingestion with regression tracking, event grouping, URL-synced filters |
| Composables | `src/composables/*` | Issue list facade, search matching, event read model, simulator, breakpoints |
| UI | `src/components/ui` | Atomic primitives (button, badge, card, input, checkbox, modal, dropdown, tabs, tooltip, pagination) |
| Feature UI | `src/components/molecules`, `src/components/domain` | Sparklines, search bar, issue rows/table/bulk bar, stack frames, breadcrumbs, context inspector, tag distribution, simulator |
| Shell | `src/components/layout` | Header, sidebar (full/rail/drawer), mobile bottom nav, responsive container |

### Routes

| Route | Purpose |
| --- | --- |
| `/issues` | Issue stream with facets, search operators, bulk actions, pagination |
| `/issues/:id` | Detail view: resolution toolbar, event stepper, stack frames, breadcrumbs, context, tags |
| `/stream` | Live ingestion feed with pause, manual triggers and the ingestion log drawer |
| `/settings` | Persisted preferences and local storage maintenance |
| `/ui-kit` | Design-system gallery (unlinked) used by the verification harness |

Filter state is bidirectional: the router guard hydrates the filter store from the query
string, and store changes are debounced back into the URL (`?q=&status=&level=&env=&range=&sort=&order=`).

## Responsive matrix

| Width | Shell | Issue list | Detail |
| --- | --- | --- | --- |
| ≤430px | Drawer + bottom nav | Stacked cards, hidden sparkline | Collapsible full-width frames, horizontal code scroll |
| 768px | 64px icon rail | Compact rows, sparkline visible | Two-column detail |
| ≥1024px | 240px sidebar | Full grid, users, bulk checkboxes | Side-by-side stack trace + context inspector |

## Ingestion pipeline

`issueStore.ingestEvent()` performs the read-modify-write inside a single Dexie transaction:

1. compute the fingerprint (last in-app frame, else normalised message),
2. update or create the issue (rolling 500-timestamp window, unique users, environments,
   tag frequencies, 24h histogram, regression counter when a resolved issue re-opens),
3. insert the event,
4. append an entry to the session ingestion log.

The simulator (`stores/simulatorStore.ts`, a Pinia singleton so only one interval can exist)
and the demo seeder write through this same path, so every row on screen reflects a real
IndexedDB transaction.

### Security and integrity guarantees

- **Credential redaction** (`src/utils/redaction.ts`): authorization, cookie, API-key and
  session headers, sensitive query parameters and JSON/form payload fields are masked both
  before the event is written to IndexedDB and again at render time, so legacy rows are
  covered too. Non-sensitive fields are preserved.
- **Fingerprints** use FNV-1a 64-bit (`hash64`), rendered as 16 hex characters, so unrelated
  exception signatures cannot collide into one issue group.
- **Event-only purge**: `clearEventsPreservingIssues()` deletes events and zeroes derived
  counters while keeping issue identity, status and assignments.
- **Scoped reads**: the detail view queries `events.where('issue_id')` through a live
  subscription, so issues whose events fall outside the live-stream window remain fully
  inspectable.