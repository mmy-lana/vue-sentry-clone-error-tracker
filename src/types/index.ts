export type ErrorLevel = 'fatal' | 'error' | 'warning' | 'info' | 'debug';
export type IssueStatus = 'unresolved' | 'resolved' | 'ignored';
export type BreadcrumbType = 'default' | 'http' | 'navigation' | 'ui.click' | 'console' | 'system';
export type ErrorPlatform = 'javascript' | 'node' | 'vue';
export type IssueSortField = 'last_seen' | 'event_count' | 'user_count' | 'first_seen';
export type SortDirection = 'asc' | 'desc';
export type BulkActionType = 'resolve' | 'unresolve' | 'ignore' | 'delete';

export interface StackFrame {
  id: string;
  filename: string;
  function: string;
  lineno: number;
  colno: number;
  in_app: boolean;
  pre_context: string[];
  context_line: string;
  post_context: string[];
  vars?: Record<string, unknown>;
}

export interface ExceptionValue {
  type: string;
  value: string;
  module?: string;
  stacktrace: {
    frames: StackFrame[];
  };
}

export interface Breadcrumb {
  id: string;
  timestamp: number;
  category: string;
  type: BreadcrumbType;
  level: ErrorLevel;
  message: string;
  data?: Record<string, unknown>;
}

export interface UserContext {
  id?: string;
  email?: string;
  username?: string;
  ip_address?: string;
}

export interface RequestContext {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers: Record<string, string>;
  query_params?: Record<string, string>;
  body?: string;
}

export interface DeviceContext {
  browser: string;
  browser_version: string;
  os: string;
  os_version: string;
  device_model?: string;
  viewport: string;
}

export interface ErrorEvent {
  id: string;
  issue_id: string;
  project_id: string;
  timestamp: number;
  platform: ErrorPlatform;
  level: ErrorLevel;
  message: string;
  culprit: string;
  fingerprint: string;
  exception: ExceptionValue;
  breadcrumbs: Breadcrumb[];
  tags: Record<string, string>;
  user?: UserContext;
  request?: RequestContext;
  device: DeviceContext;
  sdk: {
    name: string;
    version: string;
  };
}

/**
 * Payload accepted by the ingestion pipeline. The database layer derives
 * `id`, `issue_id` and `fingerprint` so callers never author them.
 */
export type ErrorEventInput = Omit<ErrorEvent, 'id' | 'issue_id' | 'fingerprint'> &
  Partial<Pick<ErrorEvent, 'id' | 'issue_id' | 'fingerprint'>>;

export interface HourlyBucket {
  hour_timestamp: number;
  count: number;
}

export interface Issue {
  id: string;
  project_id: string;
  fingerprint: string;
  title: string;
  culprit: string;
  level: ErrorLevel;
  status: IssueStatus;
  first_seen: number;
  last_seen: number;
  event_count: number;
  user_count: number;
  unique_users: string[];
  environments: string[];
  regression_count: number;
  recent_timestamps: number[];
  histogram_24h: HourlyBucket[];
  tags_summary: Record<string, Record<string, number>>;
  assigned_to?: string;
}

export interface IssueFilterCriteria {
  search_query: string;
  status: IssueStatus | 'all';
  level: ErrorLevel | 'all';
  environment: string | 'all';
  time_range_hours: number;
  sort_by: IssueSortField;
  sort_order: SortDirection;
}

export interface BulkActionRequest {
  issue_ids: string[];
  action: BulkActionType;
}

/** Key/value row persisted in the `settings` object store. */
export interface SettingRecord {
  key: string;
  value: unknown;
}

/** Persisted user preferences owned by the settings screen. */
export interface AppPreferences {
  project_id: string;
  default_environment: string;
  default_time_range_hours: number;
  auto_seed_on_boot: boolean;
  live_stream_paused_by_default: boolean;
  live_stream_max_rows: number;
  reduced_motion: boolean;
}

/** One row of the ingestion audit trail rendered by the live stream drawer. */
export interface IngestionLogEntry {
  id: string;
  timestamp: number;
  outcome: 'created' | 'merged' | 'regressed' | 'rejected';
  issue_id: string;
  issue_title: string;
  level: ErrorLevel;
  fingerprint: string;
  detail: string;
}

export interface TabItem {
  key: string;
  label: string;
  badge?: number | string;
}

export interface BaseTabsProps {
  modelValue: string;
  tabs: TabItem[];
}

export interface BaseDropdownItem {
  id: string;
  label: string;
  icon?: string;
  danger?: boolean;
}

export interface BaseDropdownProps {
  items: BaseDropdownItem[];
  triggerText?: string;
}

export interface AppDatabaseSchema {
  issues: {
    key: string;
    value: Issue;
    indexes: string[];
  };
  events: {
    key: string;
    value: ErrorEvent;
    indexes: string[];
  };
  settings: {
    key: string;
    value: SettingRecord;
  };
}