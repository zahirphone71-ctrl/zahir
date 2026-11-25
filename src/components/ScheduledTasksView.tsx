import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useMikroTik } from '../context/MikroTikContext';
import { ScheduledTask, ScheduledTaskTemplate } from '../types/mikrotik';
import { exportScheduledTasksToCsv } from '../lib/formatters';
import {
  CalendarClock,
  Clock,
  Play,
  CheckCircle2,
  Trash2,
  Edit2,
  Plus,
  Search,
  X,
  RotateCcw,
  FileSpreadsheet,
  HardDrive,
  Sparkles,
  Zap,
  Copy,
  Check,
  Power,
  Terminal,
  ArrowUpDown,
  CheckSquare,
  Square,
  ShieldAlert
} from 'lucide-react';

// Built-in battle-tested RouterOS Scheduled Task Templates
const TASK_TEMPLATES: ScheduledTaskTemplate[] = [
  {
    id: 'tmpl-reboot-daily',
    name: 'Daily-Reboot-04AM',
    titleAr: 'إعادة التشغيل اليومي التلقائي (04:00 فجراً)',
    category: 'maintenance',
    descriptionAr: 'يقوم بإعادة تشغيل الراوتر فجراً لتفريغ الذاكرة المؤقتة (RAM)، تجديد الاتصال مع مزود الخدمة، وتنشيط أداء السيرفر دون التأثير على المستخدمين.',
    startTime: '04:00:00',
    interval: '1d',
    onEvent: '/system reboot',
    comment: 'إعادة تشغيل مجدولة يومياً في 04:00 فجراً لتحسين الاستقرار',
    dangerLevel: 'medium',
    suggestedPolicy: 'reboot,read,write,policy,test'
  },
  {
    id: 'tmpl-backup-daily',
    name: 'Auto-Backup-Daily',
    titleAr: 'النسخ الاحتياطي التلقائي اليومي (03:30 فجراً)',
    category: 'backup',
    descriptionAr: 'إنشاء نسخة احتياطية كاملة من قاعدة بيانات النظام وإعدادات الراوتر تلقائياً باسم يحتوي على تاريخ اليوم لحماية الشبكة من فقدان البيانات.',
    startTime: '03:30:00',
    interval: '1d',
    onEvent: ':local d [/system clock get date]; :if ([:find $d "/"] >= 0) do={ :set d ([:pick $d 7 11] . [:pick $d 0 3] . [:pick $d 4 6]) }; /system backup save name=("daily-backup-" . $d)',
    comment: 'نسخ احتياطي يومي آلي لملفات الراوتر وقاعدة البيانات',
    dangerLevel: 'none',
    suggestedPolicy: 'read,write,policy,test'
  },
  {
    id: 'tmpl-clean-expired-users',
    name: 'Clean-Expired-Hotspot-Users',
    titleAr: 'تنظيف كروت ومشتركي الهوتسبوت المنتهية',
    category: 'cleanup',
    descriptionAr: 'فحص وحذف كروت الهوتسبوت المنتهية تلقائياً لمنع تضخم قاعدة بيانات المشتركين وتخفيف استهلاك معالج الراوتر والذاكرة.',
    startTime: '05:00:00',
    interval: '1d',
    onEvent: ':foreach u in=[/ip hotspot user find where uptime>=limit-uptime and limit-uptime!=0s] do={/ip hotspot user remove $u}',
    comment: 'حذف كروت ومشتركي الهوتسبوت منتهية الصلاحية يومياً',
    dangerLevel: 'none',
    suggestedPolicy: 'read,write,policy,test'
  },
  {
    id: 'tmpl-flush-dns',
    name: 'Flush-DNS-Cache-6H',
    titleAr: 'تفريغ كاش الـ DNS دورياً (كل 6 ساعات)',
    category: 'network',
    descriptionAr: 'مسح ذاكرة الكاش المؤقتة لخادم DNS كل 6 ساعات لتسريع فتح المواقع وحل مشاكل الصفحات العالقة أو بطء الاستجابة للمشتركين.',
    startTime: '00:00:00',
    interval: '06:00:00',
    onEvent: '/ip dns cache flush',
    comment: 'تفريغ دوري لذاكرة الكاش DNS كل 6 ساعات',
    dangerLevel: 'none',
    suggestedPolicy: 'read,write,test'
  },
  {
    id: 'tmpl-export-rsc-weekly',
    name: 'Export-Config-RSC-Weekly',
    titleAr: 'تصدير نصي أسبوعي للإعدادات (.rsc)',
    category: 'backup',
    descriptionAr: 'تصدير ملف أوامر نصي شامل لإعدادات الراوتر أسبوعياً، يسهل قراءته واستعادته على أي جهاز مايكروتك آخر بسهولة.',
    startTime: '02:00:00',
    interval: '7d',
    onEvent: ':local d [/system clock get date]; :if ([:find $d "/"] >= 0) do={ :set d ([:pick $d 7 11] . [:pick $d 0 3] . [:pick $d 4 6]) }; /export file=("weekly-config-" . $d)',
    comment: 'تصدير نصي أسبوعي لملفات الإعدادات بصيغة .rsc',
    dangerLevel: 'none',
    suggestedPolicy: 'read,write,policy,test'
  },
  {
    id: 'tmpl-kick-idle-sessions',
    name: 'Kick-Idle-Sessions-Night',
    titleAr: 'طرد الجلسات الخاملة ليلاً (تحرير العناوين)',
    category: 'cleanup',
    descriptionAr: 'طرد الأجهزة المتصلة الخاملة التي لم تقم بأي نشاط لأكثر من 30 دقيقة لتحرير عناوين IP وسيرفر DHCP ليلاً.',
    startTime: '04:30:00',
    interval: '1d',
    onEvent: '/ip hotspot active remove [find idle-time>30m]',
    comment: 'طرد الجلسات الخاملة ليلاً لتحرير عناوين الآي بي',
    dangerLevel: 'none',
    suggestedPolicy: 'read,write,policy,test'
  },
  {
    id: 'tmpl-reset-counters',
    name: 'Reset-Traffic-Counters-Monthly',
    titleAr: 'تصفير عدادات ترافيك المنافذ شهرياً',
    category: 'maintenance',
    descriptionAr: 'تصفير عدادات البايتات والحزم على منافذ الراوتر في أول كل شهر لبدء حساب استهلاك الإنترنت للشهر الجديد بدقة.',
    startTime: '00:01:00',
    interval: '30d',
    onEvent: '/interface reset-counters [find]',
    comment: 'تصفير إحصائيات المنافذ شهرياً لبداية دورة فوترة جديدة',
    dangerLevel: 'none',
    suggestedPolicy: 'read,write,test'
  },
  {
    id: 'tmpl-restart-lte-watchdog',
    name: 'Restart-LTE-Modem-Check',
    titleAr: 'إعادة تنشيط مودم 4G/LTE كل 12 ساعة',
    category: 'network',
    descriptionAr: 'إيقاف وتشغيل منفذ مودم 4G/LTE الداخلي كل 12 ساعة لتجديد الاتصال بالبرج وتفادي تجميد شريحة البيانات.',
    startTime: '06:00:00',
    interval: '12:00:00',
    onEvent: '/interface disable [find name="lte1"]; :delay 5s; /interface enable [find name="lte1"]',
    comment: 'إعادة تنشيط دورية لمنفذ LTE كل 12 ساعة',
    dangerLevel: 'none',
    suggestedPolicy: 'read,write,test'
  }
];

export const ScheduledTasksView: React.FC = () => {
  const {
    scheduledTasks,
    isLoadingSchedulers,
    fetchScheduledTasks,
    addScheduledTask,
    updateScheduledTask,
    deleteScheduledTask,
    runScheduledTask,
    toggleScheduledTask,
    batchDeleteScheduledTasks,
    batchToggleScheduledTasks,
    showToast,
    isConnected
  } = useMikroTik();

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');
  const [sortField, setSortField] = useState<'name' | 'startTime' | 'interval' | 'runCount'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Multi-selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  // Modals & Panels state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);
  const [isTemplatesDrawerOpen, setIsTemplatesDrawerOpen] = useState(false);
  const [taskToRun, setTaskToRun] = useState<ScheduledTask | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<ScheduledTask | null>(null);
  const [isBatchDeleteConfirmOpen, setIsBatchDeleteConfirmOpen] = useState(false);
  const [copiedScriptId, setCopiedScriptId] = useState<string | null>(null);
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBatchOperating, setIsBatchOperating] = useState(false);
  const [isDeletingSingle, setIsDeletingSingle] = useState(false);
  const [togglingTaskId, setTogglingTaskId] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAutoFetchedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
    };
  }, []);

  // Form State for Add / Edit
  const [formName, setFormName] = useState('');
  const [formStartTime, setFormStartTime] = useState('04:00:00');
  const [formStartDate, setFormStartDate] = useState('');
  const [formInterval, setFormInterval] = useState('1d');
  const [formOnEvent, setFormOnEvent] = useState('/system reboot');
  const [formComment, setFormComment] = useState('');
  const [formDisabled, setFormDisabled] = useState(false);
  const [formPolicy, setFormPolicy] = useState('read,write,policy,test,reboot');

  // Stats calculation
  const totalTasks = scheduledTasks.length;
  const activeTasks = scheduledTasks.filter((t) => !t.disabled).length;
  const disabledTasks = scheduledTasks.filter((t) => t.disabled).length;
  const totalRuns = scheduledTasks.reduce((acc, t) => acc + (t.runCount || 0), 0);

  // Check if daily reboot task is configured and enabled
  const dailyRebootTask = useMemo(() => {
    return scheduledTasks.find((t) => {
      const isRebootCmd = (t.onEvent || '').toLowerCase().includes('reboot');
      const isNameReboot = (t.name || '').toLowerCase().includes('reboot');
      return isRebootCmd || isNameReboot;
    });
  }, [scheduledTasks]);

  // Check if automated backup task is configured and enabled
  const autoBackupTask = useMemo(() => {
    return scheduledTasks.find((t) => {
      const isBackupCmd = (t.onEvent || '').toLowerCase().includes('backup');
      const isNameBackup = (t.name || '').toLowerCase().includes('backup');
      return isBackupCmd || isNameBackup;
    });
  }, [scheduledTasks]);

  // Auto-fetch scheduled tasks from MikroTik once per connection
  useEffect(() => {
    if (!isConnected) {
      hasAutoFetchedRef.current = false;
      return;
    }
    if (!hasAutoFetchedRef.current) {
      hasAutoFetchedRef.current = true;
      fetchScheduledTasks().catch(() => {});
    }
  }, [isConnected, fetchScheduledTasks]);

  // Prune stale selectedIds when scheduledTasks changes
  useEffect(() => {
    const validIds = new Set(scheduledTasks.map(t => t.id));
    setSelectedIds(prev => {
      const next = prev.filter(id => validIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [scheduledTasks]);

  // Filter & Sort
  const filteredTasks = useMemo(() => {
    return scheduledTasks
      .filter((t) => {
        // Status filter
        if (statusFilter === 'active' && t.disabled) return false;
        if (statusFilter === 'disabled' && !t.disabled) return false;

        // Search filter
        if (searchTerm.trim()) {
          const q = searchTerm.toLowerCase();
          const matchName = (t.name || '').toLowerCase().includes(q);
          const matchEvent = (t.onEvent || '').toLowerCase().includes(q);
          const matchComment = (t.comment || '').toLowerCase().includes(q);
          const matchInterval = (t.interval || '').toLowerCase().includes(q);
          if (!matchName && !matchEvent && !matchComment && !matchInterval) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortField === 'runCount') {
          const diff = (a.runCount || 0) - (b.runCount || 0);
          return sortDirection === 'asc' ? diff : -diff;
        }
        const valA = String(a[sortField] || '');
        const valB = String(b[sortField] || '');
        const cmp = valA.localeCompare(valB);
        return sortDirection === 'asc' ? cmp : -cmp;
      });
  }, [scheduledTasks, statusFilter, searchTerm, sortField, sortDirection]);

  // Quick human-friendly interval translation to Arabic
  const formatIntervalAr = (val: string) => {
    const v = (val || '').trim().toLowerCase();
    if (v === '1d' || v === '1d 00:00:00' || v === '24:00:00') return 'يومياً (1d)';
    if (v === '12h' || v === '12:00:00') return 'كل 12 ساعة (12h)';
    if (v === '6h' || v === '06:00:00') return 'كل 6 ساعات (6h)';
    if (v === '1h' || v === '01:00:00') return 'كل ساعة (1h)';
    if (v === '7d' || v === '7d 00:00:00') return 'أسبوعياً (7d)';
    if (v === '30d' || v === '30d 00:00:00') return 'شهرياً (30d)';
    if (v === '0s' || v === '00:00:00') return 'عند الإقلاع فقط (0s)';
    return val;
  };

  // Handle open modal for new task
  const handleOpenAddModal = (preset?: ScheduledTaskTemplate) => {
    if (preset) {
      setFormName(preset.name);
      setFormStartTime(preset.startTime);
      setFormStartDate('');
      setFormInterval(preset.interval);
      setFormOnEvent(preset.onEvent);
      setFormComment(preset.comment);
      setFormDisabled(false);
      setFormPolicy(preset.suggestedPolicy || 'read,write,policy,test,reboot');
    } else {
      setFormName(`Task-${Date.now().toString().slice(-4)}`);
      setFormStartTime('04:00:00');
      setFormStartDate('');
      setFormInterval('1d');
      setFormOnEvent('/system reboot');
      setFormComment('');
      setFormDisabled(false);
      setFormPolicy('read,write,policy,test,reboot');
    }
    setEditingTask(null);
    setIsAddModalOpen(true);
    setIsTemplatesDrawerOpen(false);
  };

  // Handle open modal for editing
  const handleOpenEditModal = (task: ScheduledTask) => {
    setEditingTask(task);
    setFormName(task.name);
    setFormStartTime(task.startTime || 'startup');
    setFormStartDate(task.startDate || '');
    setFormInterval(task.interval || '1d');
    setFormOnEvent(task.onEvent || '');
    setFormComment(task.comment || '');
    setFormDisabled(Boolean(task.disabled));
    setFormPolicy(task.policy || 'read,write,policy,test,reboot');
    setIsAddModalOpen(true);
  };

  // Save Task (Add or Update)
  const handleSubmitTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!formName.trim() || !formOnEvent.trim()) {
      showToast('يرجى كتابة اسم المهمة والأمر البرمجي', 'warning');
      return;
    }

    const taskPayload = {
      name: formName.trim(),
      startTime: formStartTime.trim() || 'startup',
      startDate: formStartDate.trim() || undefined,
      interval: formInterval.trim() || '1d',
      onEvent: formOnEvent.trim(),
      comment: formComment.trim(),
      disabled: formDisabled,
      policy: formPolicy
    };

    setIsSubmitting(true);
    try {
      const res = editingTask
        ? await updateScheduledTask(editingTask.id, taskPayload)
        : await addScheduledTask(taskPayload);

      if (isMountedRef.current && res.success) {
        setIsAddModalOpen(false);
        setEditingTask(null);
      }
    } finally {
      if (isMountedRef.current) setIsSubmitting(false);
    }
  };

  // Execute Task Now
  const handleRunTask = async (task: ScheduledTask) => {
    if (runningTaskId) return;
    setRunningTaskId(task.id);
    try {
      await runScheduledTask(task.id);
    } finally {
      if (isMountedRef.current) {
        setRunningTaskId(null);
        setTaskToRun(null);
      }
    }
  };

  const handleToggleSingle = async (task: ScheduledTask) => {
    if (togglingTaskId) return;
    setTogglingTaskId(task.id);
    try {
      await toggleScheduledTask(task.id, !task.disabled);
    } finally {
      if (isMountedRef.current) setTogglingTaskId(null);
    }
  };

  // Copy script content to clipboard
  const handleCopyScript = async (script: string, id: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(script);
      } else {
        throw new Error('Clipboard API not available');
      }
    } catch {
      const ta = document.createElement('textarea');
      ta.value = script;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } finally {
        document.body.removeChild(ta);
      }
    }
    setCopiedScriptId(id);
    showToast('تم نسخ الأمر البرمجي للحافظة', 'info');
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) setCopiedScriptId(null);
    }, 2000);
  };

  // Handle selection toggles
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => (selectedIdSet.has(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const allFilteredSelected = filteredTasks.length > 0 && filteredTasks.every(t => selectedIdSet.has(t.id));

  const handleSelectAll = () => {
    const filteredIds = new Set(filteredTasks.map((t) => t.id));
    if (allFilteredSelected) {
      setSelectedIds(prev => prev.filter(id => !filteredIds.has(id)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  // Bulk actions
  const handleBatchEnable = async () => {
    if (selectedIds.length === 0 || isBatchOperating) return;
    setIsBatchOperating(true);
    try {
      const res = await batchToggleScheduledTasks(selectedIds, false);
      if (isMountedRef.current && res.success) setSelectedIds([]);
    } finally {
      if (isMountedRef.current) setIsBatchOperating(false);
    }
  };

  const handleBatchDisable = async () => {
    if (selectedIds.length === 0 || isBatchOperating) return;
    setIsBatchOperating(true);
    try {
      const res = await batchToggleScheduledTasks(selectedIds, true);
      if (isMountedRef.current && res.success) setSelectedIds([]);
    } finally {
      if (isMountedRef.current) setIsBatchOperating(false);
    }
  };

  const handleBatchDeleteConfirm = async () => {
    if (selectedIds.length === 0 || isBatchOperating) return;
    setIsBatchOperating(true);
    try {
      const res = await batchDeleteScheduledTasks(selectedIds);
      if (isMountedRef.current && res.success) {
        setSelectedIds([]);
        setIsBatchDeleteConfirmOpen(false);
      }
    } finally {
      if (isMountedRef.current) setIsBatchOperating(false);
    }
  };

  // Quick 1-click toggle, edit, or install Daily Reboot
  const handleQuickSetupDailyReboot = async () => {
    if (dailyRebootTask) {
      if (dailyRebootTask.disabled) {
        await toggleScheduledTask(dailyRebootTask.id, false);
      } else {
        handleOpenEditModal(dailyRebootTask);
      }
    } else {
      const rebootPreset = TASK_TEMPLATES.find((t) => t.id === 'tmpl-reboot-daily')!;
      await addScheduledTask({
        name: rebootPreset.name,
        startTime: rebootPreset.startTime,
        interval: rebootPreset.interval,
        onEvent: rebootPreset.onEvent,
        comment: rebootPreset.comment,
        disabled: false,
        policy: rebootPreset.suggestedPolicy
      });
    }
  };

  // Quick 1-click toggle, edit, or install Auto Backup
  const handleQuickSetupAutoBackup = async () => {
    if (autoBackupTask) {
      if (autoBackupTask.disabled) {
        await toggleScheduledTask(autoBackupTask.id, false);
      } else {
        handleOpenEditModal(autoBackupTask);
      }
    } else {
      const backupPreset = TASK_TEMPLATES.find((t) => t.id === 'tmpl-backup-daily')!;
      await addScheduledTask({
        name: backupPreset.name,
        startTime: backupPreset.startTime,
        interval: backupPreset.interval,
        onEvent: backupPreset.onEvent,
        comment: backupPreset.comment,
        disabled: false,
        policy: backupPreset.suggestedPolicy
      });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* Top Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-100 flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/30">
              <CalendarClock className="w-6 h-6" />
            </span>
            <span>جدولة المهام التلقائية (Scheduled Tasks / RouterOS Scheduler)</span>
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1.5 leading-relaxed">
            أتمتة مهام الصيانة الدورية في المايكروتك: إعادة التشغيل اليومي، النسخ الاحتياطي التلقائي، تنظيف الكروت المنتهية، تفريغ كاش DNS، والمزيد.
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => setIsTemplatesDrawerOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold transition-all shadow-sm shadow-amber-500/10 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>قوالب المهام الجاهزة</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenAddModal()}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-all shadow-lg shadow-blue-600/20 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة مهمة مجدولة</span>
          </button>

          <button
            type="button"
            onClick={() => exportScheduledTasksToCsv(scheduledTasks)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer"
            title="تصدير المهام إلى ملف CSV"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">تصدير CSV</span>
          </button>

          <button
            type="button"
            onClick={() => fetchScheduledTasks()}
            disabled={isLoadingSchedulers}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors disabled:opacity-50 cursor-pointer"
            title="تحديث قائمة المهام من الراوتر"
          >
            <RotateCcw className={`w-4 h-4 ${isLoadingSchedulers ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 md:gap-4">
        {/* Total Tasks */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-medium block mb-1">إجمالي المهام المجدولة</span>
            <div className="text-2xl font-black text-slate-100 font-mono">{totalTasks}</div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <CalendarClock className="w-5 h-5" />
          </div>
        </div>

        {/* Active Tasks */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-medium block mb-1">المهام النشطة التلقائية</span>
            <div className="text-2xl font-black text-emerald-400 font-mono flex items-center gap-2">
              <span>{activeTasks}</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        {/* Disabled Tasks */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-medium block mb-1">المهام المعطلة / المتوقفة</span>
            <div className="text-2xl font-black text-amber-400 font-mono">{disabledTasks}</div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* Total Run Counts */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-medium block mb-1">مرات التنفيذ المسجلة</span>
            <div className="text-2xl font-black text-purple-400 font-mono">{totalRuns}</div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <Zap className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Featured Routine Banners: Daily Reboot & Daily Auto-Backup */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Daily Reboot Card */}
        <div className="bg-gradient-to-br from-blue-950/40 via-slate-900 to-indigo-950/40 border border-blue-500/30 rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-4 shadow-xl">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 shrink-0">
              <Power className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="text-sm font-bold text-slate-100">إعادة التشغيل اليومي التلقائي (Daily Reboot)</h2>
                {dailyRebootTask && !dailyRebootTask.disabled ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    مفعل ونشط
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    غير مفعل
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                إعادة التشغيل فجراً (04:00 AM) تحمي السيرفر من تسرب الذاكرة وتجدد اتصال المشتركين واستقرار الراوتر.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
            {dailyRebootTask && !dailyRebootTask.disabled ? (
              <div className="flex items-center gap-2 text-xs bg-slate-950/60 border border-slate-700/60 px-3 py-1.5 rounded-xl text-slate-300 font-mono">
                <Clock className="w-3.5 h-3.5 text-blue-400" />
                <span>الوقت: {dailyRebootTask.startTime}</span>
              </div>
            ) : (
              <span className="text-[11px] text-slate-400">الوقت المقترح: 04:00:00 فجراً</span>
            )}

            <button
              type="button"
              onClick={handleQuickSetupDailyReboot}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                dailyRebootTask && !dailyRebootTask.disabled
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-md shadow-blue-500/25'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              <span>{dailyRebootTask && !dailyRebootTask.disabled ? 'إعادة ضبط' : 'تفعيل بنقرة واحدة'}</span>
            </button>
          </div>
        </div>

        {/* Daily Auto-Backup Card */}
        <div className="bg-gradient-to-br from-emerald-950/30 via-slate-900 to-teal-950/30 border border-emerald-500/30 rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-4 shadow-xl">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
              <HardDrive className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="text-sm font-bold text-slate-100">النسخ الاحتياطي التلقائي اليومي (Daily Backup)</h2>
                {autoBackupTask && !autoBackupTask.disabled ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    مفعل ونشط
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    غير مفعل
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                إنشاء نسخة احتياطية كاملة لملفات وقاعدة بيانات الراوتر يومياً (03:30 AM) لحماية بيانات المشتركين والإعدادات.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
            {autoBackupTask && !autoBackupTask.disabled ? (
              <div className="flex items-center gap-2 text-xs bg-slate-950/60 border border-slate-700/60 px-3 py-1.5 rounded-xl text-slate-300 font-mono">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                <span>الوقت: {autoBackupTask.startTime}</span>
              </div>
            ) : (
              <span className="text-[11px] text-slate-400">الوقت المقترح: 03:30:00 فجراً</span>
            )}

            <button
              type="button"
              onClick={handleQuickSetupAutoBackup}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                autoBackupTask && !autoBackupTask.disabled
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                  : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-500/25'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>{autoBackupTask && !autoBackupTask.disabled ? 'إعادة ضبط' : 'تفعيل بنقرة واحدة'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter, Search & Bulk Actions Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3.5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث باسم المهمة، الأمر البرمجي، أو الملاحظة..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl pr-10 pl-9 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status Filter buttons */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                statusFilter === 'all' ? 'bg-blue-600 text-white shadow-sm font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              الكل ({totalTasks})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                statusFilter === 'active' ? 'bg-emerald-600 text-white shadow-sm font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              النشطة ({activeTasks})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('disabled')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                statusFilter === 'disabled' ? 'bg-amber-600 text-white shadow-sm font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              المعطلة ({disabledTasks})
            </button>
          </div>
        </div>

        {/* Bulk Actions Panel (active when tasks selected) */}
        {selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800 bg-blue-950/20 px-3 py-2 rounded-xl border-dashed border-blue-500/30 animate-in fade-in duration-200">
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-300">
              <CheckCircle2 className="w-4 h-4 text-blue-400" />
              <span>تم تحديد {selectedIds.length} مهمة مجدولة</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleBatchEnable}
                className="px-3 py-1.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/40 border border-emerald-500/40 text-emerald-200 text-xs font-medium transition-colors"
              >
                تفعيل المحدد
              </button>
              <button
                type="button"
                onClick={handleBatchDisable}
                className="px-3 py-1.5 rounded-lg bg-amber-600/30 hover:bg-amber-600/40 border border-amber-500/40 text-amber-200 text-xs font-medium transition-colors"
              >
                تعطيل المحدد
              </button>
              <button
                type="button"
                onClick={() => setIsBatchDeleteConfirmOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-rose-600/30 hover:bg-rose-600/40 border border-rose-500/40 text-rose-200 text-xs font-medium transition-colors flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>حذف المحدد</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-slate-200"
              >
                إلغاء التحديد
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Scheduled Tasks Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold select-none">
                <th className="py-3 px-4 w-10 text-center">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    {allFilteredSelected ? (
                      <CheckSquare className="w-4 h-4 text-blue-400" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="py-3 px-4">
                  <button
                    type="button"
                    onClick={() => {
                      if (sortField === 'name') setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                      else { setSortField('name'); setSortDirection('asc'); }
                    }}
                    className="flex items-center gap-1.5 hover:text-slate-200 cursor-pointer"
                  >
                    <span>اسم المهمة والوصف</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </button>
                </th>
                <th className="py-3 px-4 text-center">الحالة</th>
                <th className="py-3 px-4">
                  <button
                    type="button"
                    onClick={() => {
                      if (sortField === 'startTime') setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                      else { setSortField('startTime'); setSortDirection('asc'); }
                    }}
                    className="flex items-center gap-1.5 hover:text-slate-200 cursor-pointer"
                  >
                    <span>وقت البدء والتكرار</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </button>
                </th>
                <th className="py-3 px-4">الأمر البرمجي المنفذ (On Event)</th>
                <th className="py-3 px-4 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      if (sortField === 'runCount') setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                      else { setSortField('runCount'); setSortDirection('desc'); }
                    }}
                    className="flex items-center justify-center gap-1.5 hover:text-slate-200 cursor-pointer mx-auto"
                  >
                    <span>مرات التشغيل</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </button>
                </th>
                <th className="py-3 px-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <CalendarClock className="w-8 h-8 text-slate-600 mb-1" />
                      <p className="text-sm font-semibold text-slate-300">لا توجد مهام مجدولة تطابق البحث الحالي</p>
                      <p className="text-xs text-slate-500">يمكنك إضافة مهمة جديدة أو اختيار أحد القوالب الجاهزة بنقرة واحدة</p>
                      <button
                        type="button"
                        onClick={() => setIsTemplatesDrawerOpen(true)}
                        className="mt-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
                      >
                        استعراض القوالب الجاهزة
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredTasks.map((task) => {
                  const isSelected = selectedIdSet.has(task.id);
                  const isReboot = (task.onEvent || '').toLowerCase().includes('reboot');

                  return (
                    <tr
                      key={task.id}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        isSelected ? 'bg-blue-950/20' : ''
                      } ${task.disabled ? 'opacity-70' : ''}`}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleSelect(task.id)}
                          className="text-slate-400 hover:text-slate-200 cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-blue-400" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* Name & Comment */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`p-1.5 rounded-lg border ${
                              isReboot
                                ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                            }`}
                          >
                            {isReboot ? <Power className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                          </span>
                          <div>
                            <div className="font-bold text-slate-100 font-mono text-xs">{task.name}</div>
                            {task.comment && (
                              <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{task.comment}</div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Status & Instant Toggle */}
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleSingle(task)}
                          disabled={togglingTaskId === task.id}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all cursor-pointer disabled:opacity-50 ${
                            !task.disabled
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
                              : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700/60'
                          }`}
                          title={task.disabled ? 'انقر لتفعيل المهمة' : 'انقر لتعطيل المهمة'}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              !task.disabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                            }`}
                          ></span>
                          <span>{!task.disabled ? 'نشط' : 'معطل'}</span>
                        </button>
                      </td>

                      {/* Timing & Interval */}
                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          <div className="text-slate-200 font-mono text-xs flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>{task.startTime || 'startup'}</span>
                          </div>
                          <div className="text-[11px] text-blue-400 font-medium">
                            {formatIntervalAr(task.interval)}
                          </div>
                        </div>
                      </td>

                      {/* On Event (Script) snippet */}
                      <td className="py-3 px-4 max-w-xs">
                        <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 group">
                          <Terminal className="w-3 h-3 text-slate-500 shrink-0" />
                          <code className="text-[11px] text-slate-300 font-mono truncate flex-1 dir-ltr text-left">
                            {task.onEvent}
                          </code>
                          <button
                            type="button"
                            onClick={() => handleCopyScript(task.onEvent, task.id)}
                            className="text-slate-500 hover:text-slate-300 p-0.5 rounded transition-colors"
                            title="نسخ الأمر"
                          >
                            {copiedScriptId === task.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Run Count */}
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-300 font-mono text-xs">
                          {task.runCount ?? 0}
                        </span>
                      </td>

                      {/* Row Actions */}
                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => (isReboot ? setTaskToRun(task) : handleRunTask(task))}
                            disabled={runningTaskId === task.id}
                            title="تنفيذ المهمة الآن"
                            className="p-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 transition-all cursor-pointer disabled:opacity-40"
                          >
                            {runningTaskId === task.id ? (
                              <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Play className="w-3.5 h-3.5" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(task)}
                            title="تعديل المهمة"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-blue-600/30 text-slate-300 hover:text-blue-300 border border-slate-700 transition-all cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setTaskToDelete(task)}
                            title="حذف المهمة"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700 transition-all cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Templates Drawer / Gallery Modal */}
      {isTemplatesDrawerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  <Sparkles className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-100">قوالب المهام المجدولة الجاهزة (RouterOS Task Presets)</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    اختر قالباً مجرباً لتطبيقه وضبطه في راوتر المايكروتك بنقرة واحدة
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTemplatesDrawerOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Presets List */}
            <div className="p-5 overflow-y-auto space-y-3.5 flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {TASK_TEMPLATES.map((tmpl) => (
                  <div
                    key={tmpl.id}
                    className="bg-slate-950 border border-slate-800 hover:border-blue-500/50 rounded-2xl p-4 transition-all hover:shadow-lg group flex flex-col justify-between space-y-3"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`p-1.5 rounded-lg border text-xs ${
                              tmpl.category === 'maintenance'
                                ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                                : tmpl.category === 'backup'
                                ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                                : tmpl.category === 'cleanup'
                                ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                                : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            }`}
                          >
                            {tmpl.category === 'maintenance' ? (
                              <Power className="w-4 h-4" />
                            ) : tmpl.category === 'backup' ? (
                              <HardDrive className="w-4 h-4" />
                            ) : tmpl.category === 'cleanup' ? (
                              <Trash2 className="w-4 h-4" />
                            ) : (
                              <Zap className="w-4 h-4" />
                            )}
                          </span>
                          <h4 className="text-xs font-bold text-slate-100 group-hover:text-blue-300 transition-colors">
                            {tmpl.titleAr}
                          </h4>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                        {tmpl.descriptionAr}
                      </p>

                      <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-300 font-mono bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800">
                        <Clock className="w-3 h-3 text-blue-400" />
                        <span>الوقت: {tmpl.startTime}</span>
                        <span className="text-slate-600">•</span>
                        <span>التكرار: {formatIntervalAr(tmpl.interval)}</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                      <code className="text-[10px] text-slate-500 font-mono truncate max-w-[180px] dir-ltr text-left">
                        {tmpl.onEvent}
                      </code>
                      <button
                        type="button"
                        onClick={() => handleOpenAddModal(tmpl)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600/30 hover:bg-blue-600 border border-blue-500/40 text-blue-200 hover:text-white text-xs font-bold transition-all cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>استخدام هذا القالب</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
              <span>يمكنك تعديل أي باراميتر أو وقت بعد اختيار القالب.</span>
              <button
                type="button"
                onClick={() => setIsTemplatesDrawerOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Task Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/30">
                  <CalendarClock className="w-5 h-5" />
                </span>
                <h3 className="text-base font-bold text-slate-100">
                  {editingTask ? 'تعديل المهمة المجدولة' : 'إضافة مهمة مجدولة جديدة (New Scheduled Task)'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmitTask} className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
              {/* Task Name */}
              <div>
                <label className="text-slate-300 font-semibold mb-1.5 block">
                  اسم المهمة في الراوتر (Name):
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="مثال: Daily-Reboot-04AM"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Timing: Start Time & Interval */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-slate-300 font-semibold mb-1.5 block">
                    وقت البدء (Start Time):
                  </label>
                  <input
                    type="text"
                    required
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    placeholder="04:00:00 أو startup"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                  />
                  <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-400">
                    <button
                      type="button"
                      onClick={() => setFormStartTime('04:00:00')}
                      className="text-blue-400 hover:underline"
                    >
                      04:00:00 (الفجر)
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => setFormStartTime('startup')}
                      className="text-blue-400 hover:underline"
                    >
                      عند الإقلاع (startup)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-slate-300 font-semibold mb-1.5 block">
                    التكرار والفترة (Interval):
                  </label>
                  <select
                    value={formInterval}
                    onChange={(e) => setFormInterval(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                  >
                    <option value="1d">يومياً (1d / كل 24 ساعة)</option>
                    <option value="12:00:00">كل 12 ساعة (12h)</option>
                    <option value="06:00:00">كل 6 ساعات (6h)</option>
                    <option value="01:00:00">كل ساعة (1h)</option>
                    <option value="7d">أسبوعياً (7d / كل أسبوع)</option>
                    <option value="30d">شهرياً (30d / كل شهر)</option>
                    <option value="0s">مرة واحدة عند الإقلاع فقط (0s)</option>
                  </select>
                </div>
              </div>

              {/* On Event (Script / Command) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-slate-300 font-semibold">
                    الأمر البرمجي المنفذ (On Event / Script):
                  </label>
                  <div className="flex items-center gap-1 text-[10px] text-slate-400">
                    <span>أوامر سريعة:</span>
                    <button
                      type="button"
                      onClick={() => setFormOnEvent('/system reboot')}
                      className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-blue-300 font-mono"
                    >
                      reboot
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormOnEvent('/ip dns cache flush')}
                      className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-blue-300 font-mono"
                    >
                      flush dns
                    </button>
                  </div>
                </div>
                <textarea
                  required
                  rows={4}
                  value={formOnEvent}
                  onChange={(e) => setFormOnEvent(e.target.value)}
                  placeholder="مثال: /system reboot أو /system backup save name=backup1"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-slate-100 font-mono dir-ltr text-left focus:outline-none focus:border-blue-500 leading-relaxed"
                />
              </div>

              {/* Comment */}
              <div>
                <label className="text-slate-300 font-semibold mb-1.5 block">
                  الوصف أو الملاحظة (Comment):
                </label>
                <input
                  type="text"
                  value={formComment}
                  onChange={(e) => setFormComment(e.target.value)}
                  placeholder="وصف اختياري للمهمة وسبب جدولتها..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Policy Permissions */}
              <div>
                <label className="text-slate-300 font-semibold mb-1.5 block">
                  صلاحيات التنفيذ (RouterOS Policy):
                </label>
                <input
                  type="text"
                  value={formPolicy}
                  onChange={(e) => setFormPolicy(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-400 font-mono text-[11px]"
                />
              </div>

              {/* Disabled switch */}
              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="formDisabledCheck"
                  checked={!formDisabled}
                  onChange={(e) => setFormDisabled(!e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 bg-slate-950 border-slate-700 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="formDisabledCheck" className="text-slate-200 font-semibold cursor-pointer select-none">
                  تفعيل المهمة فور الحفظ (Enable Schedule Now)
                </label>
              </div>

              {/* Submit Buttons */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all shadow-lg shadow-blue-600/25 disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'جاري الحفظ...' : (editingTask ? 'حفظ التعديلات' : 'إضافة المهمة المجدولة')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Running Reboot Task */}
      {taskToRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <span className="p-2 rounded-xl bg-rose-500/15 border border-rose-500/30">
                <ShieldAlert className="w-6 h-6" />
              </span>
              <h3 className="text-base font-bold text-slate-100">تأكيد تنفيذ أمر إعادة التشغيل</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              تحتوي هذه المهمة على أمر إعادة تشغيل الراوتر (<code className="text-rose-400 font-mono font-bold">/system reboot</code>).
              تنفيذ هذا الأمر الآن سيؤدي لإعادة تشغيل الجهاز وانقطاع الاتصال المؤقت لبضع ثوان. هل أنت متأكد؟
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setTaskToRun(null)}
                disabled={!!runningTaskId}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => handleRunTask(taskToRun)}
                disabled={!!runningTaskId}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors shadow-lg shadow-rose-600/30 disabled:opacity-50"
              >
                {runningTaskId ? 'جاري التنفيذ...' : 'نعم، نفّذ الأمر الآن'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Single Task Confirmation Modal */}
      {taskToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <span className="p-2 rounded-xl bg-rose-500/15 border border-rose-500/30">
                <Trash2 className="w-6 h-6" />
              </span>
              <h3 className="text-base font-bold text-slate-100">حذف المهمة المجدولة</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              هل أنت متأكد من حذف المهمة المجدولة (<span className="font-bold font-mono text-white">{taskToDelete.name}</span>) من الراوتر؟
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setTaskToDelete(null)}
                disabled={isDeletingSingle}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isDeletingSingle}
                onClick={async () => {
                  setIsDeletingSingle(true);
                  try {
                    const res = await deleteScheduledTask(taskToDelete.id);
                    if (isMountedRef.current && res.success) setTaskToDelete(null);
                  } finally {
                    if (isMountedRef.current) setIsDeletingSingle(false);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors shadow-lg shadow-rose-600/30 disabled:opacity-50"
              >
                {isDeletingSingle ? 'جاري الحذف...' : 'حذف المهمة'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Delete Confirmation Modal */}
      {isBatchDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <span className="p-2 rounded-xl bg-rose-500/15 border border-rose-500/30">
                <Trash2 className="w-6 h-6" />
              </span>
              <h3 className="text-base font-bold text-slate-100">تأكيد الحذف الجماعي</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              هل أنت متأكد من حذف <span className="font-bold text-white font-mono">{selectedIds.length}</span> مهمة مجدولة محددة من الراوتر؟
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsBatchDeleteConfirmOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleBatchDeleteConfirm}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors shadow-lg shadow-rose-600/30"
              >
                حذف المحدد
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
