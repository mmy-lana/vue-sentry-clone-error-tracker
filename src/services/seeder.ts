import { db } from './db';
import { computeFingerprint, calculate24HourBuckets } from '../utils/analytics';
import type { ErrorEvent, Issue, StackFrame } from '../types';

export function createSafeStackFrame(
  frame: Partial<StackFrame> & Pick<StackFrame, 'filename' | 'function' | 'lineno' | 'colno' | 'in_app' | 'context_line'>
): StackFrame {
  return {
    id: frame.id || `frame_${Math.random().toString(36).slice(2, 8)}`,
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

export async function seedInitialErrors(): Promise<void> {
  const count = await db.issues.count();
  if (count > 0) return;

  const now = Date.now();

  const mockFrames: StackFrame[] = [
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
      vars: { 'response.data': null, 'userId': 'usr_9410' }
    })
  ];

  const rawEventPayload: Omit<ErrorEvent, 'id' | 'issue_id' | 'fingerprint'> = {
    project_id: 'default',
    timestamp: now - 3600000,
    platform: 'javascript',
    level: 'error',
    message: 'Cannot read properties of undefined (reading "user")',
    culprit: 'src/views/Profile.vue in loadUserProfile',
    exception: {
      type: 'TypeError',
      value: 'Cannot read properties of undefined (reading "user")',
      stacktrace: {
        frames: mockFrames
      }
    },
    breadcrumbs: [
      {
        id: 'bc-1',
        timestamp: now - 3605000,
        category: 'navigation',
        type: 'navigation',
        level: 'info',
        message: 'Navigated to /profile/settings'
      },
      {
        id: 'bc-2',
        timestamp: now - 3602000,
        category: 'http',
        type: 'http',
        level: 'info',
        message: 'GET /api/v1/user/settings [200]'
      }
    ],
    tags: {
      environment: 'production',
      browser: 'Chrome 122',
      os: 'macOS 14.3'
    },
    user: {
      id: 'usr_9410',
      email: 'alex@example.com'
    },
    device: {
      browser: 'Chrome',
      browser_version: '122.0.0',
      os: 'macOS',
      os_version: '14.3.1',
      viewport: '1920x1080'
    },
    sdk: {
      name: 'vue-sentry-tracker',
      version: '1.0.0'
    }
  };

  const fingerprint = computeFingerprint(
    rawEventPayload.exception.type,
    rawEventPayload.message,
    mockFrames
  );

  const issueId = 'issue_seed_001';
  const eventId = 'evt_seed_001';

  await db.transaction('rw', [db.issues, db.events], async () => {
    const seedIssue: Issue = {
      id: issueId,
      project_id: rawEventPayload.project_id,
      fingerprint,
      title: `${rawEventPayload.exception.type}: ${rawEventPayload.message}`,
      culprit: rawEventPayload.culprit,
      level: rawEventPayload.level,
      status: 'unresolved',
      first_seen: rawEventPayload.timestamp,
      last_seen: rawEventPayload.timestamp,
      event_count: 1,
      user_count: 1,
      unique_users: ['usr_9410'],
      environments: ['production'],
      regression_count: 0,
      recent_timestamps: [rawEventPayload.timestamp],
      histogram_24h: calculate24HourBuckets([rawEventPayload.timestamp], now),
      tags_summary: {
        environment: { production: 1 },
        browser: { 'Chrome 122': 1 },
        os: { 'macOS 14.3': 1 }
      }
    };

    const seedEvent: ErrorEvent = {
      ...rawEventPayload,
      id: eventId,
      issue_id: issueId,
      fingerprint
    };

    await db.issues.add(seedIssue);
    await db.events.add(seedEvent);
  });
}
