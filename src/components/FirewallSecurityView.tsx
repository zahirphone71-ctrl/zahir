import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useMikroTik } from '../context/MikroTikContext';
import { safeStorage } from '../utils/safeStorage';
import { secureFetch, safeParseJson } from '../lib/api';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Zap,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Flame,
  ArrowRightLeft,
  Activity,
  Layers,
  Settings,
  Sliders,
  Network,
  Users,
  Check,
  RefreshCw,
  FolderLock,
  Trash2,
  Plus,
  Play,
  Filter,
  Server,
  Wifi,
  Info,
  SlidersHorizontal,
  Key,
  Globe,
  FileCode,
  FileDown,
  Terminal
} from 'lucide-react';
import { PdfExportModal } from './PdfExportModal';
import { ConfirmModal } from './ConfirmModal';

const sanitizeCliVal = (v: string): string =>
  String(v || '').replace(/["`$;[\]\r\n\\]/g, '').trim();

interface SecurityRule {
  id: string;
  path: string;
  title: string;
  description: string;
}

interface SecurityGroup {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  rules: SecurityRule[];
}

const SECURITY_GROUPS: SecurityGroup[] = [
  {
    id: 'system',
    title: '1. قائمة System (النظام وإدارة الحسابات والتحديثات)',
    icon: Settings,
    rules: [
      {
        id: 'new_admin_user',
        path: 'System > Users',
        title: 'إنشاء حساب مسؤول جديد',
        description: 'إضافة حساب جديد بأسماء غير قياسية ومنحه صلاحيات كاملة (group=full) كمدير رئيسي بديل.',
      },
      {
        id: 'disable_default_admin',
        path: 'System > Users',
        title: 'تعطيل الحساب الافتراضي (admin)',
        description: 'تعطيل أو حذف حساب admin الافتراضي بعد التأكد التام من عمل وصلاحية الحساب الجديد لتجنب هجمات الاختراق.',
      },
      {
        id: 'strong_passwords',
        path: 'System > Users',
        title: 'تعيين كلمة مرور قوية للمدير',
        description: 'استخدام كلمة مرور طويلة ومعقدة تحتوي على مزيج عشوائي من الحروف الكبيرة والصغيرة والأرقام والرموز.',
      },
      {
        id: 'update_routeros',
        path: 'System > Packages',
        title: 'تحديث نظام التشغيل RouterOS باستمرار',
        description: 'النقر على Check For Updates والتحديث المستمر إلى النسخ المستقرة (Stable أو Long-Term) لسد الثغرات المكتشفة.',
      }
    ]
  },
  {
    id: 'ip',
    title: '2. قائمة IP (إعدادات بروتوكول الإنترنت والخدمات والمنافذ)',
    icon: Network,
    rules: [
      {
        id: 'disable_unused_services',
        path: 'IP > Services',
        title: 'تعطيل الخدمات غير المستخدمة',
        description: 'إيقاف الخدمات غير الضرورية تماماً مثل Telnet (23)، FTP (21)، WWW (80)، و API (8728) لتقليص مساحة الاختراق.',
      },
      {
        id: 'change_default_ports',
        path: 'IP > Services',
        title: 'تغيير المنافذ الافتراضية للاتصال',
        description: 'تغيير منافذ الاتصال القياسية إلى منافذ مخصصة وغير معروفة (مثل منفذ WinBox 8291 ومنفذ SSH 22).',
      },
      {
        id: 'restrict_service_access',
        path: 'IP > Services',
        title: 'تقييد الوصول للخدمات (Available From)',
        description: 'تحديد نطاق أو عناوين IP مخصصة وموثوقة فقط مسموح لها بالاتصال بالخدمات المتبقية النشطة بالراوتر.',
      },
      {
        id: 'secure_dns_server',
        path: 'IP > DNS',
        title: 'تأمين خادم الـ DNS المحلي',
        description: 'إلغاء تحديد خيار Allow Remote Requests لمنع استغلال الراوتر في هجمات DNS Amplification الضارة من الخارج.',
      },
      {
        id: 'disable_mndp_discovery',
        path: 'IP > Neighbors',
        title: 'إيقاف بروتوكول الاكتشاف (MNDP)',
        description: 'التوجه إلى Discovery Settings وتعطيل اكتشاف الراوتر على واجهات WAN الخارجية لمنع تسريب بيانات وهوية الشبكة.',
      }
    ]
  },
  {
    id: 'firewall_rules_group',
    title: '3. قائمة IP > Firewall (الجدار الناري وقواعد الحماية المتقدمة)',
    icon: Shield,
    rules: [
      {
        id: 'protect_router_wan',
        path: 'Filter Rules (سلسلة Input)',
        title: 'حماية الراوتر من شبكة WAN الخارجية',
        description: 'إضافة قاعدة بحظر جميع الاتصالات الواردة من منفذ الإنترنت والتوجهة للراوتر نفسه لمنع الوصول الخارجي (chain=input, in-interface=WAN, action=drop).',
      },
      {
        id: 'brute_force_protection',
        path: 'Filter Rules (سلسلة Input)',
        title: 'الحماية من هجمات القوة الغاشمة (Brute Force)',
        description: 'إضافة قواعد جدار حماية لمراقبة وحظر المحاولات المتكررة والفاشلة لتسجيل الدخول عبر WinBox أو SSH تلقائياً.',
      },
      {
        id: 'port_scanning_protection',
        path: 'Filter Rules (سلسلة Input)',
        title: 'حظر هجمات فحص المنافذ (Port Scanning)',
        description: 'إنشاء قواعد ذكية تُسجل وتضيف أي آيبي خارجي يقوم بفحص منافذ الراوتر تلقائياً إلى قائمة الحظر السوداء (Address Lists).',
      }
    ]
  },
  {
    id: 'tools',
    title: '4. قائمة Tools (أدوات الطبقة الثانية وحصر الوصول المحلي)',
    icon: Sliders,
    rules: [
      {
        id: 'disable_mac_server_wan',
        path: 'Tools > MAC Server',
        title: 'تعطيل الوصول عبر الـ MAC من الخارجية',
        description: 'إيقاف خدمات MAC Telnet Server و MAC WinBox Server عن واجهة الإنترنت WAN لحصر وإجبار الدخول عبر الماك من الشبكة المحلية فقط.',
      }
    ]
  }
];

export const FirewallSecurityView: React.FC = () => {
  const { showToast, runCommand, applyQuickHarden, firewallRules: contextFirewallRules, simpleQueues } = useMikroTik();
  const [activeTab, setActiveTab] = useState<'hardening' | 'server_shield' | 'firewall_rules' | 'address_lists' | 'services_scripts' | 'queues_mangle' | 'vlans'>('hardening');
  const [isLoading, setIsLoading] = useState(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);

  // Server Security Shield State
  const [serverShieldConfig, setServerShieldConfig] = useState({
    rateLimitingEnabled: true,
    strictTenantIsolation: true,
    strictCorsEnabled: true,
    pathTraversalGuardEnabled: true,
    scriptInjectionGuardEnabled: true,
    inMemoryEncryptionEnabled: true,
  });
  const [serverShieldAudit, setServerShieldAudit] = useState<Array<{ id: string; name: string; status: string }>>([
    { id: "VULN-01", name: "Multi-Tenant Session Isolation", status: "Secured & Enforced" },
    { id: "VULN-02", name: "Authentication Rate Limiter", status: "Active (25 req / 15m)" },
    { id: "VULN-03", name: "CORS Whitelist Control", status: "Active & Restricted" },
    { id: "VULN-04", name: "RouterOS Script Injection Shield", status: "Sanitized & Validated" },
    { id: "VULN-05", name: "Deep Path Traversal Guard", status: "Zero-Traversal Enforced" },
    { id: "VULN-06", name: "In-Memory Credential Vault", status: "AES-256-GCM Encrypted" }
  ]);
  const [isUpdatingShield, setIsUpdatingShield] = useState(false);

  // Live MikroTik Official Audit & Auto-Fix State
  const [liveAuditLoading, setLiveAuditLoading] = useState(false);
  const [liveAuditData, setLiveAuditData] = useState<{
    score: number;
    summary: { total: number; compliant: number; vulnerable: number; warning: number; fixable: number };
    checks: Array<{
      id: string;
      category: string;
      title: string;
      path: string;
      officialRecommendation: string;
      status: 'compliant' | 'vulnerable' | 'warning';
      currentValue: string;
      fixAvailable: boolean;
      explanation: string;
    }>;
  } | null>(null);
  const [isAutoFixing, setIsAutoFixing] = useState(false);
  const [fixingCheckId, setFixingCheckId] = useState<string | null>(null);

  // Live Script Auditor & Cleaner State
  const [scriptsAuditLoading, setScriptsAuditLoading] = useState(false);
  const [scriptsAuditData, setScriptsAuditData] = useState<{
    totalScripts: number;
    totalSchedulers: number;
    faultyCount: number;
    scripts: Array<any>;
    brokenSchedulers: Array<any>;
  } | null>(null);
  const [isCleaningScripts, setIsCleaningScripts] = useState(false);

  const isMountedRef = useRef(true);
  const fetchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (fetchAbortRef.current) fetchAbortRef.current.abort();
    };
  }, []);

  const fetchLiveAudit = async () => {
    setLiveAuditLoading(true);
    try {
      const res = await secureFetch('/api/mikrotik/security/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = (await safeParseJson(res)) || {};
      if (!isMountedRef.current) return;
      if (res.ok && data.success) {
        setLiveAuditData(data);
        showToast(`اكتمل الفحص: نسبة التوافق مع توصيات MikroTik هي ${data.score}%`, 'info');
      } else {
        showToast(data.message || 'فشل فحص إعدادات الراوتر', 'error');
      }
    } catch (e: any) {
      if (isMountedRef.current) showToast('خطأ أثناء فحص الراوتر: ' + e.message, 'error');
    } finally {
      if (isMountedRef.current) setLiveAuditLoading(false);
    }
  };

  const handleRunAutoFix = async (checkIds: string[] = []) => {
    setIsAutoFixing(true);
    if (checkIds.length === 1) setFixingCheckId(checkIds[0]);
    try {
      const res = await secureFetch('/api/mikrotik/security/autofix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkIds })
      });
      const data = (await safeParseJson(res)) || {};
      if (!isMountedRef.current) return;
      if (res.ok && data.success) {
        showToast(data.message || 'تم تطبيق الإصلاحات بنجاح', 'success');
        fetchLiveAudit();
      } else {
        showToast(data.message || 'فشل تطبيق بعض الإصلاحات', 'error');
      }
    } catch (e: any) {
      if (isMountedRef.current) showToast('خطأ أثناء تطبيق الإصلاح: ' + e.message, 'error');
    } finally {
      if (isMountedRef.current) {
        setIsAutoFixing(false);
        setFixingCheckId(null);
      }
    }
  };

  const fetchScriptsAudit = async () => {
    setScriptsAuditLoading(true);
    try {
      const res = await secureFetch('/api/mikrotik/scripts/audit');
      const data = (await safeParseJson(res)) || {};
      if (!isMountedRef.current) return;
      if (res.ok && data.success) {
        setScriptsAuditData(data);
        if (data.faultyCount > 0) {
          showToast(`تم رصد ${data.faultyCount} سكربت/مجدول عشوائي أو تالف`, 'info');
        } else {
          showToast('الراوتر نظيف وخالٍ من السكربتات العشوائية والتالفة', 'success');
        }
      } else {
        showToast(data.message || 'فشل فحص السكربتات', 'error');
      }
    } catch (e: any) {
      if (isMountedRef.current) showToast('خطأ أثناء فحص السكربتات: ' + e.message, 'error');
    } finally {
      if (isMountedRef.current) setScriptsAuditLoading(false);
    }
  };

  const handleCleanScripts = async () => {
    setIsCleaningScripts(true);
    try {
      const res = await secureFetch('/api/mikrotik/scripts/clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = (await safeParseJson(res)) || {};
      if (!isMountedRef.current) return;
      if (res.ok && data.success) {
        showToast(data.message, 'success');
        fetchScriptsAudit();
        fetchLiveAudit();
      } else {
        showToast(data.message || 'فشل تنظيف السكربتات', 'error');
      }
    } catch (e: any) {
      if (isMountedRef.current) showToast('خطأ أثناء تنظيف السكربتات: ' + e.message, 'error');
    } finally {
      if (isMountedRef.current) setIsCleaningScripts(false);
    }
  };

  const fetchServerShieldStatus = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await secureFetch('/api/security/settings', { signal });
      const data = (await safeParseJson(res)) || {};
      if (!isMountedRef.current || signal?.aborted) return;
      if (res.ok && data.success) {
        setServerShieldConfig(data.config);
        if (data.auditedVulnerabilities) setServerShieldAudit(data.auditedVulnerabilities);
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.warn('Failed to fetch server security settings', e);
      }
    }
  }, []);

  const toggleShieldOption = async (key: string, value: boolean) => {
    const prevConfig = { ...serverShieldConfig };
    setIsUpdatingShield(true);
    try {
      const updated = { ...serverShieldConfig, [key]: value };
      setServerShieldConfig(updated as any);
      const res = await secureFetch('/api/security/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value })
      });
      const data = (await safeParseJson(res)) || {};
      if (!isMountedRef.current) return;
      if (res.ok && data.success) {
        if (data.config) setServerShieldConfig(data.config);
        showToast(data.message || 'تم تحديث الإعداد الأمني بنجاح', 'success');
      } else {
        setServerShieldConfig(prevConfig);
        showToast(data.message || 'فشل تحديث الإعداد الأمني', 'error');
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        setServerShieldConfig(prevConfig);
        showToast('فشل تحديث الإعداد الأمني: ' + err.message, 'error');
      }
    } finally {
      if (isMountedRef.current) setIsUpdatingShield(false);
    }
  };

  // Load / Save security checklist manually toggled by the manager
  const [securityStates, setSecurityStates] = useState<Record<string, boolean>>(() => {
    try {
      const saved = safeStorage.getItem('routeros_security_toggles');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const toggleSecurityRule = (id: string) => {
    const newState = { ...securityStates, [id]: !securityStates[id] };
    setSecurityStates(newState);
    safeStorage.setItem('routeros_security_toggles', JSON.stringify(newState));
    showToast(newState[id] ? 'تم وضع علامة الاستيفاء اليدوي' : 'تم إزالة علامة الاستيفاء', 'info');
  };

  // 1. Services State
  const [services, setServices] = useState<Array<{ id: string; name: string; port: number; enabled: boolean; desc: string }>>([
    { id: 'telnet', name: 'Telnet', port: 23, enabled: false, desc: 'منفذ الاتصال النصي غير المشفر (غير آمن)' },
    { id: 'ftp', name: 'FTP', port: 21, enabled: false, desc: 'منفذ نقل وتحميل الملفات للراوتر' },
    { id: 'www', name: 'WWW (HTTP)', port: 80, enabled: true, desc: 'منفذ واجهة الويب الافتراضية لإدارة الراوتر' },
    { id: 'ssh', name: 'SSH', port: 22, enabled: true, desc: 'منفذ الاتصال الطرفي المشفر والآمن' },
    { id: 'api', name: 'API', port: 8728, enabled: false, desc: 'منفذ الاتصال البرمجي الخارجي' },
    { id: 'winbox', name: 'WinBox', port: 8291, enabled: true, desc: 'برنامج إدارة المايكروتك الرسومي المعتمد' },
  ]);

  // 2. Firewall Rules State
  const [firewallRules, setFirewallRules] = useState<Array<{ id: string; action: string; chain: string; protocol: string; dstPort: string; comment: string; isOld?: boolean }>>(() => {
    if (Array.isArray(contextFirewallRules) && contextFirewallRules.length > 0) {
      return contextFirewallRules.map((r, idx) => ({
        id: r.id || `fw-${idx}`,
        action: r.action || 'accept',
        chain: r.chain || 'input',
        protocol: r.protocol || 'all',
        dstPort: r.dstPort || '',
        comment: r.comment || '',
        isOld: (r.comment || '').toLowerCase().includes('old') || (r.comment || '').includes('قديم')
      }));
    }
    return [];
  });

  // 3. Address Lists State
  const [addressLists, setAddressLists] = useState<Array<{ id: string; listName: string; address: string; comment: string }>>([]);

  // 4. Scheduled Scripts State
  const [scripts, setScripts] = useState<Array<{ id: string; name: string; interval: string; enabled: boolean; runCount: number; comment: string }>>([]);

  // 5. Queues & Mangles State
  const [queuesAndMangles, setQueuesAndMangles] = useState<Array<{ id: string; type: string; name: string; target: string; value: string; isDuplicate?: boolean }>>(() => {
    if (Array.isArray(simpleQueues) && simpleQueues.length > 0) {
      return simpleQueues.map((q, idx) => ({
        id: q.id || `qm-q-${idx}`,
        type: 'Queue',
        name: q.name || 'queue',
        target: q.target || '0.0.0.0/0',
        value: q.maxLimit || 'unlimited',
        isDuplicate: false
      }));
    }
    return [];
  });

  // 6. VLANs Settings State
  const [vlans, setVlans] = useState<Array<{ id: string; name: string; vlanId: number; interface: string; comment: string }>>([]);

  const [preventRandomQueues, setPreventRandomQueues] = useState(false);

  // Live RouterOS Fetcher via Structured API (preserves real MikroTik .id values)
  const fetchLiveSecurityData = useCallback(async () => {
    if (fetchAbortRef.current) fetchAbortRef.current.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    setIsLoading(true);
    try {
      const res = await secureFetch('/api/mikrotik/security/resources', {
        signal: controller.signal
      });
      const json = (await safeParseJson(res)) || {};
      if (!isMountedRef.current || controller.signal.aborted) return;

      if (res.ok && json.success && json.data) {
        const d = json.data;
        if (Array.isArray(d.services) && d.services.length > 0) {
          setServices((prev) =>
            prev.map((s) => {
              const matched = d.services.find((rs: any) => String(rs.name).toLowerCase() === s.id.toLowerCase());
              return matched ? { ...s, port: matched.port || s.port, enabled: Boolean(matched.enabled) } : s;
            })
          );
        }
        if (Array.isArray(d.firewallRules)) setFirewallRules(d.firewallRules);
        if (Array.isArray(d.addressLists)) setAddressLists(d.addressLists);
        if (Array.isArray(d.scripts)) {
          setScripts(d.scripts);
          const guardActive = d.scripts.some(
            (sc: any) => sc.name === 'ZCtrl-Duplicate-Cleaner' && sc.enabled
          );
          setPreventRandomQueues(guardActive);
        }
        if (Array.isArray(d.queuesAndMangles)) setQueuesAndMangles(d.queuesAndMangles);
        if (Array.isArray(d.vlans)) setVlans(d.vlans);
      } else if (!res.ok) {
        showToast(json?.message || 'تعذر جلب بيانات الأمان من الراوتر', 'error');
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError' && isMountedRef.current) {
        showToast('تعذر الاتصال بالراوتر لجلب إعدادات الأمان', 'error');
      }
    } finally {
      if (isMountedRef.current && !controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [showToast]);

  useEffect(() => {
    const controller = new AbortController();
    fetchServerShieldStatus(controller.signal);
    fetchLiveSecurityData();
    return () => controller.abort();
  }, [fetchServerShieldStatus, fetchLiveSecurityData]);

  const toggleService = async (id: string) => {
    const targetService = services.find(s => s.id === id);
    if (!targetService) return;
    const nextState = !targetService.enabled;

    const cmd = `/ip service set [find name="${sanitizeCliVal(id)}"] disabled=${nextState ? 'no' : 'yes'}`;
    const res = await runCommand(cmd);
    if (!isMountedRef.current) return;
    if (!res.success) {
      showToast(res.output || `فشل تعديل حالة خدمة ${targetService.name}`, 'error');
      return;
    }
    setServices(prev => prev.map(s => s.id === id ? { ...s, enabled: nextState } : s));
    showToast(`تم ${nextState ? 'تمكين' : 'تعطيل'} خدمة ${targetService.name} بنجاح`, 'success');
  };

  const [newRule, setNewRule] = useState({ action: 'accept', chain: 'input', protocol: 'tcp', dstPort: '', comment: '' });
  const [safeModeEnabled, setSafeModeEnabled] = useState(true);

  // Safe Guard: Inject Admin Whitelist Acceptance at top of Filter Rules
  const handleInjectAdminSafeRule = async () => {
    const safeCmd = `/ip firewall filter add chain=input action=accept protocol=tcp dst-port=8728,8729,8291,80,443,22 comment="ZCtrl-Safe-Admin-Guard" place-before=0`;
    const res = await runCommand(safeCmd);
    if (!isMountedRef.current) return;
    if (!res.success) {
      showToast(res.output || 'تعذر حقن قاعدة الأمان في الراوتر', 'error');
      return;
    }
    showToast('🛡️ تم حقن وتثبيت قاعدة حماية المدير في أعلى قائمة الجدار الناري بنجاح لمنع أي قفل للراوتر!', 'success');
    await fetchLiveSecurityData();
  };

  const [pendingDangerousRule, setPendingDangerousRule] = useState<any | null>(null);

  const executeAddRuleFinal = async (ruleToAdd: any) => {
    const cleanChain = sanitizeCliVal(ruleToAdd.chain);
    const cleanAction = sanitizeCliVal(ruleToAdd.action);
    const cleanProto = sanitizeCliVal(ruleToAdd.protocol);
    const cleanPort = sanitizeCliVal(ruleToAdd.dstPort);
    const cleanComment = sanitizeCliVal(ruleToAdd.comment);

    let cmd = `/ip firewall filter add chain=${cleanChain} action=${cleanAction}`;
    if (cleanProto && cleanProto !== 'all') cmd += ` protocol=${cleanProto}`;
    if (cleanPort) cmd += ` dst-port=${cleanPort}`;
    if (cleanComment) cmd += ` comment="${cleanComment}"`;

    const res = await runCommand(cmd);
    if (!isMountedRef.current) return;
    if (!res.success) {
      showToast(res.output || 'فشل إضافة قاعدة جدار الحماية في المايكروتك', 'error');
      return;
    }

    setNewRule({ action: 'accept', chain: 'input', protocol: 'tcp', dstPort: '', comment: '' });
    showToast('تمت إضافة قاعدة جدار الحماية وحقنها في المايكروتك بنجاح', 'success');
    await fetchLiveSecurityData();
  };

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();

    // Lockout Guard Check
    if (newRule.chain === 'input' && (newRule.action === 'drop' || newRule.action === 'reject')) {
      const port = (newRule.dstPort || '').trim();
      const dangerousPorts = ['8728', '8729', '8291', '80', '443', '22'];
      const isBlockingAdminPort = dangerousPorts.some(p => port === p || port.split(',').map(s => s.trim()).includes(p));
      const isBlockingAll = !port || port === 'all';

      if (isBlockingAdminPort || isBlockingAll) {
        setPendingDangerousRule(newRule);
        return;
      }
    }

    await executeAddRuleFinal(newRule);
  };

  const handleConfirmDangerousRule = async () => {
    if (!pendingDangerousRule) return;
    if (safeModeEnabled) {
      const guardRes = await runCommand(`/ip firewall filter add chain=input action=accept protocol=tcp dst-port=8728,8729,8291,80,443 comment="ZCtrl-Safe-Admin-Guard" place-before=0`);
      if (!isMountedRef.current) return;
      if (!guardRes.success) {
        showToast('تعذر حقن قاعدة حماية المدير — تم إيقاف تنفيذ الحظر لحماية الراوتر', 'error');
        setPendingDangerousRule(null);
        return;
      }
    }
    const rule = pendingDangerousRule;
    setPendingDangerousRule(null);
    await executeAddRuleFinal(rule);
  };

  const handleDeleteRule = async (id: string, comment?: string) => {
    const target = firewallRules.find(r => r.id === id);
    const cmd = id.startsWith('*')
      ? `/ip firewall filter remove =.id=${id}`
      : (comment || target?.comment)
        ? `/ip firewall filter remove [find comment="${sanitizeCliVal(comment || target?.comment || '')}"]`
        : `/ip firewall filter remove [find .id="${sanitizeCliVal(id)}"]`;

    const res = await runCommand(cmd);
    if (!isMountedRef.current) return;
    if (!res.success) {
      showToast(res.output || 'فشل حذف قاعدة جدار الحماية', 'error');
      return;
    }
    setFirewallRules(prev => prev.filter(r => r.id !== id));
    showToast('تم حذف قاعدة جدار الحماية بنجاح', 'success');
  };

  const handleCleanOldRules = async () => {
    const oldRules = firewallRules.filter(r => r.isOld);
    if (oldRules.length === 0) {
      showToast('لا توجد قواعد قديمة أو مهملة للتنظيف', 'info');
      return;
    }

    let removedCount = 0;
    for (const r of oldRules) {
      const cmd = r.id.startsWith('*')
        ? `/ip firewall filter remove =.id=${r.id}`
        : `/ip firewall filter remove [find comment="${sanitizeCliVal(r.comment)}"]`;
      const res = await runCommand(cmd);
      if (res.success) removedCount++;
    }
    if (!isMountedRef.current) return;
    if (removedCount === 0) {
      showToast('تعذر حذف القواعد القديمة من الراوتر', 'error');
      return;
    }
    showToast(`تم تنظيف وحذف ${removedCount} من قواعد جدار الحماية القديمة بنجاح!`, 'success');
    await fetchLiveSecurityData();
  };

  const [newAddress, setNewAddress] = useState({ listName: '', address: '', comment: '' });

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    const listName = sanitizeCliVal(newAddress.listName);
    const addr = sanitizeCliVal(newAddress.address);
    const comm = sanitizeCliVal(newAddress.comment);
    if (!listName || !addr) return;

    let cmd = `/ip firewall address-list add list="${listName}" address="${addr}"`;
    if (comm) cmd += ` comment="${comm}"`;

    const res = await runCommand(cmd);
    if (!isMountedRef.current) return;
    if (!res.success) {
      showToast(res.output || 'فشل إضافة العنوان لقائمة العناوين', 'error');
      return;
    }

    setNewAddress({ listName: '', address: '', comment: '' });
    showToast('تم إضافة العنوان لقائمة العناوين بنجاح', 'success');
    await fetchLiveSecurityData();
  };

  const handleDeleteAddress = async (id: string, listName?: string, address?: string) => {
    const target = addressLists.find(a => a.id === id);
    const lName = sanitizeCliVal(listName || target?.listName || '');
    const addr = sanitizeCliVal(address || target?.address || '');
    const cmd = id.startsWith('*')
      ? `/ip firewall address-list remove =.id=${id}`
      : (lName && addr)
        ? `/ip firewall address-list remove [find list="${lName}" address="${addr}"]`
        : `/ip firewall address-list remove [find .id="${sanitizeCliVal(id)}"]`;

    const res = await runCommand(cmd);
    if (!isMountedRef.current) return;
    if (!res.success) {
      showToast(res.output || 'فشل حذف العنوان من القائمة', 'error');
      return;
    }
    setAddressLists(prev => prev.filter(a => a.id !== id));
    showToast('تم حذف العنوان بنجاح', 'success');
  };

  const handleRemoveDuplicateAddresses = async () => {
    const seen = new Set<string>();
    const duplicates = addressLists.filter((item) => {
      const key = `${item.listName}::${item.address}`;
      if (seen.has(key)) return true;
      seen.add(key);
      return false;
    });

    if (duplicates.length === 0) {
      showToast('قوائم العناوين نظيفة تماماً ولا تحتوي على تكرار.', 'info');
      return;
    }

    let removedCount = 0;
    for (const dup of duplicates) {
      // Remove ONLY the duplicate entry by exact .id so the original first entry is preserved
      if (!dup.id.startsWith('*')) continue;
      const res = await runCommand(`/ip firewall address-list remove =.id=${dup.id}`);
      if (res.success) removedCount++;
    }
    if (!isMountedRef.current) return;
    if (removedCount === 0) {
      showToast('تعذر إزالة العناوين المكررة (تأكد من الاتصال بالراوتر)', 'error');
      return;
    }
    showToast(`تم تنظيف وإزالة ${removedCount} من العناوين المكررة في القائمة بنجاح!`, 'success');
    await fetchLiveSecurityData();
  };

  const [newScript, setNewScript] = useState({ name: '', interval: '1d', comment: '' });

  const handleAddScript = async (e: React.FormEvent) => {
    e.preventDefault();
    const sName = sanitizeCliVal(newScript.name);
    const sInterval = sanitizeCliVal(newScript.interval);
    const sComment = sanitizeCliVal(newScript.comment);
    if (!sName) return;

    const scriptRes = await runCommand(`/system script add name="${sName}" comment="${sComment || 'Added by ZCtrl'}" source=":log info \\"Executed ${sName}\\""`);
    if (!isMountedRef.current) return;
    if (!scriptRes.success) {
      showToast(scriptRes.output || 'فشل إضافة السكربت في المايكروتك', 'error');
      return;
    }
    if (sInterval) {
      const schedRes = await runCommand(`/system scheduler add name="${sName}" interval="${sInterval}" on-event="${sName}" comment="${sComment || ''}"`);
      if (!isMountedRef.current) return;
      if (!schedRes.success) {
        showToast(schedRes.output || 'تمت إضافة السكربت لكن فشلت جدولته', 'error');
        await fetchLiveSecurityData();
        return;
      }
    }

    setNewScript({ name: '', interval: '1d', comment: '' });
    showToast('تم إضافة السكربت المجدول الجديد وحقنه في النظام بنجاح', 'success');
    await fetchLiveSecurityData();
  };

  const handleDeleteScript = async (id: string, name?: string) => {
    const target = scripts.find(s => s.id === id);
    const scriptName = sanitizeCliVal(name || target?.name || '');
    const schedCmd = id.startsWith('*')
      ? `/system scheduler remove =.id=${id}`
      : `/system scheduler remove [find name="${scriptName}"]`;

    const schedRes = await runCommand(schedCmd);
    if (scriptName) {
      await runCommand(`/system script remove [find name="${scriptName}"]`);
    }
    if (!isMountedRef.current) return;
    if (!schedRes.success) {
      showToast(schedRes.output || 'فشل حذف السكربت المجدول', 'error');
      return;
    }
    setScripts(prev => prev.filter(s => s.id !== id));
    showToast('تم حذف السكربت المجدول بنجاح', 'success');
  };

  const toggleScript = async (id: string) => {
    const target = scripts.find(s => s.id === id);
    if (!target) return;
    const next = !target.enabled;

    const cmd = id.startsWith('*')
      ? `/system scheduler set =.id=${id} disabled=${next ? 'no' : 'yes'}`
      : `/system scheduler set [find name="${sanitizeCliVal(target.name)}"] disabled=${next ? 'no' : 'yes'}`;
    const res = await runCommand(cmd);
    if (!isMountedRef.current) return;
    if (!res.success) {
      showToast(res.output || `فشل تعديل حالة السكربت ${target.name}`, 'error');
      return;
    }

    setScripts(prev => prev.map(s => s.id === id ? { ...s, enabled: next } : s));
    showToast(`تم ${next ? 'تمكين' : 'تعطيل'} السكربت المجدول ${target.name}`, 'info');
  };

  const handleCleanUnnecessaryScripts = async () => {
    const oldScripts = scripts.filter(s => !s.enabled && s.runCount === 0);
    if (oldScripts.length === 0) {
      showToast('لا توجد سكربتات مهملة للتنظيف', 'info');
      return;
    }

    let removed = 0;
    for (const sc of oldScripts) {
      const sName = sanitizeCliVal(sc.name);
      const r1 = await runCommand(sc.id.startsWith('*') ? `/system scheduler remove =.id=${sc.id}` : `/system scheduler remove [find name="${sName}"]`);
      await runCommand(`/system script remove [find name="${sName}"]`);
      if (r1.success) removed++;
    }
    if (!isMountedRef.current) return;
    if (removed === 0) {
      showToast('تعذر تنظيف السكربتات المهملة', 'error');
      return;
    }
    showToast(`تم تنظيف وحذف ${removed} من السكربتات غير الضرورية القديمة!`, 'success');
    await fetchLiveSecurityData();
  };

  const togglePreventRandom = async () => {
    const next = !preventRandomQueues;
    const existing = scripts.find((s) => s.name === 'ZCtrl-Duplicate-Cleaner');
    let res: { success: boolean; output: string };

    if (next) {
      if (existing) {
        res = await runCommand(`/system scheduler set =.id=${existing.id} disabled=no`);
      } else {
        res = await runCommand(
          `/system scheduler add name="ZCtrl-Duplicate-Cleaner" interval="30m" on-event="/queue simple remove [find comment~\\"duplicate\\"]" comment="ZCtrl Auto Prevent Random Queues"`
        );
      }
    } else if (existing) {
      res = await runCommand(`/system scheduler set =.id=${existing.id} disabled=yes`);
    } else {
      setPreventRandomQueues(false);
      return;
    }

    if (!isMountedRef.current) return;
    if (!res.success) {
      showToast(res.output || 'تعذر تحديث مهمة الحماية من القواعد العشوائية في الراوتر', 'error');
      return;
    }
    setPreventRandomQueues(next);
    showToast(
      next
        ? 'تم تفعيل مهمة المراقبة التلقائية لمنع تراكم قواعد Mangle / Queue العشوائية في الراوتر'
        : 'تم إيقاف مهمة المنع التلقائي بنجاح',
      'success'
    );
    await fetchLiveSecurityData();
  };

  const handleCleanDuplicates = async () => {
    const duplicates = queuesAndMangles.filter(item => item.isDuplicate);
    if (duplicates.length === 0) {
      showToast('لا توجد قواعد Queue أو Mangle مكررة', 'info');
      return;
    }

    let removedCount = 0;
    for (const dup of duplicates) {
      if (!dup.id.startsWith('*')) continue;
      const endpoint = dup.type === 'Queue' ? '/queue simple remove' : '/ip firewall mangle remove';
      const res = await runCommand(`${endpoint} =.id=${dup.id}`);
      if (res.success) removedCount++;
    }
    if (!isMountedRef.current) return;
    if (removedCount === 0) {
      showToast('تعذر حذف القواعد المكررة من الراوتر', 'error');
      return;
    }
    showToast(`تم تنظيف وإزالة ${removedCount} من قواعد الـ Queue و Mangle المكررة بنجاح!`, 'success');
    await fetchLiveSecurityData();
  };

  const handleDeleteQueueMangle = async (id: string, name?: string) => {
    const target = queuesAndMangles.find(q => q.id === id);
    const cmd = id.startsWith('*')
      ? `${target?.type === 'Queue' ? '/queue simple remove' : '/ip firewall mangle remove'} =.id=${id}`
      : target?.type === 'Queue'
        ? `/queue simple remove [find name="${sanitizeCliVal(name || target.name)}"]`
        : `/ip firewall mangle remove [find comment="${sanitizeCliVal(name || target?.name || '')}"]`;

    const res = await runCommand(cmd);
    if (!isMountedRef.current) return;
    if (!res.success) {
      showToast(res.output || 'فشل حذف القاعدة من الراوتر', 'error');
      return;
    }
    setQueuesAndMangles(prev => prev.filter(item => item.id !== id));
    showToast('تم حذف القاعدة بنجاح', 'success');
  };

  const [newVlan, setNewVlan] = useState({ name: '', vlanId: '', interface: 'ether1', comment: '' });

  const handleAddVlan = async (e: React.FormEvent) => {
    e.preventDefault();
    const vName = sanitizeCliVal(newVlan.name);
    const vIface = sanitizeCliVal(newVlan.interface);
    const vComment = sanitizeCliVal(newVlan.comment);
    if (!vName || !newVlan.vlanId) return;
    const idNum = Number(newVlan.vlanId);
    if (idNum < 1 || idNum > 4094) {
      showToast('يرجى إدخال VLAN ID صحيح بين 1 و 4094', 'error');
      return;
    }

    let cmd = `/interface vlan add name="${vName}" vlan-id=${idNum} interface="${vIface}"`;
    if (vComment) cmd += ` comment="${vComment}"`;

    const res = await runCommand(cmd);
    if (!isMountedRef.current) return;
    if (!res.success) {
      showToast(res.output || 'فشل إنشاء واجهة VLAN في المايكروتك', 'error');
      return;
    }

    setNewVlan({ name: '', vlanId: '', interface: 'ether1', comment: '' });
    showToast(`تم إنشاء وتطبيق شبكة الفيلان vlan-${idNum} بنجاح!`, 'success');
    await fetchLiveSecurityData();
  };

  const handleDeleteVlan = async (id: string, name?: string) => {
    const target = vlans.find(v => v.id === id);
    const vName = sanitizeCliVal(name || target?.name || '');
    const cmd = id.startsWith('*')
      ? `/interface vlan remove =.id=${id}`
      : `/interface vlan remove [find name="${vName}"]`;

    const res = await runCommand(cmd);
    if (!isMountedRef.current) return;
    if (!res.success) {
      showToast(res.output || 'فشل إزالة واجهة VLAN من الراوتر', 'error');
      return;
    }
    setVlans(prev => prev.filter(v => v.id !== id));
    showToast('تم إزالة واجهة الفيلان وتنظيف الإعدادات الملحقة بنجاح', 'success');
  };

  // Compute stats dynamically from SECURITY_GROUPS
  const totalRules = SECURITY_GROUPS.reduce((sum, g) => sum + g.rules.length, 0);
  const activeCount = Object.values(securityStates).filter(Boolean).length;
  const percentage = totalRules > 0 ? Math.round((activeCount / totalRules) * 100) : 0;

  return (
    <div className="space-y-6 text-right" dir="rtl">
      {/* Header Panel with Subtabs */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-2xl shadow-lg shadow-blue-600/25">
            <Shield className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-100 font-serif">ZCtrl Security Suite</h2>
            <p className="text-[10px] text-slate-400 mt-0.5">درع الأمان المتكامل، جدار الحماية، إدارة الفيلان وأدوات التنظيف اليدوي للراوتر</p>
          </div>
        </div>

        {/* Header Action & Sub-tabs Navigation */}
        <div className="flex items-center gap-2 flex-wrap md:flex-nowrap">
          <button
            type="button"
            onClick={() => setIsPdfModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-white border border-rose-500/30 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 shadow-xs active:scale-95"
            title="تصدير تقرير الجدار الناري والأمان كملف PDF"
          >
            <FileDown className="w-3.5 h-3.5 text-rose-400" />
            <span>تصدير PDF</span>
          </button>

          <button
            type="button"
            onClick={fetchLiveSecurityData}
            disabled={isLoading}
            className="px-3.5 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 disabled:opacity-50"
            title="تحديث البيانات المباشرة من المايكروتك"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${isLoading ? 'animate-spin' : ''}`} />
            <span>تحديث حي</span>
          </button>

          <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-2xl border border-slate-800/80 overflow-x-auto w-full md:w-auto max-w-full">
            <button
              type="button"
              onClick={() => setActiveTab('hardening')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                activeTab === 'hardening' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              نصائح وحالة التحصين
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('server_shield')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'server_shield' ? 'bg-emerald-600 text-white shadow-md' : 'text-emerald-400 hover:text-emerald-300 bg-emerald-500/10'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>درع أمان السيرفر والتطبيق</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('firewall_rules')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                activeTab === 'firewall_rules' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              جدار الحماية الفعال
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('address_lists')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                activeTab === 'address_lists' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              قوائم العناوين
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('services_scripts')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                activeTab === 'services_scripts' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              الخدمات والسكربتات
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('queues_mangle')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                activeTab === 'queues_mangle' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              تنظيف Queues/Mangle
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('vlans')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                activeTab === 'vlans' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              إعدادات الفيلان (VLAN)
            </button>
          </div>
        </div>
      </div>

      {/* 1. VIEW: SECURITY HARDENING & ASSESSMENT */}
      {activeTab === 'hardening' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Top Live Audit & Auto-Fix Banner */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl relative overflow-hidden">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5">
              <div className="space-y-1.5 text-right">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    معايير شركة MikroTik الرسمية (Official Hardening Guide)
                  </span>
                  {liveAuditData && (
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      liveAuditData.score >= 80 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}>
                      التوافق الحقيقي: {liveAuditData.score}%
                    </span>
                  )}
                </div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  <span>الفحص والتدقيق الأمني المباشر وفق توصيات شركة MikroTik</span>
                </h3>
                <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                  يقوم هذا النظام بالاتصال المباشر بالراوتر وقراءة إعدادات الخدمات، حسابات المدراء، الجدار الناري، ثغرات الـ DNS، وسكربتات النظام، ومقارنتها بتعليمات الأمان الموصى بها رسمياً من MikroTik مع ميزة الإصلاح الفوري بنقرة واحدة.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
                <button
                  type="button"
                  onClick={fetchLiveAudit}
                  disabled={liveAuditLoading || isAutoFixing}
                  className="flex-1 sm:flex-initial px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${liveAuditLoading ? 'animate-spin' : ''}`} />
                  <span>{liveAuditLoading ? 'جارٍ فحص الراوتر...' : 'فحص ومطابقة إعدادات الراوتر'}</span>
                </button>

                {liveAuditData && liveAuditData.summary.fixable > 0 && (
                  <button
                    type="button"
                    onClick={() => handleRunAutoFix([])}
                    disabled={isAutoFixing || liveAuditLoading}
                    className="flex-1 sm:flex-initial px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Zap className={`w-4 h-4 ${isAutoFixing ? 'animate-spin' : ''}`} />
                    <span>{isAutoFixing ? 'جارٍ تطبيق الإصلاحات...' : `إصلاح فوري لجميع المشاكل (${liveAuditData.summary.fixable})`}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Live Audit Results Cards if Data Available */}
            {liveAuditData && (
              <div className="mt-5 pt-5 border-t border-slate-800 space-y-4">
                {/* Summary Badges Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-right">
                    <span className="text-[10px] text-slate-400 block">إجمالي الفحوصات:</span>
                    <span className="text-sm font-black text-white font-mono">{liveAuditData.summary.total} فحص</span>
                  </div>
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-right">
                    <span className="text-[10px] text-emerald-400 block">مطابق وآمن:</span>
                    <span className="text-sm font-black text-emerald-400 font-mono">{liveAuditData.summary.compliant} إعداد</span>
                  </div>
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-right">
                    <span className="text-[10px] text-rose-400 block">ثغرات بحاجة لإصلاح:</span>
                    <span className="text-sm font-black text-rose-400 font-mono">{liveAuditData.summary.vulnerable} ثغرة</span>
                  </div>
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-right">
                    <span className="text-[10px] text-amber-400 block">تنبيهات أمنية:</span>
                    <span className="text-sm font-black text-amber-400 font-mono">{liveAuditData.summary.warning} تنبيه</span>
                  </div>
                </div>

                {/* Detailed Checks Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {liveAuditData.checks.map((check) => (
                    <div
                      key={check.id}
                      className={`p-4 rounded-2xl border text-right space-y-2.5 transition-all ${
                        check.status === 'compliant'
                          ? 'bg-slate-950/40 border-slate-800/90'
                          : check.status === 'vulnerable'
                          ? 'bg-rose-950/10 border-rose-500/30'
                          : 'bg-amber-950/10 border-amber-500/30'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              check.status === 'compliant'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : check.status === 'vulnerable'
                                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            }`}
                          >
                            {check.status === 'compliant' ? 'مطابق ومعتمد' : check.status === 'vulnerable' ? 'ثغرة حرجة' : 'تحذير أمني'}
                          </span>
                          <span className="text-[10px] font-mono bg-slate-900 text-slate-400 px-2 py-0.5 rounded border border-slate-800">
                            {check.path}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-semibold">{check.category}</span>
                      </div>

                      <div>
                        <h4 className="text-xs font-bold text-white">{check.title}</h4>
                        <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">{check.explanation}</p>
                      </div>

                      <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800/80 space-y-1 text-[11px]">
                        <div className="flex items-center justify-between text-slate-300">
                          <span className="font-mono text-[10px] font-bold text-slate-200">{check.currentValue}</span>
                          <span className="text-slate-500">القيمة في الراوتر:</span>
                        </div>
                        <div className="flex items-center justify-between text-slate-300">
                          <span className="text-[10px] font-bold text-emerald-400 text-left">{check.officialRecommendation}</span>
                          <span className="text-slate-500 shrink-0">توصية MikroTik:</span>
                        </div>
                      </div>

                      {check.fixAvailable && check.status !== 'compliant' && (
                        <div className="pt-1 flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleRunAutoFix([check.id])}
                            disabled={isAutoFixing && fixingCheckId === check.id}
                            className="px-3 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                          >
                            <Zap className="w-3 h-3" />
                            <span>{isAutoFixing && fixingCheckId === check.id ? 'جارٍ الإصلاح...' : 'إصلاح هذا الإعداد فوراً'}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="bg-gradient-to-r from-slate-900 via-slate-900/40 to-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl pointer-events-none" />
            
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 shrink-0 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center shadow-inner">
                {percentage >= 80 ? (
                  <ShieldCheck className="w-7 h-7 text-emerald-400" />
                ) : percentage >= 40 ? (
                  <ShieldAlert className="w-7 h-7 text-amber-400" />
                ) : (
                  <Shield className="w-7 h-7 text-rose-400" />
                )}
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <span>مؤشر السلامة ومستوى أمان الـ RouterOS</span>
                  <span className="text-slate-500 font-normal">|</span>
                  <span className={`text-xs ${percentage >= 80 ? 'text-emerald-400' : percentage >= 40 ? 'text-amber-400' : 'text-rose-400'}`}>
                    {percentage >= 80 ? 'مؤمن بالكامل وثابت' : percentage >= 40 ? 'متوسط الحماية - تابع التحصين' : 'درجة حماية منخفضة'}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400 leading-relaxed max-w-xl">
                  تعد حماية الراوتر من أهم مهام مدير الشبكة لمنع الاختراقات وتأمين كروت المشتركين.
                  يرجى تفعيل هذه الإعدادات والنصائح يدوياً داخل واجهة المايكروتك (WinBox / WebFig) وتحديدها هنا لتحديث مستوى الأمان التراكمي للسيرفر.
                </p>
              </div>
            </div>

            <div className="flex flex-col items-center shrink-0">
              <div className="relative w-20 h-20 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle className="text-slate-800" strokeWidth="10" stroke="currentColor" fill="transparent" r="38" cx="50" cy="50" />
                  <circle
                    className={`transition-all duration-500 ease-out ${percentage >= 80 ? 'text-emerald-500' : percentage >= 40 ? 'text-amber-500' : 'text-rose-500'}`}
                    strokeWidth="10" strokeDasharray={2 * Math.PI * 38} strokeDashoffset={2 * Math.PI * 38 * (1 - percentage / 100)} strokeLinecap="round" stroke="currentColor" fill="transparent" r="38" cx="50" cy="50"
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-lg font-mono font-black text-white">{percentage}%</span>
                  <span className="text-[9px] text-slate-400 font-semibold">{activeCount} / {totalRules} مفعلة</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {SECURITY_GROUPS.map((group) => {
              const Icon = group.icon;
              return (
                <div key={group.id} className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col justify-between">
                  <div className="p-3.5 bg-slate-950/70 border-b border-slate-800 flex items-center gap-2.5">
                    <Icon className="w-4 h-4 text-blue-400" />
                    <h3 className="text-xs font-bold text-slate-100">{group.title}</h3>
                  </div>

                  <div className="p-4 space-y-3.5 divide-y divide-slate-800/40 flex-1">
                    {group.rules.map((rule, idx) => {
                      const isChecked = !!securityStates[rule.id];
                      return (
                        <div key={rule.id} className={`flex items-start justify-between gap-4 pt-3.5 ${idx === 0 ? 'pt-0' : ''}`}>
                          <div className="space-y-1 max-w-sm sm:max-w-md">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-white">{rule.title}</span>
                              <span className="font-mono text-[9px] bg-slate-950 text-slate-400 border border-slate-800 px-1.5 py-0.5 rounded-md">
                                {rule.path}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 leading-relaxed">{rule.description}</p>
                          </div>

                          <div className="flex items-center shrink-0">
                            <button
                              type="button"
                              onClick={() => toggleSecurityRule(rule.id)}
                              className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                isChecked ? 'bg-emerald-600' : 'bg-slate-800'
                              }`}
                            >
                              <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition duration-200 ease-in-out ${isChecked ? '-translate-x-5' : 'translate-x-0'}`} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 1b. VIEW: SERVER SECURITY SHIELD & VULNERABILITY CONTROLS */}
      {activeTab === 'server_shield' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          <div className="bg-gradient-to-r from-slate-900 via-emerald-950/30 to-slate-900 border border-emerald-500/20 rounded-3xl p-5 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-center gap-4">
              <div className="w-14 h-14 shrink-0 rounded-2xl bg-slate-950 border border-emerald-500/30 flex items-center justify-center shadow-inner">
                <ShieldCheck className="w-7 h-7 text-emerald-400" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <span>درع أمان السيرفر والخادم البرمجي (Server Security Shield)</span>
                  <span className="text-slate-500 font-normal">|</span>
                  <span className="text-xs text-emerald-400 font-bold">نشط ومحصن بالكامل</span>
                </h3>
                <p className="text-[11px] text-slate-400 leading-relaxed max-w-2xl">
                  لوحة التحكم المركزية في أمان الخادم، عزل الجلسات متعددة المشتركين، منع هجمات القوة الغاشمة، تأمين استدعاءات RouterOS، وتشفير البيانات والاعتمادات.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => fetchServerShieldStatus()}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-slate-700"
              >
                <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
                <span>إعادة فحص الحالة</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 1. Session Isolation */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 shadow-xl space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white flex items-center gap-2">
                      <span>1. عزل الجلسات متعددة المشتركين (Session Isolation)</span>
                    </h4>
                    <span className="text-[10px] text-emerald-400 font-medium">Secured - Strict Tenant Enforced</span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isUpdatingShield}
                  onClick={() => toggleShieldOption('strictTenantIsolation', !serverShieldConfig.strictTenantIsolation)}
                  className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                    serverShieldConfig.strictTenantIsolation ? 'bg-emerald-600' : 'bg-slate-800'
                  }`}
                >
                  <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition duration-200 ${serverShieldConfig.strictTenantIsolation ? '-translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                يمنع تداخل جلسات المدراء أو المشتركين، ويلغي أي استرجاع عشوائي للجلسات. كل طلب يتطلب رمز جلسة موثق (x-router-token) حصراً.
              </p>
            </div>

            {/* 2. Rate Limiting */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 shadow-xl space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white flex items-center gap-2">
                      <span>2. حظر هجمات التخمين والقوة الغاشمة (Rate Limiting)</span>
                    </h4>
                    <span className="text-[10px] text-amber-400 font-medium">25 محاولة / 15 دقيقة (Auth) | 40 / دقيقة (Diag)</span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isUpdatingShield}
                  onClick={() => toggleShieldOption('rateLimitingEnabled', !serverShieldConfig.rateLimitingEnabled)}
                  className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                    serverShieldConfig.rateLimitingEnabled ? 'bg-emerald-600' : 'bg-slate-800'
                  }`}
                >
                  <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition duration-200 ${serverShieldConfig.rateLimitingEnabled ? '-translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                يحدد محاولات الاتصال والتسجيل لمنع استنزاف موارد الراوتر والتصدي لمحاولات تخمين كلمات المرور مع ردود أمان واضحة.
              </p>
            </div>

            {/* 3. Controlled CORS */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 shadow-xl space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                    <Globe className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white flex items-center gap-2">
                      <span>3. تقييد والتحكم في سياسة النطاقات (CORS Whitelist)</span>
                    </h4>
                    <span className="text-[10px] text-emerald-400 font-medium">Local LAN & Authorized Origins Only</span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isUpdatingShield}
                  onClick={() => toggleShieldOption('strictCorsEnabled', !serverShieldConfig.strictCorsEnabled)}
                  className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                    serverShieldConfig.strictCorsEnabled ? 'bg-emerald-600' : 'bg-slate-800'
                  }`}
                >
                  <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition duration-200 ${serverShieldConfig.strictCorsEnabled ? '-translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                يقيد الطلبات الواردة للخادم ويحصرها بنطاقات الشبكة الداخلية المحلية (192.168.x.x, 10.x.x.x) والتطبيق المعتمد ويمنع المواقع الخبيثة الخارجية.
              </p>
            </div>

            {/* 4. Script Injection Shield */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 shadow-xl space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-purple-500/10 text-purple-400 rounded-xl border border-purple-500/20">
                    <Terminal className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white flex items-center gap-2">
                      <span>4. درع حماية حقن سكربتات RouterOS (Script Injection Shield)</span>
                    </h4>
                    <span className="text-[10px] text-purple-400 font-medium">Zero-Injection Syntax Sanitized</span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isUpdatingShield}
                  onClick={() => toggleShieldOption('scriptInjectionGuardEnabled', !serverShieldConfig.scriptInjectionGuardEnabled)}
                  className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                    serverShieldConfig.scriptInjectionGuardEnabled ? 'bg-emerald-600' : 'bg-slate-800'
                  }`}
                >
                  <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition duration-200 ${serverShieldConfig.scriptInjectionGuardEnabled ? '-translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                يقوم بتعقيم وتطهير كافة أسماء الملفات ومعلمات نشر صفحات الهوتسبوت لمنع تنفيذ أوامر غير مصرح بها داخل سطر أوامر RouterOS.
              </p>
            </div>

            {/* 5. Deep Path Traversal */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 shadow-xl space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-rose-500/10 text-rose-400 rounded-xl border border-rose-500/20">
                    <FileCode className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white flex items-center gap-2">
                      <span>5. منع اجتياز المسارات (Anti-Path Traversal Guard)</span>
                    </h4>
                    <span className="text-[10px] text-rose-400 font-medium">Deep POSIX Sanitizer & Double-Encoding Guard</span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isUpdatingShield}
                  onClick={() => toggleShieldOption('pathTraversalGuardEnabled', !serverShieldConfig.pathTraversalGuardEnabled)}
                  className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                    serverShieldConfig.pathTraversalGuardEnabled ? 'bg-emerald-600' : 'bg-slate-800'
                  }`}
                >
                  <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition duration-200 ${serverShieldConfig.pathTraversalGuardEnabled ? '-translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                يفك التشفير المزدوج للمسارات ويمنع الهروب إلى أدلة النظام العليا عبر .. أو مسارات /etc/ أو /system/ في جميع عمليات ملفات FTP والهوتسبوت.
              </p>
            </div>

            {/* 6. Credential Encryption Vault */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 shadow-xl space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20">
                    <Key className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white flex items-center gap-2">
                      <span>6. خزنة التشفير AES-256-GCM للبيانات والاعتمادات</span>
                    </h4>
                    <span className="text-[10px] text-cyan-400 font-medium">Authenticated Encryption Vault Active</span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isUpdatingShield}
                  onClick={() => toggleShieldOption('inMemoryEncryptionEnabled', !serverShieldConfig.inMemoryEncryptionEnabled)}
                  className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                    serverShieldConfig.inMemoryEncryptionEnabled ? 'bg-emerald-600' : 'bg-slate-800'
                  }`}
                >
                  <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition duration-200 ${serverShieldConfig.inMemoryEncryptionEnabled ? '-translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                يضمن عدم تخزين كلمات المرور كنصوص واضحة (Plaintext) في الذاكرة أو ملفات التخزين، ويستخدم معيار AES-256 مع تحقق التوقيع الرقمي (GCM Tag).
              </p>
            </div>
          </div>
        </div>
      )}
      {activeTab === 'firewall_rules' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/20 rounded-2xl p-4.5 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Filter className="w-4 h-4 text-blue-400 animate-pulse" />
                <span>إدارة قواعد جدار الحماية (Firewall Rules) وتنظيف القواعد القديمة</span>
              </h3>
              <p className="text-[11px] text-slate-400">
                يمكنك هنا إضافة قواعد جديدة، مراجعة القواعد الحالية، وحذف القواعد القديمة المكررة أو غير الآمنة يدوياً لضمان سلامة الراوتر.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleInjectAdminSafeRule}
                className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-600/10"
                title="حقن قاعدة أمان في أعلى قائمة الفلتر لمنع طرد المدير وقفل منافذ Winbox و API"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>تثبيت حارس المدير (Safe Guard)</span>
              </button>
              <button
                type="button"
                onClick={handleCleanOldRules}
                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-rose-600/10"
              >
                <Trash2 className="w-4 h-4" />
                <span>حذف قواعد جدار الحماية القديمة ({firewallRules.filter(r => r.isOld).length})</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Add New Firewall Rule Form */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 space-y-4 h-fit">
              <h3 className="text-xs font-bold text-white border-b border-slate-800 pb-2 flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-400" />
                <span>إضافة قاعدة جديدة يدوياً</span>
              </h3>
              <form onSubmit={handleAddRule} className="space-y-3.5 text-xs text-slate-200">
                <div>
                  <label className="text-[11px] text-slate-300 block mb-1">الإجراء (Action)</label>
                  <select
                    value={newRule.action}
                    onChange={(e) => setNewRule({ ...newRule, action: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 focus:outline-none focus:border-blue-500"
                  >
                    <option value="accept">قبول (accept)</option>
                    <option value="drop">حظر (drop)</option>
                    <option value="reject">رفض (reject)</option>
                    <option value="fasttrack-connection">تسريع (fasttrack)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] text-slate-300 block mb-1">السلسلة (Chain)</label>
                  <select
                    value={newRule.chain}
                    onChange={(e) => setNewRule({ ...newRule, chain: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 focus:outline-none focus:border-blue-500"
                  >
                    <option value="input">قادمة للراوتر نفسه (input)</option>
                    <option value="forward">عابرة للشبكة (forward)</option>
                    <option value="output">خارجة من الراوتر (output)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-300 block mb-1">البروتوكول</label>
                    <select
                      value={newRule.protocol}
                      onChange={(e) => setNewRule({ ...newRule, protocol: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 focus:outline-none focus:border-blue-500"
                    >
                      <option value="tcp">TCP</option>
                      <option value="udp">UDP</option>
                      <option value="all">جميع البروتوكولات</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-300 block mb-1">المنفذ المستهدف</label>
                    <input
                      type="text"
                      value={newRule.dstPort}
                      onChange={(e) => setNewRule({ ...newRule, dstPort: e.target.value })}
                      placeholder="مثل: 8291"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-slate-300 block mb-1">الوصف / الملاحظة (Comment)</label>
                  <input
                    type="text"
                    value={newRule.comment}
                    onChange={(e) => setNewRule({ ...newRule, comment: e.target.value })}
                    placeholder="ملاحظة تشرح عمل الفلتر"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>تطبيق وإضافة القاعدة للراوتر</span>
                </button>
              </form>
            </div>

            {/* Firewall Rules List */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg lg:col-span-2">
              <div className="p-4 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">قواعد جدار الحماية الفعالة</span>
                <span className="text-[11px] bg-slate-800 text-slate-300 px-2.5 py-0.5 rounded-lg">{firewallRules.length} قواعد</span>
              </div>

              <div className="divide-y divide-slate-800/60 max-h-[420px] overflow-y-auto">
                {firewallRules.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs">
                    لا توجد قواعد جدار حماية مسجلة حالياً في المايكروتك
                  </div>
                ) : (
                  firewallRules.map((rule) => (
                    <div key={rule.id} className={`p-4 hover:bg-slate-950/30 transition-all flex items-start justify-between gap-4 ${rule.isOld ? 'bg-rose-950/10 border-r-2 border-rose-500' : ''}`}>
                      <div className="space-y-1.5 text-right">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] border ${
                            rule.action === 'accept' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                          }`}>
                            {rule.action}
                          </span>
                          <span className="text-xs font-bold text-white">chain={rule.chain}</span>
                          {rule.protocol !== 'all' && (
                            <span className="text-[10px] font-mono bg-slate-950 border border-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                              {rule.protocol} {rule.dstPort ? `:${rule.dstPort}` : ''}
                            </span>
                          )}
                          {rule.isOld && (
                            <span className="bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[9px] font-bold px-1.5 py-0.2 rounded-full">
                              قاعدة قديمة / غير ضرورية
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400">{rule.comment || 'بدون تعليق'}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteRule(rule.id)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                        title="حذف القاعدة"
                      >
                        <Trash2 className="w-4.5 h-4.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. VIEW: ADDRESS LISTS */}
      {activeTab === 'address_lists' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          <div className="bg-gradient-to-r from-slate-900 via-slate-900/40 to-slate-900 border border-slate-800 rounded-2xl p-4.5 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Network className="w-4 h-4 text-blue-400" />
                <span>إدارة قوائم العناوين (IP Firewall Address Lists)</span>
              </h3>
              <p className="text-[11px] text-slate-400">
                استخدام قوائم العناوين يغنيك عن تكرار قواعد جدار الحماية. يمكنك إنشاء قائمة واحدة (مثال: Blocked-IPs) وإضافة آلاف العناوين إليها يدوياً لحظرهم دفعة واحدة بقاعدة جدار حماية مفردة.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRemoveDuplicateAddresses}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-blue-600/10"
            >
              <RefreshCw className="w-4 h-4" />
              <span>تنظيف العناوين المكررة في القوائم</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Add New Address List Entry */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 space-y-4 h-fit">
              <h3 className="text-xs font-bold text-white border-b border-slate-800 pb-2 flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-400" />
                <span>إضافة آيبي لقائمة عناوين</span>
              </h3>
              <form onSubmit={handleAddAddress} className="space-y-3.5 text-xs text-slate-200">
                <div>
                  <label className="text-[11px] text-slate-300 block mb-1">اسم القائمة (List Name)</label>
                  <input
                    type="text"
                    value={newAddress.listName}
                    onChange={(e) => setNewAddress({ ...newAddress, listName: e.target.value })}
                    required
                    placeholder="مثال: Blocked-Spammers"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-slate-300 block mb-1">عنوان الـ IP المستهدف</label>
                  <input
                    type="text"
                    value={newAddress.address}
                    onChange={(e) => setNewAddress({ ...newAddress, address: e.target.value })}
                    required
                    placeholder="مثال: 192.168.100.55"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 focus:outline-none focus:border-blue-500 font-mono text-left"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-slate-300 block mb-1">ملاحظة / سبب الحظر</label>
                  <input
                    type="text"
                    value={newAddress.comment}
                    onChange={(e) => setNewAddress({ ...newAddress, comment: e.target.value })}
                    placeholder="مثل: محاولات تخمين كلمات المرور"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة للقائمة يدوياً</span>
                </button>
              </form>
            </div>

            {/* Address Lists Data Display */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg lg:col-span-2">
              <div className="p-4 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">عناوين القوائم المسجلة (Address Lists)</span>
                <span className="text-[11px] bg-slate-800 text-slate-300 px-2.5 py-0.5 rounded-lg">{addressLists.length} مدخلات</span>
              </div>

              <div className="divide-y divide-slate-800/60 max-h-[420px] overflow-y-auto">
                {addressLists.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs">
                    لا توجد عناوين مسجلة في قوائم العناوين حالياً
                  </div>
                ) : (
                  addressLists.map((item) => (
                    <div key={item.id} className="p-4 hover:bg-slate-950/30 transition-all flex items-center justify-between gap-4">
                      <div className="space-y-1.5 text-right">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded-md font-bold text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            {item.listName}
                          </span>
                          <span className="text-xs font-mono font-bold text-slate-100" dir="ltr">{item.address}</span>
                        </div>
                        <p className="text-[11px] text-slate-400">{item.comment || '—'}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteAddress(item.id)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                        title="حذف العنوان"
                      >
                        <Trash2 className="w-4.5 h-4.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. VIEW: SERVICES & SCHEDULED SCRIPTS */}
      {activeTab === 'services_scripts' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Services Box with Manual Toggles */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="p-4 bg-slate-950/70 border-b border-slate-800">
              <h3 className="text-xs sm:text-sm font-bold text-slate-100 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-blue-400" />
                <span>تعطيل وتغيير خدمات الراوتر غير المستخدمة (IP Services)</span>
              </h3>
              <p className="text-[10px] text-slate-400 mt-1">
                إيقاف تشغيل منافذ الخدمات والبروتوكولات القديمة غير الضرورية يمنع المخترقين من الاتصال بالراوتر.
              </p>
            </div>

            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {services.map((srv) => (
                <div key={srv.id} className={`p-4 rounded-xl border flex flex-col justify-between space-y-3.5 transition-all ${
                  srv.enabled ? 'bg-slate-950/60 border-slate-800' : 'bg-rose-950/5 border-rose-500/20'
                }`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">{srv.name}</span>
                        <span className="font-mono text-[9px] bg-slate-900 text-slate-400 px-1.5 py-0.5 rounded">Port {srv.port}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-relaxed">{srv.desc}</p>
                    </div>

                    <span className={`w-2.5 h-2.5 rounded-full ${srv.enabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs">
                    <span className={`font-semibold ${srv.enabled ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {srv.enabled ? 'نشط ومستمع' : 'تم تعطيله وأمن'}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleService(srv.id)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer transition-colors ${
                        srv.enabled ? 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                      }`}
                    >
                      {srv.enabled ? 'إيقاف وتعطيل المنفذ' : 'تمكين وتشغيل المنفذ'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Real Script Cleaner & Sanitizer Box */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden p-5 space-y-4">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1 text-right">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    أداة التطهير المباشر (Router Cleaner)
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-emerald-400" />
                  <span>فحص ومنع السكربتات العشوائية وتنظيف الراوتر من السكربتات التالفة</span>
                </h3>
                <p className="text-[11px] text-slate-400 max-w-2xl leading-relaxed">
                  يقوم هذا الفاحص بفحص مسار <code className="text-blue-400 font-mono">/system/script</code> و <code className="text-blue-400 font-mono">/system/scheduler</code> في الراوتر لاكتشاف السكربتات العشوائية الفارغة، السكربتات المؤقتة القديمة، والمجدولات المعطلة المعلقة، وتنظيفها فوراً مع حماية السكربتات الحيوية.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={fetchScriptsAudit}
                  disabled={scriptsAuditLoading || isCleaningScripts}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${scriptsAuditLoading ? 'animate-spin' : ''}`} />
                  <span>{scriptsAuditLoading ? 'جارٍ الفحص...' : 'فحص سكربتات الراوتر'}</span>
                </button>

                {scriptsAuditData && scriptsAuditData.faultyCount > 0 && (
                  <button
                    type="button"
                    onClick={handleCleanScripts}
                    disabled={isCleaningScripts || scriptsAuditLoading}
                    className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-lg shadow-rose-600/20 disabled:opacity-50"
                  >
                    <Trash2 className={`w-3.5 h-3.5 ${isCleaningScripts ? 'animate-spin' : ''}`} />
                    <span>{isCleaningScripts ? 'جارٍ التطهير...' : `تطهير الراوتر فوراً (${scriptsAuditData.faultyCount})`}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Audit Results */}
            {scriptsAuditData && (
              <div className="pt-3 border-t border-slate-800/80 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs text-right">
                  <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                    <span className="text-[10px] text-slate-400 block">إجمالي السكربتات:</span>
                    <span className="text-xs font-bold text-white font-mono">{scriptsAuditData.totalScripts}</span>
                  </div>
                  <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                    <span className="text-[10px] text-slate-400 block">إجمالي المجدولات:</span>
                    <span className="text-xs font-bold text-white font-mono">{scriptsAuditData.totalSchedulers}</span>
                  </div>
                  <div className={`p-3 rounded-xl border ${
                    scriptsAuditData.faultyCount > 0
                      ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                      : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  }`}>
                    <span className="text-[10px] block">العشوائيات والتوالف:</span>
                    <span className="text-xs font-bold font-mono">{scriptsAuditData.faultyCount} مستهدفة للتنظيف</span>
                  </div>
                  <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                    <span className="text-[10px] text-slate-400 block">حالة الراوتر:</span>
                    <span className={`text-xs font-bold ${scriptsAuditData.faultyCount === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {scriptsAuditData.faultyCount === 0 ? 'نظيف ومطهر بالكامل' : 'بحاجة لتنظيف'}
                    </span>
                  </div>
                </div>

                {scriptsAuditData.faultyCount > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-rose-400 text-right">السكربتات والمجدولات المرشحة للتنظيف:</h4>
                    <div className="max-h-48 overflow-y-auto divide-y divide-slate-800/80 bg-slate-950/60 rounded-xl border border-slate-800 p-2">
                      {scriptsAuditData.scripts.filter(s => s.isFaulty).map(s => (
                        <div key={s.id} className="p-2 flex items-center justify-between text-xs text-right">
                          <span className="text-[10px] text-rose-400 font-semibold bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                            {s.faultReason}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-slate-300 font-bold">{s.name}</span>
                            <span className="text-[10px] text-slate-500">سكربت:</span>
                          </div>
                        </div>
                      ))}
                      {scriptsAuditData.brokenSchedulers.map(sch => (
                        <div key={sch.id} className="p-2 flex items-center justify-between text-xs text-right">
                          <span className="text-[10px] text-amber-400 font-semibold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                            {sch.reason}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-slate-300 font-bold">{sch.name}</span>
                            <span className="text-[10px] text-slate-500">مجدول:</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Scheduled Scripts Section */}
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-slate-900 via-slate-900/40 to-slate-900 border border-slate-800 rounded-2xl p-4.5 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Play className="w-4 h-4 text-blue-400" />
                  <span>تنظيم السكربتات المجدولة (System Scheduler Scripts)</span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  تسمح الجدولة التلقائية بتشغيل الأوامر بالخلفية. تنظيف وحذف السكربتات القديمة وغير الضرورية يدوياً يمنع استهلاك موارد المعالج.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCleanUnnecessaryScripts}
                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-rose-600/10"
              >
                <Trash2 className="w-4 h-4" />
                <span>تنظيف وحذف السكربتات المتروكة ({scripts.filter(s => !s.enabled && s.runCount === 0).length})</span>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Add New Scheduled Script Form */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 space-y-4 h-fit">
                <h3 className="text-xs font-bold text-white border-b border-slate-800 pb-2 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-blue-400" />
                  <span>إضافة سكربت مجدول جديد</span>
                </h3>
                <form onSubmit={handleAddScript} className="space-y-3.5 text-xs text-slate-200">
                  <div>
                    <label className="text-[11px] text-slate-300 block mb-1">اسم السكربت (Script Name)</label>
                    <input
                      type="text"
                      value={newScript.name}
                      onChange={(e) => setNewScript({ ...newScript, name: e.target.value })}
                      required
                      placeholder="مثال: Auto-Reboot-At-Dawn"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-300 block mb-1">مدة تكرار التشغيل (Interval)</label>
                    <select
                      value={newScript.interval}
                      onChange={(e) => setNewScript({ ...newScript, interval: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 focus:outline-none focus:border-blue-500"
                    >
                      <option value="1h">كل ساعة واحدة (1h)</option>
                      <option value="12h">كل 12 ساعة (12h)</option>
                      <option value="1d">يومياً (1d)</option>
                      <option value="7d">أسبوعياً (7d)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-300 block mb-1">الوصف والملاحظة</label>
                    <input
                      type="text"
                      value={newScript.comment}
                      onChange={(e) => setNewScript({ ...newScript, comment: e.target.value })}
                      placeholder="وظيفة هذا السكربت"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>حفظ وجدولة السكربت يدوياً</span>
                  </button>
                </form>
              </div>

              {/* Scheduled Scripts List */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg lg:col-span-2">
                <div className="p-4 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200">السكربتات والمهام المجدولة الفعالة</span>
                  <span className="text-[11px] bg-slate-800 text-slate-300 px-2.5 py-0.5 rounded-lg">{scripts.length} سكربتات</span>
                </div>

                <div className="divide-y divide-slate-800/60 max-h-[420px] overflow-y-auto">
                  {scripts.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 text-xs">
                      لا توجد مهام أو سكربتات مجدولة مسجلة حالياً
                    </div>
                  ) : (
                    scripts.map((sc) => (
                      <div key={sc.id} className="p-4 hover:bg-slate-950/30 transition-all flex items-start justify-between gap-4">
                        <div className="space-y-1.5 text-right">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-white">{sc.name}</span>
                            <span className="text-[9px] font-mono bg-slate-950 text-slate-400 border border-slate-800 px-1.5 py-0.5 rounded">
                              Interval: {sc.interval}
                            </span>
                            <span className="text-[10px] text-slate-400">مرات التشغيل: {sc.runCount}</span>
                          </div>
                          <p className="text-[11px] text-slate-400">{sc.comment || 'بدون تفاصيل'}</p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleScript(sc.id)}
                            className={`px-3 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all ${
                              sc.enabled ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {sc.enabled ? 'مفعل ومجدول' : 'معطل ومؤمن'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteScript(sc.id)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. VIEW: QUEUES & MANGLE DUPLICATE CLEANUP */}
      {activeTab === 'queues_mangle' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          <div className="bg-gradient-to-r from-slate-900 via-slate-900/40 to-slate-900 border border-slate-800 rounded-2xl p-4.5 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-blue-400" />
                <span>إيقاف وتنظيف تكرار قواعد QUEUE / MANGLE العشوائية</span>
              </h3>
              <p className="text-[11px] text-slate-400">
                منع الاختناق وتراكم القواعد المتروكة التي ينشئها الهوتسبوت أو الراوتر بشكل عشوائي دون مسحها. قم بتفعيل الحماية اليدوية أو تنظيف القواعد المكررة فوراً.
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              {/* Clean Duplicates Trigger */}
              <button
                type="button"
                onClick={handleCleanDuplicates}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-blue-600/10"
              >
                <Trash2 className="w-4 h-4" />
                <span>حذف القواعد المكررة ({queuesAndMangles.filter(q => q.isDuplicate).length})</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Prevention Settings Box */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 space-y-4 h-fit">
              <h3 className="text-xs font-bold text-white border-b border-slate-800 pb-2 flex items-center gap-2">
                <FolderLock className="w-4 h-4 text-amber-400" />
                <span>إعدادات الحماية اليدوية للـ Queues</span>
              </h3>

              <div className="p-4 bg-slate-950 rounded-xl space-y-3 border border-slate-800/80">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-slate-100 block">حظر القواعد العشوائية</span>
                    <span className="text-[10px] text-slate-400">منع الهوتسبوت من إنشاء قواعد Mangle غير مسجلة</span>
                  </div>
                  <button
                    type="button"
                    onClick={togglePreventRandom}
                    className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      preventRandomQueues ? 'bg-emerald-600' : 'bg-slate-800'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition duration-200 ease-in-out ${preventRandomQueues ? '-translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>

              <div className="p-4 bg-blue-950/20 border border-blue-500/15 rounded-xl text-[11px] text-slate-300 leading-relaxed flex gap-2">
                <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <span>
                  تكرار القواعد لآيبيات المشتركين يؤدي لخلل في تحديد السرعة وزيادة العبء على الراوتر. قم بتفعيل ميزة المنع والحد من تكرار القواعد.
                </span>
              </div>
            </div>

            {/* List of Active Queues & Mangle rules */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg lg:col-span-2">
              <div className="p-4 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">قواعد الـ Queue والـ Mangle الفعالة</span>
                <span className="text-[11px] bg-slate-800 text-slate-300 px-2.5 py-0.5 rounded-lg">{queuesAndMangles.length} قواعد</span>
              </div>

              <div className="divide-y divide-slate-800/60 max-h-[420px] overflow-y-auto">
                {queuesAndMangles.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs">
                    لا توجد قواعد سرعة أو مانجل مسجلة حالياً
                  </div>
                ) : (
                  queuesAndMangles.map((item) => (
                    <div key={item.id} className={`p-4 hover:bg-slate-950/30 transition-all flex items-center justify-between gap-4 ${item.isDuplicate ? 'bg-rose-950/10 border-r-2 border-rose-500' : ''}`}>
                      <div className="space-y-1.5 text-right">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-md font-bold text-[9px] border ${
                            item.type === 'Queue' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          }`}>
                            {item.type}
                          </span>
                          <span className="text-xs font-bold text-white">{item.name}</span>
                          {item.isDuplicate && (
                            <span className="bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[9px] font-bold px-1.5 py-0.2 rounded-full">
                              مكرر / غير ضروري
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          Target: {item.target} • Limit/Action: {item.value}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteQueueMangle(item.id)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. VIEW: PRECISE VLAN INTERFACES SETTINGS */}
      {activeTab === 'vlans' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 border border-indigo-500/20 rounded-2xl p-4.5 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
            <div className="space-y-1 text-right">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Wifi className="w-4 h-4 text-blue-400" />
                <span>تنظيم وتطبيق إعدادات الـ VLAN باحتراف ودقة يدوياً</span>
              </h3>
              <p className="text-[11px] text-slate-400">
                تقسيم الشبكة الفيزيائية إلى شبكات VLAN معزولة تماماً يضمن عزل المشتركين ومنع هجمات التجسس وفصل شبكة الإدارة والموظفين عن الزوار.
              </p>
            </div>
            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20 text-xs font-mono font-bold">
              IEEE 802.1Q VLANs
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Create VLAN interface Form */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 space-y-4 h-fit">
              <h3 className="text-xs font-bold text-white border-b border-slate-800 pb-2 flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-400" />
                <span>إنشاء وتطبيق واجهة VLAN</span>
              </h3>
              <form onSubmit={handleAddVlan} className="space-y-3.5 text-xs text-slate-200">
                <div>
                  <label className="text-[11px] text-slate-300 block mb-1">اسم واجهة الفيلان (VLAN Name)</label>
                  <input
                    type="text"
                    value={newVlan.name}
                    onChange={(e) => setNewVlan({ ...newVlan, name: e.target.value })}
                    required
                    placeholder="مثال: vlan10-hotspot"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-300 block mb-1">VLAN ID (1-4094)</label>
                    <input
                      type="number"
                      value={newVlan.vlanId}
                      onChange={(e) => setNewVlan({ ...newVlan, vlanId: e.target.value })}
                      required
                      placeholder="مثال: 10"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 focus:outline-none focus:border-blue-500 font-mono text-left"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-300 block mb-1">المنفذ الفيزيائي</label>
                    <select
                      value={newVlan.interface}
                      onChange={(e) => setNewVlan({ ...newVlan, interface: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 focus:outline-none focus:border-blue-500"
                    >
                      <option value="ether1">ether1 (WAN)</option>
                      <option value="ether2">ether2 (LAN)</option>
                      <option value="ether3">ether3</option>
                      <option value="ether4">ether4</option>
                      <option value="sfp-plus1">sfp-plus1</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-slate-300 block mb-1">الوصف والملاحظة (Comment)</label>
                  <input
                    type="text"
                    value={newVlan.comment}
                    onChange={(e) => setNewVlan({ ...newVlan, comment: e.target.value })}
                    placeholder="مثل: عزل سيرفر الهوتسبوت"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>تطبيق وإضافة واجهة VLAN يدوياً</span>
                </button>
              </form>
            </div>

            {/* List of VLAN Interfaces */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg lg:col-span-2">
              <div className="p-4 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">واجهات الفيلان المطبقة يدوياً</span>
                <span className="text-[11px] bg-slate-800 text-slate-300 px-2.5 py-0.5 rounded-lg">{vlans.length} واجهات نشطة</span>
              </div>

              <div className="divide-y divide-slate-800/60 max-h-[420px] overflow-y-auto">
                {vlans.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs">
                    لا توجد واجهات فيلان مضافة حالياً
                  </div>
                ) : (
                  vlans.map((v) => (
                    <div key={v.id} className="p-4 hover:bg-slate-950/30 transition-all flex items-center justify-between gap-4">
                      <div className="space-y-1.5 text-right">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-white">{v.name}</span>
                          <span className="text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded">
                            VLAN ID: {v.vlanId}
                          </span>
                          <span className="text-[10px] text-slate-400">على منفذ: {v.interface}</span>
                        </div>
                        <p className="text-[11px] text-slate-400">{v.comment || 'بدون ملاحظات'}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteVlan(v.id)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                        title="حذف واجهة VLAN"
                      >
                        <Trash2 className="w-4.5 h-4.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Formatted Firewall & Security PDF Export Modal */}
      <PdfExportModal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
        activeTab="firewall"
      />

      {/* Dangerous Rule Safe Mode Guard Confirm Modal */}
      <ConfirmModal
        isOpen={!!pendingDangerousRule}
        title="تحذير أمني حرج (Safe Mode Guard)"
        message="أنت تقوم بإضافة قاعدة حظر (Drop/Reject) على منافذ الإدارة لسلسلة الـ input. لمنع فقدان الاتصال بالراوتر أو طرد المدير نهائياً، سيقوم النظام تلقائياً بحقن قاعدة أمان مسبقة تسمح بوصول المدير. هل ترغب في المتابعة؟"
        confirmText="متابعة وحقن قاعدة الحماية"
        cancelText="إلغاء لحماية الراوتر"
        type="warning"
        onConfirm={handleConfirmDangerousRule}
        onClose={() => {
          setPendingDangerousRule(null);
          showToast('تم إلغاء إضافة القاعدة لمنع غلق الراوتر وحماية وصول المدير', 'info');
        }}
      />
    </div>
  );
};
