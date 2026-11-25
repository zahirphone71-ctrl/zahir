import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  SlidersHorizontal,
  Globe,
  Activity,
  Wifi,
  Power,
  Clock,
  Sparkles,
  Filter,
  X,
  UserPlus,
  FileDown
} from 'lucide-react';
import { TableDensity, AdvancedFilterState } from './types';

export type SearchColumn = 'all' | 'username' | 'device' | 'mac' | 'profile' | 'notes';
export type StatusFilterType = 'all' | 'online' | 'idle' | 'suspended' | 'expired' | 'new';

export interface ProfileItem {
  id: string | number;
  name: string;
  subscriberCount?: number;
}

export interface StatusCounts {
  total: number;
  online: number;
  idle: number;
  suspended: number;
  expired: number;
  new?: number;
}

export interface SubscribersFilterBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchColumn: SearchColumn;
  onSearchColumnChange: (col: SearchColumn) => void;
  selectedProfile: string;
  onProfileChange: (p: string) => void;
  profilesList: ProfileItem[];
  statusFilter: StatusFilterType;
  onStatusFilterChange: (status: StatusFilterType) => void;
  statusCounts: StatusCounts;
  onOpenColumnCustomizer: () => void;
  onOpenAddSubscriberModal?: () => void;
  onExportPdf?: () => void;
  density: TableDensity;
  onChangeDensity: (density: TableDensity) => void;
  activeSystemName: string;
  isAdvancedOpen?: boolean;
  onToggleAdvanced?: () => void;
  advancedActiveCount?: number;
  advancedFilters?: AdvancedFilterState;
  onResetAdvancedFilters?: () => void;
  onClearAdvancedActivity?: () => void;
  onClearAdvancedExpiry?: () => void;
  onClearAdvancedProfiles?: () => void;
  onClearAdvancedDateRange?: () => void;
}

const STATUS_CONFIG = [
  {
    key: 'all' as const,
    label: 'الكل',
    icon: Globe,
    badgeStyle: 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
  },
  {
    key: 'online' as const,
    label: 'متصلون',
    icon: Activity,
    badgeStyle: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
    ping: true
  },
  {
    key: 'idle' as const,
    label: 'خاملين',
    icon: Wifi,
    badgeStyle: 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
  },
  {
    key: 'suspended' as const,
    label: 'معلقين',
    icon: Power,
    badgeStyle: 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
  },
  {
    key: 'expired' as const,
    label: 'منتهين',
    icon: Clock,
    badgeStyle: 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
  },
  {
    key: 'new' as const,
    label: 'جدد (لم يتصل)',
    icon: Sparkles,
    badgeStyle: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
  }
];

export const SubscribersFilterBarComponent: React.FC<SubscribersFilterBarProps> = ({
  searchQuery,
  onSearchChange,
  searchColumn,
  onSearchColumnChange,
  selectedProfile,
  onProfileChange,
  profilesList,
  statusFilter,
  onStatusFilterChange,
  statusCounts,
  onOpenColumnCustomizer,
  onOpenAddSubscriberModal,
  onExportPdf,
  density,
  onChangeDensity,
  activeSystemName,
  isAdvancedOpen,
  onToggleAdvanced,
  advancedActiveCount = 0,
  advancedFilters,
  onResetAdvancedFilters,
  onClearAdvancedActivity,
  onClearAdvancedExpiry,
  onClearAdvancedProfiles,
  onClearAdvancedDateRange
}) => {
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Safe profiles array
  const safeProfilesList = useMemo(() => {
    return Array.isArray(profilesList) ? profilesList : [];
  }, [profilesList]);

  // Global Keyboard Shortcut: Ctrl+K or / to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'SELECT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Check if any filter is active
  const hasActiveFilters = useMemo(() => {
    return (
      searchQuery.trim() !== '' ||
      selectedProfile !== 'all' ||
      statusFilter !== 'all' ||
      (advancedActiveCount !== undefined && advancedActiveCount > 0)
    );
  }, [searchQuery, selectedProfile, statusFilter, advancedActiveCount]);

  // Clear all active filters
  const handleClearAllFilters = useCallback(() => {
    onSearchChange('');
    onProfileChange('all');
    onStatusFilterChange('all');
    if (onResetAdvancedFilters) {
      onResetAdvancedFilters();
    }
  }, [onSearchChange, onProfileChange, onStatusFilterChange, onResetAdvancedFilters]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-2.5 sm:p-3 space-y-2.5 shadow-md">
      {/* Upper Row: Search Input, Column Dropdown, Profile Filter, Density & Actions */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5">
        {/* Search with Target Column Dropdown */}
        <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1">
            <label htmlFor="subscriber-search-input" className="sr-only">
              بحث عن مشترك
            </label>
            <Search className="w-3.5 h-3.5 absolute right-3 top-2.5 text-slate-500 pointer-events-none" />
            <input
              id="subscriber-search-input"
              ref={searchInputRef}
              type="text"
              placeholder="بحث فوري (اسم، جهاز، ماك، ملاحظات...)"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-9 pl-14 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-medium"
            />
            {/* Keyboard Shortcut Badge */}
            <div className="absolute left-8 top-1.5 hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700/80 text-[10px] text-slate-400 font-mono select-none pointer-events-none">
              <span>Ctrl</span>
              <span>K</span>
            </div>
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute left-2.5 top-2 text-slate-500 hover:text-slate-300 p-0.5 rounded-full hover:bg-slate-800 transition-colors cursor-pointer"
                aria-label="مسح نص البحث"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Search Target Column Dropdown */}
          <div className="flex items-center gap-1.5 shrink-0">
            <label htmlFor="search-column-select" className="sr-only">
              اختر عمود البحث
            </label>
            <span className="text-[10px] text-slate-400 hidden sm:inline">في:</span>
            <select
              id="search-column-select"
              value={searchColumn}
              onChange={(e) => onSearchColumnChange(e.target.value as SearchColumn)}
              className="w-full sm:w-auto bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-[11px] text-slate-300 focus:outline-none focus:border-blue-500 cursor-pointer font-medium"
            >
              <option value="all">[ * ] كل الحقول والأعمدة</option>
              <option value="username">[ # ] اسم المشترك / الكود</option>
              <option value="device">[ @ ] نوع وصانع الجهاز</option>
              <option value="mac">[ MAC ] الماك أدرس</option>
              <option value="profile">[ ~ ] البروفايل</option>
              <option value="notes">[ ! ] الملاحظات</option>
            </select>
          </div>
        </div>

        {/* Right Controls: Profile Filter, Segmented Density & Column Customizer */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Profile Filter Dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1 shrink-0">
            <Filter className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <label htmlFor="profile-filter-select" className="sr-only">
              اختر بروفايل للتصفية
            </label>
            <select
              id="profile-filter-select"
              value={selectedProfile}
              onChange={(e) => onProfileChange(e.target.value)}
              className="bg-transparent border-0 text-[11px] text-slate-300 focus:outline-none cursor-pointer py-0.5 font-medium"
            >
              <option value="all">كل البروفايلات ({safeProfilesList.length})</option>
              {safeProfilesList.map((p) => (
                <option key={String(p.id)} value={String(p.name)}>
                  {p.name} {p.subscriberCount !== undefined ? `(${p.subscriberCount})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Segmented Density Selector */}
          <div
            role="group"
            aria-label="حجم وكثافة جدول المشتركين"
            className="flex bg-slate-950 border border-slate-800 rounded-xl p-0.5 shrink-0"
          >
            {(['compact', 'normal', 'relaxed'] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onChangeDensity(d)}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                  density === d
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
                title={d === 'compact' ? 'عرض مضغوط' : d === 'normal' ? 'عرض عادي' : 'عرض مريح'}
              >
                {d === 'compact' ? 'مضغوط' : d === 'normal' ? 'عادي' : 'مريح'}
              </button>
            ))}
          </div>

          {/* Add New Subscriber Button */}
          {onOpenAddSubscriberModal && (
            <button
              type="button"
              onClick={onOpenAddSubscriberModal}
              className="px-2.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer shrink-0"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>إضافة مشترك</span>
            </button>
          )}

          {/* Advanced Filter Panel Toggle Button */}
          {onToggleAdvanced && (
            <button
              type="button"
              onClick={onToggleAdvanced}
              className={`px-3 py-2 rounded-2xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 border ${
                isAdvancedOpen || (advancedActiveCount && advancedActiveCount > 0)
                  ? 'bg-blue-600/25 border-blue-500 text-blue-200 shadow-sm shadow-blue-500/20'
                  : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
              }`}
              title="فتح لوحة الفلترة والتصفية المتقدمة"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" />
              <span>فلترة متقدمة</span>
              {advancedActiveCount !== undefined && advancedActiveCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-blue-500 text-white text-[10px] font-mono flex items-center justify-center font-black">
                  {advancedActiveCount}
                </span>
              )}
            </button>
          )}

          {/* Customize Columns Button */}
          <button
            type="button"
            onClick={onOpenColumnCustomizer}
            className="px-3 py-2 bg-gradient-to-r from-blue-600/20 to-indigo-600/20 hover:from-blue-600/30 hover:to-indigo-600/30 text-blue-300 border border-blue-500/40 rounded-2xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 shadow-sm"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" />
            <span>الأعمدة</span>
          </button>

          {/* Export Formatted PDF Button */}
          {onExportPdf && (
            <button
              type="button"
              onClick={onExportPdf}
              className="px-2.5 sm:px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-white border border-rose-500/30 rounded-2xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer shrink-0 active:scale-95"
              title="تصدير قائمة وبيانات المشتركين كتقرير PDF منسق"
            >
              <FileDown className="w-3.5 h-3.5 text-rose-400" />
              <span>تصدير PDF</span>
            </button>
          )}
        </div>
      </div>

      {/* Active Filters Bar (Shown only when filters are active) */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/60 text-xs">
          <span className="text-slate-400 font-bold text-[11px]">فلاتر نشطة:</span>
          {searchQuery.trim() && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-blue-500/15 text-blue-300 border border-blue-500/30 font-medium">
              <span>بحث: "{searchQuery}"</span>
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="hover:text-white cursor-pointer"
                aria-label="مسح فلتر البحث"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {selectedProfile !== 'all' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-medium">
              <span>البروفايل: {selectedProfile}</span>
              <button
                type="button"
                onClick={() => onProfileChange('all')}
                className="hover:text-white cursor-pointer"
                aria-label="مسح فلتر البروفايل"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {statusFilter !== 'all' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-medium">
              <span>
                الحالة:{' '}
                {statusFilter === 'online'
                  ? 'متصلون'
                  : statusFilter === 'idle'
                  ? 'خاملين'
                  : statusFilter === 'suspended'
                  ? 'معلقين'
                  : statusFilter === 'expired'
                  ? 'منتهين'
                  : 'جدد'}
              </span>
              <button
                type="button"
                onClick={() => onStatusFilterChange('all')}
                className="hover:text-white cursor-pointer"
                aria-label="مسح فلتر الحالة"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {/* Advanced Filter Active Chips */}
          {advancedFilters?.activity && advancedFilters.activity !== 'all' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-medium">
              <span>
                حالة الاتصال:{' '}
                {advancedFilters.activity === 'active'
                  ? 'نشط (متصل)'
                  : advancedFilters.activity === 'inactive'
                  ? 'غير نشط'
                  : 'معلق'}
              </span>
              {onClearAdvancedActivity && (
                <button
                  type="button"
                  onClick={onClearAdvancedActivity}
                  className="hover:text-white cursor-pointer"
                  aria-label="مسح فلتر حالة الاتصال المتقدمة"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          )}

          {advancedFilters?.expiry && advancedFilters.expiry !== 'all' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-rose-500/15 text-rose-300 border border-rose-500/30 font-medium">
              <span>
                الصلاحية:{' '}
                {advancedFilters.expiry === 'expired'
                  ? 'منتهي الصلاحية'
                  : advancedFilters.expiry === 'expiring_24h'
                  ? 'ينتهي خلال 24 ساعة'
                  : advancedFilters.expiry === 'expiring_3d'
                  ? 'ينتهي خلال 3 أيام'
                  : advancedFilters.expiry === 'expiring_7d'
                  ? 'ينتهي خلال أسبوع'
                  : advancedFilters.expiry === 'active_valid'
                  ? 'ساري المفعول'
                  : 'نطاق مخصص'}
              </span>
              {onClearAdvancedExpiry && (
                <button
                  type="button"
                  onClick={onClearAdvancedExpiry}
                  className="hover:text-white cursor-pointer"
                  aria-label="مسح فلتر الصلاحية"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          )}

          {(advancedFilters?.expiryFrom || advancedFilters?.expiryTo) && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-medium font-mono">
              <span>
                التاريخ: {advancedFilters?.expiryFrom || '—'} إلى {advancedFilters?.expiryTo || '—'}
              </span>
              {onClearAdvancedDateRange && (
                <button
                  type="button"
                  onClick={onClearAdvancedDateRange}
                  className="hover:text-white cursor-pointer font-sans"
                  aria-label="مسح فلتر نطاق التاريخ"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          )}

          {advancedFilters?.selectedProfiles && advancedFilters.selectedProfiles.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-medium">
              <span>البروفايلات المحددة: ({advancedFilters.selectedProfiles.length})</span>
              {onClearAdvancedProfiles && (
                <button
                  type="button"
                  onClick={onClearAdvancedProfiles}
                  className="hover:text-white cursor-pointer"
                  aria-label="مسح البروفايلات المحددة"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          )}

          <button
            type="button"
            onClick={handleClearAllFilters}
            className="px-2.5 py-1 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 font-bold text-[11px] transition-colors cursor-pointer mr-auto"
          >
            مسح جميع الفلاتر
          </button>
        </div>
      )}

      {/* Bottom Row: Data-Driven Status Classification Tabs */}
      <div className="border-t border-slate-800/80 pt-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
          <div className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-400" aria-hidden="true"></span>
            <span>تصنيف جداول الحالات لـ ({activeSystemName}):</span>
          </div>
          <div className="text-[10px] text-slate-500">
            إجمالي المشتركين:{' '}
            <span className="text-slate-300 font-mono font-bold">{statusCounts.total ?? 0}</span>
          </div>
        </div>

        <div
          role="radiogroup"
          aria-label={`تصنيف حالات المشتركين لـ ${activeSystemName}`}
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2"
        >
          {STATUS_CONFIG.map((s) => {
            const Icon = s.icon;
            const isActive = statusFilter === s.key;
            const count = s.key === 'all' ? statusCounts.total : ((statusCounts as any)[s.key] ?? 0);

            return (
              <button
                key={s.key}
                type="button"
                role="radio"
                aria-checked={isActive}
                aria-label={`${s.label}: ${count} مشترك`}
                onClick={() => onStatusFilterChange(s.key)}
                className={`flex items-center justify-between p-2.5 sm:p-3 rounded-2xl border text-xs font-bold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-slate-800/90 border-blue-500 text-white shadow-lg ring-2 ring-blue-500/50 scale-[1.01]'
                    : 'bg-slate-950/60 border-slate-800/90 text-slate-400 hover:border-slate-700 hover:text-slate-200 hover:bg-slate-900/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-lg bg-slate-800 text-slate-300 relative">
                    <Icon className="w-3.5 h-3.5" />
                    {s.ping && (
                      <span
                        aria-hidden="true"
                        className="w-1.5 h-1.5 rounded-full bg-emerald-400 absolute -top-0.5 -right-0.5 animate-ping motion-reduce:animate-none"
                      ></span>
                    )}
                  </div>
                  <span className="flex items-center gap-1">
                    {isActive && <span className="text-blue-400 font-black">✓</span>}
                    {s.label}
                  </span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-lg text-xs font-mono font-bold ${s.badgeStyle}`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const SubscribersFilterBar = React.memo(SubscribersFilterBarComponent);
