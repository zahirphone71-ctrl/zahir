import React, { useState } from 'react';
import {
  BookOpen,
  LayoutDashboard,
  Users,
  Sliders,
  Sparkles,
  Shield,
  HardDrive,
  Terminal,
  HelpCircle,
  Cpu,
  Search,
  CheckCircle,
  Network,
  Zap,
  Printer,
  FileText,
  AlertOctagon,
  Lock,
  ArrowLeftRight
} from 'lucide-react';

type GuideSection =
  | 'overview'
  | 'startup'
  | 'dashboard'
  | 'subscribers'
  | 'profiles_queues'
  | 'card_studio'
  | 'network_firewall'
  | 'backups';

export const UserGuideView: React.FC = () => {
  const [activeSection, setActiveSection] = useState<GuideSection>('overview');
  const [searchQuery, setSearchQuery] = useState('');

  const sections = [
    {
      id: 'overview' as GuideSection,
      title: 'مقدمة ونظرة عامة',
      desc: 'فلسفة التطبيق وآلية الربط الحقيقي بالمايكروتك',
      icon: BookOpen,
      color: 'text-blue-400 bg-blue-500/10'
    },
    {
      id: 'startup' as GuideSection,
      title: 'خطوات التشغيل والاتصال لأول مرة',
      desc: 'تجهيز الراوتر، بورت API، وربط ZCtrl بالشبكة',
      icon: Zap,
      color: 'text-amber-400 bg-amber-500/10'
    },
    {
      id: 'dashboard' as GuideSection,
      title: 'لوحة المراقبة والترافيك المباشر',
      desc: 'تحليل الموارد، استهلاك CPU، ومخططات المنافذ الحية',
      icon: LayoutDashboard,
      color: 'text-cyan-400 bg-cyan-500/10'
    },
    {
      id: 'subscribers' as GuideSection,
      title: 'إدارة المشتركين والجلسات الحية',
      desc: 'إنشاء كروت الهوتسبوت، جلسات active، وطرد الحسابات المعلقة',
      icon: Users,
      color: 'text-indigo-400 bg-indigo-500/10'
    },
    {
      id: 'profiles_queues' as GuideSection,
      title: 'البروفايلات وتحديد السرعة (Queues)',
      desc: 'تحديد سرعات الباقات، الماك أدرس المشترك، والتحكم في التدفق',
      icon: Sliders,
      color: 'text-purple-400 bg-purple-500/10'
    },
    {
      id: 'card_studio' as GuideSection,
      title: 'استوديو التوليد المتقدم وطباعة الكروت',
      desc: 'توليد الكروت عشوائياً، قوالب A4 الفاخرة، والإيصالات الحرارية POS',
      icon: Sparkles,
      color: 'text-emerald-400 bg-emerald-500/10'
    },
    {
      id: 'network_firewall' as GuideSection,
      title: 'أدوات الحماية، الـ VLAN، وجدار الحماية',
      desc: 'عزل الخدمات، تصفية الفايروال، حجز الـ Static IP، والـ IP Binding',
      icon: Shield,
      color: 'text-rose-400 bg-rose-500/10'
    },
    {
      id: 'backups' as GuideSection,
      title: 'النسخ الاحتياطي والطرفية والمساعد AI',
      desc: 'تصدير ملفات .backup و .rsc، كتابة الأوامر، والاستشارات الفنية الذكية',
      icon: HardDrive,
      color: 'text-slate-400 bg-slate-500/10'
    }
  ];

  const filteredSections = sections.filter(
    (s) =>
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.desc.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2.5 animate-pulse">
            <BookOpen className="w-6 h-6 text-emerald-400" />
            <span>دليل المستخدم المتقدم والتشغيل الفني (User Guide)</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            دليل تشغيل شامل يعرّفك بدقة متناهية على جميع تفاصيل ZCtrl وكيفية التحكم بسيرفر المايكروتك دون ثغرات أو بيانات مكررة
          </p>
        </div>

        {/* Quick Guide Search */}
        <div className="relative w-full sm:w-72 shrink-0">
          <Search className="w-4 h-4 absolute right-3.5 top-2.5 text-slate-500" />
          <input
            type="text"
            placeholder="ابحث في دليل التشغيل الفني..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pr-10 pl-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 font-medium"
          />
        </div>
      </div>

      {/* Main Container */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Right Navigation List */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-1.5 shadow-xl">
          <div className="px-3 py-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            فهرس أقسام التشغيل
          </div>
          {filteredSections.length === 0 ? (
            <div className="p-6 text-center space-y-2.5 text-xs text-slate-400">
              <p>لا توجد أقسام مطابقة لعبارة البحث &quot;{searchQuery}&quot;</p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-bold transition-colors cursor-pointer"
              >
                إعادة ضبط البحث
              </button>
            </div>
          ) : (
            filteredSections.map((sec) => {
              const Icon = sec.icon;
              const isActive = activeSection === sec.id;
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => setActiveSection(sec.id)}
                  className={`w-full flex items-start gap-3 p-3 rounded-xl text-right transition-all cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/10 font-bold'
                      : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                  }`}
                >
                  <div className={`p-2 rounded-lg shrink-0 ${isActive ? 'bg-white/20 text-white' : sec.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold">{sec.title}</div>
                    <div className={`text-[10px] mt-0.5 truncate ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>
                      {sec.desc}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Left Detailed Guide Content */}
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-6">
          {/* Section Header */}
          <div className="border-b border-slate-800/80 pb-4">
            <h2 className="text-sm font-bold text-blue-300 flex items-center gap-2">
              <CheckCircle className="w-4.5 h-4.5 text-blue-400" />
              <span>{sections.find((s) => s.id === activeSection)?.title}</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1 font-medium">
              {sections.find((s) => s.id === activeSection)?.desc}
            </p>
          </div>

          {/* Detailed Sections */}
          {activeSection === 'overview' && (
            <div className="space-y-5 text-xs text-slate-300 leading-relaxed">
              <p>
                مرحبًا بك في <strong>ZCtrl (زاهر كنترول)</strong>، المنظومة المتكاملة لإدارة ومزامنة خوادم مايكروتك <strong>MikroTik RouterOS</strong> من خلال واجهة ويب سريعة وعصرية مبنية لمدراء الشبكات والمهندسين وأصحاب شبكات الهوتسبوت المحلية.
              </p>

              <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-2xl space-y-2">
                <div className="font-bold text-slate-100 text-xs flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-emerald-400" />
                  <span>🔒 مبدأ المزامنة الحقيقية والمنع المطلق للبيانات الوهمية</span>
                </div>
                <p className="text-slate-400">
                  يقوم ZCtrl بالربط الفعلي والمباشر بقاعدة بيانات المايكروتك من خلال بروتوكول <strong>RouterOS API (منفذ 8728)</strong>. خلافاً للبرامج التجارية، لا يعرض ZCtrl أي بيانات وهمية أو كروت تخيلية غير موجودة في الذاكرة الحقيقية للراوتر. جميع العمليات تعكس بدقة متناهية الإعدادات الفعلية للشبكة لتجنب أي مشاكل بالاتصال أو تراكم الكروت الوهمية.
                </p>
              </div>

              <div className="space-y-2">
                <div className="font-bold text-slate-200">السياسة الصارمة للحذف والضبط اليدوي:</div>
                <ul className="list-disc pr-5 space-y-1.5 text-slate-400">
                  <li><strong>موافقة المدير أولاً:</strong> لن يقوم التطبيق بحذف أي كرت، مشترك، جلسة، بروفايل، أو حجز DHCP آلياً أبداً. كل عملية حذف تتطلب تأكيداً يدوياً صريحاً من المدير قبل التنفيذ على الراوتر.</li>
                  <li><strong>تنظيف العمليات العشوائية:</strong> يقوم النظام بالتحقق المستمر لضمان عدم وجود ملفات معلقة أو مشوهة بقاعدة بيانات الراوتر.</li>
                  <li><strong>أداء بلا تشنج:</strong> تمت هيكلة الواجهة لتخزين البيانات محلياً وتحديثها تدريجياً لتعمل بسرعة وسلاسة متناهية حتى على الأجهزة ذات الموارد المحدودة.</li>
                </ul>
              </div>
            </div>
          )}

          {activeSection === 'startup' && (
            <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
              <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl space-y-2 text-slate-400">
                <div className="font-bold text-amber-400 flex items-center gap-1.5 text-xs">
                  <AlertOctagon className="w-4 h-4" />
                  <span>المتطلبات الأساسية على راوتر مايكروتك (WinBox)</span>
                </div>
                <p>
                  قبل محاولة الاتصال عبر ZCtrl، يجب عليك التأكد من تفعيل منفذ الـ API في المايكروتك لديك. اتبع الخطوات التالية:
                </p>
                <ol className="list-decimal pr-5 space-y-1">
                  <li>افتح برنامج <strong>WinBox</strong> واتصل بالراوتر كمسؤول.</li>
                  <li>توجه إلى القائمة الجانبية: <strong>IP</strong> ثم اختر <strong>Services</strong>.</li>
                  <li>ابحث عن خدمة <strong>api</strong> (المنفذ الافتراضي 8728)، وتأكد أنها مفعلة (غير معطلة بلون رمادي).</li>
                  <li>إذا كنت تريد الاتصال الآمن والمشفر، قم بتفعيل منفذ <strong>api-ssl</strong> (المنفذ 8729).</li>
                </ol>
              </div>

              <div className="space-y-2">
                <div className="font-bold text-slate-200">خطوات الاتصال والتشغيل لأول مرة:</div>
                <div className="space-y-3">
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <span className="font-bold text-blue-400 block mb-1">الخطوة 1: إدخال بيانات السيرفر</span>
                    <p className="text-slate-400 text-[11px]">
                      أدخل آي بي الراوتر (مثال: 192.168.88.1) أو نطاق الدومين الخاص بك، ثم بورت الاتصال (8728 للـ API العادي)، واسم مستخدم الراوتر وكلمة المرور في شاشة الدخول الموحدة والنظيفة.
                    </p>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <span className="font-bold text-blue-400 block mb-1">الخطوة 2: اختبار وفحص الاتصال</span>
                    <p className="text-slate-400 text-[11px]">
                      بمجرد الضغط على زر "الاتصال والربط الحقيقي"، سيقوم البرنامج بالتحقق الفوري من سلامة الاتصال وجلب موارد السيرفر، وتحويلك تلقائياً إلى لوحة التحكم الرئيسية بدون إعادة تحميل الصفحة.
                    </p>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <span className="font-bold text-blue-400 block mb-1">الخطوة 3: تحديد تردد المزامنة المفضل</span>
                    <p className="text-slate-400 text-[11px]">
                      توجه إلى تبويبة "الإعدادات" ثم "تردد المزامنة" لتحديد كم مرة يقوم البرنامج بجلب التحديثات من الراوتر. يمكنك تركها على الخيار "الذكي والمتوازن" للحفاظ على كفاءة معالج المايكروتك لديك.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'dashboard' && (
            <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
              <div className="space-y-2">
                <div className="font-bold text-slate-200">1. لوحة المراقبة السريعة (Resource Board):</div>
                <p className="text-slate-400">
                  تستدعي هذه النافذة بانتظام أمر <code className="font-mono bg-slate-950 px-1.5 py-0.5 rounded text-blue-400">/system/resource/print</code> لعرض قراءات حقيقية للمعالج (CPU)، الذاكرة المتوفرة (RAM)، القرص الصلب (HDD)، ووقت تشغيل الراوتر منذ آخر إعادة تشغيل (Uptime).
                </p>
              </div>

              <div className="space-y-2">
                <div className="font-bold text-slate-200">2. مخططات الترافيك المباشرة (Live Traffic Graphs):</div>
                <p className="text-slate-400">
                  يتم سحب الترافيك المباشر لحظة بلحظة باستخدام أمر المايكروتك <code className="font-mono bg-slate-950 px-1.5 py-0.5 rounded text-blue-400">/interface/monitor-traffic</code>. يعرض هذا المخطط حجم الرفع (Tx) والتحميل (Rx) الفعلي على المنافذ المختارة مثل (ether1, sfp-sfpplus1) وغيرها، مما يتيح لك معرفة وقت ذروة الاستهلاك فورياً وتحديد الاختناقات في السحب بالشبكة.
                </p>
              </div>

              <div className="p-3.5 bg-blue-950/20 border border-blue-500/20 text-blue-300 rounded-xl">
                <strong>💡 تلميح الأداء الفائق:</strong> تم تصميم الرسوم البيانية لتحديث نفسها في الخلفية بسلاسة تامة، مما يضمن خلو التطبيق من أي ثقل أو بطء أثناء تصفح التبويبات الأخرى.
              </div>
            </div>
          )}

          {activeSection === 'subscribers' && (
            <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
              <div className="space-y-2">
                <div className="font-bold text-slate-200">1. إدارة مستخدمي الهوتسبوت (Hotspot Users):</div>
                <p className="text-slate-400">
                  يتعامل مع مسار <code className="font-mono bg-slate-950 px-1.5 py-0.5 rounded text-blue-400">/ip/hotspot/user</code>. يمكنك إجراء العمليات التالية:
                </p>
                <ul className="list-disc pr-5 text-slate-400 space-y-1">
                  <li><strong>إضافة مشترك جديد:</strong> تحديد اسم الكود، كلمة المرور، البروفايل، وتعيين الماك أدرس لربط الكرت بجهاز محدد فوراً.</li>
                  <li><strong>إيقاف وتفعيل المشترك:</strong> تعطيل الكروت يدوياً دون حذفها لتمكين استخدامها لاحقاً.</li>
                  <li><strong>الحذف النهائي للكرت:</strong> إرسال أمر إزالة الكرت من السيرفر نهائياً بعد موافقة وتأكيد يدوي من المدير لمنع الفقد العشوائي.</li>
                </ul>
              </div>

              <div className="space-y-2">
                <div className="font-bold text-slate-200">2. مراقبة الجلسات النشطة (Active Hotspot Sessions):</div>
                <p className="text-slate-400">
                  مرتبط بمسار <code className="font-mono bg-slate-950 px-1.5 py-0.5 rounded text-blue-400">/ip/hotspot/active</code>. يعرض المستخدمين المتصلين فعلياً بالشبكة الآن وعناوين الـ IP والـ MAC الخاصة بأجهزتهم ووقت الاتصال الفعلي وسحب البيانات. يحتوي على زر "فصل وطرد" الذي ينفذ أمر الحذف للجلسة ليرغم العميل على إعادة تسجيل الدخول (Kick).
                </p>
              </div>

              <div className="space-y-2">
                <div className="font-bold text-slate-200">3. كروت البرودباند واليوزر مانجر (PPPoE & User Manager):</div>
                <p className="text-slate-400">
                  يتيح لك التحكم بمسار <code className="font-mono bg-slate-950 px-1.5 py-0.5 rounded text-blue-400">/ppp/secret</code> لاشتراكات المنازل السلكية، والتحكم بمشتركي اليوزر مانجر تحت مسار <code className="font-mono bg-slate-950 px-1.5 py-0.5 rounded text-blue-400">/user-manager/user</code> بدقة متناهية.
                </p>
              </div>
            </div>
          )}

          {activeSection === 'profiles_queues' && (
            <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
              <div className="space-y-2">
                <div className="font-bold text-slate-200">1. باقات السرعات والبروفايلات (Hotspot Profiles):</div>
                <p className="text-slate-400">
                  يتحكم بمسار <code className="font-mono bg-slate-950 px-1.5 py-0.5 rounded text-blue-400">/ip/hotspot/user/profile</code>. تضبط هذه الواجهة:
                </p>
                <ul className="list-disc pr-5 text-slate-400 space-y-1">
                  <li><strong>عدد الأجهزة المشتركة (Shared Users):</strong> لتحديد عدد الأجهزة التي يسمح لها بالولوج بنفس الكرت في وقت واحد.</li>
                  <li><strong>تحديد السرعة (Rate Limit rx/tx):</strong> تحديد الحد الأقصى للرفع والتنزيل للعميل (مثال: <code className="font-mono text-emerald-400 text-[10px]">512k/2m</code> تعني نصف ميجا رفع و 2 ميجا تنزيل).</li>
                </ul>
              </div>

              <div className="space-y-2">
                <div className="font-bold text-slate-200">2. تنظيم الطوابير (Simple Queues):</div>
                <p className="text-slate-400">
                  يتحكم بمسار <code className="font-mono bg-slate-950 px-1.5 py-0.5 rounded text-blue-400">/queue/simple</code> لتطبيق وتنظيم أولويات توزيع السرعات في الشبكة ومنع الاستهلاك الجائر الذي يقوم به برامج التحميل التلقائي وتوزيع جودة الخدمة (QoS) للعملاء.
                </p>
              </div>
            </div>
          )}

          {activeSection === 'card_studio' && (
            <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
              <div className="space-y-2">
                <div className="font-bold text-slate-200">1. آلية توليد الكروت الذكية (Voucher Generator):</div>
                <p className="text-slate-400">
                  تقوم الواجهة بإنتاج آلاف الحسابات العشوائية الحقيقية وإرسالها بدفعة واحدة للراوتر عبر مسار الهوتسبوت. يمكنك تحديد طول الكرت، البادئة التلقائية، والسعر بدقة، ويضمن محرك ZCtrl عدم تكرار الأكواد نهائياً عبر خوارزمية فحص تمنع التصادم.
                </p>
              </div>

              <div className="space-y-2">
                <div className="font-bold text-slate-200">2. قوالب الطباعة المتطورة:</div>
                <p className="text-slate-400">
                  يوفر التطبيق 4 قوالب تصميمية فاخرة وجاهزة للطباعة الفورية على ورق A4 (قالب شبكتي الملون، القالب الكلاسيكي المبسط، القالب المظلم الفاخر، والقالب العصري المدمج).
                </p>
              </div>

              <div className="space-y-2">
                <div className="font-bold text-slate-200">3. الطباعة الحرارية والمستمرّة (POS System):</div>
                <p className="text-slate-400">
                  يدعم التطبيق الطباعة الفردية والطباعة المستمرة على طابعات الكاشير البلوتوث والـ USB الحرارية (بكرات 58مم أو 80مم). تشتمل الكروت على الباركود ورمز الاستجابة السريعة (QR Code) لتسهيل وتسريع ولوج المشتركين للشبكة فور مسح الكود بكاميرا الهاتف.
                </p>
              </div>
            </div>
          )}

          {activeSection === 'network_firewall' && (
            <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
              <div className="space-y-2">
                <div className="font-bold text-slate-200">1. حماية المايكروتك وتعطيل الخدمات غير المستخدمة (System Hardening):</div>
                <p className="text-slate-400">
                  يقوم بحظر منافذ الخدمات الحساسة والقديمة مثل (Telnet, FTP, WWW, api) وتفعيلها يدوياً فقط عند الحاجة لمنع الهجمات وسحب كلمات المرور.
                </p>
              </div>

              <div className="space-y-2">
                <div className="font-bold text-slate-200">2. تنظيف قواعد جدار الحماية (Firewall Cleanup):</div>
                <p className="text-slate-400">
                  يتيح لك فحص وحذف قواعد الفايروال التالفة والقديمة دفعة واحدة، واستخدام قوائم العناوين <strong>Address Lists</strong> لمنع تكرار القواعد وتحسين أداء معالجة الحزم بداخل النواة (Kernel).
                </p>
              </div>

              <div className="space-y-2">
                <div className="font-bold text-slate-200">3. إدارة الفيلان (VLAN Setup):</div>
                <p className="text-slate-400">
                  يسمح للمدراء ببناء شبكات افتراضية معزولة (IEEE 802.1Q) للفصل التام بين ترافيك المشتركين، شبكة الإدارة والموظفين، وشاشات المراقبة لضمان أعلى مستويات الأمان.
                </p>
              </div>

              <div className="space-y-2">
                <div className="font-bold text-slate-200">4. استثناء وتجاوز الهوتسبوت (IP Binding):</div>
                <p className="text-slate-400">
                  يسمح باستثناء شاشات التلفاز الذكية، كاميرات المراقبة، أو سيرفرات الكاش بالشبكة من صفحة تسجيل دخول الهوتسبوت عبر خيار <strong>Bypassed</strong>، أو حظر الأجهزة المتطفلة نهائياً بـ <strong>Blocked</strong>.
                </p>
              </div>
            </div>
          )}

          {activeSection === 'backups' && (
            <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
              <div className="space-y-2">
                <div className="font-bold text-slate-200">1. النسخ الاحتياطي وتصدير السكربتات (Backups & RSC):</div>
                <p className="text-slate-400">
                  يقوم التطبيق بطلب إنشاء نسخة كاملة مشفرة بنوع <strong>.backup</strong> لضمان استرجاع كامل النظام، أو ملف نصي <strong>.rsc script</strong> لنسخ الإعدادات واستعراض الأوامر يدوياً وتعديلها بسهولة.
                </p>
              </div>

              <div className="space-y-2">
                <div className="font-bold text-slate-200">2. طرفية الأوامر السريعة (RouterOS Terminal):</div>
                <p className="text-slate-400">
                  تتيح إرسال أي أمر نصي مباشر إلى الراوتر (مثال: <code className="font-mono bg-slate-950 px-1 py-0.5 rounded text-blue-400">/ip route print</code>) وتلقي النتائج الحقيقية فوراً لخدمة المشاكل الفنية الصعبة بسرعة فائقة.
                </p>
              </div>

              <div className="space-y-2">
                <div className="font-bold text-slate-200">3. المساعد الذكي بالذكاء الاصطناعي (AI Specialist):</div>
                <p className="text-slate-400">
                  تم دمج الذكاء الاصطناعي لتقديم النصائح الفنية الحية، تحليل مشاكل الفصل، واقتراح سكربتات حماية متطورة للمايكروتك لديك بناءً على إعدادات شبكتك ومواردها.
                </p>
              </div>

              <div className="space-y-2">
                <div className="font-bold text-slate-200">4. جدولة المهام التلقائية (Scheduled Tasks):</div>
                <p className="text-slate-400">
                  يتيح قسم <strong>المهام المجدولة (/system/scheduler)</strong> أتمتة صيانة الراوتر بالكامل دون تدخل يدوي: كإعادة التشغيل اليومي فجراً (مثل 04:00 AM) لتفريغ الذاكرة وتجديد الاتصال، أخذ نسخ احتياطية تلقائية يومية أو أسبوعية، تنظيف كروت الهوتسبوت المنتهية دورياً، وتفريغ كاش DNS لحل مشاكل تصفح المواقع.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
