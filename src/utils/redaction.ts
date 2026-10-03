import type { RequestContext } from '../types';

/**
 * Credential and PII sanitisation.
 *
 * Ingestion writes requests through {@link redactRequest} and every consumer
 * renders the redacted shape again, so secrets never reach IndexedDB or the DOM
 * even if an event was captured by an older build.
 */
export const REDACTED = '[redacted]';

/** Header names masked wholesale, regardless of the value they carry. */
export const SENSITIVE_HEADERS: readonly string[] = [
  'authorization',
  'proxy-authorization',
  'authentication',
  'cookie',
  'set-cookie',
  'x-api-key',
  'apikey',
  'api-key',
  'x-auth-token',
  'x-access-token',
  'x-refresh-token',
  'x-session-token',
  'x-csrf-token',
  'x-xsrf-token',
  'x-amz-security-token',
  'x-client-secret',
  'x-key',
  'x-token',
  'x-session-id',
  'private-token'
];

const SENSITIVE_HEADER_SET = new Set(SENSITIVE_HEADERS);

/** Object/JSON keys whose values are replaced by {@link REDACTED}. */
const SENSITIVE_KEY_PATTERN =
  /(^|[-_])(pass(word|wd)?|secret|token|api[-_]?key|auth|credential|private[-_]?key|session|otp|cvv|cvc|card[-_]?number|cardnumber|pan|iban|ssn|tax[-_]?id)($|[-_])/i;

interface TextPattern {
  pattern: RegExp;
  replace: string | ((match: string, ...groups: string[]) => string);
}

const TEXT_PATTERNS: TextPattern[] = [
  { pattern: /\bBearer\s+[\w\-.~+/]+=*/gi, replace: `Bearer ${REDACTED}` },
  { pattern: /\bBasic\s+[\w+/=]{8,}/gi, replace: `Basic ${REDACTED}` },
  { pattern: /\beyJ[\w-]{6,}\.[\w-]+\.[\w-]+/g, replace: REDACTED },
  {
    pattern: /\b(session|sid|sessid|jsessionid)=([^;\s]+)/gi,
    replace: (_match: string, key: string) => `${key}=${REDACTED}`
  },
  {
    pattern: /\b(access_token|refresh_token|id_token|api_key|apikey|password|passwd|secret)=([^&\s]+)/gi,
    replace: (_match: string, key: string) => `${key}=${REDACTED}`
  }
];

export function isSensitiveHeaderName(name: string): boolean {
  return SENSITIVE_HEADER_SET.has(name.trim().toLowerCase());
}

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key.trim());
}

/** Masks bearer/basic tokens, JWTs and inline `token=`/`session=` pairs. */
export function redactText(value: string): string {
  let result = value;
  for (const { pattern, replace } of TEXT_PATTERNS) {
    result = typeof replace === 'string'
      ? result.replace(pattern, replace)
      : result.replace(pattern, (...args) => replace(...args));
  }
  return result;
}

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    redacted[name] = isSensitiveHeaderName(name) ? REDACTED : redactText(String(value));
  }
  return redacted;
}

/** Masks sensitive query string parameters while preserving the URL shape. */
export function redactUrl(url: string): string {
  const withText = redactText(url);
  const separatorIndex = withText.indexOf('?');
  if (separatorIndex === -1) return withText;

  const base = withText.slice(0, separatorIndex);
  const query = withText.slice(separatorIndex + 1);

  const redactedQuery = query
    .split('&')
    .map((pair) => {
      const equalsIndex = pair.indexOf('=');
      const rawKey = equalsIndex === -1 ? pair : pair.slice(0, equalsIndex);
      const value = equalsIndex === -1 ? '' : pair.slice(equalsIndex + 1);
      let key = rawKey;
      try {
        key = decodeURIComponent(rawKey);
      } catch {
        key = rawKey;
      }
      return isSensitiveKey(key) ? `${rawKey}=${encodeURIComponent(REDACTED)}` : `${rawKey}=${value}`;
    })
    .join('&');

  return `${base}?${redactedQuery}`;
}

function redactJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => redactJsonValue(entry));
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      result[key] = isSensitiveKey(key) ? REDACTED : redactJsonValue(inner);
    }
    return result;
  }
  if (typeof value === 'string') return redactText(value);
  return value;
}

/** Masks a request body: JSON is walked recursively, anything else text-scanned. */
export function redactBody(body: string | undefined): string | undefined {
  if (body === undefined || body === null || body.length === 0) return body;

  const trimmed = body.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.stringify(redactJsonValue(JSON.parse(trimmed)), null, 2);
    } catch {
      // Not valid JSON after all - fall through to pattern based redaction.
    }
  }
  return redactText(body);
}

/** Returns a sanitised copy of the request context. */
export function redactRequest(request: RequestContext | undefined): RequestContext | undefined {
  if (!request) return request;

  const queryParams = request.query_params
    ? Object.fromEntries(
        Object.entries(request.query_params).map(([key, value]) => [
          key,
          isSensitiveKey(key) ? REDACTED : redactText(String(value))
        ])
      )
    : request.query_params;

  return {
    url: redactUrl(request.url),
    method: request.method,
    headers: redactHeaders(request.headers ?? {}),
    query_params: queryParams,
    body: redactBody(request.body)
  };
}