import { db } from './db';
import { calculate24HourBuckets, computeFingerprint } from '../utils/analytics';
import { redactRequest } from '../utils/redaction';
import { MINUTE_MS } from '../utils/date';
import type { Breadcrumb, ErrorEvent, Issue, IssueStatus, StackFrame } from '../types';

const HOUR = 3600000;

/**
 * Deterministic PRNG (mulberry32). The seeder must produce a stable dataset so
 * screenshots, regression checks and filter tests stay reproducible.
 */
function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SeedSummary {
  issuesCreated: number;
  eventsCreated: number;
  skipped: boolean;
}

export function createSafeStackFrame(
  frame: Partial<StackFrame> &
    Pick<StackFrame, 'filename' | 'function' | 'lineno' | 'colno' | 'in_app' | 'context_line'>
): StackFrame {
  return {
    id: frame.id ?? `frame_${Math.random().toString(36).slice(2, 8)}`,
    filename: frame.filename,
    function: frame.function,
    lineno: frame.lineno,
    colno: frame.colno,
    in_app: frame.in_app,
    pre_context: frame.pre_context ?? [],
    context_line: frame.context_line,
    post_context: frame.post_context ?? [],
    vars: frame.vars ?? {}
  };
}

interface SeedScenario {
  exceptionType: string;
  message: string;
  culprit: string;
  level: Issue['level'];
  environment: string;
  status: IssueStatus;
  eventCount: number;
  userCount: number;
  regressionCount: number;
  assignedTo?: string;
  frames: StackFrame[];
  requestPath?: string;
}

const SEEDED_USERS = [
  { id: 'usr_9410', email: 'alex@example.com', username: 'alex', ip_address: '203.0.113.14' },
  { id: 'usr_2287', email: 'sam@example.com', username: 'sam', ip_address: '203.0.113.88' },
  { id: 'usr_5534', email: 'riley@example.com', username: 'riley', ip_address: '198.51.100.7' },
  { id: 'usr_7102', email: 'jordan@example.com', username: 'jordan', ip_address: '198.51.100.51' },
  { id: 'usr_8846', email: 'casey@example.com', username: 'casey', ip_address: '192.0.2.19' }
];

const DEVICES = [
  { browser: 'Chrome', browser_version: '122.0.0', os: 'macOS', os_version: '14.3.1', viewport: '1920x1080' },
  { browser: 'Safari', browser_version: '17.3', os: 'iOS', os_version: '17.3.1', device_model: 'iPhone 15 Pro', viewport: '393x852' },
  { browser: 'Firefox', browser_version: '123.0', os: 'Windows', os_version: '11', viewport: '1536x864' },
  { browser: 'Chrome', browser_version: '121.0.0', os: 'Android', os_version: '14', device_model: 'Pixel 8', viewport: '412x915' }
];

const SCENARIOS: SeedScenario[] = [
  {
    exceptionType: 'TypeError',
    message: 'Cannot read properties of undefined (reading "user")',
    culprit: 'src/views/Profile.vue in loadUserProfile',
    level: 'error',
    environment: 'production',
    status: 'unresolved',
    eventCount: 34,
    userCount: 5,
    regressionCount: 0,
    assignedTo: 'unassigned',
    requestPath: '/api/v1/user/settings',
    frames: [
      createSafeStackFrame({
        filename: 'src/services/apiClient.ts',
        function: 'request',
        lineno: 84,
        colno: 15,
        in_app: false,
        pre_context: ['  const headers = getHeaders();', '  const response = await fetch(url, options);'],
        context_line: '  if (!response.ok) throw new Error(response.statusText);',
        post_context: ['  return response.json();', '}']
      }),
      createSafeStackFrame({
        filename: 'src/views/Profile.vue',
        function: 'loadUserProfile',
        lineno: 42,
        colno: 12,
        in_app: true,
        pre_context: ['const route = useRoute();', 'async function loadUserProfile() {'],
        context_line: '  const name = response.data.user.name;',
        post_context: ['  userName.value = name;', '}'],
        vars: { 'response.data': null, 'userId': 'usr_9410', 'route.params': '{ id: "9410" }' }
      })
    ]
  },
  {
    exceptionType: 'APIError',
    message: 'Request failed with status code 500',
    culprit: 'src/services/apiClient.ts in request',
    level: 'fatal',
    environment: 'production',
    status: 'unresolved',
    eventCount: 12,
    userCount: 4,
    regressionCount: 1,
    requestPath: '/api/v1/checkout/submit',
    frames: [
      createSafeStackFrame({
        filename: 'node_modules/axios/lib/core/AxiosError.js',
        function: 'AxiosError',
        lineno: 112,
        colno: 8,
        in_app: false,
        pre_context: ['function AxiosError(message, code, config, request, response) {'],
        context_line: '  AxiosError.call(this, message, code, config, request, response);',
        post_context: ['}']
      }),
      createSafeStackFrame({
        filename: 'src/services/apiClient.ts',
        function: 'request',
        lineno: 88,
        colno: 7,
        in_app: true,
        pre_context: ['  const response = await fetch(url, options);', '  if (!response.ok) {'],
        context_line: '    throw new APIError(`Request failed with status code ${response.status}`);',
        post_context: ['  }', '  return response.json();'],
        vars: { 'url': '/api/v1/checkout/submit', 'status': 500, 'attempt': 3 }
      })
    ]
  },
  {
    exceptionType: 'ValidationError',
    message: 'field "email" must be a valid address',
    culprit: 'src/components/forms/UserForm.vue in validate',
    level: 'warning',
    environment: 'staging',
    status: 'unresolved',
    eventCount: 9,
    userCount: 3,
    regressionCount: 0,
    requestPath: '/api/v1/users',
    frames: [
      createSafeStackFrame({
        filename: 'src/components/forms/UserForm.vue',
        function: 'validate',
        lineno: 57,
        colno: 18,
        in_app: true,
        pre_context: ['const rules = { email: requiredEmail, name: requiredName };'],
        context_line: "    throw new ValidationError(`field \"${key}\" must be a valid address`);",
        post_context: ['  }', '  return rules;'],
        vars: { 'key': 'email', 'value': '"not-an-email"' }
      })
    ]
  },
  {
    exceptionType: 'NetworkError',
    message: 'Failed to fetch',
    culprit: 'src/composables/useSession.ts in refreshSession',
    level: 'error',
    environment: 'production',
    status: 'unresolved',
    eventCount: 21,
    userCount: 5,
    regressionCount: 0,
    requestPath: '/api/v1/auth/session',
    frames: [
      createSafeStackFrame({
        filename: 'src/composables/useSession.ts',
        function: 'refreshSession',
        lineno: 31,
        colno: 22,
        in_app: true,
        pre_context: ['const session = ref<Session | null>(null);', 'async function refreshSession() {'],
        context_line: '  const res = await fetch(SESSION_ENDPOINT, { credentials: "include" });',
        post_context: ['  session.value = await res.json();', '}'],
        vars: { 'SESSION_ENDPOINT': '/api/v1/auth/session', 'offline': true }
      })
    ]
  },
  {
    exceptionType: 'ReferenceError',
    message: 'ResizeObserver is not defined',
    culprit: 'src/components/layout/ResponsiveContainer.vue in observe',
    level: 'warning',
    environment: 'production',
    status: 'resolved',
    eventCount: 7,
    userCount: 2,
    regressionCount: 1,
    assignedTo: 'frontend-guild',
    frames: [
      createSafeStackFrame({
        filename: 'src/components/layout/ResponsiveContainer.vue',
        function: 'observe',
        lineno: 18,
        colno: 20,
        in_app: true,
        pre_context: ['import { onMounted, onBeforeUnmount } from "vue";', 'onMounted(() => {'],
        context_line: '  observer = new ResizeObserver(handleResize);',
        post_context: ['  observer.observe(root);', '});'],
        vars: { 'root': 'HTMLElement', 'observer': 'undefined' }
      })
    ]
  },
  {
    exceptionType: 'ChunkLoadError',
    message: 'Loading chunk 42 failed',
    culprit: 'src/router/index.ts in loadRouteLocation',
    level: 'error',
    environment: 'production',
    status: 'ignored',
    eventCount: 46,
    userCount: 5,
    regressionCount: 2,
    frames: [
      createSafeStackFrame({
        filename: 'src/router/index.ts',
        function: 'loadRouteLocation',
        lineno: 64,
        colno: 11,
        in_app: true,
        pre_context: ['const loaders: Record<string, () => Promise<unknown>> = {', '  "issue-detail": () => import("../views/IssueDetailView.vue")'],
        context_line: '    throw new ChunkLoadError(`Loading chunk ${chunkId} failed`);',
        post_context: ['  }', '}'],
        vars: { 'chunkId': 42, 'targetRoute': 'issue-detail' }
      })
    ]
  },
  {
    exceptionType: 'RangeError',
    message: 'Maximum call stack size exceeded',
    culprit: 'src/utils/analytics.ts in computeFingerprint',
    level: 'fatal',
    environment: 'development',
    status: 'unresolved',
    eventCount: 3,
    userCount: 1,
    regressionCount: 0,
    frames: [
      createSafeStackFrame({
        filename: 'src/utils/analytics.ts',
        function: 'computeFingerprint',
        lineno: 12,
        colno: 24,
        in_app: true,
        pre_context: ['const inAppFrames = frames.filter((frame) => frame.in_app);'],
        context_line: '  const targetFrame = inAppFrames.length > 0 ? inAppFrames[inAppFrames.length - 1] : frames[frames.length - 1];',
        post_context: ['  let raw = `${type}:`;'],
        vars: { 'frames.length': 12048, 'inAppFrames.length': 0 }
      })
    ]
  }
];

function buildBreadcrumbs(scenario: SeedScenario, eventTimestamp: number, index: number): Breadcrumb[] {
  const crumbs: Breadcrumb[] = [
    {
      id: `bc-${index}-nav`,
      timestamp: eventTimestamp - 95_000,
      category: 'navigation',
      type: 'navigation',
      level: 'info',
      message: 'Navigated to /issues'
    },
    {
      id: `bc-${index}-click`,
      timestamp: eventTimestamp - 41_000,
      category: 'ui.click',
      type: 'ui.click',
      level: 'info',
      message: 'ui.click on element <button class="refresh">'
    }
  ];

  if (scenario.requestPath) {
    crumbs.push({
      id: `bc-${index}-http`,
      timestamp: eventTimestamp - 12_000,
      category: 'http',
      type: 'http',
      level: scenario.level === 'fatal' ? 'error' : 'info',
      message: `GET ${scenario.requestPath} [${scenario.level === 'fatal' ? 500 : 200}]`,
      data: { url: scenario.requestPath, status_code: scenario.level === 'fatal' ? 500 : 200 }
    });
  }

  crumbs.push({
    id: `bc-${index}-console`,
    timestamp: eventTimestamp - 2_000,
    category: 'console',
    type: 'console',
    level: 'warning',
    message: `[Tracker] preparing ${scenario.exceptionType} report`
  });

  return crumbs.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Idempotent seeder. Writes straight to IndexedDB so boot never depends on
 * Pinia store hydration, and short-circuits when issues already exist.
 */
export async function seedInitialErrors(): Promise<SeedSummary> {
  const existingIssues = await db.issues.count();
  if (existingIssues > 0) {
    return { issuesCreated: 0, eventsCreated: 0, skipped: true };
  }

  const now = Date.now();
  const random = createSeededRandom(0x5eed1234);

  const issues: Issue[] = [];
  const events: ErrorEvent[] = [];

  SCENARIOS.forEach((scenario, scenarioIndex) => {
    const fingerprint = computeFingerprint(
      scenario.exceptionType,
      scenario.message,
      scenario.frames
    );
    const issueId = `issue_seed_${String(scenarioIndex + 1).padStart(3, '0')}`;
    const timestamps: number[] = [];
    const tagsSummary: Record<string, Record<string, number>> = {};

    for (let eventIndex = 0; eventIndex < scenario.eventCount; eventIndex += 1) {
      const user = SEEDED_USERS[(scenarioIndex + eventIndex) % scenario.userCount];
      const device = DEVICES[Math.floor(random() * DEVICES.length)];
      const ageMs = Math.round(
        random() * (23 * HOUR + 45 * MINUTE_MS)
      );
      const timestamp = now - ageMs;
      timestamps.push(timestamp);

      const tags: Record<string, string> = {
        environment: scenario.environment,
        browser: `${device.browser} ${device.browser_version.split('.')[0]}`,
        os: `${device.os} ${device.os_version}`,
        release: `dashboard@${(eventIndex % 4) + 1}.${scenarioIndex}.0`
      };

      for (const [key, value] of Object.entries(tags)) {
        const bucket = tagsSummary[key] ?? (tagsSummary[key] = {});
        bucket[value] = (bucket[value] ?? 0) + 1;
      }

      const eventId = `evt_seed_${String(scenarioIndex + 1).padStart(3, '0')}_${String(
        eventIndex + 1
      ).padStart(3, '0')}`;

      const event: ErrorEvent = {
        id: eventId,
        issue_id: issueId,
        project_id: 'default',
        timestamp,
        platform: 'vue',
        level: scenario.level,
        message: scenario.message,
        culprit: scenario.culprit,
        fingerprint,
        exception: {
          type: scenario.exceptionType,
          value: scenario.message,
          stacktrace: { frames: scenario.frames }
        },
        breadcrumbs: buildBreadcrumbs(scenario, timestamp, eventIndex),
        tags,
        user: { ...user },
        request: scenario.requestPath
          ? redactRequest({
              url: scenario.requestPath,
              method: 'GET',
              headers: {
                accept: 'application/json',
                'x-request-id': `req_${eventId}`
              },
              query_params: { locale: 'en-US' }
            })
          : undefined,
        device: { ...device },
        sdk: {
          name: 'vue-sentry-tracker',
          version: '1.0.0'
        }
      };

      events.push(event);
    }

    const sortedTimestamps = [...timestamps].sort((a, b) => a - b);
    const usersSeen = new Set(timestamps.map((_, i) => SEEDED_USERS[(scenarioIndex + i) % scenario.userCount].id));

    const issue: Issue = {
      id: issueId,
      project_id: 'default',
      fingerprint,
      title: `${scenario.exceptionType}: ${scenario.message}`,
      culprit: scenario.culprit,
      level: scenario.level,
      status: scenario.status,
      first_seen: sortedTimestamps[0] ?? now,
      last_seen: sortedTimestamps[sortedTimestamps.length - 1] ?? now,
      event_count: scenario.eventCount,
      user_count: usersSeen.size,
      unique_users: Array.from(usersSeen),
      environments: [scenario.environment],
      regression_count: scenario.regressionCount,
      recent_timestamps: sortedTimestamps,
      histogram_24h: calculate24HourBuckets(sortedTimestamps, now),
      tags_summary: tagsSummary,
      ...(scenario.assignedTo ? { assigned_to: scenario.assignedTo } : {})
    };

    issues.push(issue);
  });

  await db.transaction('rw', [db.issues, db.events], async () => {
    await db.issues.bulkAdd(issues);
    await db.events.bulkAdd(events);
  });

  return { issuesCreated: issues.length, eventsCreated: events.length, skipped: false };
}

/** Remove every seeded and user-created row (settings screen reset action). */
export async function clearAllErrors(): Promise<void> {
  await db.transaction('rw', [db.issues, db.events], async () => {
    await db.issues.clear();
    await db.events.clear();
  });
}