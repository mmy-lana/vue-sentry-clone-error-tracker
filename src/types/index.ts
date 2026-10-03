export type ErrorLevel = 'fatal' | 'error' | 'warning' | 'info' | 'debug';
export type IssueStatus = 'unresolved' | 'resolved' | 'ignored';
export type BreadcrumbType = 'default' | 'http' | 'navigation' | 'ui.click' | 'console' | 'system';

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
  platform: 'javascript' | 'node' | 'vue';
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
  sort_by: 'last_seen' | 'event_count' | 'user_count' | 'first_seen';
  sort_order: 'asc' | 'desc';
}

export interface BulkActionRequest {
  issue_ids: string[];
  action: 'resolve' | 'unresolve' | 'ignore' | 'delete';
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
