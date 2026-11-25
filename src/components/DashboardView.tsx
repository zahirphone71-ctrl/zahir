import React, { useMemo, useState } from 'react';
import { useMikroTik } from '../context/MikroTikContext';
import { TabType } from './Sidebar';
import {
  Users,
  Activity,
  Cpu,
  Layers,
  HardDrive,
  Sparkles,
  ArrowUpRight,
  Shield,
  Clock,
  Radio,
  Network,
  Terminal,
  ChevronLeft,
  Server,
  Wifi,
  BookmarkCheck,
  Gauge,
  FileText,
  Bot,
  Database,
  Sliders,
  CheckCircle2,
  FileDown,
  Thermometer,
  CalendarClock
} from 'lucide-react';
import { formatBytes, formatBps } from '../lib/formatters';
import { BandwidthAnalyticsSpikesMonitor } from './dashboard/BandwidthAnalyticsSpikesMonitor';
import { RouterResourcesMonitor } from './dashboard/RouterResourcesMonitor';
import { AutoPingStabilizerPanel } from './dashboard/AutoPingStabilizerPanel';
import { PdfExportModal } from './PdfExportModal';

interface DashboardViewProps {
  onNavigate: (tab: TabType) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const {
    router,
    isConnected,
    users,
    profiles,
    activeUsers,
    interfaces,
    pppSecrets,
    pppProfiles,
    pppActive,
    usermanUsers,
    usermanProfiles,
    usermanActive,
    simpleQueues,
    ipBindings,
    dhcpLeases,
    firewallRules,
    systemLogs,
    wirelessInterfaces,
    registrationTable,
    hotspotServerProfiles,
    scheduledTasks,
    ecoMode,
    setEcoMode,
    thermalShieldActive
  } = useMikroTik();

  const totalVouchers = useMemo(() => (users || []).filter((u) => u && u.isVoucher).length, [users]);
  const totalRevenue = useMemo(
    () => (users || []).reduce((acc, u) => acc + (Number(u?.price) || 0), 0),
    [users]
  );
  const wanInterface = useMemo(
    () => (interfaces || []).find((i) => i?.name?.toLowerCase().includes('wan') || i?.name?.toLowerCase().includes('ether1')) || (interfaces || [])[0],
    [interfaces]
  );
  const totalActiveSessions = activeUsers.length + pppActive.length + usermanActive.length;
  const totalProfilesCount = profiles.length + pppProfiles.length + usermanProfiles.length;
  const activeFirewallCount = useMemo(
    () => (firewallRules || []).filter((r) => !r.disabled).length,
    [firewallRules]
  );

  const cpuLoad = router?.cpuLoad || 0;
  const cpuColor =
    cpuLoad > 80 ? 'text-rose-400 bg-rose-500/10 border-rose-500/30' :
    cpuLoad > 50 ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' :
    'text-blue-400 bg-blue-500/10 border-blue-500/30';


  // All Tabs Monitoring Config with Live Metrics and Direct Navigation
  const monitoringCards = useMemo<Array<{
    id: TabType;
    title: string;
    category: string;
    description: string;
    operations: string[];
    icon: React.ComponentType<{ className?: string }>;
    accentColor: string;
    badgeBg: string;
    borderHover: string;
    primaryMetric: { label: string; value: string | number };
    secondaryMetric?: { label: string; value: string | number };
    statusText: string;
    statusColor: string;
  }>>(() => [
    {
      id: 'hotspot_users' as TabType,
      title: 'مستخدمي وبطاقات الهوتسبوت',
      category: 'إدارة المشتركين',
      description: 'مراقبة قاعدة بيانات مستخدمي وبطاقات شبكة الهوتسبوت والكروت المصدرة',
      operations: ['إضافة مشترك جديد', 'تعديل البيانات', 'تعليق / تفعيل', 'حذف وتصفير'],
      icon: Users,
      accentColor: 'text-blue-400',
      badgeBg: 'bg-blue-500/10 border-blue-500/30 text-blue-300',
      borderHover: 'hover:border-blue-500/60 hover:shadow-blue-900/20',
      primaryMetric: { label: 'إجمالي المشتركين', value: users.length },
      secondaryMetric: { label: 'كروت مولّدة', value: totalVouchers },
      statusText: users.length > 0 ? `${users.filter(u => !u.disabled).length} نشط / ${users.filter(u => u.disabled).length} معطل` : 'لا يوجد مشتركون بعد',
      statusColor: 'text-blue-400'
    },
    {
      id: 'active_sessions' as TabType,
      title: 'الجلسات المتصلة لحظياً',
      category: 'المراقبة المباشرة',
      description: 'مراقبة المستخدمين المتصلين حالياً بالشبكة وعناوين الـ IP واستهلاكهم',
      operations: ['مراقبة استهلاك البيانات', 'فصل الجلسات (Kick)', 'فحص الـ MAC Address'],
      icon: Activity,
      accentColor: 'text-emerald-400',
      badgeBg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
      borderHover: 'hover:border-emerald-500/60 hover:shadow-emerald-900/20',
      primaryMetric: { label: 'إجمالي المتصلين الآن', value: totalActiveSessions },
      secondaryMetric: { label: 'هوتسبوت / PPP', value: `${activeUsers.length} / ${pppActive.length}` },
      statusText: totalActiveSessions > 0
        ? `هوتسبوت: ${activeUsers.length} | PPP: ${pppActive.length} | UM: ${usermanActive.length}`
        : 'لا توجد جلسات نشطة حالياً',
      statusColor: totalActiveSessions > 0 ? 'text-emerald-400' : 'text-slate-400'
    },
    {
      id: 'profiles' as TabType,
      title: 'باقات السرعات والبروفايلات',
      category: 'البروفايلات والسرعات',
      description: 'مراقبة وتحديد باقات السرعة، حصص الجيجابايت، ومدد صلاحية الكروت',
      operations: ['إنشاء باقة سرعة', 'تحديد Rate Limit', 'ضبط مدة الصلاحية', 'تخصيص الأسعار'],
      icon: Sliders,
      accentColor: 'text-purple-400',
      badgeBg: 'bg-purple-500/10 border-purple-500/30 text-purple-300',
      borderHover: 'hover:border-purple-500/60 hover:shadow-purple-900/20',
      primaryMetric: { label: 'إجمالي الباقات', value: totalProfilesCount },
      secondaryMetric: { label: 'هوتسبوت', value: profiles.length },
      statusText: profiles.length > 0 ? `${profiles.map(p => p.name).slice(0, 3).join(', ')}${profiles.length > 3 ? '...' : ''}` : 'بروفايل default فقط',
      statusColor: 'text-purple-400'
    },
    {
      id: 'card_studio' as TabType,
      title: 'استوديو الكروت',
      category: 'توليد وتصميم وطباعة الكروت',
      description: 'مراقبة وتوليد كروت ذكية بتكرار صفري 100% مع محرر التصميم التفاعلي وطباعة A4 وحراري POS',
      operations: ['توليد كميات كروت ذكية', 'فحص التكرار الصفري 100%', 'محرر التصميم بالسحب والإفلات', 'طباعة A4 وحراري POS وتصدير'],
      icon: Sparkles,
      accentColor: 'text-amber-400',
      badgeBg: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
      borderHover: 'hover:border-amber-500/60 hover:shadow-amber-900/20',
      primaryMetric: { label: 'الكروت المصدرة', value: totalVouchers },
      secondaryMetric: { label: 'قيمة المبيعات', value: `${totalRevenue.toLocaleString()} ر.س` },
      statusText: 'استوديو الكروت جاهز للتوليد والتصميم والطباعة المباشرة',
      statusColor: 'text-amber-400'
    },
    {
      id: 'ppp' as TabType,
      title: 'اشتراكات البرودباند PPPoE / VPN',
      category: 'إدارة المشتركين',
      description: 'مراقبة خطوط المشتركين السلكية، حسابات PPPoE Secrets، وجلسات الأنفاق',
      operations: ['إضافة مشترك PPPoE', 'تحديد IP ثابت', 'فصل الجلسات النشطة', 'مراقبة استهلاك الخطوط'],
      icon: Network,
      accentColor: 'text-teal-400',
      badgeBg: 'bg-teal-500/10 border-teal-500/30 text-teal-300',
      borderHover: 'hover:border-teal-500/60 hover:shadow-teal-900/20',
      primaryMetric: { label: 'مشتركي PPPoE', value: pppSecrets.length },
      secondaryMetric: { label: 'متصل الآن', value: pppActive.length },
      statusText: pppActive.length > 0 ? `${pppActive.length} جلسة PPPoE متصلة` : 'لا توجد اتصالات PPPoE حالياً',
      statusColor: 'text-teal-400'
    },
    {
      id: 'userman' as TabType,
      title: 'إدارة اليوزر مانجر (User Manager)',
      category: 'إدارة المشتركين',
      description: 'مراقبة قاعدة بيانات مشتركي اليوزر مانجر المتقدمة وبطاقات Radius',
      operations: ['إدارة حسابات Radius', 'توليد كروت UM', 'تحديد الحصص والصلاحية', 'تتبع الاستهلاك'],
      icon: Shield,
      accentColor: 'text-violet-400',
      badgeBg: 'bg-violet-500/10 border-violet-500/30 text-violet-300',
      borderHover: 'hover:border-violet-500/60 hover:shadow-violet-900/20',
      primaryMetric: { label: 'مشتركي Userman', value: usermanUsers.length },
      secondaryMetric: { label: 'البروفايلات', value: usermanProfiles.length },
      statusText: usermanUsers.length > 0
        ? `${usermanUsers.length} مشترك | ${usermanActive.length} متصل الآن`
        : 'لا يوجد مشتركون في اليوزر مانجر',
      statusColor: 'text-violet-400'
    },
    {
      id: 'traffic',
      title: 'حركة وسرعة المنافذ (Traffic)',
      category: 'المراقبة المباشرة',
      description: 'مراقبة حية لحظية لمعدل سحب البيانات (Rx/Tx) وسرعة المنافذ السلكية واللاسلكية',
      operations: ['مراقبة المنافذ النشطة', 'تحليل استهلاك WAN / LAN', 'فحص الباكتات والأخطاء'],
      icon: ArrowUpRight,
      accentColor: 'text-cyan-400',
      badgeBg: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300',
      borderHover: 'hover:border-cyan-500/60 hover:shadow-cyan-900/20',
      primaryMetric: { label: 'المنافذ العاملة', value: interfaces.filter(i => i.running).length },
      secondaryMetric: { label: 'إجمالي المنافذ', value: interfaces.length },
      statusText: wanInterface ? `WAN Rx: ${formatBps(wanInterface.rxBps)} | Tx: ${formatBps(wanInterface.txBps)}` : 'المنافذ قيد المراقبة',
      statusColor: 'text-cyan-400'
    },
    {
      id: 'queues',
      title: 'تحديد وتوزيع السرعات (Queues)',
      category: 'البروفايلات والسرعات',
      description: 'مراقبة وتوزيع سرعات التحميل والرفع للأجهزة وشبكات الهوتسبوت والمواقع',
      operations: ['إضافة Simple Queue', 'تحديد Target IP / Subnet', 'ضبط Max Limit', 'تحديد الأولويات'],
      icon: Gauge,
      accentColor: 'text-pink-400',
      badgeBg: 'bg-pink-500/10 border-pink-500/30 text-pink-300',
      borderHover: 'hover:border-pink-500/60 hover:shadow-pink-900/20',
      primaryMetric: { label: 'قواعد السرعة', value: simpleQueues.length },
      secondaryMetric: { label: 'المسارات المحددة', value: simpleQueues.length },
      statusText: simpleQueues.length > 0 ? `${simpleQueues.length} قواعد سرعة نشطة` : 'لا توجد قواعد سرعة مخصصة',
      statusColor: 'text-pink-400'
    },
    {
      id: 'network_center',
      title: 'الشبكة والوايرلس (SSID & Antennas)',
      category: 'الشبكة والأمان',
      description: 'قراءة شبكات البث SSID في المايكروتك، الأنتنات المتصلة، وبوابات تسجيل الدخول',
      operations: ['قراءة وتعديل اسم الشبكة SSID', 'مراقبة إشارة الأنتنات المتصلة', 'فصل المحطات الضعيفة', 'إدارة صفحات وقوالب الدخول'],
      icon: Radio,
      accentColor: 'text-indigo-400',
      badgeBg: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300',
      borderHover: 'hover:border-indigo-500/60 hover:shadow-indigo-900/20',
      primaryMetric: { label: 'شبكات البث', value: wirelessInterfaces.length },
      secondaryMetric: { label: 'أنتنات متصلة', value: registrationTable.length },
      statusText: `${wirelessInterfaces.length} شبكات بث | ${hotspotServerProfiles.length} بروفايلات بوابة`,
      statusColor: 'text-indigo-400'
    },
    {
      id: 'dhcp',
      title: 'سيرفر DHCP وحجز العناوين',
      category: 'الشبكة والأمان',
      description: 'مراقبة توزيع عناوين IP على الأجهزة المتصلة وحجز العناوين الثابتة (Static Leases)',
      operations: ['فحص الأجهزة المتصلة', 'تثبيت IP للجهاز (Make Static)', 'حذف وحظر العناوين', 'فحص وقت الانتهاء'],
      icon: Network,
      accentColor: 'text-sky-400',
      badgeBg: 'bg-sky-500/10 border-sky-500/30 text-sky-300',
      borderHover: 'hover:border-sky-500/60 hover:shadow-sky-900/20',
      primaryMetric: { label: 'عناوين الأجهزة', value: dhcpLeases.length },
      secondaryMetric: { label: 'حجز ثابت Static', value: dhcpLeases.filter(d => !d.isDynamic).length },
      statusText: dhcpLeases.length > 0 ? `${dhcpLeases.length} جهاز حاصل على IP` : 'لا توجد أجهزة مسجلة في DHCP',
      statusColor: 'text-sky-400'
    },
    {
      id: 'ip_binding',
      title: 'الأجهزة المستثناة (IP Binding)',
      category: 'البروفايلات والسرعات',
      description: 'مراقبة وتجاوز صفحة تسجيل الدخول للشاشات الذكية والكاميرات وحظر أجهزة الاختراق',
      operations: ['استثناء جهاز (Bypassed)', 'حظر جهاز نهائياً (Blocked)', 'تحديد الـ MAC و IP'],
      icon: BookmarkCheck,
      accentColor: 'text-orange-400',
      badgeBg: 'bg-orange-500/10 border-orange-500/30 text-orange-300',
      borderHover: 'hover:border-orange-500/60 hover:shadow-orange-900/20',
      primaryMetric: { label: 'أجهزة مستثناة / محظورة', value: ipBindings.length },
      secondaryMetric: { label: 'Bypassed', value: ipBindings.filter(b => b.type === 'bypassed').length },
      statusText: ipBindings.length > 0 ? `${ipBindings.filter(b => b.type === 'bypassed').length} مستثنى / ${ipBindings.filter(b => b.type === 'blocked').length} محظور` : 'لا توجد استثناءات مسجلة',
      statusColor: 'text-orange-400'
    },
    {
      id: 'firewall',
      title: 'الجدار الناري والأمان',
      category: 'الشبكة والأمان',
      description: 'مراقبة قواعد حماية الراوتر، منع الاختراق وهجمات DoS، وتسريع FastTrack',
      operations: ['تطبيق الحماية السريعة', 'تفعيل FastTrack', 'حظر فحص المنافذ', 'حماية مدخل DNS'],
      icon: Shield,
      accentColor: 'text-rose-400',
      badgeBg: 'bg-rose-500/10 border-rose-500/30 text-rose-300',
      borderHover: 'hover:border-rose-500/60 hover:shadow-rose-900/20',
      primaryMetric: { label: 'قواعد الحماية', value: firewallRules.length },
      secondaryMetric: { label: 'حالة الأمان', value: activeFirewallCount > 0 ? `مفعل (${activeFirewallCount})` : 'غير مفعل' },
      statusText: firewallRules.length > 0 ? `${activeFirewallCount} قاعدة نشطة من أصل ${firewallRules.length}` : 'لا توجد قواعد فلترة مخصصة',
      statusColor: activeFirewallCount > 0 ? 'text-rose-400' : 'text-amber-400'
    },
    {
      id: 'logs',
      title: 'سجل الأحداث والعمليات (Logs)',
      category: 'أدوات النظام',
      description: 'مراقبة فورية لسجلات النظام وأحداث دخول وخروج المشتركين وتنبيهات الأمان',
      operations: ['استعراض سجلات الدخول', 'تصفية حسب الخطورة', 'تتبع رسائل الأخطاء', 'تصدير السجلات'],
      icon: FileText,
      accentColor: 'text-slate-300',
      badgeBg: 'bg-slate-800 border-slate-700 text-slate-300',
      borderHover: 'hover:border-slate-600 hover:shadow-slate-900/20',
      primaryMetric: { label: 'سجلات الأحداث', value: systemLogs.length },
      secondaryMetric: { label: 'حالة التسجيل', value: 'حي' },
      statusText: systemLogs.length > 0 ? `${systemLogs.length} سجل مسجل في الراوتر` : 'لا توجد سجلات جديدة',
      statusColor: 'text-slate-400'
    },
    {
      id: 'terminal',
      title: 'طرفية الأوامر (Terminal CLI)',
      category: 'أدوات النظام',
      description: 'تنفيذ أوامر RouterOS CLI البرمجية واستخراج بيانات الراوتر بشكل فوري ومباشر',
      operations: ['تنفيذ أوامر RouterOS', 'استخراج export الإعدادات', 'فحص المنافذ والـ Ping', 'تطبيق سكربتات'],
      icon: Terminal,
      accentColor: 'text-lime-400',
      badgeBg: 'bg-lime-500/10 border-lime-500/30 text-lime-300',
      borderHover: 'hover:border-lime-500/60 hover:shadow-lime-900/20',
      primaryMetric: { label: 'حالة الطرفية', value: 'متصلة' },
      secondaryMetric: { label: 'بروتوكول', value: 'RouterOS CLI' },
      statusText: 'جاهزة لإدخال وتنفيذ الأوامر الفورية',
      statusColor: 'text-lime-400'
    },
    {
      id: 'ai_assistant',
      title: 'المساعد الذكي (Gemini AI)',
      category: 'أدوات النظام',
      description: 'مستشار الذكاء الاصطناعي لتحليل أداء الشبكة، كشف المشاكل وتوليد سكربتات RouterOS',
      operations: ['تحليل أداء الراوتر', 'توليد سكربتات حماية مخصصة', 'اقتراح حلول للأعطال', 'استشارات الشبكة'],
      icon: Bot,
      accentColor: 'text-purple-400',
      badgeBg: 'bg-purple-500/10 border-purple-500/30 text-purple-300',
      borderHover: 'hover:border-purple-500/60 hover:shadow-purple-900/20',
      primaryMetric: { label: 'محرك AI', value: 'Gemini Pro' },
      secondaryMetric: { label: 'التشخيص', value: 'جاهز' },
      statusText: 'جاهز للإجابة وتقديم التوصيات والسكربتات',
      statusColor: 'text-purple-400'
    },
    {
      id: 'backup',
      title: 'النسخ الاحتياطي والضبط',
      category: 'أدوات النظام',
      description: 'مراقبة وضبط خيارات النسخ الاحتياطي الثنائي، تصدير ملفات RSC واستعادة الإعدادات',
      operations: ['تصدير نسخة Backup ثنائية', 'تصدير سكربت RSC نصي', 'استعادة النسخ السابقة', 'إعادة ضبط'],
      icon: HardDrive,
      accentColor: 'text-indigo-400',
      badgeBg: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300',
      borderHover: 'hover:border-indigo-500/60 hover:shadow-indigo-900/20',
      primaryMetric: { label: 'النسخ الاحتياطي', value: 'آمن' },
      secondaryMetric: { label: 'التنسيق', value: 'RSC / Backup' },
      statusText: 'تصدير فوري وتأمين إعدادات الراوتر',
      statusColor: 'text-indigo-400'
    },
    {
      id: 'scheduled_tasks',
      title: 'جدولة المهام (Scheduled Tasks)',
      category: 'أدوات النظام',
      description: 'جدولة مهام الصيانة التلقائية للراوتر: إعادة التشغيل اليومي، النسخ الاحتياطي التلقائي، وتنظيف الكروت',
      operations: ['إعادة التشغيل اليومي التلقائي', 'النسخ الاحتياطي المجدول', 'حذف الكروت المنتهية', 'تفريغ كاش DNS'],
      icon: CalendarClock,
      accentColor: 'text-amber-400',
      badgeBg: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
      borderHover: 'hover:border-amber-500/60 hover:shadow-amber-900/20',
      primaryMetric: { label: 'المهام النشطة', value: scheduledTasks.filter(t => !t.disabled).length },
      secondaryMetric: { label: 'إجمالي المهام', value: scheduledTasks.length },
      statusText: scheduledTasks.some(t => t.name.toLowerCase().includes('reboot') && !t.disabled) ? 'إعادة التشغيل اليومي مجدولة نشطة ✓' : 'جاهز لجدولة المهام',
      statusColor: 'text-amber-400'
    }
  ], [
    users,
    totalVouchers,
    totalRevenue,
    totalActiveSessions,
    activeUsers.length,
    totalProfilesCount,
    profiles,
    pppSecrets.length,
    pppActive.length,
    usermanUsers.length,
    usermanProfiles.length,
    usermanActive.length,
    interfaces,
    wanInterface,
    simpleQueues.length,
    ipBindings.length,
    dhcpLeases.length,
    firewallRules,
    activeFirewallCount,
    systemLogs.length,
    wirelessInterfaces.length,
    registrationTable.length,
    hotspotServerProfiles.length,
    scheduledTasks
  ]);

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-200" dir="rtl">
      {/* Central Monitoring Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900/95 to-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl backdrop-blur-md relative overflow-hidden">
        {/* Glow Accent */}
        <div className="absolute top-0 right-0 w-96 h-48 bg-blue-600/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5 relative z-10">
          {/* Router Identity and Live State */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-xl shadow-blue-600/30 border border-blue-400/40 shrink-0">
              <Radio className="w-7 h-7 animate-pulse" />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight">
                  لوحة المراقبة المركزية
                </h1>
                <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40" dir="ltr">
                  {router?.name || 'MikroTik Router'}
                </span>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  مراقبة حية نشطة
                </span>
                <button
                  type="button"
                  onClick={() => setIsPdfModalOpen(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-xl bg-gradient-to-r from-rose-500/15 to-red-500/15 hover:from-rose-500/25 hover:to-red-500/25 text-rose-300 hover:text-white border border-rose-500/30 transition-all cursor-pointer shadow-xs active:scale-95"
                  title="تصدير بيانات لوحة المراقبة الشاملة كتقرير PDF منسق"
                >
                  <FileDown className="w-3.5 h-3.5 text-rose-400" />
                  <span>تصدير تقرير PDF</span>
                </button>
              </div>

              <p className="text-xs text-slate-400 mt-1">
                استعراض ومراقبة شاملة لكافة أقسام وعمليات السيرفر — انقر على أي قسم للدخول إليه والتحكم في إعداداته وإجراءاته
              </p>

              <div className="text-xs text-slate-400 mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-slate-500" />
                  الموديل: <strong className="text-slate-200 font-mono">{router?.boardName || 'RouterBOARD'}</strong>
                </span>
                <span className="text-slate-700 hidden sm:inline">•</span>
                <span className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-400" />
                  إصدار RouterOS: <strong className="text-blue-300 font-mono" dir="ltr">{router?.version || 'v7.x'}</strong>
                </span>
                <span className="text-slate-700 hidden sm:inline">•</span>
                <span className="flex items-center gap-1.5">
                  {router?.hasInternet ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                      <Wifi className="w-3.5 h-3.5" />
                      الإنترنت متصل بالراوتر {router?.pingMs !== undefined ? `(${router.pingMs}ms)` : ''}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                      <Wifi className="w-3.5 h-3.5 text-amber-400" />
                      بانتظار وصول الإنترنت للـ WAN
                    </span>
                  )}
                </span>
                {router?.wanIp && (
                  <>
                    <span className="text-slate-700 hidden sm:inline">•</span>
                    <span className="flex items-center gap-1.5 text-slate-300 font-mono text-[11px]" dir="ltr">
                      WAN: {router.wanIp}
                    </span>
                  </>
                )}
                <span className="text-slate-700 hidden sm:inline">•</span>
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  وقت التشغيل: <strong className="text-slate-200 font-mono">{router?.uptime || '0s'}</strong>
                </span>
                <span className="text-slate-700 hidden sm:inline">•</span>
                <span className="flex items-center gap-1.5 font-mono text-slate-400" dir="ltr">
                  {router?.host || '192.168.88.1'}:{router?.port || 8728}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Hardware Gauges */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* CPU Gauge */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3 text-right min-w-[130px]">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
                <span className="flex items-center gap-1">
                  <Cpu className="w-3.5 h-3.5 text-blue-400" />
                  معالج CPU
                </span>
                <span className="font-mono font-bold text-slate-200">{cpuLoad}%</span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    cpuLoad > 80 ? 'bg-rose-500' : cpuLoad > 50 ? 'bg-amber-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(5, cpuLoad))}%` }}
                />
              </div>
            </div>

            {/* RAM Gauge */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3 text-right min-w-[130px]">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
                <span className="flex items-center gap-1">
                  <Database className="w-3.5 h-3.5 text-indigo-400" />
                  الذاكرة الحرة
                </span>
                <span className="font-mono tabular-nums font-bold text-indigo-300" dir="ltr">
                  {router?.freeMemory ? formatBytes(router.freeMemory, 0) : (isConnected ? '-' : '0 B')}
                </span>
              </div>
              <div className="text-[10px] text-slate-500 font-mono tabular-nums" dir="ltr">
                Total: {router?.totalMemory ? formatBytes(router.totalMemory, 0) : (isConnected ? '-' : '0 B')}
              </div>
            </div>

            {/* Router Temperature Gauge & Zero-Heat Guard */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3 text-right min-w-[150px]">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
                <span className="flex items-center gap-1">
                  <Thermometer className={`w-3.5 h-3.5 ${
                    (router?.cpuTemperature && router.cpuTemperature > 65) ? 'text-rose-400' :
                    (router?.cpuTemperature && router.cpuTemperature > 55) ? 'text-amber-400' :
                    'text-emerald-400'
                  }`} />
                  حرارة الراوتر
                </span>
                <span className="font-mono tabular-nums font-bold text-slate-200" dir="ltr">
                  {router?.cpuTemperature ? `${router.cpuTemperature}°C` : (router?.boardTemperature ? `${router.boardTemperature}°C` : 'غير مدعوم')}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] mt-1">
                <span className={ecoMode || thermalShieldActive ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                  {ecoMode || thermalShieldActive ? 'درع التبريد نشط ✓' : (router?.cpuTemperature || router?.boardTemperature ? 'حرارة طبيعية' : 'حماية الموارد نشطة')}
                </span>
                <button
                  type="button"
                  onClick={() => setEcoMode(!ecoMode)}
                  className="text-[10px] text-blue-400 hover:text-blue-300 font-medium underline cursor-pointer"
                >
                  {ecoMode ? 'إلغاء' : 'تفعيل التبريد'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Auto-Ping & CPU Stabilizer Control Panel */}
      <AutoPingStabilizerPanel />

      {/* Real-time Router Resources (CPU/RAM) Interactive Monitor with Recharts */}
      <RouterResourcesMonitor />

      {/* Real-time Bandwidth Analytics & Abnormal Spikes Detection Module */}
      <BandwidthAnalyticsSpikesMonitor
        onNavigateToSessions={() => onNavigate('active_sessions')}
        onNavigateToQueues={() => onNavigate('queues')}
      />

      {/* Main Monitoring & Section Hub Grid (شبكة مراقبة الأقسام والعمليات) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-extrabold text-slate-100">
              شبكة مراقبة الأقسام والعمليات المتاحة
            </h2>
          </div>
          <span className="text-xs text-slate-400">
            انقر على أي بطاقة للدخول للتبويبة والتحكم في عملياتها
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {monitoringCards.map((card) => {
            const CardIcon = card.icon;
            return (
              <div
                key={card.id}
                id={`monitoring-hub-card-${card.id}`}
                role="button"
                tabIndex={0}
                onClick={() => onNavigate(card.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onNavigate(card.id);
                  }
                }}
                className={`bg-slate-900/90 border border-slate-800 rounded-3xl p-5 transition-all cursor-pointer group shadow-xl flex flex-col justify-between relative overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-500/60 ${card.borderHover}`}
              >
                <div>
                  {/* Card Header: Icon + Category Badge + Primary Metric */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-3 rounded-2xl border ${card.badgeBg} group-hover:scale-110 transition-transform`}>
                        <CardIcon className={`w-5 h-5 ${card.accentColor}`} />
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          {card.category}
                        </span>
                        <h3 className="font-extrabold text-sm text-slate-100 group-hover:text-white transition-colors">
                          {card.title}
                        </h3>
                      </div>
                    </div>

                    <div className="text-left shrink-0">
                      <span className="text-xl font-black font-mono text-slate-100 block" dir="ltr">
                        {card.primaryMetric.value}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {card.primaryMetric.label}
                      </span>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">
                    {card.description}
                  </p>

                  {/* Live Status Pill */}
                  <div className="mt-3 py-1 px-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">الحالة:</span>
                    <span className={`font-semibold truncate max-w-[180px] ${card.statusColor}`}>
                      {card.statusText}
                    </span>
                  </div>

                  {/* Operations Checklist Preview */}
                  <div className="mt-3 pt-2.5 border-t border-slate-800/60 space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 block mb-1">
                      العمليات المتاحة داخل التبويبة:
                    </span>
                    <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-300">
                      {card.operations.slice(0, 4).map((op, idx) => (
                        <div key={idx} className="flex items-center gap-1 truncate text-slate-300">
                          <CheckCircle2 className="w-3 h-3 text-slate-500 shrink-0" />
                          <span className="truncate">{op}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Card Action Link Footer */}
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-bold text-blue-400 group-hover:text-blue-300 transition-colors">
                  <span>دخول التبويبة والتحكم</span>
                  <div className="flex items-center gap-1 group-hover:-translate-x-1 transition-transform">
                    <span>فتح</span>
                    <ChevronLeft className="w-4 h-4" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Formatted Dashboard PDF Export Modal */}
      <PdfExportModal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
        activeTab="dashboard"
        customTitle="تقرير لوحة المراقبة الشاملة"
      />
    </div>
  );
};
