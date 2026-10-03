import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { Breadcrumb, ErrorEventInput, ErrorLevel, StackFrame } from '../types';
import { useIssueStore } from './issueStore';

export interface SimulatorPreset {
  id: string;
  label: string;
  description: string;
  level: ErrorLevel;
  build: () => Omit<ErrorEventInput, 'timestamp'>;
}

const VIEWPORTS = ['1920x1080', '1440x900', '393x852', '412x915', '1536x864'];
const BROWSERS = [
  { browser: 'Chrome', browser_version: '122.0.0', os: 'macOS', os_version: '14.3.1' },
  { browser: 'Safari', browser_version: '17.3', os: 'iOS', os_version: '17.3.1' },
  { browser: 'Firefox', browser_version: '123.0', os: 'Windows', os_version: '11' }
];
const IDENTITIES = [
  { id: 'usr_9410', email: 'alex@example.com', username: 'alex' },
  { id: 'usr_2287', email: 'sam@example.com', username: 'sam' },
  { id: 'usr_5534', email: 'riley@example.com', username: 'riley' },
  { id: 'usr_7102', email: 'jordan@example.com', username: 'jordan' }
];
const ENVIRONMENTS = ['production', 'staging', 'development'];

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)] ?? items[0];
}

function frame(partial: Partial<StackFrame> & Pick<StackFrame, 'filename' | 'function' | 'lineno' | 'in_app' | 'context_line'>): StackFrame {
  return {
    id: `frame_${Math.random().toString(36).slice(2, 8)}`,
    colno: 12,
    pre_context: [],
    post_context: [],
    vars: {},
    ...partial
  };
}

function basePayload(level: ErrorLevel, environment: string): {
  project_id: string;
  platform: 'javascript';
  level: ErrorLevel;
  culprit: string;
  breadcrumbs: Breadcrumb[];
  tags: Record<string, string>;
  user: { id: string; email: string; username: string };
  device: {
    browser: string;
    browser_version: string;
    os: string;
    os_version: string;
    viewport: string;
  };
  sdk: { name: string; version: string };
} {
  const device = pick(BROWSERS);
  const identity = pick(IDENTITIES);
  const now = Date.now();

  return {
    project_id: 'default',
    platform: 'javascript',
    level,
    culprit: 'src/services/simulator.ts in emit',
    breadcrumbs: [
      {
        id: `bc_${now}`,
        timestamp: now - 1_500,
        category: 'ui.click',
        type: 'ui.click',
        level: 'info',
        message: 'ui.click on element <button class="simulate">'
      }
    ],
    tags: {
      environment,
      release: `simulator@${new Date(now).toISOString().slice(0, 10)}`,
      transport: 'manual'
    },
    user: { ...identity },
    device: {
      browser: device.browser,
      browser_version: device.browser_version,
      os: device.os,
      os_version: device.os_version,
      viewport: pick(VIEWPORTS)
    },
    sdk: { name: 'vue-sentry-tracker', version: '1.0.0' }
  };
}

export const SIMULATOR_PRESETS: SimulatorPreset[] = [
  {
    id: 'type-error',
    label: 'TypeError',
    description: 'Reading a property of an undefined response payload',
    level: 'error',
    build: () => {
      const payload = basePayload('error', 'production');
      return {
        ...payload,
        message: 'Cannot read properties of undefined (reading "user")',
        exception: {
          type: 'TypeError',
          value: 'Cannot read properties of undefined (reading "user")',
          stacktrace: {
            frames: [
              frame({
                filename: 'node_modules/vue-router/dist/vue-router.mjs',
                function: 'loadRouteLocation',
                lineno: 132,
                in_app: false,
                context_line: '  const component = await loader();'
              }),
              frame({
                filename: 'src/components/domain/details/ContextInspector.vue',
                function: 'setup',
                lineno: 58,
                in_app: true,
                context_line: '  const identity = event.user.display;',
                vars: { event: '{ user: null }' }
              })
            ]
          }
        },
        request: {
          url: '/api/v1/user/settings',
          method: 'GET',
          headers: { accept: 'application/json' }
        }
      };
    }
  },
  {
    id: 'promise-rejection',
    label: 'Promise rejection',
    description: 'Unhandled rejection from a failed checkout call',
    level: 'warning',
    build: () => {
      const payload = basePayload('warning', 'staging');
      return {
        ...payload,
        message: 'Unhandled rejection: checkout session expired',
        exception: {
          type: 'UnhandledRejection',
          value: 'checkout session expired',
          stacktrace: {
            frames: [
              frame({
                filename: 'src/services/checkout.ts',
                function: 'startCheckout',
                lineno: 96,
                in_app: true,
                context_line: "  throw new Error('checkout session expired');",
                vars: { sessionId: '"cs_test_a91f"', attempts: 2 }
              })
            ]
          }
        },
        request: {
          url: '/api/v1/checkout/session',
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{"cartId":"cart_7721"}'
        }
      };
    }
  },
  {
    id: 'http-500',
    label: 'HTTP 500',
    description: 'Server error surfaced by the API client',
    level: 'fatal',
    build: () => {
      const payload = basePayload('fatal', 'production');
      return {
        ...payload,
        message: 'Request failed with status code 500',
        exception: {
          type: 'APIError',
          value: 'Request failed with status code 500',
          stacktrace: {
            frames: [
              frame({
                filename: 'node_modules/axios/lib/core/AxiosError.js',
                function: 'AxiosError',
                lineno: 112,
                in_app: false,
                context_line: '  AxiosError.call(this, message, code, config, request, response);'
              }),
              frame({
                filename: 'src/services/apiClient.ts',
                function: 'request',
                lineno: 88,
                in_app: true,
                context_line: '    throw new APIError(`Request failed with status code ${response.status}`);',
                vars: { status: 500, url: '/api/v1/orders' }
              })
            ]
          }
        },
        request: {
          url: '/api/v1/orders',
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          query_params: { retry: 'false' }
        }
      };
    }
  }
];

export interface SimulatorState {
  isRunning: boolean;
  ratePerMinute: number;
  environment: string;
  presetId: string;
}

/**
 * Real-time error emitter.
 *
 * Implemented as a Pinia store so the timer handle, counters and lifecycle share a
 * single source of truth: every consumer (shell, modal, live stream) works with
 * one instance and therefore one interval, which a component-local composable
 * instance could otherwise duplicate behind the user's back.
 */
export const useSimulatorStore = defineStore('simulator', () => {
  const issueStore = useIssueStore();

  // Presets and environment tags are store state so `storeToRefs` consumers
  // (shell, modal) always receive a defined value.
  const presets = ref<SimulatorPreset[]>(SIMULATOR_PRESETS);
  const environments = ref<string[]>(ENVIRONMENTS);
  const isRunning = ref<boolean>(false);
  const ratePerMinute = ref<number>(12);
  const environment = ref<string>('production');
  const presetId = ref<string>(presets.value[0]?.id ?? 'type-error');
  const lastError = ref<string | null>(null);
  const emittedCount = ref<number>(0);

  let timer: number | null = null;

  const activePreset = computed<SimulatorPreset>(
    () => presets.value.find((preset) => preset.id === presetId.value) ?? presets.value[0]!
  );

  const intervalMs = computed<number>(() => Math.max(250, Math.round(60_000 / Math.max(1, ratePerMinute.value))));

  function stop(): void {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
    isRunning.value = false;
  }

  function start(): void {
    stop();
    isRunning.value = true;
    timer = window.setInterval(() => {
      void emit();
    }, intervalMs.value);
  }

  async function toggle(): Promise<void> {
    if (isRunning.value) stop();
    else start();
  }

  async function emit(preset?: SimulatorPreset): Promise<string | null> {
    const target = preset ?? activePreset.value;
    if (!target) return null;
    try {
      const built = target.build();
      const payload: ErrorEventInput = {
        ...built,
        tags: { ...built.tags, environment: environment.value }
      };

      const result = await issueStore.ingestEvent(payload);
      emittedCount.value += 1;
      lastError.value = null;
      return result.issueId;
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error);
      return null;
    }
  }

  /** Emits a raw JSON payload typed by the operator in the simulator modal. */
  async function emitCustom(json: string): Promise<{ ok: true } | { ok: false; error: string }> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Invalid JSON' };
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ok: false, error: 'Payload must be a JSON object' };
    }

    const record = parsed as Partial<ErrorEventInput> & { level?: string; exception?: { type?: string; value?: string } };

    if (typeof record.level !== 'string' || !['fatal', 'error', 'warning', 'info', 'debug'].includes(record.level)) {
      return { ok: false, error: 'level must be one of fatal, error, warning, info, debug' };
    }

    const payload = {
      ...basePayload(record.level as ErrorLevel, environment.value),
      ...record,
      level: record.level as ErrorLevel,
      message: record.message ?? record.exception?.value ?? 'Custom simulator payload',
      culprit: record.culprit ?? 'custom payload',
      exception: record.exception ?? { type: 'Error', value: record.message ?? 'Custom simulator payload', stacktrace: { frames: [] } },
      tags: { ...(record.tags ?? {}), environment: environment.value, transport: 'custom' }
    };

    try {
      await issueStore.ingestEvent(payload);
      emittedCount.value += 1;
      lastError.value = null;
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError.value = message;
      return { ok: false, error: message };
    }
  }

  function setRate(rate: number): void {
    ratePerMinute.value = Math.min(120, Math.max(1, Math.round(rate)));
    if (isRunning.value) start();
  }

  function setEnvironment(next: string): void {
    environment.value = next;
  }

  function reset(): void {
    stop();
    emittedCount.value = 0;
    lastError.value = null;
  }


  return {
    presets,
    environments,
    isRunning,
    ratePerMinute,
    intervalMs,
    environment,
    presetId,
    activePreset,
    emittedCount,
    lastError,
    start,
    stop,
    toggle,
    emit,
    emitCustom,
    setRate,
    setEnvironment,
    reset
  };
});
