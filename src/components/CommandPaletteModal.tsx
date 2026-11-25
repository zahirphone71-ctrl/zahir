import React, { useState, useEffect, useMemo, useRef } from 'react';
import { TabType } from './Sidebar';
import { useMikroTik } from '../context/MikroTikContext';
import {
  Search,
  LayoutDashboard,
  Users,
  Sliders,
  Sparkles,
  Printer,
  Activity,
  LineChart,
  Network,
  Gauge,
  BookmarkCheck,
  Shield,
  Radio,
  FileText,
  Terminal,
  Bot,
  HardDrive,
  Server,
  Zap,
  RotateCcw,
  RefreshCw,
  X,
  Command,
  ArrowRight,
  Palette,
  Contrast,
  FileDown,
  FileSpreadsheet,
  CalendarClock
} from 'lucide-react';
import { applyAppTheme } from '../utils/themeManager';
import { exportUsersToCsv, exportActiveSessionsToCsv, exportScheduledTasksToCsv } from '../lib/formatters';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTab: (tab: TabType) => void;
  onOpenPdfExport?: () => void;
}

interface PaletteAction {
  id: string;
  title: string;
  category: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  action: () => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  onSelectTab,
  onOpenPdfExport
}) => {
  const {
    isConnected,
    users,
    activeUsers,
    profiles,
    connectionProfiles,
    activateConnectionProfile,
    syncNow,
    runCommand,
    scheduledTasks,
    showToast
  } = useMikroTik();

  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const isMountedRef = useRef(true);
  const dispatchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (dispatchTimerRef.current) clearTimeout(dispatchTimerRef.current);
    };
  }, []);

  const actions: PaletteAction[] = useMemo(() => {
    const list: PaletteAction[] = [
      {
        id: 'tab-dashboard',
        title: 'لوحة التحكم والمراقبة الرئيسية (Dashboard)',
        category: 'التنقل في الأقسام',
        icon: LayoutDashboard,
        action: () => {
          onSelectTab('dashboard');
          onClose();
        }
      },
      {
        id: 'tab-generator',
        title: 'مُوَلّد الكروت والبطاقات الذكي (Vouchers Generator)',
        category: 'التنقل في الأقسام',
        icon: Sparkles,
        action: () => {
          onSelectTab('generator');
          onClose();
        }
      },
      {
        id: 'tab-hotspot-users',
        title: 'إدارة مستخدمي ومشتركي الهوتسبوت (Hotspot Users)',
        category: 'التنقل في الأقسام',
        icon: Users,
        action: () => {
          onSelectTab('hotspot_users');
          onClose();
        }
      },
      {
        id: 'tab-card-studio',
        title: 'استوديو تصميم وطباعة الكروت A4 و POS (Card Print Studio)',
        category: 'التنقل في الأقسام',
        icon: Printer,
        action: () => {
          onSelectTab('card_studio');
          onClose();
        }
      },
      {
        id: 'tab-active-sessions',
        title: 'الجلسات المتصلة الآن لحظياً (Active Sessions)',
        category: 'التنقل في الأقسام',
        icon: Activity,
        action: () => {
          onSelectTab('active_sessions');
          onClose();
        }
      },
      {
        id: 'tab-profiles',
        title: 'باقات السرعات والبروفايلات (Bandwidth Profiles)',
        category: 'التنقل في الأقسام',
        icon: Sliders,
        action: () => {
          onSelectTab('profiles');
          onClose();
        }
      },
      {
        id: 'tab-traffic',
        title: 'مراقبة حركة الترافيك والمنافذ (Interfaces Traffic)',
        category: 'التنقل في الأقسام',
        icon: LineChart,
        action: () => {
          onSelectTab('traffic');
          onClose();
        }
      },
      {
        id: 'tab-queues',
        title: 'تحديد السرعات للآيبيهات (Simple Queues)',
        category: 'التنقل في الأقسام',
        icon: Gauge,
        action: () => {
          onSelectTab('queues');
          onClose();
        }
      },
      {
        id: 'tab-dhcp',
        title: 'سيرفر DHCP وتوزيع العناوين (DHCP Leases)',
        category: 'التنقل في الأقسام',
        icon: Network,
        action: () => {
          onSelectTab('dhcp');
          onClose();
        }
      },
      {
        id: 'tab-network',
        title: 'الشبكة والوايرلس (SSID، الأنتنات، صفحات تسجيل الدخول)',
        category: 'التنقل في الأقسام',
        icon: Radio,
        action: () => {
          onSelectTab('network_center');
          onClose();
        }
      },
      {
        id: 'action-wireless-scanner',
        title: 'ماسح الترددات والتشويش واختيار أفضل قناة للبث (Wireless Frequency Scanner)',
        category: 'الشبكة والوايرلس',
        icon: Activity,
        action: () => {
          onSelectTab('network_center');
          if (dispatchTimerRef.current) clearTimeout(dispatchTimerRef.current);
          dispatchTimerRef.current = setTimeout(() => {
            window.dispatchEvent(new CustomEvent('zctrl:open-network-section', { detail: 'scanner' }));
          }, 50);
          onClose();
        }
      },
      {
        id: 'tab-ip-binding',
        title: 'استثناء الأجهزة والشاشات وحظر MAC (IP Binding)',
        category: 'التنقل في الأقسام',
        icon: BookmarkCheck,
        action: () => {
          onSelectTab('ip_binding');
          onClose();
        }
      },
      {
        id: 'tab-firewall',
        title: 'الجدار الناري وتسريع FastTrack والحماية (Firewall)',
        category: 'التنقل في الأقسام',
        icon: Shield,
        action: () => {
          onSelectTab('firewall');
          onClose();
        }
      },
      {
        id: 'tab-terminal',
        title: 'طرفية الأوامر المباشرة لـ ZCtrl (CLI Terminal)',
        category: 'أدوات النظام',
        icon: Terminal,
        action: () => {
          onSelectTab('terminal');
          onClose();
        }
      },
      {
        id: 'tab-ai',
        title: 'المساعد الذكي لتشخيص الشبكة (AI Assistant)',
        category: 'أدوات النظام',
        icon: Bot,
        action: () => {
          onSelectTab('ai_assistant');
          onClose();
        }
      },
      {
        id: 'tab-logs',
        title: 'سجل أحداث النظام والعمليات (System Logs)',
        category: 'أدوات النظام',
        icon: FileText,
        action: () => {
          onSelectTab('logs');
          onClose();
        }
      },
      {
        id: 'tab-scheduled-tasks',
        title: 'جدولة المهام التلقائية للراوتر (Scheduled Tasks / RouterOS Scheduler)',
        category: 'أدوات النظام',
        icon: CalendarClock,
        action: () => {
          onSelectTab('scheduled_tasks');
          onClose();
        }
      },
      {
        id: 'tab-backup',
        title: 'النسخ الاحتياطي وتصدير الإعدادات (Backup & Export)',
        category: 'أدوات النظام',
        icon: HardDrive,
        action: () => {
          onSelectTab('backup');
          onClose();
        }
      },
      // Fast Router Actions
      {
        id: 'cmd-daily-reboot-view',
        title: 'ضبط وإدارة إعادة التشغيل اليومي التلقائي (Daily Reboot Schedule)',
        category: 'أوامر سريعة للراوتر',
        icon: CalendarClock,
        action: () => {
          onSelectTab('scheduled_tasks');
          onClose();
        }
      },
      {
        id: 'cmd-export-scheduled-csv',
        title: 'تصدير المهام المجدولة إلى ملف CSV',
        category: 'تصدير البيانات والتقارير',
        icon: FileSpreadsheet,
        action: () => {
          onClose();
          exportScheduledTasksToCsv(scheduledTasks);
          showToast('تم تصدير المهام المجدولة CSV بنجاح', 'success');
        }
      },
      {
        id: 'cmd-flush-dns',
        title: 'تفريغ وحذف كاش الـ DNS (Flush DNS Cache)',
        category: 'أوامر سريعة للراوتر',
        icon: RotateCcw,
        action: async () => {
          onClose();
          try {
            const res = await runCommand('/ip dns cache flush');
            if (!isMountedRef.current) return;
            if (res.success) {
              showToast('تم تفريغ كاش الـ DNS بنجاح على ZCtrl', 'success');
            } else {
              showToast(res.output || 'تعذر تفريغ كاش الـ DNS', 'error');
            }
          } catch {
            if (isMountedRef.current) showToast('حدث خطأ أثناء تفريغ كاش الـ DNS', 'error');
          }
        }
      },
      {
        id: 'cmd-sync-now',
        title: 'مزامنة وتحديث كافة بيانات ZCtrl الآن (Sync Now)',
        category: 'أوامر سريعة للراوتر',
        icon: RefreshCw,
        action: async () => {
          onClose();
          if (!isConnected) {
            showToast('الراوتر غير متصل حالياً', 'error');
            return;
          }
          try {
            await syncNow(true);
            if (isMountedRef.current) {
              showToast('تم تحديث ومزامنة البيانات مع ZCtrl', 'success');
            }
          } catch {
            if (isMountedRef.current) showToast('فشلت مزامنة البيانات مع الراوتر', 'error');
          }
        }
      },
      {
        id: 'cmd-export-pdf',
        title: 'تصدير بيانات الصفحة الحالية كتقرير PDF منسق (Export PDF)',
        category: 'التقارير والمستندات',
        icon: FileDown,
        action: () => {
          onClose();
          if (onOpenPdfExport) {
            onOpenPdfExport();
          }
        }
      },
      // Theme & Appearance Actions
      {
        id: 'theme-deep-void',
        title: 'تفعيل سمة السواد المطلق (Deep Void - True Black #000000)',
        category: 'المظهر والقوالب',
        icon: Contrast,
        action: () => {
          applyAppTheme('deep_void');
          onClose();
          showToast('تم تفعيل سمة السواد المطلق (Deep Void) بنجاح - راحة فائقة للعين ليلاً', 'success');
        }
      },
      {
        id: 'theme-gallery',
        title: 'معرض القوالب والأنماط الشاملة (App Themes & Templates)',
        category: 'المظهر والقوالب',
        icon: Palette,
        action: () => {
          onSelectTab('settings');
          onClose();
        }
      },
      // Router Connection Profiles Quick Switching Commands
      ...connectionProfiles.map((p) => ({
        id: `switch-profile-${p.id}`,
        title: `التبديل إلى بروفايل: ${p.name} (${p.category}) - ${p.host}`,
        category: 'بروفايلات الاتصال بالراوتر (1-Click Switch)',
        icon: Zap,
        action: async () => {
          onClose();
          const res = await activateConnectionProfile(p.id);
          if (isMountedRef.current && res?.needPassword) {
            showToast(`يتطلب بروفايل "${p.name}" إدخال كلمة المرور من إدارة البروفايلات`, 'info');
          }
        }
      })),
      // Fast CSV Reports
      {
        id: 'export-users-csv',
        title: 'تصدير المشتركين كملف إكسل CSV (Export Users CSV)',
        category: 'التقارير والمستندات',
        icon: FileSpreadsheet,
        action: () => {
          onClose();
          exportUsersToCsv(users);
          showToast(`تم تصدير ${users.length} مشترك كملف CSV بنجاح`, 'success');
        }
      },
      {
        id: 'export-active-csv',
        title: 'تصدير الجلسات النشطة كملف إكسل CSV (Export Active Sessions CSV)',
        category: 'التقارير والمستندات',
        icon: FileSpreadsheet,
        action: () => {
          onClose();
          exportActiveSessionsToCsv(activeUsers);
          showToast(`تم تصدير ${activeUsers.length} جلسة نشطة كملف CSV بنجاح`, 'success');
        }
      }
    ];

    return list;
  }, [isConnected, onSelectTab, onClose, onOpenPdfExport, runCommand, syncNow, showToast, connectionProfiles, activateConnectionProfile, users, activeUsers, scheduledTasks]);

  const filtered = useMemo(() => {
    if (!search.trim()) return actions;
    const term = search.toLowerCase();
    return actions.filter(
      (a) => a.title.toLowerCase().includes(term) || a.category.toLowerCase().includes(term)
    );
  }, [actions, search]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  // Keyboard navigation inside modal (Arrows, Enter, Escape, Ctrl+K)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onClose();
        return;
      }

      if (filtered.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          filtered[selectedIndex].action();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, filtered, selectedIndex]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-start justify-center pt-16 sm:pt-24 p-4 animate-in fade-in-50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header Bar */}
        <div className="p-4 border-b border-slate-800 flex items-center gap-3 bg-slate-950/80">
          <Search className="w-5 h-5 text-blue-400 shrink-0" />
          <input
            type="text"
            placeholder="ابحث عن قسم، كروت، مستخدمين، أوامر تشغيل سريعة... (Ctrl + K)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            className="flex-1 bg-transparent text-sm sm:text-base text-slate-100 placeholder-slate-500 focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="text-xs text-slate-400 hover:text-white p-1 rounded-md bg-slate-800"
            >
              ✕
            </button>
          )}
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              لم يتم العثور على أي نتائج مطابقة لـ "{search}"
            </div>
          ) : (
            filtered.map((item, idx) => {
              const ItemIcon = item.icon;
              const isSelected = idx === selectedIndex;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-right transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600/20 text-white border border-blue-500/40 shadow-xs'
                      : 'text-slate-300 hover:bg-slate-800/60 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`p-2 rounded-xl border ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-400'
                          : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      <ItemIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-semibold truncate">{item.title}</div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">{item.category}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-500 shrink-0">
                    <span>انتقال</span>
                    <ArrowRight className="w-3.5 h-3.5 rotate-180 text-blue-400" />
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 font-mono">
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px]">Enter</kbd> لتنفيذ
            </span>
            <span className="flex items-center gap-1 font-mono">
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px]">Esc</kbd> للإغلاق
            </span>
          </div>
          <span className="text-[11px] text-slate-400">ZCtrl Command Center</span>
        </div>
      </div>
    </div>
  );
};
