import React, { useState, useEffect, Suspense, lazy } from 'react';
import { MikroTikProvider, useConnectionSession, useMikroTikActions } from './context/MikroTikContext';
import { DesktopHeader } from './components/DesktopHeader';
import { Sidebar, TabType } from './components/Sidebar';
import { MikrotikLoginView } from './components/MikrotikLoginView';
import { HotspotUser } from './types/mikrotik';

import { DashboardView } from './components/DashboardView';
import { SubscribersManagerView } from './components/SubscribersManagerView';
import { ProfilesManagerView } from './components/ProfilesManagerView';
import { CardPrintStudioView } from './components/CardPrintStudioView';
import { ActiveSessionsView } from './components/ActiveSessionsView';

// Lazy-load secondary views and heavy modals on demand
const QueuesBandwidthView = lazy(() => import('./components/QueuesBandwidthView').then((m) => ({ default: m.QueuesBandwidthView })));
const InterfacesTrafficView = lazy(() => import('./components/InterfacesTrafficView').then((m) => ({ default: m.InterfacesTrafficView })));
const RouterTerminalView = lazy(() => import('./components/RouterTerminalView').then((m) => ({ default: m.RouterTerminalView })));
const AiAssistantView = lazy(() => import('./components/AiAssistantView').then((m) => ({ default: m.AiAssistantView })));
const BackupSettingsView = lazy(() => import('./components/BackupSettingsView').then((m) => ({ default: m.BackupSettingsView })));
const IpBindingView = lazy(() => import('./components/IpBindingView').then((m) => ({ default: m.IpBindingView })));
const DhcpLeasesView = lazy(() => import('./components/DhcpLeasesView').then((m) => ({ default: m.DhcpLeasesView })));
const FirewallSecurityView = lazy(() => import('./components/FirewallSecurityView').then((m) => ({ default: m.FirewallSecurityView })));
const NetworkView = lazy(() => import('./components/NetworkView').then((m) => ({ default: m.NetworkView })));
const SystemLogsView = lazy(() => import('./components/SystemLogsView').then((m) => ({ default: m.SystemLogsView })));
const ScheduledTasksView = lazy(() => import('./components/ScheduledTasksView').then((m) => ({ default: m.ScheduledTasksView })));
const SettingsView = lazy(() => import('./components/SettingsView').then((m) => ({ default: m.SettingsView })));
const UserGuideView = lazy(() => import('./components/UserGuideView').then((m) => ({ default: m.UserGuideView })));
const ConnectRouterModal = lazy(() => import('./components/ConnectRouterModal').then((m) => ({ default: m.ConnectRouterModal })));
const CommandPaletteModal = lazy(() => import('./components/CommandPaletteModal').then((m) => ({ default: m.CommandPaletteModal })));
const RouterDiagnosticsModal = lazy(() => import('./components/RouterDiagnosticsModal').then((m) => ({ default: m.RouterDiagnosticsModal })));
const PdfExportModal = lazy(() => import('./components/PdfExportModal').then((m) => ({ default: m.PdfExportModal })));

const ViewChunkFallback: React.FC = () => (
  <div className="flex items-center justify-center min-h-[260px] w-full text-slate-400">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 rounded-full border-2 border-blue-500/30 border-t-blue-500 animate-spin" />
      <span className="text-xs font-semibold">جاري تحميل القسم...</span>
    </div>
  </div>
);
import { applyAppTheme, getSavedAppTheme } from './utils/themeManager';
import { safeStorage, safeSession } from './utils/safeStorage';
import { ErrorBoundary } from './components/ErrorBoundary';

if (typeof window !== 'undefined') {
  try {
    applyAppTheme(getSavedAppTheme());
  } catch (err) {
    console.warn('Failed to apply initial theme:', err);
  }
}
import {
  LayoutDashboard,
  Users,
  Sparkles,
  Menu,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Info,
  Activity,
  X
} from 'lucide-react';

function MainAppContent() {
  const { isConnected, isRestoringSession, toast } = useConnectionSession();
  const { showToast, setCurrentActiveTab } = useMikroTikActions();
  
  // Strictly require authentication per session. On fresh launch, always prompt login without auto-login.
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const isSessionAuth = safeSession.getItem('zctrl_session_authenticated') === 'true';
    const hasExplicitLogout = safeStorage.getItem('zctrl_explicit_logout') === 'true';
    if (!isSessionAuth || hasExplicitLogout) {
      return 'mikrotik_login';
    }
    const saved = (safeSession.getItem('zctrl_active_tab') || safeStorage.getItem('zctrl_active_tab')) as TabType;
    return saved && saved !== 'mikrotik_login' ? saved : 'dashboard';
  });
  const [history, setHistory] = useState<TabType[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState<boolean>(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState<boolean>(false);
  const [isPdfExportOpen, setIsPdfExportOpen] = useState<boolean>(false);
  const [usersToPrint, setUsersToPrint] = useState<HotspotUser[]>([]);
  const [backendFailure, setBackendFailure] = useState<{
    attempts: number;
    code?: number | null;
    signal?: string | null;
    message?: string;
  } | null>(null);
  const [isRetryingBackend, setIsRetryingBackend] = useState<boolean>(false);

  // Listen to Electron backend respawn exhaustion or recovery
  useEffect(() => {
    const bridge = typeof window !== 'undefined' ? window.zctrlDesktopSession : undefined;
    if (!bridge) return;
    const unsubFail = bridge.onBackendFailed?.((payload) => {
      setBackendFailure(payload);
      setIsRetryingBackend(false);
    });
    const unsubRespawn = bridge.onBackendRespawned?.(() => {
      setBackendFailure(null);
      setIsRetryingBackend(false);
    });
    return () => {
      unsubFail?.();
      unsubRespawn?.();
    };
  }, []);

  const handleRetryBackend = async () => {
    const bridge = typeof window !== 'undefined' ? window.zctrlDesktopSession : undefined;
    if (!bridge?.retryBackend) return;
    setIsRetryingBackend(true);
    try {
      const res = await bridge.retryBackend();
      if (res?.success) {
        setBackendFailure(null);
      } else if (res?.message) {
        showToast(res.message, 'error');
      }
    } catch (err) {
      console.warn('Backend retry failed:', err);
      showToast('تعذر إعادة تشغيل الخادم الخلفي', 'error');
    } finally {
      setIsRetryingBackend(false);
    }
  };

  // Synchronize current tab with MikroTikContext for smart resource-saving polling
  useEffect(() => {
    if (setCurrentActiveTab) {
      setCurrentActiveTab(activeTab);
    }
  }, [activeTab, setCurrentActiveTab]);

  // Purge any legacy auto-logout setting so sessions never terminate unexpectedly while open
  useEffect(() => {
    safeStorage.removeItem('set_sec_auto_logout');
  }, []);

  // Initialize global application theme template on mount
  useEffect(() => {
    const savedTheme = getSavedAppTheme();
    applyAppTheme(savedTheme);

    const handleThemeChange = (e: any) => {
      // Re-trigger layout repaint if needed
    };
    window.addEventListener('zctrl-theme-changed', handleThemeChange);
    return () => window.removeEventListener('zctrl-theme-changed', handleThemeChange);
  }, []);

  // When connection succeeds, restore the user's active tab instead of bouncing back to dashboard
  useEffect(() => {
    if (isConnected) {
      safeSession.setItem('zctrl_session_authenticated', 'true');
      if (activeTab === 'mikrotik_login') {
        const savedTab = ((safeSession.getItem('zctrl_active_tab') || safeStorage.getItem('zctrl_active_tab')) as TabType) || 'dashboard';
        setActiveTab(savedTab === 'mikrotik_login' ? 'dashboard' : savedTab);
      }
    } else if (!isRestoringSession) {
      const hasExplicitLogout = safeStorage.getItem('zctrl_explicit_logout') === 'true';
      const isSessionAuth = safeSession.getItem('zctrl_session_authenticated') === 'true';
      // Resilience Rule: Never kick user to login screen on transient router delays or background reconnections.
      // Only navigate to login screen if the user explicitly clicked logout or session is no longer authenticated.
      if ((hasExplicitLogout || !isSessionAuth) && activeTab !== 'mikrotik_login') {
        setActiveTab('mikrotik_login');
      }
    }
  }, [isConnected, isRestoringSession, activeTab]);

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelectTab = (newTab: TabType, force: boolean = false) => {
    const isSessionAuth = safeSession.getItem('zctrl_session_authenticated') === 'true';
    const hasExplicitLogout = safeStorage.getItem('zctrl_explicit_logout') === 'true';

    // Only force login if the user has no authenticated session or explicitly logged out
    if (!force && !isRestoringSession && (!isSessionAuth || hasExplicitLogout) && newTab !== 'mikrotik_login') {
      showToast('سجل الدخول بـ ZCtrl أولاً للوصول لباقي التبويبات', 'info');
      setActiveTab('mikrotik_login');
      setIsMobileMenuOpen(false);
      return;
    }
    if (newTab === activeTab) {
      setIsMobileMenuOpen(false);
      setIsSidebarCollapsed(true);
      return;
    }
    setHistory((prev) => [...prev.slice(-24), activeTab]);
    React.startTransition(() => {
      setActiveTab(newTab);
    });
    safeSession.setItem('zctrl_active_tab', newTab);
    safeStorage.setItem('zctrl_active_tab', newTab);
    setIsMobileMenuOpen(false);
    setIsSidebarCollapsed(true);
  };

  const handleGoBack = () => {
    if (history.length === 0) return;
    const previousTab = history[history.length - 1];
    setHistory((prev) => prev.slice(0, prev.length - 1));
    React.startTransition(() => {
      setActiveTab(previousTab);
    });
    safeSession.setItem('zctrl_active_tab', previousTab);
    setIsSidebarCollapsed(true);
  };

  const handleNavigateToPrint = (usersList?: HotspotUser[]) => {
    if (usersList && usersList.length > 0) {
      setUsersToPrint(usersList);
    }
    handleSelectTab('card_studio');
  };

  const isSessionAuth = safeSession.getItem('zctrl_session_authenticated') === 'true';
  const hasExplicitLogout = safeStorage.getItem('zctrl_explicit_logout') === 'true';

  // Only render Login Screen when not authenticated or on login tab
  if (!isSessionAuth || hasExplicitLogout || activeTab === 'mikrotik_login') {
    return (
      <div className="min-h-screen w-full bg-slate-950 text-slate-100 font-sans antialiased flex flex-col justify-center items-center selection:bg-blue-600 selection:text-white relative" dir="rtl">
        {backendFailure && (
          <div
            role="alert"
            className="w-full bg-rose-950/95 border-b border-rose-500/40 text-rose-100 px-4 py-3 flex flex-wrap items-center justify-between gap-3 z-50 fixed top-0 inset-x-0 shadow-lg"
          >
            <div className="flex items-center gap-2.5 text-xs sm:text-sm">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              <span className="font-bold">
                {backendFailure.message || `توقف الخادم الخلفي بعد ${backendFailure.attempts} محاولات إعادة تشغيل.`}
              </span>
            </div>
            <button
              type="button"
              disabled={isRetryingBackend}
              onClick={handleRetryBackend}
              className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-60 text-white text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 cursor-pointer"
            >
              {isRetryingBackend ? 'جاري إعادة التشغيل...' : 'إعادة تشغيل الخادم'}
            </button>
          </div>
        )}
        <ErrorBoundary fallbackTitle="حدث خطأ في تحميل واجهة تسجيل الدخول">
          <MikrotikLoginView onSuccessNavigate={() => {
            safeSession.setItem('zctrl_session_authenticated', 'true');
            const saved = (safeSession.getItem('zctrl_active_tab') as TabType) || 'dashboard';
            const target = saved === 'mikrotik_login' ? 'dashboard' : saved;
            React.startTransition(() => {
              setActiveTab(target);
            });
            safeSession.setItem('zctrl_active_tab', target);
            setIsMobileMenuOpen(false);
            setIsSidebarCollapsed(true);
          }} />
        </ErrorBoundary>

        {/* Global Toast on Login Portal */}
        {toast && (
          <div className="fixed bottom-5 end-5 z-50 animate-in slide-in-from-bottom-3 duration-200">
            <div
              className={`px-4 py-3 rounded-2xl border shadow-2xl flex items-center gap-3 text-sm backdrop-blur-md ${
                toast.type === 'success'
                  ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200 shadow-emerald-900/20'
                  : toast.type === 'error'
                  ? 'bg-rose-950/90 border-rose-500/40 text-rose-200 shadow-rose-900/20'
                  : 'bg-blue-950/90 border-blue-500/40 text-blue-200 shadow-blue-900/20'
              }`}
            >
              {toast.type === 'success' && <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />}
              {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
              {toast.type === 'info' && <Info className="w-4 h-4 text-blue-400 shrink-0" />}
              <span className="font-semibold text-xs sm:text-sm">{toast.message}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen max-h-screen w-screen max-w-full bg-slate-950 text-slate-100 font-sans antialiased overflow-hidden selection:bg-blue-600 selection:text-white relative" dir="rtl">
      {/* Top Application Desktop Header */}
      <DesktopHeader
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        onToggleMobileMenu={() => setIsMobileMenuOpen((prev) => !prev)}
        onOpenConnectModal={() => setIsConnectModalOpen(true)}
        canGoBack={history.length > 0}
        onGoBack={handleGoBack}
        historyLength={history.length}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenDiagnostics={() => setIsDiagnosticsOpen(true)}
        onOpenPdfExport={() => setIsPdfExportOpen(true)}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebarCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
      />

      {backendFailure && (
        <div
          role="alert"
          className="w-full bg-rose-950/95 border-b border-rose-500/40 text-rose-100 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 z-40 shrink-0"
        >
          <div className="flex items-center gap-2.5 text-xs sm:text-sm">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="font-bold">
              {backendFailure.message || `توقف الخادم الخلفي بعد ${backendFailure.attempts} محاولات إعادة تشغيل.`}
            </span>
          </div>
          <button
            type="button"
            disabled={isRetryingBackend}
            onClick={handleRetryBackend}
            className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-60 text-white text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 cursor-pointer"
          >
            {isRetryingBackend ? 'جاري إعادة التشغيل...' : 'إعادة تشغيل الخادم'}
          </button>
        </div>
      )}

      {/* Main Work Area */}
      <div className="flex flex-1 w-full max-w-full overflow-hidden relative min-h-0">
        {/* Navigation Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          isOpenMobile={isMobileMenuOpen}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        />

        {/* Dynamic Active View Canvas */}
        <main className="flex-1 bg-slate-950 overflow-y-auto overflow-x-hidden p-3 sm:p-5 relative pb-20 md:pb-6 custom-scrollbar min-w-0 w-full max-w-full" id="main-content-canvas">
          <ErrorBoundary isInline={true} fallbackTitle="حدث خطأ في تحميل هذا القسم">
            <Suspense fallback={<ViewChunkFallback />}>
              {activeTab === 'dashboard' && <DashboardView onNavigate={handleSelectTab} />}
              {activeTab === 'hotspot_users' && <SubscribersManagerView initialSystem="hotspot" onNavigateToPrint={handleNavigateToPrint} />}
              {activeTab === 'ppp' && <SubscribersManagerView initialSystem="pppoe" onNavigateToPrint={handleNavigateToPrint} />}
              {activeTab === 'userman' && <SubscribersManagerView initialSystem="userman" onNavigateToPrint={handleNavigateToPrint} />}
              {activeTab === 'profiles' && <ProfilesManagerView />}
              {(activeTab === 'card_studio' || activeTab === 'generator') && <CardPrintStudioView initialUsers={usersToPrint} />}
              {activeTab === 'active_sessions' && <ActiveSessionsView />}
              {activeTab === 'ip_binding' && <IpBindingView />}
              {activeTab === 'network_center' && <NetworkView />}
              {activeTab === 'dhcp' && <DhcpLeasesView />}
              {activeTab === 'queues' && <QueuesBandwidthView />}
              {activeTab === 'firewall' && <FirewallSecurityView />}
              {activeTab === 'traffic' && <InterfacesTrafficView />}
              {activeTab === 'terminal' && <RouterTerminalView />}
              {activeTab === 'scheduled_tasks' && <ScheduledTasksView />}
              {activeTab === 'logs' && <SystemLogsView />}
              {activeTab === 'ai_assistant' && <AiAssistantView onNavigateToTerminal={() => handleSelectTab('terminal')} />}
              {activeTab === 'backup' && <BackupSettingsView onNavigate={handleSelectTab} />}
              {activeTab === 'settings' && <SettingsView />}
              {activeTab === 'guide' && <UserGuideView />}
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      {/* Mobile Bottom Quick Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-3 py-2 flex items-center justify-around z-30">
        <button
          type="button"
          onClick={() => handleSelectTab('dashboard')}
          className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            activeTab === 'dashboard' ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span>الرئيسية</span>
        </button>

        <button
          type="button"
          onClick={() => handleSelectTab('hotspot_users')}
          className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            activeTab === 'hotspot_users' ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users className="w-5 h-5" />
          <span>المشتركين</span>
        </button>

        <button
          type="button"
          onClick={() => handleSelectTab('card_studio')}
          className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            activeTab === 'card_studio' || activeTab === 'generator' ? 'text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-5 h-5 text-amber-400" />
          <span>استوديو الكروت</span>
        </button>

        <button
          type="button"
          onClick={() => handleSelectTab('active_sessions')}
          className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            activeTab === 'active_sessions' ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="w-5 h-5" />
          <span>الجلسات</span>
        </button>

        <button
          type="button"
          onClick={() => setIsMobileMenuOpen(true)}
          className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Menu className="w-5 h-5" />
          <span>كل الأقسام</span>
        </button>
      </nav>

      {/* Lazy-mounted Modals: chunks only load when the user actually opens them */}
      <Suspense fallback={null}>
        {isConnectModalOpen && (
          <ConnectRouterModal isOpen={isConnectModalOpen} onClose={() => setIsConnectModalOpen(false)} />
        )}
        {isDiagnosticsOpen && (
          <RouterDiagnosticsModal isOpen={isDiagnosticsOpen} onClose={() => setIsDiagnosticsOpen(false)} />
        )}
        {isCommandPaletteOpen && (
          <CommandPaletteModal
            isOpen={isCommandPaletteOpen}
            onClose={() => setIsCommandPaletteOpen(false)}
            onSelectTab={handleSelectTab}
            onOpenPdfExport={() => setIsPdfExportOpen(true)}
          />
        )}
        {isPdfExportOpen && (
          <PdfExportModal
            isOpen={isPdfExportOpen}
            onClose={() => setIsPdfExportOpen(false)}
            activeTab={activeTab}
          />
        )}
      </Suspense>

      {/* Global Toast Notification with Rapid Intervention Actions */}
      {toast && (
        <div className="fixed bottom-5 end-5 z-50 animate-in slide-in-from-bottom-3 duration-200 max-w-xl w-full sm:w-auto px-3 sm:px-0">
          <div
            className={`px-4 py-3 rounded-2xl border shadow-2xl flex items-center justify-between gap-3 text-sm backdrop-blur-md ${
              toast.type === 'success'
                ? 'bg-emerald-950/95 border-emerald-500/40 text-emerald-200 shadow-emerald-900/30'
                : toast.type === 'error'
                ? 'bg-rose-950/95 border-rose-500/50 text-rose-100 shadow-rose-950/50 ring-1 ring-rose-500/30'
                : toast.type === 'warning'
                ? 'bg-amber-950/95 border-amber-500/50 text-amber-100 shadow-amber-950/50 ring-1 ring-amber-500/30'
                : 'bg-blue-950/95 border-blue-500/40 text-blue-200 shadow-blue-900/30'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {toast.type === 'success' && <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />}
              {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />}
              {toast.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />}
              {toast.type === 'info' && <Info className="w-5 h-5 text-blue-400 shrink-0" />}
              <span className="font-semibold text-xs sm:text-sm leading-snug">{toast.message}</span>
            </div>

            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action?.onClick();
                }}
                className="shrink-0 bg-white/20 hover:bg-white/30 active:scale-95 text-white font-bold text-xs px-3 py-1.5 rounded-xl border border-white/30 transition-all cursor-pointer shadow-xs whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                {toast.action.label}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary isInline={false} fallbackTitle="حدث خطأ في تشغيل واجهة ZCtrl">
      <MikroTikProvider>
        <MainAppContent />
      </MikroTikProvider>
    </ErrorBoundary>
  );
}
