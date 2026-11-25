import React, { useState, useRef, useEffect } from 'react';
import { useMikroTik } from '../../context/MikroTikContext';
import { RouterConnectionProfile, RouterProfileCategory } from '../../types/mikrotik';
import {
  Home,
  Building2,
  Store,
  Server,
  Globe,
  Zap,
  ChevronDown,
  Check,
  Plus,
  Settings,
  Lock,
  Layers,
  ArrowRight
} from 'lucide-react';

interface HeaderProfileSwitcherProps {
  onOpenManageModal: () => void;
  onOpenAddModal: () => void;
}

const CATEGORY_ICONS: Record<RouterProfileCategory, React.ElementType> = {
  home: Home,
  office: Building2,
  branch: Store,
  datacenter: Server,
  custom: Globe
};

export const HeaderProfileSwitcher: React.FC<HeaderProfileSwitcherProps> = ({
  onOpenManageModal,
  onOpenAddModal
}) => {
  const {
    connectionProfiles,
    activeProfileId,
    activateConnectionProfile,
    isConnecting,
    isConnected,
    router: currentRouter,
    showToast
  } = useMikroTik();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Find active profile: either by activeProfileId, or by matching host with current connected router
  const activeProfile = connectionProfiles.find(
    p => p.id === activeProfileId || (isConnected && currentRouter && p.host === currentRouter.host)
  ) || connectionProfiles[0];

  const ActiveIcon = activeProfile ? (CATEGORY_ICONS[activeProfile.category] || Globe) : Server;

  const handleQuickSwitch = async (profile: RouterConnectionProfile) => {
    setIsOpen(false);
    if (isConnected && currentRouter?.host === profile.host) {
      showToast(`أنت متصل بالفعل ببروفايل: ${profile.name}`, 'info');
      return;
    }

    const res = await activateConnectionProfile(profile.id);
    if (res.needPassword) {
      onOpenManageModal();
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        id="header-profile-switcher-btn"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer shadow-xs ${
          isOpen
            ? 'bg-blue-600/25 border-blue-500/50 text-white ring-1 ring-blue-500/40'
            : isConnected
            ? 'bg-slate-950/80 hover:bg-slate-800 border-slate-700/80 text-slate-200'
            : 'bg-slate-800/80 hover:bg-slate-700 border-slate-700/80 text-slate-300'
        }`}
        title="التبديل السريع بين بروفايلات الراوتر (منزل، مكتب، فرع)"
      >
        <div className={`p-1 rounded-lg ${
          activeProfile?.category === 'home' ? 'bg-blue-500/20 text-blue-400' :
          activeProfile?.category === 'office' ? 'bg-emerald-500/20 text-emerald-400' :
          activeProfile?.category === 'branch' ? 'bg-amber-500/20 text-amber-400' :
          'bg-purple-500/20 text-purple-400'
        }`}>
          <ActiveIcon className="w-3.5 h-3.5" />
        </div>
        
        <div className="flex flex-col text-right">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-xs truncate max-w-[90px] sm:max-w-[120px]">
              {activeProfile ? activeProfile.name : 'بروفايل الاتصال'}
            </span>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-blue-400' : ''}`} />
          </div>
        </div>
      </button>

      {/* Floating Dropdown */}
      {isOpen && (
        <div className="absolute left-0 mt-2 w-72 sm:w-80 bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl p-3 z-50 animate-in fade-in-50 zoom-in-95 text-right space-y-2.5" dir="rtl">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div>
              <span className="text-xs font-bold text-white block">بروفايلات الاتصال بالراوتر</span>
              <span className="text-[10px] text-slate-400 block">تبديل فوري بضغطة زر واحدة</span>
            </div>
            <span className="text-[10px] font-mono font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">
              {connectionProfiles.length} بروفايل
            </span>
          </div>

          {/* Profiles List */}
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
            {connectionProfiles.map((p) => {
              const Icon = CATEGORY_ICONS[p.category] || Globe;
              const isCurrent = isConnected && currentRouter?.host === p.host;

              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleQuickSwitch(p)}
                  disabled={isConnecting}
                  className={`w-full p-2.5 rounded-xl border text-right transition-all flex items-center justify-between group cursor-pointer ${
                    isCurrent
                      ? 'bg-blue-600/15 border-blue-500/50 text-white'
                      : 'bg-slate-950/60 border-slate-800/80 text-slate-300 hover:bg-slate-800/70 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`p-2 rounded-lg shrink-0 ${
                      p.category === 'home' ? 'bg-blue-500/10 text-blue-400' :
                      p.category === 'office' ? 'bg-emerald-500/10 text-emerald-400' :
                      p.category === 'branch' ? 'bg-amber-500/10 text-amber-400' :
                      'bg-purple-500/10 text-purple-400'
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs truncate text-white">{p.name}</span>
                        {isCurrent && (
                          <span className="text-[8px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold shrink-0">
                            نشط
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono truncate" dir="ltr">
                        {p.host}:{p.port || 8728}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 mr-2">
                    {isCurrent ? (
                      <div className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg">
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    ) : (
                      <div className="px-2 py-1 bg-blue-600/10 group-hover:bg-blue-600 text-blue-400 group-hover:text-white rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors">
                        <Zap className="w-3 h-3 text-amber-300" />
                        <span>تبديل</span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Bottom Actions */}
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenAddModal();
              }}
              className="flex-1 py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-blue-400" />
              <span>إضافة بروفايل</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenManageModal();
              }}
              className="py-1.5 px-3 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/20 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>إدارة كاملة</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
