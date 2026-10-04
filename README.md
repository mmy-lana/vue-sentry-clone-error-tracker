# Bug & Error Tracking Logger Dashboard

A high-fidelity Sentry-style application observability and error tracking dashboard built with Vue 3, TypeScript, Pinia, Vue Router, Dexie.js (IndexedDB), and Tailwind CSS v4. Operates entirely client-side without external cloud dependencies, running deterministic event ingestion, fingerprint deduplication, PII redaction, and call stack analysis directly inside the browser.

- Repository: https://github.com/mmy-lana/vue-sentry-clone-error-tracker
- Live Demo: https://vue-sentry-clone-error-tracker.vercel.app

---

## Overview

This dashboard emulates production-grade error aggregation systems like Sentry. It implements local transaction persistence, cryptographic fingerprinting, bidirectional URL state synchronisation, interactive call stack inspection, and real-time event simulation while enforcing zero-leakage security boundaries.

### Key Capabilities

- Offline-First Storage Engine: Backed by IndexedDB via Dexie.js with live-query reactivity for issues, event streams, and workspace configurations.
- Deterministic Fingerprinting: Error grouping driven by 64-bit FNV-1a digests computed over the most recent in-app stack frame and exception signature.
- Enterprise PII & Credential Redaction: Automated masking of Authorization tokens, session cookies, API keys, bearer tokens, JWTs, and sensitive request payload fields before writing to disk and during render time.
- Interactive Stack Trace Inspection: Syntax-highlighted code blocks with expandable context lines, line numbering, and local execution variable inspectors.
- Breadcrumb Timeline: Chronological activity trails capturing navigation changes, UI click actions, network calls, and console logs with expandable JSON payloads.
- 24-Hour Hour-Aligned Sparklines: Real-time frequency histograms anchored to standard 60-minute time boundaries without sliding-window drift.
- Live Ingestion Stream: Auto-scrolling real-time telemetry stream equipped with pause/resume controls, row count limiting, and an ingestion audit trail drawer.
- Integrated Error Simulator: Built-in engine generating preconfigured exceptions (TypeError, UnhandledRejection, APIError 500) and accepting custom JSON error payloads.
- Headless Chrome Verification: End-to-end automated testing suite driving real browser automation via Puppeteer across layout, security, and concurrency suites.

---

## System Architecture

```
[ Error Source / Simulator / Seeder ]
                  │
                  ▼
         [ utils/redaction.ts ]  <── Redacts PII, headers, tokens, and secrets
                  │
                  ▼
        [ utils/analytics.ts ]   <── Computes 64-bit FNV-1a fingerprint
                  │
                  ▼
         [ stores/issueStore ]   <── Atomic Dexie Read-Modify-Write Transaction
        ┌─────────┴─────────┐
        ▼                   ▼
  [ db.issues ]       [ db.events ] (IndexedDB)
        │                   │
        ▼                   ▼
[ liveQuery Subscriptions & Reactive Pinia Stores ]
        │
        ├─► /issues      : Filterable list with faceted search & bulk triage
        ├─► /issues/:id  : Stepper, stack frames, breadcrumbs, tags & context
        ├─► /stream      : Live incoming event stream with audit drawer
        └─► /settings    : Local preferences, storage metrics & data maintenance
```

### Ingestion Pipeline Guarantees

1. Transaction Atomicity: `issueStore.ingestEvent()` executes reads, aggregation updates, and event insertions inside a single `db.transaction('rw', [db.issues, db.events])` block to prevent write-after-read race conditions.
2. Rolling Timestamp Retention: Issues maintain a rolling window of up to 500 raw timestamps, ensuring 24-hour histogram distributions remain accurate across long lifecycles.
3. Regression Tracking: Issues transitioned to `resolved` that encounter duplicate fingerprints automatically reopen as `unresolved` and increment an audit regression counter.
4. Non-Destructive Event Purging: `clearEventsPreservingIssues()` drops raw event records and zeroes derived telemetry rollups while keeping the issue registry, triage assignments, and status flags intact.

---

## Tech Stack

- Framework: Vue 3 (Composition API, `<script setup lang="ts">`)
- State Management: Pinia
- Routing: Vue Router 4 (with route-level query synchronisation guards)
- Client Database: Dexie.js (IndexedDB wrapper with Observable live queries)
- Utilities: `@vueuse/core` (Window sizing, breakpoints, click-outside bindings)
- Styling: Tailwind CSS v4 (`@tailwindcss/vite` with `@theme` token definitions)
- Build System: Vite
- Type System: TypeScript (Strict mode enabled, `verbatimModuleSyntax`)
- Testing & Verification: Puppeteer Core with Headless Chrome

---

## Project Structure

```
src/
├── assets/
│   └── main.css                     # Tailwind v4 theme directives and surface tokens
├── components/
│   ├── domain/
│   │   ├── details/                 # Stack traces, breadcrumbs, context, and tag tables
│   │   ├── issues/                  # Issue rows, tables, bulk bars, and stat cards
│   │   └── simulator/               # Simulator modal and ingestion audit drawer
│   ├── layout/                      # Sidebar (full/rail/drawer), header, mobile nav
│   ├── molecules/                   # Sparklines, search bar, avatars, and tag groups
│   └── ui/                          # Primitives (button, badge, card, modal, tabs, input)
├── composables/
│   ├── useBreakpoints.ts            # Viewport classification (compact, mobile, tablet, desktop)
│   ├── useErrorEvent.ts             # Issue detail stepper and event reader
│   ├── useIssues.ts                 # List view facade, search, sorting, and pagination
│   ├── useSearchFilter.ts           # Search token parser (is:, level:, env:, user:)
│   └── useSimulator.ts              # Simulator store access facade
├── router/
│   └── index.ts                     # Route registry and query string hydration guards
├── services/
│   ├── db.ts                        # Dexie database instance, schemas, and live queries
│   └── seeder.ts                    # Deterministic mock dataset generator
├── stores/
│   ├── eventStore.ts                # Live stream and issue-scoped event subscriptions
│   ├── filterStore.ts               # Bidirectional URL query synchronization
│   ├── issueStore.ts                # Ingestion pipeline, status mutations, and bulk actions
│   └── simulatorStore.ts            # Centralized simulation timer and preset state
├── types/
│   └── index.ts                     # Strict TypeScript domain contracts
├── utils/
│   ├── analytics.ts                 # 64-bit FNV-1a hashing, 24h bucketing, query lexer
│   ├── date.ts                      # Locale formatters, relative time, and hour floor
│   ├── redaction.ts                 # PII, authorization header, and payload sanitization
│   └── theme.ts                     # Color scales, level tokens, and status maps
└── views/
    ├── ComponentGalleryView.vue     # Isolated UI primitive and component test harness
    ├── IssueDetailView.vue          # Full issue investigation view
    ├── IssuesListView.vue           # Primary issue stream with faceted filters
    ├── LiveStreamView.vue           # Real-time event ingestion feed
    └── SettingsView.vue             # Preferences, storage inspector, and reset tools
```

---

## Getting Started

### Prerequisites

- Node.js: `>= 20.0.0`
- Package Manager: `pnpm` (strictly enforced)

### Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/mmy-lana/vue-sentry-clone-error-tracker.git
cd vue-sentry-clone-error-tracker
pnpm install
```

### Development Server

Start the local Vite development server:

```bash
pnpm run dev
```

The application will be accessible at `http://localhost:5173`.

### Type Checking & Production Build

To run TypeScript verification and bundle production assets:

```bash
# Type check only
pnpm run typecheck

# Full production build
pnpm run build

# Preview production build locally
pnpm run preview
```

---

## Verification & Automated Testing

The repository contains an end-to-end headless Chrome verification harness (`scripts/verify.mjs`) that builds the project, launches an isolated Chrome instance, and executes functional and visual assertions.

Run the full verification suite:

```bash
pnpm run build
pnpm run verify
```

Run a specific verification suite:

```bash
pnpm run verify phase1          # Storage schema, seeding, histogram integrity, routing
pnpm run verify phase2          # UI primitives (focus traps, keyboard navigation, tabs)
pnpm run verify phase3          # Feature components (sparklines, stack frames, breadcrumbs)
pnpm run verify phase4          # Ingestion transactions, deduplication, and regression
pnpm run verify phase5          # Screen assemblies across all responsive viewports
pnpm run verify logic           # Hydration races, scoped metrics, and bucket alignment
pnpm run verify accessibility   # Table grid alignment, touch targets, and ARIA panels
pnpm run verify security        # 64-bit fingerprints, credential redaction, scoped queries
```

Verification screenshots are stored in `.verify/` after execution.

---

## Responsive Breakpoint Matrix

The application layout adapts fluidly across standard viewports without relying on desktop hover traps:

| Breakpoint | Target Viewport | Shell Behavior | Issue Table Layout | Detail View Arrangement |
| :--- | :--- | :--- | :--- | :--- |
| `<= 430px` | Small / Medium Mobile | Drawer menu + fixed bottom navigation bar | Stacked card view; sparkline hidden | Full-width collapsible frames; horizontal code scroll |
| `768px - 1023px` | Tablet / iPad | 64px collapsed icon rail navigation | Compact table rows; sparkline visible | Split view: 60% stack/breadcrumbs, 40% metadata |
| `>= 1024px` | Desktop / Laptop | Full 240px expanded navigation sidebar | Full 7-column table with multi-select bulk bar | Comprehensive two-column inspection workspace |

---

## Security & Privacy Considerations

- Local Data Boundary: All telemetry, stack traces, and preferences reside strictly within client-side IndexedDB. No network requests leave the browser.
- PII Sanitisation: Authorization headers (`Bearer`, `Basic`), `Cookie`, `X-Api-Key`, session identifiers, JWTs, and sensitive payload keys (passwords, tokens, credentials) are masked as `[redacted]` before persistence and at display time.
- Idempotency & Seeding: Database seeding short-circuits if data already exists, ensuring reproducible verification without corrupting user-created records.

---

## License

MIT License. Free for open-source and commercial use.
