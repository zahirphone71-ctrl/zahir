export type SubscriberSystem = 'hotspot' | 'pppoe' | 'userman';
export type TableDensity = 'compact' | 'normal' | 'relaxed';
export type SortDirection = 'asc' | 'desc';
export type ColumnCategory = 'identity' | 'device' | 'time' | 'quota' | 'status' | 'meta';

export type StatusFilterType = 'all' | 'online' | 'idle' | 'suspended' | 'expired' | 'new';
export type ActivityFilterType = 'all' | 'active' | 'inactive' | 'suspended';

export type ExpiryFilterType =
  | 'all' | 'expired' | 'expiring_24h' | 'expiring_3d' | 'expiring_7d' | 'active_valid' | 'custom_range';

export interface ColumnSortState {
  key: string | null;
  direction: SortDirection | null;
}

export interface TableColumnConfig {
  key: string;
  label: string;
  tooltip?: string;
  defaultVisible: boolean;
  minWidth: number;
  canSort: boolean;
  align?: 'right' | 'center' | 'left';
  category?: ColumnCategory;
  icon?: string;
  accentColor?: 'blue' | 'emerald' | 'amber' | 'rose' | 'indigo' | 'cyan' | 'purple' | 'slate';
  flexWeight?: number;
}

export interface AdvancedFilterState {
  activity: ActivityFilterType;
  expiry: ExpiryFilterType;
  expiryFrom: string | null;
  expiryTo: string | null;
  selectedProfiles: string[];
}

export const EMPTY_ADVANCED_FILTERS: AdvancedFilterState = Object.freeze({
  activity: 'all', expiry: 'all', expiryFrom: null, expiryTo: null, selectedProfiles: [],
});

export function countActiveFilters(f: AdvancedFilterState): number {
  let c = 0;
  if (f && f.activity !== 'all') c++;
  if (f && f.expiry !== 'all') c++;
  if (f && (f.expiryFrom || f.expiryTo)) c++;
  if (f && f.selectedProfiles && f.selectedProfiles.length > 0) c++;
  return c;
}

export interface StatusTableConfig {
  title: string;
  description: string;
  headerBg: string;
  headerText: string;
  accentColor: 'emerald' | 'sky' | 'amber' | 'rose' | 'indigo' | 'blue';
  icon: string;
  emptyStateIcon: string;
  emptyStateTitle: string;
  emptyStateMessage: string;
  defaultSortKey?: string;
  defaultSortDirection?: 'asc' | 'desc';
  pinnedColumns?: string[];
}

export interface StatusCounts {
  total: number;
  online: number;
  idle: number;
  suspended: number;
  expired: number;
  new: number;
}

export interface SubscriberRowItem {
  id: string;
  name: string;
  password?: string;
  profile: string;
  rateLimit?: string;
  ipAddress?: string;
  uptime: string;
  bytesIn: number;
  bytesOut: number;
  limitUptime?: string;
  limitBytesTotal?: number;
  comment?: string;
  disabled?: boolean;
  macAddress?: string;
  callerId?: string;
  hostName?: string;
  createdAt?: string;
  price?: number;
  isVoucher?: boolean;
  status: 'new' | 'online' | 'idle' | 'suspended' | 'expired';
  idleTime?: string;
  lastLoggedOut?: string;
  lastLoggedIn?: string;
  disconnectTime?: string;
  raw: any;
}

export interface TableFilters {
  searchQuery: string;
  searchColumn: string;
  profile: string;
  status: StatusFilterType;
  advanced?: AdvancedFilterState;
}
