import React from 'react';
import {
  SlidersHorizontal,
  X,
  Activity,
  Clock,
  Layers,
  Calendar,
  CheckCircle2,
  RefreshCw,
  Power,
  Wifi,
  Sparkles,
  AlertCircle,
  Filter
} from 'lucide-react';
import {
  AdvancedFilterState,
  ActivityFilterType,
  ExpiryFilterType
} from './types';
import { ProfileItem } from './SubscribersFilterBar';

interface AdvancedFilterPanelProps {
  isOpen: boolean;
  onClose: () => void;
  filters: AdvancedFilterState;
  onChangeFilters: (next: AdvancedFilterState) => void;
  onResetFilters: () => void;
  profilesList: ProfileItem[];
  totalMatching: number;
  totalSubscribers: number;
}

export const AdvancedFilterPanel: React.FC<AdvancedFilterPanelProps> = ({
  isOpen,
  onClose,
  filters,
  onChangeFilters,
  onResetFilters,
  profilesList,
  totalMatching,
  totalSubscribers
}) => {
  if (!isOpen) return null;

  const isCustomRange = filters.expiry === 'custom_range';

  // Count active filters
  const activeCount =
    (filters.activity !== 'all' ? 1 : 0) +
    (filters.expiry !== 'all' ? 1 : 0) +
    (filters.selectedProfiles.length > 0 ? 1 : 0) +
    (filters.expiryFrom || filters.expiryTo ? 1 : 0);

  const handleActivityChange = (act: ActivityFilterType) => {
    onChangeFilters({ ...filters, activity: act });
  };

  const handleExpiryChange = (exp: ExpiryFilterType) => {
    onChangeFilters({ ...filters, expiry: exp });
  };

  const handleToggleProfile = (profName: string) => {
    const current = filters.selectedProfiles;
    const next = current.includes(profName)
      ? current.filter((p) => p !== profName)
      : [...current, profName];
    onChangeFilters({ ...filters, selectedProfiles: next });
  };

  const handleClearProfiles = () => {
    onChangeFilters({ ...filters, selectedProfiles: [] });
  };

  return (
    <div
      id="advanced-subscribers-filter-panel"
      className="bg-slate-900 border border-blue-500/40 rounded-3xl p-4 sm:p-5 shadow-2xl space-y-4 animate-in fade-in slide-in-from-top-3 duration-200"
      dir="rtl"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="p-2 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-400">
            <SlidersHorizontal className="w-4 h-4" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black text-white">لوحة الفلترة والتصفية المتقدمة</h3>
              {activeCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40 font-mono text-[10px] font-black">
                  {activeCount} نشط
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              تصفية المشتركين بدقة عالية بناءً على الحالة، تاريخ وصلاحية الانتهاء، أو البروفايلات المستخدمة
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
          title="إغلاق لوحة الفلترة"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Grid of 3 Main Filter Criteria */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. STATUS / ACTIVITY FILTER */}
        <div className="bg-slate-950/70 border border-slate-800/90 rounded-2xl p-3.5 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-bold text-slate-300">
            <span className="flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span>الحالة (نشط / غير نشط)</span>
            </span>
            <span className="text-[10px] text-slate-500 font-mono">Status</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => handleActivityChange('all')}
              className={`p-2 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                filters.activity === 'all'
                  ? 'bg-blue-600/25 border-blue-500 text-blue-300 shadow-sm'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
              }`}
            >
              الكل (جميع الحالات)
            </button>

            <button
              type="button"
              onClick={() => handleActivityChange('active')}
              className={`p-2 rounded-xl text-[11px] font-bold border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                filters.activity === 'active'
                  ? 'bg-emerald-600/25 border-emerald-500 text-emerald-300 shadow-sm'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-emerald-300 hover:border-slate-700'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>نشط (متصل الآن)</span>
            </button>

            <button
              type="button"
              onClick={() => handleActivityChange('inactive')}
              className={`p-2 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                filters.activity === 'inactive'
                  ? 'bg-sky-600/25 border-sky-500 text-sky-300 shadow-sm'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-sky-300 hover:border-slate-700'
              }`}
            >
              غير نشط (غير متصل)
            </button>

            <button
              type="button"
              onClick={() => handleActivityChange('suspended')}
              className={`p-2 rounded-xl text-[11px] font-bold border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                filters.activity === 'suspended'
                  ? 'bg-amber-600/25 border-amber-500 text-amber-300 shadow-sm'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-amber-300 hover:border-slate-700'
              }`}
            >
              <Power className="w-3 h-3 text-amber-400" />
              <span>معلق / معطل</span>
            </button>
          </div>
        </div>

        {/* 2. EXPIRATION & VALIDITY FILTER */}
        <div className="bg-slate-950/70 border border-slate-800/90 rounded-2xl p-3.5 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-bold text-slate-300">
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-rose-400" />
              <span>تاريخ الانتهاء والصلاحية</span>
            </span>
            <span className="text-[10px] text-slate-500 font-mono">Expiry</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => handleExpiryChange('all')}
              className={`p-2 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                filters.expiry === 'all'
                  ? 'bg-blue-600/25 border-blue-500 text-blue-300 shadow-sm'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
              }`}
            >
              الكل (بدون قيد)
            </button>

            <button
              type="button"
              onClick={() => handleExpiryChange('expired')}
              className={`p-2 rounded-xl text-[11px] font-bold border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                filters.expiry === 'expired'
                  ? 'bg-rose-600/25 border-rose-500 text-rose-300 shadow-sm'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-rose-300 hover:border-slate-700'
              }`}
            >
              <AlertCircle className="w-3 h-3 text-rose-400" />
              <span>منتهي الصلاحية</span>
            </button>

            <button
              type="button"
              onClick={() => handleExpiryChange('expiring_24h')}
              className={`p-2 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                filters.expiry === 'expiring_24h'
                  ? 'bg-amber-600/25 border-amber-500 text-amber-300 shadow-sm'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-amber-300 hover:border-slate-700'
              }`}
            >
              ينتهي خلال 24 ساعة
            </button>

            <button
              type="button"
              onClick={() => handleExpiryChange('expiring_3d')}
              className={`p-2 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                filters.expiry === 'expiring_3d'
                  ? 'bg-amber-600/25 border-amber-500 text-amber-300 shadow-sm'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-amber-300 hover:border-slate-700'
              }`}
            >
              ينتهي خلال 3 أيام
            </button>

            <button
              type="button"
              onClick={() => handleExpiryChange('expiring_7d')}
              className={`p-2 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                filters.expiry === 'expiring_7d'
                  ? 'bg-indigo-600/25 border-indigo-500 text-indigo-300 shadow-sm'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-indigo-300 hover:border-slate-700'
              }`}
            >
              ينتهي خلال أسبوع
            </button>

            <button
              type="button"
              onClick={() => handleExpiryChange('active_valid')}
              className={`p-2 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                filters.expiry === 'active_valid'
                  ? 'bg-emerald-600/25 border-emerald-500 text-emerald-300 shadow-sm'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-emerald-300 hover:border-slate-700'
              }`}
            >
              ساري ومتبقي رصيد
            </button>
          </div>

          {/* Date range picker toggle */}
          <div className="pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                <Calendar className="w-3 h-3 text-blue-400" />
                <span>نطاق تاريخ مخصص:</span>
              </span>
              {(filters.expiryFrom || filters.expiryTo) && (
                <button
                  type="button"
                  onClick={() => onChangeFilters({ ...filters, expiryFrom: '', expiryTo: '' })}
                  className="text-[10px] text-rose-400 hover:underline cursor-pointer"
                >
                  مسح التاريخ
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] text-slate-500 block mb-0.5">من تاريخ:</label>
                <input
                  type="date"
                  value={filters.expiryFrom || ''}
                  onChange={(e) => onChangeFilters({ ...filters, expiryFrom: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-200 font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[9px] text-slate-500 block mb-0.5">إلى تاريخ:</label>
                <input
                  type="date"
                  value={filters.expiryTo || ''}
                  onChange={(e) => onChangeFilters({ ...filters, expiryTo: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-200 font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 3. PROFILE / TIER FILTER */}
        <div className="bg-slate-950/70 border border-slate-800/90 rounded-2xl p-3.5 space-y-2.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs font-bold text-slate-300 mb-2">
              <span className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-400" />
                <span>البروفايل المستخدم</span>
              </span>
              {filters.selectedProfiles.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearProfiles}
                  className="text-[10px] text-rose-400 hover:underline cursor-pointer"
                >
                  إلغاء التحديد ({filters.selectedProfiles.length})
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1 custom-scrollbar">
              {profilesList.map((p) => {
                const isSelected = filters.selectedProfiles.includes(p.name);
                return (
                  <button
                    key={String(p.id)}
                    type="button"
                    onClick={() => handleToggleProfile(p.name)}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200 shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                    }`}
                  >
                    <span>{p.name}</span>
                    {p.subscriberCount !== undefined && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 font-mono">
                        {p.subscriberCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="text-[10px] text-slate-500 pt-2 border-t border-slate-800">
            {filters.selectedProfiles.length === 0 ? (
              <span>يتم عرض جميع المشتركين لكافة البروفايلات</span>
            ) : (
              <span>محدد {filters.selectedProfiles.length} بروفايل من أصل {profilesList.length}</span>
            )}
          </div>
        </div>
      </div>

      {/* Footer Summary & Action Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-800 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-medium">النتائج المطابقة:</span>
          <span className="font-mono font-black text-blue-400 text-sm px-2.5 py-0.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
            {totalMatching} مشترك
          </span>
          <span className="text-slate-500 text-[11px]">من إجمالي {totalSubscribers}</span>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {activeCount > 0 && (
            <button
              type="button"
              onClick={onResetFilters}
              className="px-3.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>إعادة ضبط الفلاتر</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs shadow-md shadow-blue-600/30 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>تطبيق الفلترة وإغلاق</span>
          </button>
        </div>
      </div>
    </div>
  );
};
