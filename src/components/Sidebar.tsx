import React, { useState, useEffect, useMemo } from 'react';
import {
  useConnectionSession,
  useSubscribersState,
  useNetworkState,
  useMikroTikActions
} from '../context/MikroTikContext';
import { safeStorage } from '../utils/safeStorage';
import { LogoZ } from './LogoZ';
import { ZCtrlTitle } from './ZCtrlTitle';
import {
  LayoutDashboard,
  Users,
  Sliders,
  Sparkles,
  Printer,
  Activity,
  Network,
  Gauge,
  LineChart,
  Terminal,
  Bot,
  HardDrive,
  CheckCircle2,
  X,
  Radio,
  Server,
  Shield,
  FileText,
  BookmarkCheck,
  Cpu,
  LogOut,
  ChevronDown,
  ChevronLeft,
  Search,
  Layers,
  Zap,
  ChevronsUpDown,
  Lock,
  Wifi,
  PanelRightClose,
  PanelRightOpen,
  Star,
  CalendarClock
} from 'lucide-react';

export type TabType =
  | 'dashboard'
  | 'mikrotik_login'
  | 'hotspot_users'
  | 'profiles'
  | 'generator'
  | 'card_studio'
  | 'active_sessions'
  | 'network_center'
  | 'ip_binding'
  | 'dhcp'
  | 'ppp'
  | 'userman'
  | 'queues'
  | 'firewall'
  | 'traffic'
  | 'scheduled_tasks'
  | 'terminal'
  | 'logs'
  | 'ai_assistant'
  | 'backup'
  | 'settings'
  | 'guide';

export type CategoryId = 'monitoring' | 'hotspot' | 'profiles_cat' | 'cards' | 'network' | 'system' | 'settings_cat';

export interface SubMenuItem {
  id: TabType;
  label: string;
  shortDesc: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number | null;
  badgeColor?: string;
  highlight?: boolean;
}

export interface MainCategory {
  id: CategoryId;
  title: string;
  badgeTitle: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  borderActive: string;
  badgeBg: string;
  iconColor: string;
  items: SubMenuItem[];
}

export const MAIN_CATEGORIES_CONFIG: {
  id: CategoryId;
  title: string;
  badgeTitle: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  borderActive: string;
  badgeBg: string;
  iconColor: string;
  itemIds: TabType[];
}[] = [
  {
    id: 'monitoring',
    title: 'الرئيسية والمراقبة الحية',
    badgeTitle: 'المراقبة',
    description: 'لوحة التحكم المباشرة، الجلسات المتصلة، وترافيك المنافذ',
    icon: LayoutDashboard,
    gradient: 'from-cyan-600/20 to-blue-600/10',
    borderActive: 'border-cyan-500/50 bg-cyan-950/20',
    badgeBg: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    iconColor: 'text-cyan-400',
    itemIds: ['dashboard', 'active_sessions', 'traffic']
  },
  {
    id: 'hotspot',
    title: 'إدارة المشتركين والعملاء',
    badgeTitle: 'المشتركين',
    description: 'قاعدة بيانات المشتركين وسيرفر الهوتسبوت واشتراكات PPPoE واليوزر مانجر',
    icon: Users,
    gradient: 'from-indigo-600/20 to-blue-600/10',
    borderActive: 'border-indigo-500/50 bg-indigo-950/20',
    badgeBg: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    iconColor: 'text-indigo-400',
    itemIds: ['hotspot_users', 'ppp', 'userman']
  },
  {
    id: 'profiles_cat',
    title: 'إدارة البروفايلات والسرعات',
    badgeTitle: 'البروفايلات',
    description: 'باقات السرعات والبروفايلات، تحديد Queues، والأجهزة المستثناة',
    icon: Sliders,
    gradient: 'from-purple-600/20 to-pink-600/10',
    borderActive: 'border-purple-500/50 bg-purple-950/20',
    badgeBg: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    iconColor: 'text-purple-400',
    itemIds: ['profiles', 'queues', 'ip_binding']
  },
  {
    id: 'cards',
    title: 'استوديو الكروت',
    badgeTitle: 'استوديو الكروت',
    description: 'توليد وتصميم وطباعة كروت ZCtrl A4 وإيصالات حرارية POS',
    icon: Sparkles,
    gradient: 'from-amber-600/20 to-orange-600/10',
    borderActive: 'border-amber-500/50 bg-amber-950/20',
    badgeBg: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    iconColor: 'text-amber-400',
    itemIds: ['card_studio']
  },
  {
    id: 'network',
    title: 'خدمات الشبكة والوايرلس والجدار الناري',
    badgeTitle: 'الشبكة والوايرلس',
    description: 'إدارة شبكات البث SSID، الأنتنات المتصلة، صفحات الهوتسبوت، سيرفر DHCP، والجدار الناري',
    icon: Radio,
    gradient: 'from-indigo-600/20 to-teal-600/10',
    borderActive: 'border-indigo-500/50 bg-indigo-950/20',
    badgeBg: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    iconColor: 'text-indigo-400',
    itemIds: ['network_center', 'dhcp', 'firewall']
  },
  {
    id: 'system',
    title: 'أدوات النظام والتشخيص',
    badgeTitle: 'النظام و AI',
    description: 'سجل الأحداث، المساعد الذكي Gemini AI، طرفية الأوامر CLI، ودليل التشغيل',
    icon: Terminal,
    gradient: 'from-slate-700/30 to-slate-800/20',
    borderActive: 'border-slate-500/50 bg-slate-900/40',
    badgeBg: 'bg-slate-700/30 text-slate-300 border-slate-600/30',
    iconColor: 'text-slate-300',
    itemIds: ['scheduled_tasks', 'logs', 'terminal', 'ai_assistant', 'guide']
  },
  {
    id: 'settings_cat',
    title: 'الإعدادات والضبط والنسخ',
    badgeTitle: 'الإعدادات والضبط',
    description: 'إعدادات البرنامج والربط والمزامنة والنسخ الاحتياطي',
    icon: Sliders,
    gradient: 'from-amber-600/20 to-rose-600/10',
    borderActive: 'border-amber-500/50 bg-amber-950/20',
    badgeBg: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    iconColor: 'text-amber-400',
    itemIds: ['settings', 'backup']
  }
];

export function getCategoryForTab(tab: TabType) {
  const found = MAIN_CATEGORIES_CONFIG.find((cat) => cat.itemIds.includes(tab));
  return found || MAIN_CATEGORIES_CONFIG[0];
}

interface SidebarProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  isOpenMobile = false,
  onCloseMobile,
  isCollapsed = false,
  onToggleCollapse
}) => {
  const { isConnected, routerIdentity, userRole, operatorName } = useConnectionSession();
  const {
    users,
    profiles,
    activeUsers,
    pppActive,
    usermanActive,
    usermanUsers
  } = useSubscribersState();
  const {
    ipBindings,
    dhcpLeases,
    firewallRules,
    systemLogs,
    wirelessInterfaces,
    registrationTable,
    scheduledTasks
  } = useNetworkState();
  const { disconnectRouter, showToast } = useMikroTikActions();

  const [searchTerm, setSearchTerm] = useState('');

  // Pinned Favorites State stored in safeStorage (resilient in sandboxed iframes)
  const [pinnedTabs, setPinnedTabs] = useState<TabType[]>(() => {
    return safeStorage.getJSON<TabType[]>('zctrl_sidebar_pinned_favorites', [
      'dashboard',
      'hotspot_users',
      'active_sessions',
      'card_studio'
    ]);
  });

  const togglePinTab = (e: React.MouseEvent, tabId: TabType) => {
    e.stopPropagation();
    setPinnedTabs((prev) => {
      const next = prev.includes(tabId) ? prev.filter((id) => id !== tabId) : [...prev, tabId];
      safeStorage.setJSON('zctrl_sidebar_pinned_favorites', next);
      return next;
    });
  };

  // Expand state for each main category tab
  const [expandedCategories, setExpandedCategories] = useState<Record<CategoryId, boolean>>({
    monitoring: true,
    hotspot: true,
    profiles_cat: true,
    cards: true,
    network: true,
    system: true,
    settings_cat: true
  });

  // Auto-expand category containing the active tab
  useEffect(() => {
    const parent = getCategoryForTab(activeTab);
    if (parent) {
      setExpandedCategories((prev) => ({
        ...prev,
        [parent.id]: true
      }));
    }
  }, [activeTab]);

  const isTabAllowedForRole = (tabId: TabType): boolean => {
    if (userRole === 'admin') return true;
    if (userRole === 'cashier') {
      return [
        'dashboard',
        'active_sessions',
        'hotspot_users',
        'profiles',
        'card_studio',
        'guide'
      ].includes(tabId);
    }
    // viewer
    return ['dashboard', 'active_sessions', 'traffic', 'logs', 'guide'].includes(tabId);
  };

  const handleTabClick = (tabId: TabType) => {
    if (!isTabAllowedForRole(tabId)) {
      showToast(
        userRole === 'cashier'
          ? 'هذا القسم مخصص للمدير العام فقط (صلاحية أمين الصندوق تسمح بإدارة الكروت والمشتركين والجلسات)'
          : 'حسابك بصلاحية مراقب (Viewer) ولا يسمح بفتح أقسام التعديل والإدارة المتقدمة',
        'error'
      );
      return;
    }
    onSelectTab(tabId);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const toggleCategory = (categoryId: CategoryId) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [categoryId]: !prev[categoryId]
    }));
  };

  const toggleAllCategories = () => {
    const allExpanded = Object.values(expandedCategories).every(Boolean);
    setExpandedCategories({
      monitoring: !allExpanded,
      hotspot: !allExpanded,
      profiles_cat: !allExpanded,
      cards: !allExpanded,
      network: !allExpanded,
      system: !allExpanded,
      settings_cat: !allExpanded
    });
  };

  // Build category objects with dynamic badges
  const categories: MainCategory[] = useMemo(() => [
    {
      id: 'monitoring',
      title: 'الرئيسية والمراقبة الحية',
      badgeTitle: 'المراقبة',
      description: 'لوحة التحكم المباشرة، الجلسات المتصلة، وترافيك المنافذ',
      icon: LayoutDashboard,
      gradient: 'from-cyan-600/20 to-blue-600/10',
      borderActive: 'border-cyan-500/50 bg-cyan-950/20',
      badgeBg: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
      iconColor: 'text-cyan-400',
      items: [
        {
          id: 'dashboard',
          label: 'لوحة المراقبة',
          shortDesc: 'مراقبة مركزية شاملة لكافة التبويبات والعمليات',
          icon: LayoutDashboard
        },
        {
          id: 'active_sessions',
          label: 'الجلسات المتصلة الآن',
          shortDesc: 'المستخدمين النشطين لحظياً',
          icon: Activity,
          badge: ((activeUsers?.length || 0) + (pppActive?.length || 0) + (usermanActive?.length || 0)) || null,
          badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
        },
        {
          id: 'traffic',
          label: 'حركة المنافذ والترافيك',
          shortDesc: 'معدل سحب البيانات وسرعة المنافذ',
          icon: LineChart
        }
      ]
    },
    {
      id: 'hotspot',
      title: 'إدارة المشتركين والعملاء',
      badgeTitle: 'المشتركين',
      description: 'قاعدة بيانات المشتركين وسيرفر الهوتسبوت واشتراكات PPPoE واليوزر مانجر',
      icon: Users,
      gradient: 'from-indigo-600/20 to-blue-600/10',
      borderActive: 'border-indigo-500/50 bg-indigo-950/20',
      badgeBg: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
      iconColor: 'text-indigo-400',
      items: [
        {
          id: 'hotspot_users',
          label: 'مستخدمي سيرفر الهوتسبوت',
          shortDesc: 'قاعدة بيانات الكروت والمستخدمين',
          icon: Users,
          badge: users.length,
          badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30'
        },
        {
          id: 'ppp',
          label: 'اشتراكات البرودباند PPPoE',
          shortDesc: 'إدارة اشتراكات البرودباند السلكية',
          icon: Network,
          badge: pppActive.length,
          badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
        },
        {
          id: 'userman',
          label: 'مشتركي اليوزر مانجر (User Manager)',
          shortDesc: 'نظام إدارة المشتركين المتقدم RouterOS',
          icon: Shield,
          badge: usermanUsers.length,
          badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30'
        }
      ]
    },
    {
      id: 'profiles_cat',
      title: 'إدارة البروفايلات والسرعات',
      badgeTitle: 'البروفايلات',
      description: 'باقات السرعات والبروفايلات، تحديد Queues، والأجهزة المستثناة',
      icon: Sliders,
      gradient: 'from-purple-600/20 to-pink-600/10',
      borderActive: 'border-purple-500/50 bg-purple-950/20',
      badgeBg: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
      iconColor: 'text-purple-400',
      items: [
        {
          id: 'profiles',
          label: 'باقات السرعات والبروفايلات',
          shortDesc: 'تحديد مدد وسرعات الكروت',
          icon: Sliders,
          badge: profiles.length,
          badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30'
        },
        {
          id: 'queues',
          label: 'تحديد السرعات (Queues)',
          shortDesc: 'التحكم في سرعات الآيبيهات والمشتركين',
          icon: Gauge
        },
        {
          id: 'ip_binding',
          label: 'الأجهزة المستثناة (IP Binding)',
          shortDesc: 'استثناء الشاشات والكاميرات وحظر MAC',
          icon: BookmarkCheck,
          badge: ipBindings.length,
          badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
        }
      ]
    },
    {
      id: 'cards',
      title: 'استوديو الكروت',
      badgeTitle: 'استوديو الكروت',
      description: 'توليد وتصميم وطباعة كروت ZCtrl A4 وإيصالات حرارية POS',
      icon: Sparkles,
      gradient: 'from-amber-600/20 to-orange-600/10',
      borderActive: 'border-amber-500/50 bg-amber-950/20',
      badgeBg: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      iconColor: 'text-amber-400',
      items: [
        {
          id: 'card_studio',
          label: 'استوديو الكروت',
          shortDesc: 'توليد وتصميم وطباعة الكروت A4 و POS',
          icon: Sparkles,
          badge: 'شامل',
          highlight: true
        }
      ]
    },
    {
      id: 'network',
      title: 'خدمات الشبكة والوايرلس والجدار الناري',
      badgeTitle: 'الشبكة والوايرلس',
      description: 'إدارة شبكات البث SSID، الأنتنات المتصلة، صفحات الهوتسبوت، سيرفر DHCP، والجدار الناري',
      icon: Radio,
      gradient: 'from-indigo-600/20 to-teal-600/10',
      borderActive: 'border-indigo-500/50 bg-indigo-950/20',
      badgeBg: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
      iconColor: 'text-indigo-400',
      items: [
        {
          id: 'network_center',
          label: 'الشبكة',
          shortDesc: 'قراءة شبكات البث SSID، الأنتنات المتصلة، وبوابات الدخول',
          icon: Radio,
          badge: (wirelessInterfaces.length + registrationTable.length) || null,
          badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
          highlight: true
        },
        {
          id: 'dhcp',
          label: 'سيرفر DHCP وحجز العناوين',
          shortDesc: 'عناوين الأجهزة والحجز الثابت',
          icon: Network,
          badge: dhcpLeases.length,
          badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
        },
        {
          id: 'firewall',
          label: 'الجدار الناري والأمان',
          shortDesc: 'الحماية وتسريع FastTrack',
          icon: Shield,
          badge: firewallRules.length,
          badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
        }
      ]
    },
    {
      id: 'system',
      title: 'أدوات النظام والتشخيص',
      badgeTitle: 'النظام و AI',
      description: 'سجل الأحداث، المساعد الذكي Gemini AI، طرفية الأوامر CLI، ودليل التشغيل',
      icon: Terminal,
      gradient: 'from-slate-700/30 to-slate-800/20',
      borderActive: 'border-slate-500/50 bg-slate-900/40',
      badgeBg: 'bg-slate-700/30 text-slate-300 border-slate-600/30',
      iconColor: 'text-slate-300',
      items: [
        {
          id: 'scheduled_tasks',
          label: 'المهام المجدولة (Scheduler)',
          shortDesc: 'إعادة التشغيل والنسخ الاحتياطي والصيانة التلقائية',
          icon: CalendarClock,
          badge: scheduledTasks.filter(t => !t.disabled).length || null,
          badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
          highlight: true
        },
        {
          id: 'logs',
          label: 'سجل الأحداث (Logs)',
          shortDesc: 'متابعة سجلات الدخول والأمان',
          icon: FileText,
          badge: systemLogs.length,
          badgeColor: 'bg-slate-800 text-slate-300 border-slate-700'
        },
        {
          id: 'terminal',
          label: 'طرفية الأوامر (Terminal)',
          shortDesc: 'تنفيذ أوامر RouterOS CLI مباشرة',
          icon: Terminal
        },
        {
          id: 'ai_assistant',
          label: 'المساعد الذكي (AI Assistant)',
          shortDesc: 'إنشاء سكربتات وتحليل الأعطال بالذكاء',
          icon: Bot,
          badge: 'Gemini AI',
          badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30'
        },
        {
          id: 'guide',
          label: 'دليل المستخدم والتشغيل',
          shortDesc: 'شرح تفصيلي للتبويبات وتأثيرها على مايكروتك',
          icon: FileText
        }
      ]
    },
    {
      id: 'settings_cat',
      title: 'الإعدادات والضبط والنسخ',
      badgeTitle: 'الإعدادات والضبط',
      description: 'إعدادات البرنامج والربط والمزامنة والنسخ الاحتياطي',
      icon: Sliders,
      gradient: 'from-amber-600/20 to-rose-600/10',
      borderActive: 'border-amber-500/50 bg-amber-950/20',
      badgeBg: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      iconColor: 'text-amber-400',
      items: [
        {
          id: 'settings',
          label: 'إعدادات البرنامج والربط',
          shortDesc: 'إعدادات المزامنة وتوليد الكروت والأمان',
          icon: Sliders,
          badge: 'رئيسي',
          badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
          highlight: true
        },
        {
          id: 'backup',
          label: 'النسخ الاحتياطي والضبط',
          shortDesc: 'تصدير الإعدادات وحفظ السيرفر',
          icon: HardDrive
        }
      ]
    }
  ], [
    activeUsers.length,
    users.length,
    pppActive.length,
    usermanUsers.length,
    profiles.length,
    ipBindings.length,
    wirelessInterfaces.length,
    registrationTable.length,
    dhcpLeases.length,
    firewallRules.length,
    systemLogs.length,
    scheduledTasks
  ]);

  // Visible categories (sidebar is only mounted when connected)
  const visibleCategories = categories;

  // Filter items if searching
  const filteredCategories = useMemo(() => {
    return visibleCategories
      .map((category) => {
        const filteredItems = category.items.filter(
          (item) =>
            item.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.shortDesc.toLowerCase().includes(searchTerm.toLowerCase()) ||
            category.title.toLowerCase().includes(searchTerm.toLowerCase())
        );
        return {
          ...category,
          items: filteredItems
        };
      })
      .filter((cat) => cat.items.length > 0);
  }, [visibleCategories, searchTerm]);

  const isSearching = searchTerm.trim().length > 0;

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-black/70 backdrop-blur-xs z-40 md:hidden"
        />
      )}

      {/* Navigation Sidebar */}
      <aside
        className={`
          fixed md:static inset-y-0 start-0 z-40 md:z-30
          ${isCollapsed ? 'md:w-16 w-72' : 'w-72 sm:w-80 md:w-72 lg:w-80 xl:w-84'}
          bg-slate-900/95 backdrop-blur-md border-e border-slate-800/80 flex flex-col justify-between shrink-0
          transition-all duration-300 ease-in-out shadow-2xl md:shadow-none select-none
          ${isOpenMobile ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
        `}
      >
        {/* ========================================================= */}
        {/* CASE 1: COLLAPSED RAIL MODE (DESKTOP) */}
        {/* ========================================================= */}
        {isCollapsed && (
          <div className="hidden md:flex flex-col h-full justify-between py-2.5 items-center w-full">
            {/* Top: Expand Toggle Icon & Mini Logo */}
            <div className="flex flex-col items-center gap-2 w-full px-2">
              <button
                type="button"
                onClick={onToggleCollapse}
                id="sidebar-expand-rail-btn"
                className="w-10 h-10 rounded-xl bg-slate-800/90 hover:bg-blue-600/20 text-slate-300 hover:text-blue-400 border border-slate-700/80 flex items-center justify-center transition-all cursor-pointer shadow-sm group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                title="توسيع القائمة الجانبية (شاشة كاملة)"
                aria-label="توسيع القائمة الجانبية"
              >
                <PanelRightOpen className="w-4 h-4 text-blue-400" />
              </button>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-slate-950/60 border border-slate-800">
                <LogoZ size={20} />
              </div>
            </div>

            {/* Middle: Icon Rail for Categories */}
            <div className="flex-1 w-full overflow-y-auto overflow-x-hidden custom-scrollbar py-3 space-y-2 px-2 flex flex-col items-center">
              {filteredCategories.map((category) => {
                const CatIcon = category.icon;
                const hasActiveChild = category.items.some((item) => item.id === activeTab);

                return (
                  <div key={category.id} className="relative group w-full flex justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        if (category.items.length === 1) {
                          handleTabClick(category.items[0].id);
                        } else {
                          const activeInCat = category.items.find((i) => i.id === activeTab);
                          if (activeInCat) {
                            handleTabClick(activeInCat.id);
                          } else {
                            handleTabClick(category.items[0].id);
                          }
                        }
                      }}
                      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all relative cursor-pointer border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                        hasActiveChild
                          ? 'bg-blue-600 text-white border-blue-400 shadow-md shadow-blue-500/30 ring-1 ring-blue-400'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-100 hover:bg-slate-800 hover:border-slate-700'
                      }`}
                      title={category.title}
                      aria-label={category.title}
                    >
                      <CatIcon className="w-4 h-4" />
                      {hasActiveChild && (
                        <span className="w-1.5 h-1.5 rounded-full bg-white absolute top-1 end-1 shadow-[0_0_4px_rgba(255,255,255,0.9)]" />
                      )}
                    </button>

                    {/* Flyout Submenu Popover on Hover (opens to end side in RTL) */}
                    <div className="absolute start-12 top-0 z-50 hidden group-hover:flex flex-col w-56 bg-slate-900/95 border border-slate-700/90 rounded-2xl p-2 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 text-start">
                      <div className="px-2.5 py-1.5 mb-1 border-b border-slate-800 flex items-center justify-between">
                        <span className="text-xs font-bold text-blue-300 truncate">{category.title}</span>
                        <span className="text-xs text-slate-400 font-mono px-1.5 py-0.5 rounded-md bg-slate-800 border border-slate-700">
                          {category.items.length}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {category.items.map((sub) => {
                          const SubIcon = sub.icon;
                          const isSubActive = activeTab === sub.id;
                          return (
                            <button
                              key={sub.id}
                              type="button"
                              onClick={() => handleTabClick(sub.id)}
                              className={`w-full flex items-center justify-between p-2 rounded-xl text-xs transition-all text-start cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                isSubActive
                                  ? 'bg-blue-600 text-white font-bold shadow-xs'
                                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <SubIcon className={`w-3.5 h-3.5 shrink-0 ${isSubActive ? 'text-white' : 'text-slate-400'}`} />
                                <span className="truncate">{sub.label}</span>
                              </div>
                              {sub.badge !== undefined && sub.badge !== null && (
                                <span className="text-xs font-mono px-1.5 py-0.5 rounded-full bg-slate-950/80 text-slate-300 border border-slate-700 shrink-0">
                                  {sub.badge}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom: Status dot & Quick Action */}
            <div className="w-full px-2 pt-2 border-t border-slate-800/80 flex flex-col items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" title="RouterOS v7 (متصل)" />
              {isConnected && (
                <button
                  type="button"
                  onClick={disconnectRouter}
                  className="w-9 h-9 rounded-xl bg-rose-500/10 hover:bg-rose-600/20 text-rose-300 border border-rose-500/20 flex items-center justify-center cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                  title="تسجيل الخروج وقطع الاتصال"
                  aria-label="تسجيل الخروج وقطع الاتصال"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* CASE 2: FULL EXPANDED MODE (OR MOBILE DRAWER) */}
        {/* ========================================================= */}
        <div className={`flex flex-col h-full justify-between ${isCollapsed ? 'md:hidden flex' : 'flex'}`}>
          {/* Mobile / Desktop Header in Drawer */}
          <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
            <div className="flex items-center gap-2">
              <LogoZ size={28} />
              <ZCtrlTitle size="sm" />
            </div>

            <div className="flex items-center gap-1.5">
              {/* Desktop Collapse Button */}
              {onToggleCollapse && (
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  id="sidebar-collapse-btn"
                  className="hidden md:flex items-center gap-1 p-1.5 px-2.5 text-slate-300 hover:text-white rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700/80 cursor-pointer text-xs font-semibold transition-all shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  title="طي القائمة الجانبية لحافة الشاشة"
                >
                  <PanelRightClose className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-xs">طي القائمة</span>
                </button>
              )}

              {/* Mobile Close Button */}
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="إغلاق القائمة الجانبية"
                className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800 cursor-pointer md:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Search & Collapse All Control Bar */}
          <div className="p-3 border-b border-slate-800/80 bg-slate-950/60 space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute start-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="تصفية القوائم والأقسام..."
                aria-label="تصفية القوائم والأقسام"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl ps-8 pe-8 py-1.5 text-xs text-slate-200 placeholder-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus:border-blue-500 transition-colors"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  aria-label="مسح نص البحث"
                  className="absolute end-2.5 top-2 text-slate-400 hover:text-slate-200 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span className="font-medium text-slate-400">أقسام إدارة الراوتر:</span>
              <button
                type="button"
                onClick={toggleAllCategories}
                className="text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold cursor-pointer text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
              >
                <ChevronsUpDown className="w-3 h-3" />
                <span>طي / توسيع</span>
              </button>
            </div>
          </div>

          {/* Pinned Favorites Quick Bar (المفضلة السريعة المثبتة) */}
          {pinnedTabs.length > 0 && !isSearching && (
            <div className="px-3 pt-2.5 pb-1 bg-slate-950/40 border-b border-slate-800/60">
              <div className="flex items-center justify-between text-xs font-bold text-amber-400/90 mb-1.5 px-0.5">
                <span className="flex items-center gap-1">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  <span>المفضلة السريعة (Pinned)</span>
                </span>
                <span className="text-xs text-slate-400 font-mono">{pinnedTabs.length} مثبت</span>
              </div>
              <div className="flex flex-wrap gap-1.5 pb-1">
                {pinnedTabs.map((pinnedId) => {
                  let foundItem: SubMenuItem | null = null;
                  for (const cat of categories) {
                    const match = cat.items.find((i) => i.id === pinnedId);
                    if (match) {
                      foundItem = match;
                      break;
                    }
                  }
                  if (!foundItem) return null;
                  const PinnedIcon = foundItem.icon;
                  const isActive = activeTab === pinnedId;

                  return (
                    <button
                      key={pinnedId}
                      type="button"
                      onClick={() => handleTabClick(pinnedId)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold transition-all border cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                        isActive
                          ? 'bg-blue-600 text-white border-blue-400 shadow-sm shadow-blue-500/30'
                          : 'bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <PinnedIcon className={`w-3 h-3 ${isActive ? 'text-white' : 'text-amber-400'}`} />
                      <span className="truncate max-w-[110px]">{foundItem.label.split(' ')[0] || foundItem.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Main Categories & Nested Sub-menus List */}
          <div className="p-2.5 space-y-2 overflow-y-auto flex-1 custom-scrollbar">
            {filteredCategories.map((category) => {
              const CatIcon = category.icon;
              const isCategoryExpanded = isSearching || expandedCategories[category.id];
              const hasActiveChild = category.items.some((item) => item.id === activeTab);

              return (
                <div
                  key={category.id}
                  className={`rounded-2xl border transition-all overflow-hidden ${
                    hasActiveChild
                      ? 'border-blue-500/40 bg-slate-950/90 shadow-md'
                      : 'border-slate-800/80 bg-slate-950/40 hover:border-slate-700/80'
                  }`}
                >
                  {/* Main Category Header Tab (التبويب الرئيسي) */}
                  <button
                    type="button"
                    onClick={() => toggleCategory(category.id)}
                    id={`main-category-tab-${category.id}`}
                    className={`w-full flex items-center justify-between p-2.5 transition-all text-start group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      hasActiveChild ? 'bg-gradient-to-r from-blue-950/40 to-slate-900' : 'hover:bg-slate-900/80'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 border transition-all ${
                          hasActiveChild
                            ? 'bg-blue-600 text-white border-blue-400 shadow-xs shadow-blue-500/30'
                            : 'bg-slate-900 border-slate-800 text-slate-400 group-hover:text-slate-200 group-hover:border-slate-700'
                        }`}
                      >
                        <CatIcon className="w-3.5 h-3.5" />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-xs font-bold truncate transition-colors ${
                              hasActiveChild ? 'text-blue-300' : 'text-slate-200 group-hover:text-white'
                            }`}
                          >
                            {category.title}
                          </span>
                          {hasActiveChild && (
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                          )}
                        </div>
                        <div className="text-xs text-slate-400 truncate mt-0.5 font-mono">
                          {category.items.length} قوائم فرعية
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <div
                        className={`p-1 rounded-lg text-slate-400 transition-transform duration-200 ${
                          isCategoryExpanded ? 'rotate-180 text-blue-400' : 'rotate-0'
                        }`}
                      >
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>
                  </button>

                  {/* Nested Internal Sub-menus (القوائم الداخلية) */}
                  {isCategoryExpanded && (
                    <div className="p-1.5 pt-0 space-y-1 bg-slate-950/30 border-t border-slate-800/60">
                      <div className="relative space-y-1 border-s-2 border-slate-800/80 ms-2 ps-2 my-1">
                        {category.items.map((item) => {
                          const ItemIcon = item.icon;
                          const isChildActive = activeTab === item.id;

                          return (
                            <div
                              key={item.id}
                              className={`w-full flex items-center justify-between gap-1 rounded-xl transition-all group ${
                                isChildActive
                                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold shadow-md shadow-blue-600/30 ring-1 ring-blue-400'
                                  : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                              }`}
                            >
                              <button
                                type="button"
                                role="tab"
                                aria-selected={isChildActive}
                                id={`sidebar-subitem-${item.id}`}
                                onClick={() => handleTabClick(item.id)}
                                className="flex-1 min-w-0 flex items-center justify-between gap-2 p-2 rounded-xl text-xs cursor-pointer text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <ItemIcon
                                    className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                                      isChildActive
                                        ? 'text-white'
                                        : item.highlight
                                        ? 'text-amber-400'
                                        : 'text-slate-400 group-hover:text-blue-400'
                                    }`}
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-xs font-semibold leading-tight">{item.label}</div>
                                  </div>
                                </div>

                                {item.badge !== undefined && item.badge !== null && (
                                  <span
                                    className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full border shrink-0 whitespace-nowrap ${
                                      isChildActive
                                        ? 'bg-white/20 text-white border-white/40'
                                        : item.badgeColor
                                        ? item.badgeColor
                                        : 'bg-slate-900 text-slate-400 border-slate-800'
                                    }`}
                                  >
                                    {item.badge}
                                  </span>
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={(e) => togglePinTab(e, item.id)}
                                className={`p-1.5 me-1 rounded-lg transition-all cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                                  pinnedTabs.includes(item.id)
                                    ? 'text-amber-400 opacity-100 hover:text-amber-300'
                                    : isChildActive
                                    ? 'text-white/70 opacity-100 hover:text-white'
                                    : 'text-slate-400 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-amber-400'
                                }`}
                                title={pinnedTabs.includes(item.id) ? 'إلغاء التثبيت من المفضلة' : 'تثبيت في المفضلة السريعة'}
                                aria-label={pinnedTabs.includes(item.id) ? `إلغاء تثبيت ${item.label}` : `تثبيت ${item.label} في المفضلة`}
                              >
                                <Star
                                  className={`w-3 h-3 ${
                                    pinnedTabs.includes(item.id) ? 'fill-amber-400 text-amber-400' : ''
                                  }`}
                                />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {!isConnected && (
              <div className="p-3.5 rounded-2xl bg-amber-950/30 border border-amber-500/30 text-amber-200 space-y-2 mt-2 shadow-lg">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
                  <Lock className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>باقي القوائم مخفية</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  سجل الدخول أو اتصل بالسيرفر أولاً لإظهار باقي القوائم والعمليات (المراقبة، المشتركين، الكروت، الجدار الناري).
                </p>
              </div>
            )}
          </div>

          {/* Footer / System Status & Logout */}
          <div className="p-3 border-t border-slate-800 bg-slate-950/90 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span className="text-xs text-slate-300 font-semibold font-mono">
                  {routerIdentity?.version ? `RouterOS v${routerIdentity.version}` : 'RouterOS v7'}
                </span>
              </div>
              <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20 font-mono font-bold">
                {operatorName} • {userRole === 'admin' ? 'Admin' : userRole === 'cashier' ? 'Cashier' : 'Viewer'}
              </span>
            </div>

            {isConnected && (
              <button
                type="button"
                id="sidebar-logout-btn"
                onClick={disconnectRouter}
                className="w-full flex items-center justify-center gap-2 py-1.5 px-3 bg-rose-500/10 hover:bg-rose-600/20 border border-rose-500/20 hover:border-rose-500/40 text-rose-300 hover:text-rose-200 rounded-xl text-xs font-semibold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>تسجيل الخروج وقطع الاتصال</span>
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};

