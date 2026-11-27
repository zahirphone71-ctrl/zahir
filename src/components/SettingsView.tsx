import React, { useState, useEffect, useRef } from 'react';
import { useMikroTik } from '../context/MikroTikContext';
import { secureFetch } from '../lib/api';
import { AppThemeTemplatesView } from './AppThemeTemplatesView';
import { RouterSetupView } from "./settings/RouterSetupView";
import { BackupSettingsView } from './BackupSettingsView';
import { safeStorage } from '../utils/safeStorage';
import { ConfirmModal } from './ConfirmModal';
import {
  applyAppTheme,
  getSavedAppTheme,
  getSavedCustomThemeElements,
  saveCustomThemeElements,
  resetCustomThemeElements
} from '../utils/themeManager';
import {
  Sliders,
  Settings,
  Server,
  RefreshCw,
  Sparkles,
  Shield,
  Eye,
  EyeOff,
  Save,
  CheckCircle,
  AlertTriangle,
  Info,
  Clock,
  Lock,
  UserCheck,
  RotateCcw,
  Layout,
  Coins,
  Globe,
  HelpCircle,
  Palette,
  Thermometer,
  Cpu,
  ShieldCheck,
  Home,
  Building2,
  Store,
  Zap,
  Send,
  Bell,
  Table,
  CheckSquare,
  Square,
  HardDrive,
  Copy,
  Check,
  UserPlus,
  Trash2,
  Users
} from 'lucide-react';
import { RouterConnectionProfilesModal } from './connection/RouterConnectionProfilesModal';
import { ALL_SUBSCRIBER_COLUMNS, DEFAULT_COLUMN_KEYS } from './subscribers/tableColumnsConfig';

type SettingsCategory =
  | 'templates'
  | 'appearance'
  | 'tables'
  | 'connection'
  | 'sync'
  | 'vouchers'
  | 'security'
  | 'backup'
  | 'router-setup'
  | 'telegram'
  | 'application';

export const SettingsView: React.FC = () => {
  const {
    router,
    isConnected,
    autoSync,
    setAutoSync,
    syncFrequency,
    setSyncFrequency,
    ecoMode,
    setEcoMode,
    thermalShieldActive,
    isUserIdle,
    showToast,
    runCommand,
    connectionProfiles,
    activateConnectionProfile,
    isConnecting,
    connectToRouter,
    disconnectRouter,
    userRole,
    operatorName,
    tlsFingerprint
  } = useMikroTik();

  const [showProfilesModal, setShowProfilesModal] = useState(false);
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('templates');

  // Connection Settings States (prefilled from current router if available)
  const [host, setHost] = useState(router?.host || '');
  const [port, setPort] = useState(router?.port?.toString() || '8728');
  const [username, setUsername] = useState(router?.username || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);

  const isMountedRef = useRef(true);
  const telegramFetchAbortRef = useRef<AbortController | null>(null);
  const telegramSaveAbortRef = useRef<AbortController | null>(null);
  const telegramTestAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      telegramFetchAbortRef.current?.abort();
      telegramSaveAbortRef.current?.abort();
      telegramTestAbortRef.current?.abort();
    };
  }, []);

  // Synchronize router host/port/username on router connect
  useEffect(() => {
    if (router) {
      if (router.host) setHost(router.host);
      if (router.port) setPort(router.port.toString());
      if (router.username) setUsername(router.username);
    }
  }, [router?.host, router?.port, router?.username]);

  const handleTestAndConnect = async () => {
    if (!host || !username) {
      showToast('يرجى ملء عنوان السيرفر واسم المستخدم للاتصال', 'error');
      return;
    }
    setTestingConnection(true);
    showToast('جاري الاتصال والتحقق من راوتر المايكروتك...', 'info');
    try {
      safeStorage.setItem('set_conn_host', host);
      safeStorage.setItem('set_conn_port', port);
      safeStorage.setItem('set_conn_user', username);
      const res = await connectToRouter({
        host: host.trim(),
        port: parseInt(port, 10) || 8728,
        username: username.trim(),
        password: password
      });
      if (!isMountedRef.current) return;
      if (res && res.success) {
        showToast('تم الاتصال بسيرفر المايكروتك بنجاح!', 'success');
      } else {
        showToast(res?.message || 'فشل الاتصال بالراوتر، يرجى مراجعة العنوان والمنفذ وبيانات الاعتماد', 'error');
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;
      showToast(`خطأ في الاتصال: ${err?.message || 'تعذر الوصول للراوتر'}`, 'error');
    } finally {
      if (isMountedRef.current) setTestingConnection(false);
    }
  };

  // Default Voucher States (loaded from safeStorage or defaults)
  const [defaultLength, setDefaultLength] = useState<number>(() => {
    return Number(safeStorage.getItem('set_voucher_len') || '6');
  });
  const [defaultPrefix, setDefaultPrefix] = useState(() => {
    return safeStorage.getItem('set_voucher_prefix') || '';
  });
  const [defaultCharSet, setDefaultCharSet] = useState(() => {
    return safeStorage.getItem('set_voucher_charset') || 'numbers';
  });
  const [defaultPrice, setDefaultPrice] = useState(() => {
    return safeStorage.getItem('set_voucher_price') || '5';
  });

  // Progressive Sync Priority State
  const [syncPriority, setSyncPriority] = useState(() => {
    return safeStorage.getItem('set_sync_priority') || 'adaptive';
  });

  // Security Policy States
  const [savePasswordPolicy, setSavePasswordPolicy] = useState(() => {
    return safeStorage.getItem('set_sec_save_pass') === 'true';
  });

  // New Application Settings States
  const [currency, setCurrency] = useState(() => {
    return safeStorage.getItem('set_app_currency') || 'ر.س';
  });
  const [pagingSize, setPagingSize] = useState(() => {
    return safeStorage.getItem('set_app_paging') || '20';
  });
  const [hotspotDomain, setHotspotDomain] = useState(() => {
    return safeStorage.getItem('set_app_hotspot_domain') || 'login.zcontrol.net';
  });
  const [layoutDensity, setLayoutDensity] = useState(() => {
    return safeStorage.getItem('set_app_density') || 'normal';
  });
  const [showGuideHints, setShowGuideHints] = useState(() => {
    return safeStorage.getItem('set_app_guide_hints') !== 'false';
  });

  // Table Specific Settings States
  const [tableDensity, setTableDensity] = useState<'compact' | 'normal' | 'relaxed'>(() => {
    return (safeStorage.getItem('set_app_density') as any) || 'normal';
  });
  const [tablePaging, setTablePaging] = useState(() => {
    return safeStorage.getItem('set_app_paging') || '20';
  });
  const [tableVirtualScrolling, setTableVirtualScrolling] = useState(() => {
    return safeStorage.getItem('set_table_virtual') !== 'false';
  });
  const [tableMaskPasswords, setTableMaskPasswords] = useState(() => {
    return safeStorage.getItem('set_table_mask_pass') !== 'false';
  });
  const [tableShowLiveBadge, setTableShowLiveBadge] = useState(() => {
    return safeStorage.getItem('set_table_live_badge') !== 'false';
  });
  const [tableVisibleCols, setTableVisibleCols] = useState<string[]>(() => {
    try {
      const saved = safeStorage.getItem('subscribers_visible_cols');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed.filter((k: string) => k !== 'actions');
      }
    } catch (err) {
      console.warn('[SettingsView] failed to parse subscribers_visible_cols', err);
    }
    return DEFAULT_COLUMN_KEYS.filter((k) => k !== 'actions');
  });

  const handleToggleTableColumn = (colKey: string) => {
    setTableVisibleCols((prev) => {
      if (prev.includes(colKey)) {
        if (prev.length <= 1) {
          showToast('يجب إبقاء عمود واحد على الأقل في الجدول', 'error');
          return prev;
        }
        return prev.filter((k) => k !== colKey);
      }
      return [...prev, colKey];
    });
  };

  const handleSelectAllColumns = () => {
    const allKeys = ALL_SUBSCRIBER_COLUMNS.map((c) => c.key);
    setTableVisibleCols(allKeys);
  };

  const handleSaveTableSettings = (e: React.FormEvent) => {
    e.preventDefault();
    safeStorage.setItem('set_app_density', tableDensity);
    safeStorage.setItem('set_app_paging', tablePaging);
    safeStorage.setItem('set_table_virtual', String(tableVirtualScrolling));
    safeStorage.setItem('set_table_mask_pass', String(tableMaskPasswords));
    safeStorage.setItem('set_table_live_badge', String(tableShowLiveBadge));
    safeStorage.setItem('subscribers_visible_cols', JSON.stringify(tableVisibleCols));
    setLayoutDensity(tableDensity);
    setPagingSize(tablePaging);

    // Dispatch real-time synchronization event to all tables
    window.dispatchEvent(new CustomEvent('zctrl:table-settings-changed', {
      detail: {
        density: tableDensity,
        paging: tablePaging,
        virtual: tableVirtualScrolling,
        maskPass: tableMaskPasswords,
        liveBadge: tableShowLiveBadge,
        visibleCols: tableVisibleCols
      }
    }));
    window.dispatchEvent(new Event('storage'));

    showToast('تم حفظ وتطبيق كافة إعدادات الجداول والأعمدة بنجاح', 'success');
  };

  const handleResetTableSettings = () => {
    setTableDensity('normal');
    setTablePaging('20');
    setTableVirtualScrolling(true);
    setTableMaskPasswords(true);
    setTableShowLiveBadge(true);
    const def = DEFAULT_COLUMN_KEYS.filter((k) => k !== 'actions');
    setTableVisibleCols(def);
    safeStorage.setItem('set_app_density', 'normal');
    safeStorage.setItem('set_app_paging', '20');
    safeStorage.setItem('set_table_virtual', 'true');
    safeStorage.setItem('set_table_mask_pass', 'true');
    safeStorage.setItem('set_table_live_badge', 'true');
    safeStorage.setItem('subscribers_visible_cols', JSON.stringify(def));
    safeStorage.removeItem('subscribers_col_order');
    setLayoutDensity('normal');
    setPagingSize('20');

    window.dispatchEvent(new CustomEvent('zctrl:table-settings-changed', {
      detail: {
        density: 'normal',
        paging: '20',
        virtual: true,
        maskPass: true,
        liveBadge: true,
        visibleCols: def
      }
    }));
    window.dispatchEvent(new Event('storage'));

    showToast('تمت إعادة ضبط أعمدة وتخطيطات الجداول للوضع الافتراضي', 'info');
  };

  // Appearance & Theme States
  const [fontFamily, setFontFamily] = useState(() => {
    return safeStorage.getItem('set_app_font_family') || 'cairo';
  });
  const [fontSize, setFontSize] = useState(() => {
    return safeStorage.getItem('set_app_font_size') || '100';
  });
  const [watermarkOpacity, setWatermarkOpacity] = useState(() => {
    return safeStorage.getItem('set_app_watermark') || '0.08';
  });
  const [colorAnimation, setColorAnimation] = useState(() => {
    return safeStorage.getItem('set_app_color_anim') !== 'false';
  });
  const [themePreset, setThemePreset] = useState(() => {
    return safeStorage.getItem('set_app_theme_preset') || 'gold';
  });

  // Handle saving appearance settings
  const handleSaveAppearance = (e: React.FormEvent) => {
    e.preventDefault();
    safeStorage.setItem('set_app_font_family', fontFamily);
    safeStorage.setItem('set_app_font_size', fontSize);
    safeStorage.setItem('set_app_watermark', watermarkOpacity);
    safeStorage.setItem('set_app_color_anim', String(colorAnimation));
    safeStorage.setItem('set_app_theme_preset', themePreset);

    // Apply font scale dynamically to document root
    const fontScalePct = Number(fontSize) || 100;
    document.documentElement.style.setProperty('--app-font-scale', `${fontScalePct}%`);
    document.documentElement.style.setProperty('--app-base-font-size', `calc(16px * ${fontScalePct} / 100)`);
    document.documentElement.style.setProperty('--app-watermark-opacity', watermarkOpacity);

    const fontMap: Record<string, string> = {
      cairo: "'Cairo Variable', 'Cairo', system-ui, -apple-system, sans-serif",
      tajawal: "'Cairo Variable', 'Cairo', system-ui, -apple-system, sans-serif",
      system: "system-ui, -apple-system, 'Segoe UI', Tahoma, sans-serif",
      inter: "'Cairo Variable', 'JetBrains Mono Variable', system-ui, sans-serif"
    };
    const resolvedFont = fontMap[fontFamily] || "'Cairo Variable', 'Cairo', system-ui, -apple-system, sans-serif";
    document.documentElement.style.setProperty('--app-font-family', resolvedFont);
    document.documentElement.style.setProperty('--app-theme-font', resolvedFont);

    // Update custom theme elements
    const custom = getSavedCustomThemeElements();
    saveCustomThemeElements({
      ...custom,
      fontSize: fontSize,
      fontFamily: resolvedFont
    });
    applyAppTheme(getSavedAppTheme(), {
      ...custom,
      fontSize: fontSize,
      fontFamily: resolvedFont
    });
    
    showToast('تم حفظ وتطبيق تخصيصات المظهر والخطوط والألوان بنجاح', 'success');
  };

  // Handle saving Router connection updates
  const handleSaveConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!host || !username) {
      showToast('يرجى ملء كافة الحقول الإجبارية للاتصال', 'error');
      return;
    }
    showToast('يتم تحديث إعدادات الاتصال بالسيرفر...', 'info');
    // Store configuration locally (not password unless requested)
    safeStorage.setItem('set_conn_host', host);
    safeStorage.setItem('set_conn_port', port);
    safeStorage.setItem('set_conn_user', username);
    showToast('تم حفظ إعدادات السيرفر بنجاح', 'success');
  };

  // Handle saving Voucher Defaults
  const handleSaveVouchers = (e: React.FormEvent) => {
    e.preventDefault();
    safeStorage.setItem('set_voucher_len', defaultLength.toString());
    safeStorage.setItem('set_voucher_prefix', defaultPrefix);
    safeStorage.setItem('set_voucher_charset', defaultCharSet);
    safeStorage.setItem('set_voucher_price', defaultPrice);
    showToast('تم حفظ تفضيلات توليد الكروت الافتراضية بنجاح', 'success');
  };

  // Handle saving Sync and priority settings
  const handleSaveSync = (e: React.FormEvent) => {
    e.preventDefault();
    safeStorage.setItem('set_sync_priority', syncPriority);
    showToast('تم حفظ إعدادات المزامنة التدريجية والأولويات', 'success');
  };

  // Handle saving Security policies
  const handleSaveSecurity = (e: React.FormEvent) => {
    e.preventDefault();
    safeStorage.setItem('set_sec_save_pass', savePasswordPolicy.toString());
    safeStorage.removeItem('set_sec_auto_logout');
    showToast('تم حفظ سياسات الخصوصية والأمان للبرنامج', 'success');
  };

  // TLS Fingerprint Copy State & Vault Key Status
  const [copiedFingerprint, setCopiedFingerprint] = useState(false);
  const [vaultStatus, setVaultStatus] = useState<{ mode?: string; healthy?: boolean; warning?: string | null } | null>(null);
  const [exportingVaultKey, setExportingVaultKey] = useState(false);

  // Operator RBAC Management State (Admin only)
  interface OperatorItem {
    id: string;
    username: string;
    displayName: string;
    role: 'admin' | 'cashier' | 'viewer';
    disabled: boolean;
    createdAt: string;
    lastLoginAt?: string;
  }
  const [operators, setOperators] = useState<OperatorItem[]>([]);
  const [loadingOperators, setLoadingOperators] = useState(false);
  const [newOpUsername, setNewOpUsername] = useState('');
  const [newOpDisplayName, setNewOpDisplayName] = useState('');
  const [newOpPassword, setNewOpPassword] = useState('');
  const [newOpRole, setNewOpRole] = useState<'admin' | 'cashier' | 'viewer'>('cashier');
  const [creatingOperator, setCreatingOperator] = useState(false);
  const [confirmDeleteOpId, setConfirmDeleteOpId] = useState<string | null>(null);

  const fetchOperators = async () => {
    if (!isConnected || userRole !== 'admin') return;
    setLoadingOperators(true);
    try {
      const res = await secureFetch('/api/auth/operators');
      const data = await res.json();
      if (!isMountedRef.current) return;
      if (res.ok && data.success && Array.isArray(data.operators)) {
        setOperators(data.operators);
      }
    } catch (err) {
      console.warn('[SettingsView] fetchOperators failed', err);
    } finally {
      if (isMountedRef.current) setLoadingOperators(false);
    }
  };

  useEffect(() => {
    if (activeCategory === 'security') {
      if (isConnected && userRole === 'admin') {
        fetchOperators();
      }
      if (window.zctrlDesktopVault?.getVaultKeyStatus) {
        window.zctrlDesktopVault.getVaultKeyStatus()
          .then((status) => {
            if (isMountedRef.current && status) setVaultStatus(status);
          })
          .catch((err) => console.warn('[SettingsView] getVaultKeyStatus failed', err));
      }
    }
  }, [activeCategory, isConnected, userRole]);

  const handleCreateOperator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOpUsername.trim() || newOpPassword.length < 10) {
      showToast('يرجى إدخال اسم المشغل وكلمة مرور لا تقل عن 10 أحرف', 'error');
      return;
    }
    setCreatingOperator(true);
    try {
      const res = await secureFetch('/api/auth/operators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newOpUsername.trim(),
          displayName: newOpDisplayName.trim() || newOpUsername.trim(),
          password: newOpPassword,
          role: newOpRole
        })
      });
      const data = await res.json();
      if (!isMountedRef.current) return;
      if (res.ok && data.success) {
        showToast(data.message || 'تم إنشاء المشغل بنجاح', 'success');
        setNewOpUsername('');
        setNewOpDisplayName('');
        setNewOpPassword('');
        setNewOpRole('cashier');
        await fetchOperators();
      } else {
        showToast(data.message || 'تعذر إنشاء حساب المشغل', 'error');
      }
    } catch (err: any) {
      if (isMountedRef.current) showToast(err?.message || 'خطأ في إنشاء المشغل', 'error');
    } finally {
      if (isMountedRef.current) setCreatingOperator(false);
    }
  };

  const handleToggleOperatorStatus = async (op: OperatorItem) => {
    try {
      const res = await secureFetch(`/api/auth/operators/${encodeURIComponent(op.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled: !op.disabled })
      });
      const data = await res.json();
      if (!isMountedRef.current) return;
      if (res.ok && data.success) {
        showToast(data.message || 'تم تحديث حالة المشغل', 'success');
        await fetchOperators();
      } else {
        showToast(data.message || 'تعذر تحديث حالة المشغل', 'error');
      }
    } catch {
      if (isMountedRef.current) showToast('تعذر الاتصال بالخادم لتحديث المشغل', 'error');
    }
  };

  const handleDeleteOperator = async (id: string) => {
    try {
      const res = await secureFetch(`/api/auth/operators/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!isMountedRef.current) return;
      setConfirmDeleteOpId(null);
      if (res.ok && data.success) {
        showToast(data.message || 'تم حذف المشغل بنجاح', 'success');
        await fetchOperators();
      } else {
        showToast(data.message || 'تعذر حذف المشغل', 'error');
      }
    } catch {
      if (isMountedRef.current) showToast('تعذر الاتصال بالخادم لحذف المشغل', 'error');
    }
  };

  // Telegram Bot Notifications States
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [telegramNotifyDisconnect, setTelegramNotifyDisconnect] = useState(true);
  const [telegramNotifyHighCpu, setTelegramNotifyHighCpu] = useState(true);
  const [telegramNotifyVouchers, setTelegramNotifyVouchers] = useState(true);
  const [showTelegramToken, setShowTelegramToken] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [savingTelegram, setSavingTelegram] = useState(false);

  useEffect(() => {
    telegramFetchAbortRef.current?.abort();
    const controller = new AbortController();
    telegramFetchAbortRef.current = controller;

    secureFetch('/api/telegram/config', { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json().catch((err) => {
          console.warn('[SettingsView] telegram config invalid JSON', err);
          return null;
        });
      })
      .then((res) => {
        if (!isMountedRef.current || !res) return;
        if (res.success && res.data) {
          setTelegramEnabled(Boolean(res.data.enabled));
          setTelegramBotToken(res.data.botToken || '');
          setTelegramChatId(res.data.chatId || '');
          setTelegramNotifyDisconnect(res.data.notifyOnDisconnect !== false);
          setTelegramNotifyHighCpu(res.data.notifyOnHighCpu !== false);
          setTelegramNotifyVouchers(res.data.notifyOnVoucherBatch !== false);
        }
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') {
          console.warn('[SettingsView] telegram config fetch failed', err);
        }
      });

    return () => {
      controller.abort();
    };
  }, []);

  const handleSaveTelegram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingTelegram) return;
    telegramSaveAbortRef.current?.abort();
    const controller = new AbortController();
    telegramSaveAbortRef.current = controller;
    setSavingTelegram(true);
    try {
      const res = await secureFetch('/api/telegram/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: telegramEnabled,
          botToken: telegramBotToken,
          chatId: telegramChatId,
          notifyOnDisconnect: telegramNotifyDisconnect,
          notifyOnHighCpu: telegramNotifyHighCpu,
          notifyOnVoucherBatch: telegramNotifyVouchers
        }),
        signal: controller.signal
      });
      const data = await res.json().catch((err) => {
        console.warn('[SettingsView] telegram save invalid JSON', err);
        return {};
      });
      if (!isMountedRef.current) return;
      if (res.ok && data.success) {
        showToast('تم حفظ إعدادات إشعارات تيليجرام بنجاح', 'success');
      } else {
        showToast(data.message || 'فشل حفظ إعدادات تيليجرام', 'error');
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || !isMountedRef.current) return;
      showToast('تعذر الاتصال بالسيرفر لحفظ إعدادات تيليجرام', 'error');
    } finally {
      if (isMountedRef.current) setSavingTelegram(false);
    }
  };

  const handleTestTelegram = async () => {
    if (!telegramBotToken || !telegramChatId) {
      showToast('يرجى إدخال توكن البوت ومعرف الدردشة أولاً للتجربة', 'warning');
      return;
    }
    if (testingTelegram) return;
    telegramTestAbortRef.current?.abort();
    const controller = new AbortController();
    telegramTestAbortRef.current = controller;
    setTestingTelegram(true);
    try {
      const res = await secureFetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: telegramBotToken,
          chatId: telegramChatId
        }),
        signal: controller.signal
      });
      const data = await res.json().catch((err) => {
        console.warn('[SettingsView] telegram test invalid JSON', err);
        return {};
      });
      if (!isMountedRef.current) return;
      if (res.ok && data.success) {
        showToast('تم إرسال رسالة التجربة إلى تيليجرام بنجاح! تفقد محادثة البوت.', 'success');
      } else {
        showToast(data.message || 'فشل إرسال رسالة التجربة، تحقق من صحة التوكن و Chat ID', 'error');
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || !isMountedRef.current) return;
      showToast('تعذر إرسال التجربة: خطأ في الاتصال', 'error');
    } finally {
      if (isMountedRef.current) setTestingTelegram(false);
    }
  };

  // Handle saving Application settings
  const handleSaveApplication = (e: React.FormEvent) => {
    e.preventDefault();
    safeStorage.setItem('set_app_currency', currency);
    safeStorage.setItem('set_app_paging', pagingSize);
    safeStorage.setItem('set_app_hotspot_domain', hotspotDomain);
    safeStorage.setItem('set_app_density', layoutDensity);
    safeStorage.setItem('set_app_guide_hints', showGuideHints.toString());

    // Sync table state variables
    setTableDensity(layoutDensity as any);
    setTablePaging(pagingSize);

    window.dispatchEvent(new CustomEvent('zctrl:table-settings-changed', {
      detail: {
        density: layoutDensity,
        paging: pagingSize,
        virtual: tableVirtualScrolling,
        maskPass: tableMaskPasswords,
        liveBadge: tableShowLiveBadge,
        visibleCols: tableVisibleCols
      }
    }));
    window.dispatchEvent(new Event('storage'));

    showToast('تم حفظ الإعدادات العامة للبرنامج ومزامنتها بنجاح', 'success');
  };

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Restoring Default Settings
  const handleRestoreDefaults = () => {
    setShowResetConfirm(true);
  };

  const handleExecuteRestoreDefaults = () => {
    // Clear specific safeStorage keys
    safeStorage.removeItem('set_voucher_len');
    safeStorage.removeItem('set_voucher_prefix');
    safeStorage.removeItem('set_voucher_charset');
    safeStorage.removeItem('set_voucher_price');
    safeStorage.removeItem('set_sync_priority');
    safeStorage.removeItem('set_sec_save_pass');
    safeStorage.removeItem('set_sec_auto_logout');
    safeStorage.removeItem('set_app_currency');
    safeStorage.removeItem('set_app_paging');
    safeStorage.removeItem('set_app_hotspot_domain');
    safeStorage.removeItem('set_app_density');
    safeStorage.removeItem('set_app_guide_hints');
    safeStorage.removeItem('set_table_virtual');
    safeStorage.removeItem('set_table_mask_pass');
    safeStorage.removeItem('set_table_live_badge');
    safeStorage.removeItem('subscribers_visible_cols');
    safeStorage.removeItem('subscribers_col_order');
    safeStorage.removeItem('set_app_font_family');
    safeStorage.removeItem('set_app_font_size');
    safeStorage.removeItem('set_app_watermark');
    safeStorage.removeItem('set_app_color_anim');

    // Reset state variables
    setDefaultLength(6);
    setDefaultPrefix('');
    setDefaultCharSet('numbers');
    setDefaultPrice('5');
    setSyncPriority('adaptive');
    setSavePasswordPolicy(false);
    setCurrency('ر.س');
    setPagingSize('20');
    setTablePaging('20');
    setHotspotDomain('login.zcontrol.net');
    setLayoutDensity('normal');
    setTableDensity('normal');
    setShowGuideHints(true);
    setTableVirtualScrolling(true);
    setTableMaskPasswords(true);
    setTableShowLiveBadge(true);
    const defCols = DEFAULT_COLUMN_KEYS.filter((k) => k !== 'actions');
    setTableVisibleCols(defCols);
    setFontFamily('cairo');
    setFontSize('100');
    setWatermarkOpacity('0.08');
    setColorAnimation(true);

    // Apply defaults to document root
    document.documentElement.style.setProperty('--app-font-scale', '100%');
    document.documentElement.style.setProperty('--app-base-font-size', '16px');
    document.documentElement.style.setProperty('--app-watermark-opacity', '0.08');
    document.documentElement.style.setProperty('--app-font-family', "'Cairo Variable', 'Cairo', system-ui, -apple-system, sans-serif");
    document.documentElement.style.setProperty('--app-theme-font', "'Cairo Variable', 'Cairo', system-ui, -apple-system, sans-serif");

    // Context options
    setAutoSync(true);
    setSyncFrequency(15);
    setEcoMode(false);

    // Reset theme overrides
    resetCustomThemeElements();
    applyAppTheme('classic_sapphire');

    // Dispatch update events
    window.dispatchEvent(new CustomEvent('zctrl:table-settings-changed', {
      detail: {
        density: 'normal',
        paging: '20',
        virtual: true,
        maskPass: true,
        liveBadge: true,
        visibleCols: defCols
      }
    }));
    window.dispatchEvent(new Event('storage'));

    setShowResetConfirm(false);
    showToast('تمت استعادة الإعدادات الافتراضية لبرنامج ZCtrl بالكامل بنجاح', 'success');
  };

  const categoriesConfig = [
    {
      id: 'templates' as SettingsCategory,
      title: 'القوالب والسمات الجاهزة',
      desc: 'تغيير نمط وشكل البرنامج كلياً (الألوان، القوائم، الأشرطة، البطاقات، الخلفيات)',
      icon: Palette,
      color: 'text-amber-400 bg-amber-500/10'
    },
    {
      id: 'appearance' as SettingsCategory,
      title: 'الخطوط والمظهر والحركة',
      desc: 'تخصيص نوع وحجم الخط، شفافية الشعار، ومؤثرات الحركة التفاعلية',
      icon: Sparkles,
      color: 'text-pink-400 bg-pink-500/10'
    },
    {
      id: 'tables' as SettingsCategory,
      title: 'إعدادات الجداول والأعمدة',
      desc: 'كثافة الجداول، عدد الصفوف، إظهار وإخفاء الأعمدة، والتمرير الافتراضي',
      icon: Table,
      color: 'text-indigo-400 bg-indigo-500/10'
    },
    {
      id: 'connection' as SettingsCategory,
      title: 'بيانات الاتصال والراوتر',
      desc: 'ضبط عنوان الآي بي وبورت المايكروتك وبروفايلات الاتصال المتعددة',
      icon: Server,
      color: 'text-blue-400 bg-blue-500/10'
    },
    {
      id: 'sync' as SettingsCategory,
      title: 'تردد المزامنة والدرع الحراري',
      desc: 'تحديد أزمنة جلب البيانات حسب أهميتها وتفعيل درع التبريد لمنع اللود',
      icon: RefreshCw,
      color: 'text-emerald-400 bg-emerald-500/10'
    },
    {
      id: 'vouchers' as SettingsCategory,
      title: 'مولّد الكروت الافتراضي',
      desc: 'تفضيلات طول الكود والبادئة والأسعار الافتراضية للطباعة',
      icon: Sparkles,
      color: 'text-amber-400 bg-amber-500/10'
    },
    {
      id: 'security' as SettingsCategory,
      title: 'الحماية والأمان والسرية',
      desc: 'سياسة حفظ كلمات المرور، الخروج التلقائي والمصادقة',
      icon: Shield,
      color: 'text-purple-400 bg-purple-500/10'
    },
    {
      id: 'backup' as SettingsCategory,
      title: 'النسخ الاحتياطي واستعادة الراوتر',
      desc: 'توليد ملفات الباك اب (.backup) وسكربتات التصدير (.rsc) وإدارة الهوية',
      icon: HardDrive,
      color: 'text-cyan-400 bg-cyan-500/10'
    },
    {
      id: 'router-setup' as SettingsCategory,
      title: 'ضبط وتجهيز الراوتر (تلقائي)',
      desc: 'أداة ضبط إعدادات المايكروتك لشبكتك بضغطة زر',
      icon: Cpu,
      color: 'text-indigo-400 bg-indigo-500/10'
    },
    {
      id: 'telegram' as SettingsCategory,
      title: 'إشعارات بوت تيليجرام',
      desc: 'ربط النظام ببوت تيليجرام لإرسال تنبيهات الحرارة والكروت والراوتر فوراً',
      icon: Send,
      color: 'text-sky-400 bg-sky-500/10'
    },
    {
      id: 'application' as SettingsCategory,
      title: 'إعدادات البرنامج العامة',
      desc: 'تخصيص العملة، حدود العرض، النطاقات وكثافة التصميم',
      icon: Settings,
      color: 'text-slate-400 bg-slate-500/10'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2.5">
          <Settings className="w-6 h-6 text-blue-400" />
          <span>إعدادات النظام والبرنامج الشاملة (System Settings)</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          لوحة تحكم كاملة في سلوك التطبيق، مزامنة المايكروتك، توليد الكروت الذكية، وسياسات الأمان والسرية الحقيقية
        </p>
      </div>

      {/* Main Settings Panel: Responsive Sidebar & Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Right column: Categories Menu */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-1.5 shadow-xl">
          <div className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
            أقسام الإعدادات
          </div>
          {categoriesConfig.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`w-full flex items-start gap-3 p-3 rounded-xl text-start transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/10 font-bold'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                <div className={`p-2 rounded-lg shrink-0 ${isActive ? 'bg-white/20 text-white' : cat.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold">{cat.title}</div>
                  <div className={`text-xs mt-0.5 truncate ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>
                    {cat.desc}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Left column: Selected Category Settings Details */}
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl">
          {/* Category Title */}
          <div className="pb-4 border-b border-slate-800/80 mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-100">
                {categoriesConfig.find((c) => c.id === activeCategory)?.title}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                {categoriesConfig.find((c) => c.id === activeCategory)?.desc}
              </p>
            </div>
          </div>

          {/* 0. App Themes & Templates Gallery */}
          {activeCategory === 'router-setup' && (
            <RouterSetupView />
          )}

          {activeCategory === 'templates' && (
            <AppThemeTemplatesView showToast={showToast} />
          )}

          {activeCategory === 'backup' && (
            <BackupSettingsView />
          )}

          {/* Tables & Columns Configuration */}
          {activeCategory === 'tables' && (
            <form onSubmit={handleSaveTableSettings} className="space-y-6">
              {/* Density & Paging */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Layout className="w-3.5 h-3.5 text-indigo-400" />
                    كثافة وارتفاع أسطر الجداول (Density)
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'compact', label: 'مضغوط', desc: '36px' },
                      { id: 'normal', label: 'متوسط', desc: '44px' },
                      { id: 'relaxed', label: 'مريح', desc: '52px' },
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setTableDensity(mode.id as any)}
                        className={`p-2.5 rounded-xl border text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                          tableDensity === mode.id
                            ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200 shadow-sm shadow-indigo-500/20'
                            : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="text-xs font-bold">{mode.label}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{mode.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Table className="w-3.5 h-3.5 text-indigo-400" />
                    عدد الصفوف في الصفحة (Pagination Limit)
                  </label>
                  <select
                    value={tablePaging}
                    onChange={(e) => setTablePaging(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="15">15 صف لكل صفحة</option>
                    <option value="20">20 صف لكل صفحة (افتراضي)</option>
                    <option value="50">50 صف لكل صفحة</option>
                    <option value="100">100 صف لكل صفحة</option>
                    <option value="250">250 صف لكل صفحة (للأجهزة السريعة)</option>
                    <option value="all">عرض الكل بدون تقسيم (قد يؤثر على السرعة)</option>
                  </select>
                  <p className="text-xs text-slate-400">
                    تقسيم الصفوف يمنع استهلاك ذاكرة المتصفح ويحافظ على سرعة الاستجابة.
                  </p>
                </div>
              </div>

              {/* Toggles: Virtual Scrolling, Mask Passwords, Live Badge */}
              <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-4 space-y-3.5">
                <div className="text-xs font-bold text-slate-200 pb-2 border-b border-slate-800/60 flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  خيارات الأداء والعرض الذكي (Zero-Freeze & Privacy)
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-900/60 border border-slate-800/60 cursor-pointer hover:border-slate-700 transition-colors">
                    <input
                      type="checkbox"
                      checked={tableVirtualScrolling}
                      onChange={(e) => setTableVirtualScrolling(e.target.checked)}
                      className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-950"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-300">التمرير الافتراضي (Virtual Scrolling)</div>
                      <div className="text-xs text-slate-400 mt-0.5">رسم الصفوف الظاهرة فقط في الشاشة لحماية الرام ومنع التشنج</div>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-900/60 border border-slate-800/60 cursor-pointer hover:border-slate-700 transition-colors">
                    <input
                      type="checkbox"
                      checked={tableMaskPasswords}
                      onChange={(e) => setTableMaskPasswords(e.target.checked)}
                      className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-950"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-300">إخفاء كلمات المرور افتراضياً</div>
                      <div className="text-xs text-slate-400 mt-0.5">عرض كلمات السر على هيئة نقاط حمايةً للخصوصية أثناء التصفح</div>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-900/60 border border-slate-800/60 cursor-pointer hover:border-slate-700 transition-colors">
                    <input
                      type="checkbox"
                      checked={tableShowLiveBadge}
                      onChange={(e) => setTableShowLiveBadge(e.target.checked)}
                      className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-950"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-300">وميض النبض المباشر (Live Pulse)</div>
                      <div className="text-xs text-slate-400 mt-0.5">عرض علامة نبض خضراء بجوار الجلسات النشطة حالياً</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Columns Visibility Section */}
              <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-4 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800/60">
                  <div>
                    <div className="text-xs font-bold text-slate-200 flex items-center gap-2">
                      <Table className="w-3.5 h-3.5 text-indigo-400" />
                      إدارة أعمدة جدول المشتركين (14 عمود قياسي)
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      حدد الأعمدة المطلوب إظهارها في شاشة إدارة المشتركين
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllColumns}
                      className="text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-indigo-300 border border-slate-700/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    >
                      تحديد الكل (14)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTableVisibleCols(['username', 'password', 'status', 'profile'])}
                      className="text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    >
                      الأعمدة الأساسية فقط
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {ALL_SUBSCRIBER_COLUMNS.map((col) => {
                    const isChecked = tableVisibleCols.includes(col.key);
                    return (
                      <div
                        key={col.key}
                        role="button"
                        tabIndex={0}
                        aria-pressed={isChecked}
                        onClick={() => handleToggleTableColumn(col.key)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleToggleTableColumn(col.key);
                          }
                        }}
                        className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer select-none transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                          isChecked
                            ? 'bg-slate-900/90 border-indigo-500/40 text-slate-200 shadow-sm'
                            : 'bg-slate-950/40 border-slate-800/60 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-indigo-400 shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-600 shrink-0" />
                          )}
                          <div className="truncate">
                            <span className="text-xs font-medium block truncate">{col.label}</span>
                            <span className="text-xs text-slate-400 block truncate">{col.tooltip}</span>
                          </div>
                        </div>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded border uppercase shrink-0 ${
                            isChecked
                              ? 'bg-indigo-950/50 text-indigo-300 border-indigo-800/60'
                              : 'bg-slate-900 text-slate-400 border-slate-800'
                          }`}
                        >
                          {col.category}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleResetTableSettings}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-bold text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  استعادة الوضع الافتراضي للجداول
                </button>

                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                >
                  <Save className="w-3.5 h-3.5" />
                  حفظ وتطبيق إعدادات الجداول
                </button>
              </div>
            </form>
          )}

          {/* 1. Connection Settings */}
          {activeCategory === 'connection' && (
            <form onSubmit={handleSaveConnection} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">عنوان السيرفر / IP (Host)*</label>
                  <input
                    type="text"
                    required
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="مثال: 192.168.88.1 أو test.domain"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">بورت API للاتصال*</label>
                  <input
                    type="number"
                    required
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    placeholder="افتراضي: 8728"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">اسم مستخدم الراوتر*</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="مثال: admin"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 font-mono"
                  />
                </div>

                <div className="space-y-1.5 relative">
                  <label className="text-xs font-bold text-slate-300">كلمة المرور (اختياري للتحديث)</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl ps-3.5 pe-10 py-2 text-xs text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                      className="absolute end-3 top-2 text-slate-400 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-3.5 bg-slate-950/40 border border-slate-800 rounded-xl space-y-1.5">
                <div className="text-xs text-amber-400 font-bold flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  <span>توضيح الأمان والسرية التامة</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  تطبيق ZCtrl يتعامل مباشرة مع راوتر مايكروتك الحقيقي ولا يمرر بياناتك لأي مخدم خارجي. يتم تخزين اسم المستخدم والعنوان محلياً في المتصفح فقط بينما تفاصيل كلمات المرور الحساسة تعامل بجلسات مؤمنة ويتم نسيانها تماماً فور خروجك لحفظ أعلى مستويات الخصوصية للمشتركين والمدراء.
                </p>
              </div>

              {(tlsFingerprint || router?.tlsFingerprint) && (
                <div className="p-3.5 bg-emerald-950/20 border border-emerald-500/30 rounded-xl space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4" />
                      <span>بصمة شهادة TLS الفعلية للراوتر (SHA-256 Pinning)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const fp = tlsFingerprint || router?.tlsFingerprint || '';
                        navigator.clipboard?.writeText(fp);
                        setCopiedFingerprint(true);
                        showToast('تم نسخ بصمة الشهادة (SHA-256) بنجاح', 'success');
                        setTimeout(() => {
                          if (isMountedRef.current) setCopiedFingerprint(false);
                        }, 2000);
                      }}
                      className="px-2.5 py-1 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    >
                      {copiedFingerprint ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedFingerprint ? 'تم النسخ' : 'نسخ البصمة'}</span>
                    </button>
                  </div>
                  <div
                    dir="ltr"
                    className="p-2 bg-slate-950/80 border border-slate-800 rounded-lg text-xs font-mono text-emerald-300 break-all select-all text-left"
                  >
                    {tlsFingerprint || router?.tlsFingerprint}
                  </div>
                  <p className="text-xs text-slate-400">
                    يمكنك لصق هذه البصمة في حقل &quot;تثبيت شهادة TLS&quot; عند تسجيل الدخول لرفض أي اتصال ينتحل هوية الراوتر.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/80">
                <span className="text-xs text-slate-400 flex items-center gap-1.5">
                  <span>الحالة الحالية:</span>
                  {isConnected ? (
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span>متصل بنجاح</span>
                      <span dir="ltr" className="font-mono unicode-isolate text-slate-300">({router?.host})</span>
                    </span>
                  ) : (
                    <span className="text-rose-400 font-bold flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-rose-400" />
                      <span>غير متصل</span>
                    </span>
                  )}
                </span>
                
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleTestAndConnect}
                    disabled={testingConnection || isConnecting}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl border border-emerald-500/30 flex items-center gap-1.5 transition-all shadow-md cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                  >
                    <Zap className={`w-4 h-4 text-amber-300 ${testingConnection ? 'animate-spin' : ''}`} />
                    <span>{testingConnection ? 'جاري الاتصال...' : 'حفظ واختبار الاتصال الآن'}</span>
                  </button>

                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl border border-blue-500/30 flex items-center gap-1.5 transition-all shadow-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  >
                    <Save className="w-4 h-4" />
                    <span>حفظ البيانات محلياً</span>
                  </button>
                </div>
              </div>

              {/* Multiple Connection Profiles Section */}
              <div className="mt-6 bg-slate-950/70 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-xl">
                      <Zap className="w-4 h-4 text-amber-300" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white flex items-center gap-2">
                        <span>بروفايلات الاتصال المتعددة بالراوتر (منزل، مكتب، فرع)</span>
                        <span className="text-xs text-blue-400 font-mono font-bold bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                          {connectionProfiles.length} بروفايلات
                        </span>
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        حفظ وتفعيل بروفايلات اتصال متعددة للراوتر والتبديل بينها بضغطة زر واحدة دون إعادة كتابة البيانات
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowProfilesModal(true)}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>إدارة كافة البروفايلات</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {connectionProfiles.map((p) => {
                    const Icon = p.category === 'home' ? Home : p.category === 'office' ? Building2 : p.category === 'branch' ? Store : Globe;
                    const isCurrent = isConnected && router?.host === p.host;

                    return (
                      <div
                        key={p.id}
                        className={`p-3.5 rounded-xl border flex flex-col justify-between space-y-2.5 ${
                          isCurrent
                            ? 'bg-blue-950/40 border-blue-500/60 ring-1 ring-blue-500/30'
                            : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="p-2 bg-slate-800 text-slate-300 rounded-lg shrink-0">
                            <Icon className="w-4 h-4 text-blue-400" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-bold text-white truncate block">{p.name}</span>
                              {isCurrent && (
                                <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold shrink-0">
                                  متصل
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-slate-400 font-mono block truncate" dir="ltr">
                              {p.host}:{p.port || 8728}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={async () => {
                            if (p.password) {
                              await activateConnectionProfile(p.id);
                            } else {
                              setShowProfilesModal(true);
                            }
                          }}
                          disabled={isConnecting || isCurrent}
                          className={`w-full py-1.5 px-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                            isCurrent
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default'
                              : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md'
                          }`}
                        >
                          <Zap className="w-3 h-3 text-amber-300" />
                          <span>{isCurrent ? 'البروفايل مفعّل حالياً' : 'تفعيل بضغطة زر'}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </form>
          )}

          {/* 2. Sync and Progressive Tuning */}
          {activeCategory === 'sync' && (
            <form onSubmit={handleSaveSync} className="space-y-5">
              <div className="space-y-4">
                {/* Auto-sync Toggle */}
                <div className="flex items-center justify-between p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-slate-200">تفعيل المزامنة التلقائية اللحظية</div>
                    <div className="text-xs text-slate-400">مزامنة البيانات الحقيقية من المايكروتك دورياً بدون الحاجة لتحديث الصفحة</div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoSync}
                    aria-label="تفعيل المزامنة التلقائية اللحظية"
                    onClick={() => setAutoSync(!autoSync)}
                    className={`w-12 h-6.5 rounded-full p-1 transition-colors relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${autoSync ? 'bg-emerald-600' : 'bg-slate-800'}`}
                  >
                    <span className={`block w-4.5 h-4.5 bg-white rounded-full transition-all duration-200 absolute top-1 ${autoSync ? 'start-1' : 'end-1'}`} />
                  </button>
                </div>

                {/* Sync Frequency */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-300">تردد المزامنة التلقائية للمشتركين (بالثواني)</span>
                    <span className="text-emerald-400 font-mono text-xs font-bold">
                      كل {syncFrequency} ثانية {syncFrequency === 15 ? '(الافتراضي المستحسن)' : ''}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="5"
                      max="120"
                      step="1"
                      disabled={!autoSync}
                      value={syncFrequency}
                      aria-label="تردد المزامنة التلقائية بالثواني"
                      onChange={(e) => setSyncFrequency(Number(e.target.value))}
                      className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-blue-500 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    />
                    <div className="shrink-0 flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-2 py-1">
                      <input
                        type="number"
                        min="5"
                        max="300"
                        disabled={!autoSync}
                        value={syncFrequency}
                        aria-label="عدد ثواني المزامنة"
                        onChange={(e) => setSyncFrequency(Math.max(5, Number(e.target.value)))}
                        className="w-12 text-center bg-transparent text-xs font-mono font-bold text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
                      />
                      <span className="text-xs text-slate-400">ثانية</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <span className="text-xs text-slate-400 font-semibold shrink-0">اختيارات سريعة:</span>
                    <button
                      type="button"
                      onClick={() => setSyncFrequency(15)}
                      className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                        syncFrequency === 15
                          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                          : 'bg-slate-950 text-slate-300 hover:bg-slate-800 border border-slate-800'
                      }`}
                    >
                      15 ثانية (الافتراضي)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSyncFrequency(30)}
                      className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                        syncFrequency === 30
                          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                          : 'bg-slate-950 text-slate-300 hover:bg-slate-800 border border-slate-800'
                      }`}
                    >
                      30 ثانية
                    </button>
                    <button
                      type="button"
                      onClick={() => setSyncFrequency(60)}
                      className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                        syncFrequency === 60
                          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                          : 'bg-slate-950 text-slate-300 hover:bg-slate-800 border border-slate-800'
                      }`}
                    >
                      60 ثانية (خفيف)
                    </button>
                  </div>
                </div>

                {/* Progressive Sync Priority (المزامنة التدريجية حسب الأهمية) */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 block">نظام المزامنة التدريجية حسب الأهمية (Progressive Importance)*</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setSyncPriority('critical')}
                      className={`p-3 rounded-xl border text-start transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                        syncPriority === 'critical'
                          ? 'bg-blue-600/10 border-blue-500 text-blue-300 font-bold'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300'
                      }`}
                    >
                      <div className="text-xs font-bold mb-1">حرج ولحظي</div>
                      <div className="text-xs text-slate-400 leading-normal">
                        جلب فوري للمستخدمين النشطين وترافيك المنافذ فقط كل 3 ثوان وتأخير السجلات.
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSyncPriority('adaptive')}
                      className={`p-3 rounded-xl border text-start transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                        syncPriority === 'adaptive'
                          ? 'bg-emerald-600/10 border-emerald-500 text-emerald-300 font-bold'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300'
                      }`}
                    >
                      <div className="text-xs font-bold mb-1">ذكي ومتوازن</div>
                      <div className="text-xs text-slate-400 leading-normal">
                        مزامنة المستخدمين كل 3ث وسجلات النظام كل 10ث لضمان أعلى كفاءة وأقل لود للراوتر.
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSyncPriority('low_resource')}
                      className={`p-3 rounded-xl border text-start transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                        syncPriority === 'low_resource'
                          ? 'bg-amber-600/10 border-amber-500 text-amber-300 font-bold'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300'
                      }`}
                    >
                      <div className="text-xs font-bold mb-1">توفير معالج الراوتر</div>
                      <div className="text-xs text-slate-400 leading-normal">
                        توسيع تردد كافة المزامنات إلى 15 ثانية لمنع البطء والضغط على راوترات معالجات MIPS.
                      </div>
                    </button>
                  </div>
                </div>

                {/* MikroTik Zero-Heat & Thermal Shield Module */}
                <div className="p-4 bg-slate-950/80 border border-emerald-500/30 rounded-2xl space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shrink-0">
                        <Thermometer className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-2 flex-wrap">
                          <span>درع الحماية الحرارية للراوتر (MikroTik Zero-Heat & Thermal Guard)</span>
                          <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30">
                            حماية العتاد 100%
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          يمنع ارتفاع درجة حرارة بوردة ومعالج المايكروتك بنسبة 100% عبر الفواصل الزمنية الدقيقة (Inter-query Pacing) والإيقاف التلقائي للمزامنة عند تصغير المتصفح.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setEcoMode(!ecoMode)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                        ecoMode || thermalShieldActive
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-950'
                          : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>{ecoMode || thermalShieldActive ? 'درع التبريد نشط' : 'تفعيل درع التبريد'}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
                      <span className="text-slate-400">حرارة المعالج:</span>
                      <span className="font-mono font-bold text-emerald-400">
                        {router?.cpuTemperature ? `${router.cpuTemperature}°C` : (router?.boardTemperature ? `${router.boardTemperature}°C` : 'غير متاح')}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
                      <span className="text-slate-400">استهلاك المعالج CPU:</span>
                      <span className="font-mono font-bold text-blue-400">
                        {router?.cpuLoad ?? 0}%
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
                      <span className="text-slate-400">حالة التوفير والخمول:</span>
                      <span className="font-bold text-slate-300">
                        {isUserIdle ? 'خمول ذكي (0% لود)' : 'متفاعل ونشط'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Prevent Fake Data Disclaimer */}
                <div className="p-3.5 bg-slate-950/40 border border-slate-800 rounded-xl flex gap-3">
                  <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="text-xs text-emerald-400 font-bold">الحماية من المزامنة والبيانات الوهمية</div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      يضمن ZCtrl خلو جميع القوائم والتقارير من أي مستخدمين وهميين أو بيانات تم إنشاؤها عشوائياً. كل ما تراه يعكس الحالة الراهنة لقاعدة بيانات راوتر المايكروتك الحقيقي، ولا يقوم البرنامج بأي حذف تلقائي من الميكروتك مطلقاً إلا بطلب مباشر وصريح ومؤكد منك.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-3 border-t border-slate-800/80">
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl border border-blue-500/30 flex items-center gap-1.5 transition-all shadow-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  <Save className="w-4 h-4" />
                  <span>حفظ المزامنة والترددات</span>
                </button>
              </div>
            </form>
          )}

          {/* 3. Voucher Settings */}
          {activeCategory === 'vouchers' && (
            <form onSubmit={handleSaveVouchers} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">طول اسم الكود الافتراضي (اسم المستخدم)*</label>
                  <input
                    type="number"
                    min="4"
                    max="15"
                    required
                    value={defaultLength}
                    onChange={(e) => setDefaultLength(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">البادئة التلقائية للكروت (Prefix)</label>
                  <input
                    type="text"
                    value={defaultPrefix}
                    onChange={(e) => setDefaultPrefix(e.target.value)}
                    placeholder="مثال: ZC-"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">نوع محارف كود البطاقة الافتراضي</label>
                  <select
                    value={defaultCharSet}
                    onChange={(e) => setDefaultCharSet(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer"
                  >
                    <option value="numbers">أرقام فقط (0-9) - الأسهل للمشتركين</option>
                    <option value="letters">حروف إنجليزية صغيرة (a-z)</option>
                    <option value="mixed_lowercase">حروف صغيرة وأرقام مختلطة</option>
                    <option value="mixed_uppercase">حروف كبيرة وأرقام مختلطة</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">السعر التلقائي الافتراضي للكرت (ر.س)</label>
                  <input
                    type="number"
                    min="0"
                    value={defaultPrice}
                    onChange={(e) => setDefaultPrice(e.target.value)}
                    placeholder="5"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 font-mono"
                  />
                </div>
              </div>

              <div className="p-3.5 bg-slate-950/40 border border-slate-800 rounded-xl space-y-1.5">
                <div className="text-xs text-amber-400 font-bold flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5" />
                  <span>تلميح التوليد التلقائي للكروت</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  هذه القيم ستصبح الخيارات المعبأة تلقائياً بمجرد فتحك لتبويبة "توليد كروت الهوتسبوت" في استوديو الكروت، مما يسرع دورتك اليومية لإنتاج وتوليد وطباعة الكروت بضغطة زر واحدة بدون تكرار إدخال الطول والسعر وباقي البادئات.
                </p>
              </div>

              <div className="flex justify-end pt-3 border-t border-slate-800/80">
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl border border-blue-500/30 flex items-center gap-1.5 transition-all shadow-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  <Save className="w-4 h-4" />
                  <span>حفظ إعدادات الكروت</span>
                </button>
              </div>
            </form>
          )}

          {/* 4. Security Settings */}
          {activeCategory === 'security' && (
            <div className="space-y-6">
              <form onSubmit={handleSaveSecurity} className="space-y-5">
                <div className="space-y-4">
                {/* Save passwords locally */}
                <div className="flex items-center justify-between p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-slate-200">حفظ الإعدادات في متصفحك المحلي (Offline Storage)</div>
                    <div className="text-xs text-slate-400">تذكر تفاصيل الاتصال (عدا كلمة مرور المايكروتك) لسرعة ملء النموذج بالمرة القادمة</div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={savePasswordPolicy}
                    aria-label="حفظ إعدادات الاتصال محلياً"
                    onClick={() => setSavePasswordPolicy(!savePasswordPolicy)}
                    className={`w-12 h-6.5 rounded-full p-1 transition-colors relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${savePasswordPolicy ? 'bg-blue-600' : 'bg-slate-800'}`}
                  >
                    <span className={`block w-4.5 h-4.5 bg-white rounded-full transition-all duration-200 absolute top-1 ${savePasswordPolicy ? 'start-1' : 'end-1'}`} />
                  </button>
                </div>

                {/* Desktop Vault Key Status & Backup */}
                {(vaultStatus || window.zctrlDesktopVault?.exportVaultKeyBackup) && (
                  <div className={`p-3.5 rounded-xl border space-y-2.5 ${vaultStatus?.healthy === false ? 'bg-amber-950/20 border-amber-500/40' : 'bg-slate-950/60 border-slate-800/80'}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                          <ShieldCheck className={`w-4 h-4 ${vaultStatus?.healthy === false ? 'text-amber-400' : 'text-emerald-400'}`} />
                          <span>مفتاح تشفير خزنة سطح المكتب (Vault Encryption Key)</span>
                        </div>
                        <p className="text-xs text-slate-400">
                          {vaultStatus?.warning || 'مفتاح الخزنة مهيأ ومؤمن محلياً لحماية بيانات الاعتماد.'}
                        </p>
                      </div>
                      {window.zctrlDesktopVault?.exportVaultKeyBackup && (
                        <button
                          type="button"
                          disabled={exportingVaultKey}
                          onClick={async () => {
                            if (!window.zctrlDesktopVault?.exportVaultKeyBackup) return;
                            setExportingVaultKey(true);
                            try {
                              const res = await window.zctrlDesktopVault.exportVaultKeyBackup();
                              if (res.success) {
                                showToast('تم تصدير نسخة احتياطية لمفتاح الخزنة بنجاح', 'success');
                              } else if (!res.canceled) {
                                showToast(res.error || 'تعذر تصدير نسخة مفتاح الخزنة', 'error');
                              }
                            } catch (err: any) {
                              showToast(err?.message || 'حدث خطأ أثناء تصدير مفتاح الخزنة', 'error');
                            } finally {
                              if (isMountedRef.current) setExportingVaultKey(false);
                            }
                          }}
                          className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-bold text-emerald-300 border border-emerald-500/30 transition-colors cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                        >
                          {exportingVaultKey ? 'جاري التصدير...' : 'نسخ احتياطي لمفتاح الخزنة'}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Explicit session lifecycle policy */}
                <div className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-1">
                  <div className="text-xs font-bold text-slate-200">سياسة استمرار الجلسة وتسجيل الدخول اليدوي</div>
                  <div className="text-xs text-slate-400 leading-relaxed">
                    تبقى جلستك مفتوحة باستمرار طوال تشغيل البرنامج ولا يتم تسجيل الخروج تلقائياً أو بسبب عدم النشاط، وعند فتح التطبيق مجدداً يُطلب تسجيل الدخول يدوياً دائماً دون دخول تلقائي.
                  </div>
                </div>

                {/* Confirm on Actions disclaimer */}
                <div className="p-3.5 bg-slate-950/40 border border-slate-800 rounded-xl space-y-1.5">
                  <div className="text-xs text-amber-400 font-bold flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>تأكيد عمليات الحذف الإداري الشديد</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    من منطلق الحفاظ الشديد على استقرار السيرفر وسريته، تم تفعيل ميزة "تأكيد الحذف اليدوي" إجبارياً على جميع النوافذ والعمليات. لن يقوم النظام إطلاقاً بحذف أي مستخدم أو بروفايل أو قاعدة بيانات بصورة آلية من الراوتر، ويتم طلب موافقة المدير المباشر وتأكيده يدوياً قبل إرسال أمر الـ RouterOS API.
                  </p>
                </div>
              </div>

              <div className="flex justify-end pt-3 border-t border-slate-800/80">
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl border border-blue-500/30 flex items-center gap-1.5 transition-all shadow-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  <Save className="w-4 h-4" />
                  <span>حفظ سياسات الأمان</span>
                </button>
              </div>
            </form>

            {/* Operator RBAC Management Panel */}
            <div className="mt-6 pt-5 border-t border-slate-800/80 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-600/15 text-blue-400 border border-blue-500/25 rounded-xl">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">إدارة المشغلين وصلاحيات الوصول (RBAC)</h4>
                    <p className="text-xs text-slate-400">
                      إنشاء حسابات كاشير (توليد/طباعة الكروت وفصل الجلسات) أو مراقب (قراءة فقط)
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs bg-slate-950/70 border border-slate-800 px-3 py-1.5 rounded-xl">
                  <span className="text-slate-400">الجلسة الحالية:</span>
                  <span className="font-mono font-bold text-white">{operatorName || 'admin'}</span>
                  <span
                    className={`px-2 py-0.5 rounded-md text-xs font-bold border ${
                      userRole === 'admin'
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        : userRole === 'cashier'
                        ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                        : 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
                    }`}
                  >
                    {userRole === 'admin' ? 'مدير عام (Admin)' : userRole === 'cashier' ? 'أمين صندوق (Cashier)' : 'مراقب فقط (Viewer)'}
                  </span>
                </div>
              </div>

              {userRole !== 'admin' ? (
                <div className="p-3.5 bg-amber-950/20 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-center gap-2">
                  <Lock className="w-4 h-4 shrink-0" />
                  <span>إدارة حسابات المشغلين وتعديل الصلاحيات متاحة لصلاحية المدير العام (Admin) فقط.</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Add Operator Form */}
                  <form onSubmit={handleCreateOperator} className="p-4 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-3">
                    <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <UserPlus className="w-3.5 h-3.5 text-blue-400" />
                      <span>إضافة مشغل جديد</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                      <input
                        type="text"
                        value={newOpUsername}
                        onChange={(e) => setNewOpUsername(e.target.value)}
                        placeholder="اسم الدخول (مثال: cashier1)"
                        dir="ltr"
                        className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        required
                      />
                      <input
                        type="text"
                        value={newOpDisplayName}
                        onChange={(e) => setNewOpDisplayName(e.target.value)}
                        placeholder="الاسم المعروض (اختياري)"
                        className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      />
                      <input
                        type="password"
                        value={newOpPassword}
                        onChange={(e) => setNewOpPassword(e.target.value)}
                        placeholder="كلمة المرور (10+ أحرف)"
                        minLength={10}
                        dir="ltr"
                        className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        required
                      />
                      <select
                        value={newOpRole}
                        onChange={(e) => setNewOpRole(e.target.value as 'admin' | 'cashier' | 'viewer')}
                        className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer"
                      >
                        <option value="cashier">أمين صندوق (Cashier)</option>
                        <option value="viewer">مراقب قراءة فقط (Viewer)</option>
                        <option value="admin">مدير عام (Admin)</option>
                      </select>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={creatingOperator}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>{creatingOperator ? 'جاري الإنشاء...' : 'إنشاء حساب المشغل'}</span>
                      </button>
                    </div>
                  </form>

                  {/* Operators List */}
                  <div className="bg-slate-950/40 border border-slate-800 rounded-2xl overflow-hidden">
                    <div className="px-4 py-2.5 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-200">
                        المشغلون المسجلون ({operators.length})
                      </span>
                      <button
                        type="button"
                        onClick={fetchOperators}
                        disabled={loadingOperators}
                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-1"
                      >
                        <RefreshCw className={`w-3 h-3 ${loadingOperators ? 'animate-spin' : ''}`} />
                        <span>تحديث</span>
                      </button>
                    </div>
                    {operators.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400">
                        لا يوجد مشغلون مخصصون بعد. يتم استخدام حساب مدير الراوتر بصلاحية كاملة افتراضياً.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-800/70">
                        {operators.map((op) => (
                          <div key={op.id} className="p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${op.disabled ? 'bg-rose-500' : 'bg-emerald-400'}`}
                              />
                              <div className="min-w-0">
                                <div className="font-bold text-white flex items-center gap-2">
                                  <span>{op.displayName}</span>
                                  <span className="text-xs font-mono text-slate-400">({op.username})</span>
                                </div>
                                <div className="text-xs text-slate-400">
                                  {op.lastLoginAt
                                    ? `آخر دخول: ${new Date(op.lastLoginAt).toLocaleString('ar-EG')}`
                                    : 'لم يسجل الدخول بعد'}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2 py-0.5 rounded-lg text-xs font-bold border ${
                                  op.role === 'admin'
                                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                    : op.role === 'cashier'
                                    ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                                    : 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
                                }`}
                              >
                                {op.role === 'admin' ? 'مدير عام' : op.role === 'cashier' ? 'أمين صندوق' : 'مراقب'}
                              </span>

                              <button
                                type="button"
                                onClick={() => handleToggleOperatorStatus(op)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                  op.disabled
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                                    : 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                                }`}
                              >
                                {op.disabled ? 'تفعيل' : 'تعطيل'}
                              </button>

                              {confirmDeleteOpId === op.id ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteOperator(op.id)}
                                    className="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                                  >
                                    تأكيد الحذف
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteOpId(null)}
                                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                                  >
                                    إلغاء
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteOpId(op.id)}
                                  className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                                  title="حذف المشغل"
                                  aria-label={`حذف المشغل ${op.displayName}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            </div>
          )}

          {/* Telegram Bot Notification Settings */}
          {activeCategory === 'telegram' && (
            <form onSubmit={handleSaveTelegram} className="space-y-5">
              <div className="space-y-4">
                {/* Enable Telegram Alerts Toggle */}
                <div className="flex items-center justify-between p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl">
                  <div className="space-y-0.5">
                    <label className="text-xs font-bold text-slate-200 flex items-center gap-2">
                      <Send className="w-4 h-4 text-sky-400" />
                      <span>تفعيل إشعارات بوت تيليجرام (Telegram Alerts)</span>
                    </label>
                    <p className="text-xs text-slate-400">
                      إرسال رسائل وتنبيهات فورية ومباشرة إلى جوالك عبر تطبيق تيليجرام
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={telegramEnabled}
                    aria-label="تفعيل إشعارات بوت تيليجرام"
                    onChange={(e) => setTelegramEnabled(e.target.checked)}
                    className="w-4 h-4 accent-sky-500 rounded cursor-pointer"
                  />
                </div>

                {/* Token and Chat ID */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                      <span>توكن البوت (Bot Token)*</span>
                      <span className="text-xs text-slate-400">(من @BotFather)</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showTelegramToken ? 'text' : 'password'}
                        value={telegramBotToken}
                        onChange={(e) => setTelegramBotToken(e.target.value)}
                        placeholder="123456789:ABCdefGhIJKlmNoPQRstuVWXyz"
                        className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 font-mono pe-9"
                      />
                      <button
                        type="button"
                        onClick={() => setShowTelegramToken(!showTelegramToken)}
                        aria-label={showTelegramToken ? 'إخفاء توكن البوت' : 'إظهار توكن البوت'}
                        className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded"
                      >
                        {showTelegramToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                      <span>معرف الدردشة (Chat ID)*</span>
                      <span className="text-xs text-slate-400">(من @userinfobot)</span>
                    </label>
                    <input
                      type="text"
                      value={telegramChatId}
                      onChange={(e) => setTelegramChatId(e.target.value)}
                      placeholder="مثال: 987654321 أو -1001234567890"
                      className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 font-mono"
                    />
                  </div>
                </div>

                {/* Notification Trigger Toggles */}
                <div className="p-4 bg-slate-950/50 border border-slate-800/80 rounded-xl space-y-3">
                  <span className="text-xs font-bold text-slate-300 block">أنواع التنبيهات المطلوب إرسالها:</span>
                  
                  <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer hover:text-white">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-400" />
                      <span>تنبيه فوري عند انقطاع الاتصال براوتر المايكروتك</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={telegramNotifyDisconnect}
                      onChange={(e) => setTelegramNotifyDisconnect(e.target.checked)}
                      className="w-4 h-4 accent-sky-500 rounded cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer hover:text-white">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      <span>تنبيه عند ارتفاع حرارة الراوتر أو وصول المعالج إلى 85%+</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={telegramNotifyHighCpu}
                      onChange={(e) => setTelegramNotifyHighCpu(e.target.checked)}
                      className="w-4 h-4 accent-sky-500 rounded cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer hover:text-white">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span>تنبيه عند توليد وطباعة أي دفعة كروت جديدة</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={telegramNotifyVouchers}
                      onChange={(e) => setTelegramNotifyVouchers(e.target.checked)}
                      className="w-4 h-4 accent-sky-500 rounded cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={handleTestTelegram}
                  disabled={testingTelegram}
                  className="bg-slate-800 hover:bg-slate-700 text-sky-400 text-xs font-bold px-4 py-2.5 rounded-xl border border-sky-500/30 flex items-center gap-2 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                >
                  <Send className={`w-3.5 h-3.5 ${testingTelegram ? 'animate-spin' : ''}`} />
                  <span>{testingTelegram ? 'جاري الإرسال...' : 'إرسال رسالة تجربة للبوت'}</span>
                </button>

                <button
                  type="submit"
                  disabled={savingTelegram}
                  className="bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl border border-sky-500/30 flex items-center gap-1.5 transition-all shadow-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingTelegram ? 'جاري الحفظ...' : 'حفظ إعدادات تيليجرام'}</span>
                </button>
              </div>
            </form>
          )}

          {/* 5. General Application Settings */}
          {activeCategory === 'application' && (
            <form onSubmit={handleSaveApplication} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                    <Coins className="w-3.5 h-3.5 text-amber-400" />
                    <span>العملة الافتراضية للنظام (Currency)</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    placeholder="مثال: ر.س، د.ع، $، ل.س"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                    <Sliders className="w-3.5 h-3.5 text-blue-400" />
                    <span>عدد المشتركين في الصفحة (Paging Size)</span>
                  </label>
                  <select
                    value={pagingSize}
                    onChange={(e) => setPagingSize(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer"
                  >
                    <option value="10">10 مشتركين في الصفحة</option>
                    <option value="20">20 مشترك في الصفحة (موصى به)</option>
                    <option value="50">50 مشترك في الصفحة</option>
                    <option value="100">100 مشترك في الصفحة (للشاشات الكبيرة)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                    <Globe className="w-3.5 h-3.5 text-emerald-400" />
                    <span>نطاق تسجيل دخول الهوتسبوت (Hotspot Domain)</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={hotspotDomain}
                    onChange={(e) => setHotspotDomain(e.target.value)}
                    placeholder="مثال: login.zcontrol.net"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                    <Layout className="w-3.5 h-3.5 text-purple-400" />
                    <span>كثافة عرض وتخطيط الجداول (Density)</span>
                  </label>
                  <select
                    value={layoutDensity}
                    onChange={(e) => setLayoutDensity(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer"
                  >
                    <option value="compact">متراص (Compact) - عرض بيانات أكثر</option>
                    <option value="normal">طبيعي (Normal) - مريح للعين</option>
                    <option value="relaxed">واسع (Relaxed) - تصفح متباعد</option>
                  </select>
                </div>
              </div>

              {/* Show guide hints toggle */}
              <div className="flex items-center justify-between p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <HelpCircle className="w-4 h-4 text-emerald-400" />
                    <span>عرض تلميحات دليل التشغيل في التبويبات الأخرى</span>
                  </div>
                  <div className="text-xs text-slate-400">إظهار تلميحات سريعة أسفل النوافذ لمساعدتك أثناء إدارة الشبكة</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={showGuideHints}
                  aria-label="عرض تلميحات دليل التشغيل في التبويبات الأخرى"
                  onClick={() => setShowGuideHints(!showGuideHints)}
                  className={`w-12 h-6.5 rounded-full p-1 transition-colors relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${showGuideHints ? 'bg-blue-600' : 'bg-slate-800'}`}
                >
                  <span className={`block w-4.5 h-4.5 bg-white rounded-full transition-all duration-200 absolute top-1 ${showGuideHints ? 'start-1' : 'end-1'}`} />
                </button>
              </div>

              <div className="flex justify-end pt-3 border-t border-slate-800/80">
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl border border-blue-500/30 flex items-center gap-1.5 transition-all shadow-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  <Save className="w-4 h-4" />
                  <span>حفظ إعدادات البرنامج العامة</span>
                </button>
              </div>
            </form>
          )}

          {/* 6. Appearance, Fonts & Themes Settings */}
          {activeCategory === 'appearance' && (
            <form onSubmit={handleSaveAppearance} className="space-y-6">
              {/* Font Controls */}
              <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-4">
                <h3 className="text-xs font-bold text-amber-400 flex items-center gap-2">
                  <Palette className="w-4 h-4 text-amber-400" />
                  <span>إعدادات الخطوط وحجم العرض (Typography & Font Scale)</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300">نوع خط البرنامج (Font Family)</label>
                    <select
                      value={fontFamily}
                      onChange={(e) => setFontFamily(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer"
                    >
                      <option value="cairo">خط القاهرة المدمج (Cairo Variable - القياسي)</option>
                      <option value="tajawal">خط القاهرة المرن (Cairo Sans)</option>
                      <option value="system">خط النظام التلقائي (System Sans)</option>
                      <option value="inter">خط تقني مدمج (Cairo + JetBrains Mono)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300">تكبير وتصغير حجم الواجهة (Font Scale)</label>
                    <select
                      value={fontSize}
                      onChange={(e) => setFontSize(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer"
                    >
                      <option value="85">صغير (85% - مناسب للمراقبين)</option>
                      <option value="100">قياسي متوازن (100% - الموصى به)</option>
                      <option value="115">كبير وواضح (115% - سهولة القراءة)</option>
                      <option value="130">ضخم (130% - للشاشات البعيدة)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Logo & Color Shift Animation Controls */}
              <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-4">
                <h3 className="text-xs font-bold text-pink-400 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-pink-400" />
                  <span>تأثيرات الشعار والألوان التفاعلية (Logo & Color Shift)</span>
                </h3>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-slate-900 border border-slate-800 rounded-xl">
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-slate-200">شفافية شعار خلفية البرنامج (Logo Watermark)</div>
                      <div className="text-xs text-slate-400">إظهار شعار ZC المجسم بشكل خفيف في خلفية مساحة العمل</div>
                    </div>
                    <select
                      value={watermarkOpacity}
                      onChange={(e) => setWatermarkOpacity(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 cursor-pointer"
                    >
                      <option value="0">مخفي (0%)</option>
                      <option value="0.05">خفيف جداً (5%)</option>
                      <option value="0.08">متوسط (8% - القياسي)</option>
                      <option value="0.15">بارز (15%)</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-900 border border-slate-800 rounded-xl">
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-slate-200">حركة تحول ألوان اسم وشعار ZCTRL</div>
                      <div className="text-xs text-slate-400">تغيير الألوان بسلاسة حركية كل ثانية للعنوان والأيقونة</div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={colorAnimation}
                      aria-label="حركة تحول ألوان اسم وشعار ZCTRL"
                      onClick={() => setColorAnimation(!colorAnimation)}
                      className={`w-12 h-6.5 rounded-full p-1 transition-colors relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${colorAnimation ? 'bg-pink-600' : 'bg-slate-800'}`}
                    >
                      <span className={`block w-4.5 h-4.5 bg-white rounded-full transition-all duration-200 absolute top-1 ${colorAnimation ? 'start-1' : 'end-1'}`} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Submit Save Appearance Button */}
              <div className="flex justify-end pt-3 border-t border-slate-800/80">
                <button
                  type="submit"
                  className="bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl border border-pink-500/30 flex items-center gap-1.5 transition-all shadow-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400"
                >
                  <Save className="w-4 h-4" />
                  <span>تطبيق وتحديث مظهر ZCTRL الآن</span>
                </button>
              </div>
            </form>
          )}

          {/* Dangerous Zone / Global Restore Defaults */}
          <div className="mt-8 pt-5 border-t border-red-900/30">
            <div className="p-4 bg-red-950/20 border border-red-900/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-xs font-bold text-red-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span>منطقة الإجراءات الحاسمة (Dangerous Zone)</span>
                </h3>
                <p className="text-xs text-slate-400 max-w-lg leading-relaxed">
                  إذا واجهت أي مشاكل بالمزامنة أو ترغب بإعادة إعدادات البرنامج (تردد المزامنة، قيم توليد كروت الهوتسبوت، التفضيلات العامة) إلى قيم المصنع الأصلية الفورية.
                </p>
              </div>

              <button
                type="button"
                onClick={handleRestoreDefaults}
                className="bg-red-950 hover:bg-red-900 text-red-300 hover:text-white text-xs font-bold px-4 py-2.5 rounded-xl border border-red-800/40 flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              >
                <RotateCcw className="w-4 h-4" />
                <span>إعادة إعدادات البرنامج الافتراضية</span>
              </button>
            </div>
          </div>
        </div>
      </div>
      {/* Confirm Restore Defaults Modal */}
      <ConfirmModal
        isOpen={showResetConfirm}
        title="تأكيد استعادة الإعدادات الافتراضية"
        message="هل أنت متأكد من رغبتك في استعادة الإعدادات الافتراضية لبرنامج ZCtrl؟ سيتم إعادة تعيين جميع التفضيلات الحالية وقيم المزامنة وتوليد الكروت إلى وضع المصنع."
        confirmText="نعم، استعادة الافتراضي"
        cancelText="إلغاء"
        type="warning"
        onConfirm={handleExecuteRestoreDefaults}
        onClose={() => setShowResetConfirm(false)}
      />

      {/* Router Connection Profiles Management Modal */}
      <RouterConnectionProfilesModal
        isOpen={showProfilesModal}
        onClose={() => setShowProfilesModal(false)}
      />
    </div>
  );
};
