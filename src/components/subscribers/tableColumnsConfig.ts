import { TableColumnConfig, StatusTableConfig } from './types';

export const ALL_SUBSCRIBER_COLUMNS: TableColumnConfig[] = [
  { key: 'username', label: 'اسم المشترك / الكود', tooltip: 'اسم المستخدم أو كود الكرت', defaultVisible: true, minWidth: 150, canSort: true, align: 'right', category: 'identity', icon: 'User', accentColor: 'blue' },
  { key: 'password', label: 'كلمة السر', tooltip: 'كلمة المرور', defaultVisible: true, minWidth: 110, canSort: false, align: 'right', category: 'identity', icon: 'Key', accentColor: 'amber' },
  { key: 'status', label: 'حالة الحساب', tooltip: 'متصل، خامل، معلق، منتهي', defaultVisible: true, minWidth: 120, canSort: true, align: 'center', category: 'status', icon: 'Activity', accentColor: 'emerald' },
  { key: 'deviceType', label: 'نوع الجهاز', tooltip: 'نوع وصانع الجهاز', defaultVisible: true, minWidth: 160, canSort: true, align: 'right', category: 'device', icon: 'Smartphone', accentColor: 'cyan' },
  { key: 'profile', label: 'البروفايل والسرعة', tooltip: 'باقة الاشتراك', defaultVisible: true, minWidth: 130, canSort: true, align: 'right', category: 'quota', icon: 'Tag', accentColor: 'indigo' },
  { key: 'connectionTime', label: 'وقت الاتصال', tooltip: 'مدة الاتصال', defaultVisible: true, minWidth: 120, canSort: true, align: 'right', category: 'time', icon: 'Clock', accentColor: 'emerald' },
  { key: 'idleTime', label: 'فترة الخمول', tooltip: 'مدة السكون', defaultVisible: true, minWidth: 110, canSort: true, align: 'right', category: 'time', icon: 'Wifi', accentColor: 'cyan' },
  { key: 'disconnectTime', label: 'وقت قطع الاتصال', tooltip: 'آخر انقطاع', defaultVisible: true, minWidth: 130, canSort: true, align: 'right', category: 'time', icon: 'Power', accentColor: 'rose' },
  { key: 'remainingTimeAndData', label: 'متبقي الوقت والبيانات', tooltip: 'الرصيد المتبقي', defaultVisible: true, minWidth: 180, canSort: true, align: 'right', category: 'quota', icon: 'Clock', accentColor: 'emerald' },
  { key: 'voucherTimeAndData', label: 'وقت الكرت والبيانات', tooltip: 'الحصة الإجمالية', defaultVisible: true, minWidth: 160, canSort: true, align: 'right', category: 'quota', icon: 'Calendar', accentColor: 'indigo' },
  { key: 'suspensionTime', label: 'وقت التعليق', tooltip: 'تاريخ تعليق الحساب', defaultVisible: true, minWidth: 130, canSort: true, align: 'right', category: 'status', icon: 'Power', accentColor: 'amber' },
  { key: 'creationDate', label: 'تاريخ توليد الكرت', tooltip: 'تاريخ الإنشاء', defaultVisible: true, minWidth: 140, canSort: true, align: 'right', category: 'meta', icon: 'Calendar', accentColor: 'slate' },
  { key: 'price', label: 'السعر', tooltip: 'سعر الباقة', defaultVisible: true, minWidth: 90, canSort: true, align: 'center', category: 'meta', icon: 'CreditCard', accentColor: 'amber' },
  { key: 'notes', label: 'ملاحظات', tooltip: 'الملاحظات', defaultVisible: true, minWidth: 150, canSort: true, align: 'right', category: 'meta', icon: 'FileText', accentColor: 'slate' },
];

export const DEFAULT_COLUMN_KEYS = ALL_SUBSCRIBER_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key);

export const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string; bar: string }> = {
  identity: { bg: 'hover:bg-blue-950/40', text: 'text-blue-300', border: 'border-blue-500/20', bar: 'bg-blue-500/60' },
  device: { bg: 'hover:bg-cyan-950/40', text: 'text-cyan-300', border: 'border-cyan-500/20', bar: 'bg-cyan-500/60' },
  time: { bg: 'hover:bg-emerald-950/40', text: 'text-emerald-300', border: 'border-emerald-500/20', bar: 'bg-emerald-500/60' },
  quota: { bg: 'hover:bg-indigo-950/40', text: 'text-indigo-300', border: 'border-indigo-500/20', bar: 'bg-indigo-500/60' },
  status: { bg: 'hover:bg-amber-950/40', text: 'text-amber-300', border: 'border-amber-500/20', bar: 'bg-amber-500/60' },
  meta: { bg: 'hover:bg-slate-800/40', text: 'text-slate-300', border: 'border-slate-500/20', bar: 'bg-slate-500/60' },
};

export const STATUS_TABLE_CONFIG: Record<string, StatusTableConfig> = {
  all: {
    title: 'جميع المشتركين', description: 'قائمة شاملة', headerBg: 'from-blue-950/60 via-slate-900 to-slate-900',
    headerText: 'text-blue-300', accentColor: 'blue', icon: 'Users', emptyStateIcon: 'HelpCircle',
    emptyStateTitle: 'لا يوجد مشتركين', emptyStateMessage: 'لم يتم العثور على أي مشتركين',
  },
  online: {
    title: 'المتصلون الآن', description: 'جلسات نشطة', headerBg: 'from-emerald-950/60 via-slate-900 to-slate-900',
    headerText: 'text-emerald-300', accentColor: 'emerald', icon: 'Activity', emptyStateIcon: 'Wifi',
    emptyStateTitle: 'لا يوجد متصلون', emptyStateMessage: 'لا يوجد أي مشترك متصل',
    defaultSortKey: 'connectionTime', defaultSortDirection: 'desc',
    pinnedColumns: ['username', 'status', 'connectionTime'],
  },
  idle: {
    title: 'الخاملون', description: 'انقطع اتصالهم', headerBg: 'from-sky-950/60 via-slate-900 to-slate-900',
    headerText: 'text-sky-300', accentColor: 'sky', icon: 'Wifi', emptyStateIcon: 'WifiOff',
    emptyStateTitle: 'لا يوجد خاملون', emptyStateMessage: 'جميع المشتركين متصلون أو منتهون',
    defaultSortKey: 'idleTime', defaultSortDirection: 'desc',
    pinnedColumns: ['username', 'status', 'idleTime', 'disconnectTime'],
  },
  suspended: {
    title: 'المعلقون', description: 'معطلون يدوياً', headerBg: 'from-amber-950/60 via-slate-900 to-slate-900',
    headerText: 'text-amber-300', accentColor: 'amber', icon: 'Power', emptyStateIcon: 'PowerOff',
    emptyStateTitle: 'لا يوجد معلقون', emptyStateMessage: 'لا يوجد مشترك معلق',
    defaultSortKey: 'suspensionTime', defaultSortDirection: 'desc',
    pinnedColumns: ['username', 'status', 'suspensionTime'],
  },
  expired: {
    title: 'المنتهون', description: 'انتهت صلاحيتهم', headerBg: 'from-rose-950/60 via-slate-900 to-slate-900',
    headerText: 'text-rose-300', accentColor: 'rose', icon: 'Clock', emptyStateIcon: 'AlertCircle',
    emptyStateTitle: 'لا يوجد منتهون', emptyStateMessage: 'جميع المشتركين سارية',
    defaultSortKey: 'remainingTimeAndData', defaultSortDirection: 'asc',
    pinnedColumns: ['username', 'status', 'remainingTimeAndData'],
  },
  new: {
    title: 'الجدد', description: 'لم يتصلوا بعد', headerBg: 'from-indigo-950/60 via-slate-900 to-slate-900',
    headerText: 'text-indigo-300', accentColor: 'indigo', icon: 'Sparkles', emptyStateIcon: 'Sparkles',
    emptyStateTitle: 'لا يوجد جدد', emptyStateMessage: 'جميع المشتركين استخدموا النظام',
    defaultSortKey: 'creationDate', defaultSortDirection: 'desc',
    pinnedColumns: ['username', 'profile', 'creationDate', 'voucherTimeAndData'],
  },
};

export function filterColumnsByStatus(columns: TableColumnConfig[], statusFilter: string): TableColumnConfig[] {
  const REQUIRED: Record<string, string[]> = {
    idle: ['idleTime', 'disconnectTime'], online: ['connectionTime'], suspended: ['suspensionTime'],
    expired: ['remainingTimeAndData'], new: ['creationDate'],
  };
  const EXCLUDED: Record<string, string[]> = {
    idle: ['connectionTime', 'suspensionTime'], online: ['idleTime', 'disconnectTime', 'suspensionTime'],
    suspended: ['idleTime', 'connectionTime', 'disconnectTime'],
    expired: ['idleTime', 'connectionTime', 'suspensionTime'],
    new: ['connectionTime', 'disconnectTime', 'suspensionTime', 'idleTime'],
  };
  const required = REQUIRED[statusFilter] || [];
  const excluded = EXCLUDED[statusFilter] || [];

  const filtered = columns.filter((col) => {
    if (col.key === 'status') return statusFilter === 'all' || statusFilter === 'status';
    if (excluded.includes(col.key)) return false;
    return true;
  });

  const existingKeys = new Set(filtered.map((c) => c.key));
  required.forEach((key) => {
    if (!existingKeys.has(key)) {
      const col = ALL_SUBSCRIBER_COLUMNS.find((c) => c.key === key);
      if (col) filtered.push(col);
    }
  });
  return filtered;
}
