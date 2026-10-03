import type { StackFrame, HourlyBucket, IssueStatus, ErrorLevel } from '../types';

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

  let hash = 0;
  for (let i = 0; i < rawFingerprintSource.length; i++) {
    const char = rawFingerprintSource.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export function calculate24HourBuckets(
  eventTimestamps: number[],
  baseTimestamp: number = Date.now()
): HourlyBucket[] {
  const ONE_HOUR = 3600000;
  const startTimestamp = baseTimestamp - 24 * ONE_HOUR;
  const buckets: HourlyBucket[] = [];

  for (let i = 0; i < 24; i++) {
    buckets.push({
      hour_timestamp: startTimestamp + i * ONE_HOUR,
      count: 0
    });
  }

  for (const timestamp of eventTimestamps) {
    if (timestamp >= startTimestamp && timestamp <= baseTimestamp) {
      const bucketIndex = Math.min(23, Math.max(0, Math.floor((timestamp - startTimestamp) / ONE_HOUR)));
      buckets[bucketIndex].count++;
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
