import type { StackFrame, HourlyBucket, IssueStatus, ErrorLevel } from '../types';
import { HOUR_MS, floorToHour } from './date';

const FNV_OFFSET_BASIS_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
const UINT64_MASK = 0xffffffffffffffffn;

/**
 * FNV-1a over 64 bits, rendered as 16 hex characters.
 *
 * The previous 32-bit rolling hash collided once a project accumulated a few
 * thousand exception signatures, silently merging unrelated issue groups.
 * FNV-1a 64 keeps the function synchronous and deterministic while widening the
 * collision space by 2^32.
 */
export function hash64(input: string): string {
  let hash = FNV_OFFSET_BASIS_64;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = (hash * FNV_PRIME_64) & UINT64_MASK;
  }
  return hash.toString(16).padStart(16, '0');
}

export function computeFingerprint(
  type: string,
  message: string,
  frames: StackFrame[] = []
): string {
  const inAppFrames = frames.filter((frame) => frame.in_app);
  const targetFrame = inAppFrames.length > 0 ? inAppFrames[inAppFrames.length - 1] : frames[frames.length - 1];

  let rawFingerprintSource = `${type}:`;
  if (targetFrame) {
    rawFingerprintSource += `${targetFrame.filename}:${targetFrame.function}:${targetFrame.lineno}`;
  } else {
    rawFingerprintSource += message.replace(/[0-9a-fA-F-]{8,}/g, ':uuid:');
  }

  return hash64(rawFingerprintSource);
}

export function calculate24HourBuckets(
  eventTimestamps: number[],
  baseTimestamp: number = Date.now()
): HourlyBucket[] {
  const anchor = Number.isFinite(baseTimestamp) && baseTimestamp > 0 ? baseTimestamp : Date.now();

  // Anchored to the current hour boundary so bucket edges stay stable across
  // renders instead of sliding by milliseconds on every call.
  const startTimestamp = floorToHour(anchor) - 23 * HOUR_MS;
  const buckets: HourlyBucket[] = [];

  for (let index = 0; index < 24; index += 1) {
    buckets.push({
      hour_timestamp: startTimestamp + index * HOUR_MS,
      count: 0
    });
  }

  for (const timestamp of eventTimestamps) {
    if (timestamp >= startTimestamp && timestamp <= anchor) {
      const bucketIndex = Math.min(
        23,
        Math.max(0, Math.floor((timestamp - startTimestamp) / HOUR_MS))
      );
      buckets[bucketIndex].count += 1;
    }
  }

  return buckets;
}

export interface ParsedSearchQuery {
  rawText: string;
  status?: IssueStatus;
  level?: ErrorLevel;
  environment?: string;
  user?: string;
}

export function parseSearchFilter(query: string): ParsedSearchQuery {
  const parts = query.trim().split(/\s+/);
  const result: ParsedSearchQuery = {
    rawText: ''
  };
  const textWords: string[] = [];

  for (const part of parts) {
    if (!part) continue;
    const delimiterIndex = part.indexOf(':');
    if (delimiterIndex > -1) {
      const key = part.slice(0, delimiterIndex).toLowerCase();
      const value = part.slice(delimiterIndex + 1);

      if (key === 'is' && ['unresolved', 'resolved', 'ignored'].includes(value)) {
        result.status = value as IssueStatus;
      } else if (key === 'level' && ['fatal', 'error', 'warning', 'info', 'debug'].includes(value)) {
        result.level = value as ErrorLevel;
      } else if (key === 'env' || key === 'environment') {
        result.environment = value;
      } else if (key === 'user') {
        result.user = value;
      } else {
        textWords.push(part);
      }
    } else {
      textWords.push(part);
    }
  }

  result.rawText = textWords.join(' ');
  return result;
}
