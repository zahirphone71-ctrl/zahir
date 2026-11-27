# ZCTRL — الوثيقة الحاكمة النهائية والمهارات الكاملة

# الإصدار 4.0 — المرجع الوحيد الملزم للنظام

# الحالة: نهائي ومعتمد (خالٍ من الجداول الزمنية والافتراضات التخمينية)

# قاعدة الاعتماد: هذه الوثيقة مع تفصيل المهارات الأربعين (1-40) تمثل الدستور الهندسي الوحيد لنظام ZCtrl.

\---

## الجزء 0: بيان النطاق الحاكم (Scope Statement) والحدود المعمارية

### 0.1 ما يغطيه كل إصدار ونسبة التغطية التشغيلية (مقابل WinBox)

|الإصدار|النطاق الوظيفي التشغيلي|نسبة تغطية WinBox التقديرية|
|-|-|-|
|**v1.0 (الأساس النواتي)**|إدارة مشتركي HotSpot و PPP و User Manager (عرض، إنشاء، تعديل، حذف، تصفير، تفويج)، توليد الكروت وحقنها، استعراض المنافذ والموارد والحالة التشغيلية والسجلات، أدوات الفحص الأساسية (Ping, Traceroute)، النسخ الاحتياطي والتصدير، صفحة تسجيل دخول الهوتسبوت، نظام الصلاحيات الموزعة RBAC، سجل العمليات غير القابل للتعديل، التقارير المالية الأساسية.|\~30% – 40%|
|**v2.0 (التوسعة الشبكية)**|خوادم وتوزيع DHCP، جدران الحماية Firewall (قراءة وتعديل آمن مع حفظ الترتيب)، طوابير السرعة البسيطة Simple Queues، إدارة النظام والجدولة، الكتابة وضبط الترددات اللاسلكية Wireless مع مؤقت الأمان Revert Timer، الحديقة المسورة Walled Garden، ربط العناوين IP Bindings، مضيفو الشبكة Hosts، كوكيز المصادقة، بوابة المشترك الذاتية، تكامل بوابات الدفع.|\~65% – 75%|
|**v3.0 (الأجهزة اللاسلكية الموزعة)**|تكامل أجهزة Ubiquiti airOS (قراءة مؤشرات الإشارة والعملاء عبر SNMP، الكتابة الحذرة عبر SSH بعد فحص واختبار الجهاز الفعلي)، نظام التنبيهات الفورية (Telegram, WhatsApp, SMS)، لوحة مراقبة موحدة متعددة الأجهزة والروابط.|\~80%|
|**v4.0+ (التحكم المتقدم والأنظمة الموزعة)**|إدارة أنظمة التوزيع المركزي CAPsMAN، شجرة الطوابير المتقدمة Queue Tree، تخصيص الحصص المتكافئ PCQ، تكامل Ubiquiti UniFi عبر Controller API، فاحص الحزم Packet Sniffer، فحص السرعة البيني Bandwidth Test، محاكي الطرفية التفاعلية Terminal المعزول، ومحرر السكربتات المتقدم مع تدقيق التوافق.|\~90%+|

### 0.2 ما لا تدّعيه هذه الوثيقة (حدود الادعاء الهندسية)

1. **لا ادعاء بالتحكم الكامل كبديل كامل لـ WinBox في المراحل الأولى**: التحكم الشامل هدف تراكمي خاضع لمصفوفة القدرات واختبارات الأجهزة الفعلية.
2. **لا ادعاء بالكمال وانعدام العيوب (Zero Defect)**: الهدف الهندسي هو رصد المخاطر مبكراً، إيقاف التغييرات التدميرية، تقديم الأدلة القطعية، والاعتراف الصريح بالقيود التقنية.
3. **لا ادعاء بالسرعة الفائقة والخفة دون معايير قياس (Benchmarks)**: كل ادعاء أداء مقيد بميزانيات رقمية ملزمة ومثبتة على أجهزة مرجعية محددة.
4. **لا ادعاء بالمطابقة البصرية مع WinBox دون نظام تصميم معتمد**: واجهات النظام تبنى على Design System متكامل موثق بالرموز، وداعم للغة العربية والـ RTL مع اختبارات الانحدار البصري والإتاحة.

### 0.3 القرارات المعمارية المحسومة غير القابلة للجدل

|المحور|القرار المعتمد|البديل المرفوض|التعليل الهندسي|
|-|-|-|-|
|**نموذج النشر**|تطبيق محلي (Desktop-Native Web App / Localhost) افتراضياً مع إمكانية العمل المركزي عبر VPN موثوق.|منصة سحابية عامة فقط (Pure Public Cloud).|خصوصية بيانات المشتركين، أمان كروت الشبكة، واستمرارية العمل دون انقطاع عند ضعف الإنترنت الخارجي.|
|**حزمة التقنيات (Tech Stack)**|React 18 + TypeScript + Tailwind CSS / Node.js + Express / SQLite + Drizzle ORM / REST API + WebSocket (Typed).|Electron ثقيل، Capacitor، Python/Django، خوادم قواعد بيانات خارجية إلزامية.|سرعة الإقلاع، استهلاك الذاكرة المحدود (أقل من 300MB)، التوافق العالي، والمزامنة اللحظية ثنائية الاتجاه.|
|**حزم الـ Backend**|حزمة تنفيذية قائمة بذاتها عبر Node SEA / Pkg تعمل كخدمة نظام خلفية مستقلة (System Service).|تشغيل خادم مدمج داخل Electron Main Process مباشرة.|عزل استقرار خدمة الشبكة عن تعطل أو إغلاق نوافذ واجهة المستخدم الرسومية.|
|**الوصول لمخزن أسرار النظام (OS Keychain)**|من خلال الواجهة الخلفية (Backend) حصراً عبر المكتبات الآمنة لنظام التشغيل (DPAPI / libsecret / Keychain).|وصول الواجهة الأمامية أو التخزين في LocalStorage/Cookies.|منع تسريب مفاتيح التشفير أو كلمات المرور عبر متصفحات الويب أو هجمات XSS.|
|**قناة الاتصال المحلية (Local TLS)**|شهادة TLS ذاتية التوليد مشفرة ومثبتة في مخزن ثقة النظام المحلي.|بروتوكول HTTP غير المشفر على Localhost.|منع التنصت على حركة البيانات بين الواجهة والخدمة المحلية ودعم معايير PWA والمقابس الآمنة WSS.|
|**ربط الشبكة الداخلي (Bind Interface)**|الربط على العناوين الداخلية الآمنة `127.0.0.1` فقط مع رمز جلسة عشوائي فريد لكل إقلاع.|الربط المفتوح على كافة العناوين `0.0.0.0`.|منع أي وصول غير مصرح به من الأجهزة المتصلة على نفس الشبكة المحلية للراوتر.|
|**كلمة مرور الأدمن الكامل للراوتر**|لا تُحفظ في أي قاعدة بيانات أو ملف إطلاقاً؛ تُطلب عند كل جلسة تشغيل جديدة.|حفظ كلمة المرور مشفرة محلياً أو تخزينها تلقائياً.|تطبيق مبدأ انعدام الثقة (Zero-Trust)؛ حماية الراوتر من السيطرة في حال سرقة أو اختراق الحاسوب.|
|**حسابات الخدمة والمهام المحدودة**|تشفير بيانات الحسابات المحدودة (SNMPv3 / SSH محدود) داخل OS Keychain بعد موافقة صريحة موثقة.|التخزين بنص صريح (Plaintext) في الإعدادات.|توفير المراقبة المستمرة دون تعريض الحساب الرئيسي للراوتر للخطر.|
|**التعامل مع معدات Ubiquiti**|القراءة عبر بروتوكول SNMP أولاً، والكتابة عبر أوامر SSH المنضبطة بعد اختبار الجهاز الفعلي لكل إصدار فريم وير.|الاعتماد على Reverse-Engineered HTTP APIs غير الموثقة.|استقرار الاتصال ومنع تعليق أو تلف أجهزة الربط اللاسلكي الحساسة.|
|**آلة الحالات للعمليات**|آلة حالات مثمنة (8 States) تشمل صراحةً حالتي `diverged` و `outcome\_unknown`.|آلة حالات مبسطة (نجح / فشل فقط).|التعامل مع انقطاع الشبكة دون تكرار العمليات الخاطئة؛ انتهاء المهلة (Timeout) لا يعني بالضرورة الفشل.|

### 0.4 الأهداف المستبعدة صراحةً (Non-Goals)

1. لن يكون النظام أداة لإدارة أجهزة Cisco IOS أو Juniper Junos في أي من المراحل الحالية.
2. لن يدعم النظام المصادقة عبر بروتوكولات المؤسسات المعقدة (مثل SAML/Enterprise SSO) في الإصدارات الفردية والمحلية.
3. لن يتم تحويل النظام إلى أداة سحابية تقوم بتخزين كلمات مرور ومفاتيح الراوترات على خوادم خارجية عامة.

\---

## الجزء 1: المعمارية الهندسية الشاملة (System Architecture)

### 1.1 الهوية المعمارية والغرض الأساسي

برنامج **Zahir Control (ZCtrl)** هو منصة هندسية محلية عالية الموثوقية مخصصة لإدارة أنظمة MikroTik RouterOS (بإصداريها v6 و v7) ومعدات Ubiquiti اللاسلكية. صُمم النظام ليوفر بيئة تشغيلية فائقة السرعة والاستقرار لإدارة المشتركين، توليد وحقن الكروت، مراقبة حركة البيانات، وأرشفة السجلات المالية والتدقيقية وفق معايير الأمان الدفاعية الصارمة.

### 1.2 الطبقات الهندسية للبرنامج

```
┌────────────────────────────────────────────────────────────────────────┐
│  طبقة واجهة المستخدم (UI Layer - React 18 + TS + Tailwind + Tokens)       │
│  - عزل كامل عن أجهزة الراوتر (لا اتصال مباشر نهائياً)                  │
│  - استهلاك موحد للبيانات عبر Domain Hooks \& State Machine Providers     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ REST API + Typed WebSockets (WSS)
┌───────────────────────────────────▼────────────────────────────────────┐
│  طبقة البوابات والواجهات الخلفية (API Layer - Express Engine)          │
│  - فرض التحقق من الصلاحيات (RBAC Enforcement) على كل مسار             │
│  - مطابقة وفلترة المدخلات الصارمة (Strict Zod Schema Validation)       │
│  - تحديد معدل الطلبات (Rate Limiting)، حماية CSRF، وحصر النطاق (CORS)   │
│  - تحويل الأخطاء المعيارية إلى نمط النتيجة الموحد Result<T>            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│  طبقة النطاق ومنطق الأعمال (Domain Layer)                              │
│  - محرك قواعد الأعمال وبناء الأوامر المنضبطة                           │
│  - متتبع الحالات اللحظي (OperationStateTracker)                        │
│  - سجل ويومية التراجع الدائمة (Persistent RevertJournal Engine)        │
│  - خدمات المشتركين، تفويج الكروت، والسجلات المالية التراكمية          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│  طبقة تجريد الأجهزة (Device Abstraction Layer)                         │
│  interface DeviceAdapter { detect, capabilities, read, plan, apply, .. }│
│  ├── MikroTikAdapter  → API (8728) / API-SSL (8729) / REST v7 / SSH   │
│  ├── AirOSAdapter     → SNMP v2c/v3 (قراءة) + SSH CLI (كتابة آمنة)     │
│  └── UniFiAdapter     → Controller API Integration                     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│  طبقة البنية التحتية والبيانات (Infrastructure Layer)                  │
│  - مدير الاتصالات ومقبس القنوات (ConnectionManager)                    │
│  - محرك البيانات المحلي السريع SQLite + Drizzle ORM (وضع WAL)          │
│  - خزينة أسرار نظام التشغيل (OS Keychain Integration)                  │
│  - سجل التدقيق التراكمي المحمي من التعديل (Append-Only Audit Log)      │
└────────────────────────────────────────────────────────────────────────┘
```

### 1.3 العقد الهندسي الكامل لمحول الأجهزة (`DeviceAdapter`)

```typescript
// src/adapters/types.ts

export type Vendor = 'mikrotik' | 'ubiquiti-airmax' | 'unifi';

export type Capability =
  | `read.${string}`
  | `write.${string}`
  | `execute.${string}`;

export interface DeviceIdentity {
  vendor: Vendor;
  model: string;
  firmware: string;
  serial?: string;
  rosVersion?: string;   // خاص بأجهزة MikroTik (مثل 6.49.10 أو 7.15.2)
  detectedAt: number;
}

export type OperationState =
  | 'queued'             // في طابور المعالجة
  | 'running'            // قيد التنفيذ على الجهاز
  | 'succeeded'          // اكتملت بنجاح مع التحقق الميداني
  | 'failed'             // فشلت برسالة خطأ موثقة من الجهاز
  | 'partially\_succeeded'// نجح جزء من العملية الدفعية وفشل جزء
  | 'cancelled'          // تم الإلغاء بطلب من المستخدم أو عبر AbortSignal
  | 'outcome\_unknown'    // انقطع الاتصال أثناء التنفيذ؛ النتيجة مجهولة
  | 'diverged';          // نُفذ الأمر لكن حالة الراوتر الحالية تخالف الهدف

export interface PreparedCommand {
  menu: string;             // المسار في المايكروتك، مثل: '/ip/hotspot/user'
  action: 'add' | 'set' | 'remove' | 'print' | 'execute';
  params: Record<string, string | number | boolean>;
  rawCli?: string;          // يُمنع استخدامه إلا في الحالات المعتمدة مع التدقيق
}

export interface ChangePlan {
  changeId: string;         // معرّف فريد UUID v4
  idempotencyKey: string;   // hash(target + payload + user + timebucket)
  vendor: Vendor;
  routerId: string;
  commands: PreparedCommand\[];
  expectedEffects: string\[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  requiresConfirmation: boolean;
  requiresRevertTimer: boolean;
  revertPlan?: RevertPlan;
  createdAt: number;
}

export interface RevertPlan {
  revertCommands: PreparedCommand\[];
  deadlineMs: number;       // مهلة التأكيد (مثلاً 120000 ميلي ثانية)
  confirmationMethod: 'admin\_click' | 'admin\_terminal';
}

export interface VerificationResult {
  state: OperationState;
  intendedState: unknown;
  actualState: unknown;
  diff?: StateDiff;
  evidence: string\[];       // نتائج القراءة بعد الكتابة، المعرفات، والأختام الزمنية
  verifiedAt: number;
}

export interface StateDiff {
  path: string;
  intended: unknown;
  actual: unknown;
}

export interface ReadQuery {
  menu: string;
  props?: string\[];
  where?: Record<string, string | number | boolean>;
  rapid?: boolean;
}

export interface OperationResult {
  operationId: string;
  state: OperationState;
  data?: unknown;
  error?: string;
}

export interface Progress {
  current: number;
  total: number;
  status: string;
}

export interface ApplyOptions {
  signal?: AbortSignal;
  onProgress?: (p: Progress) => void;
  confirmationToken?: string;
  revertTimerMs?: number;
}

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; details?: unknown };

export interface DeviceAdapter {
  vendor: Vendor;
  detect(): Promise<DeviceIdentity>;
  capabilities(): Promise<Capability\[]>;
  read<T>(query: ReadQuery): Promise<Result<T>>;
  plan(change: unknown): Promise<ChangePlan>;
  apply(plan: ChangePlan, opts: ApplyOptions): Promise<OperationResult>;
  verify(plan: ChangePlan): Promise<VerificationResult>;
}
```

### 1.4 الركائز الهندسية السبع وتطبيقاتها التقنية

1. **هندسة القضاء على التشنج (Zero-Freeze UI)**:

   * عزل معالجة الرسوميات عن خيط معالجة البيانات والشبكة. استخدام Web Workers للعمليات التحليلية والحسابية التي تستغرق أكثر من 50 ميلي ثانية.
   * فرض العرض الافتراضي (Virtual Scrolling) لكافة الجداول التي تتجاوز 200 صف، بما يضمن سلاسة التنقل والفرز حتى مع 100,000 مشترك.
   * ميزانيات زمنية إلزامية: زمن أول ظهور للمحتوى FCP ≤ 1.5 ثانية، وزمن التفاعل الكامل TTI ≤ 3.0 ثوانٍ على الأجهزة المرجعية.
2. **معمارية استقرار الجلسة ومصفوفة إعادة الاتصال (Session Stability \& Reconnect Matrix)**:

|الحدث التشغيلي|إعادة الاتصال|طلب كلمة المرور|مصير العمليات المعلقة|
|-|-|-|-|
|**اهتزاز الشبكة اللحظي (نفس الجلسة)**|إعادة اتصال صامتة بخوارزمية التراجع الأسي (Exponential Backoff).|لا يُطلب إعادة إدخالها.|تستمر المعالجة مع الحفاظ على مفاتيح التطابق.|
|**إعادة تشغيل الـ Backend**|لا اتصال تلقائي؛ يتوقف عند بوابة الدخول.|نعم، مطلوبة لإعادة فتح القناة.|تُعلّم بحالة `outcome\_unknown` للتدقيق.|
|**انتهاء مهلة الجلسة (Idle Timeout)**|تنتهي الجلسة وتُغلق القنوات فوراً.|نعم، إعادة مصادقة كاملة.|تُصنف العمليات غير المؤكدة كـ `outcome\_unknown`.|
|**إغلاق نافذة أو تبويب المتصفح**|تظل الخدمة المحلية قيد التشغيل لفترة محددة.|نعم عند فتح التبويب مجدداً للأمان.|تُستكمل العمليات الدفعية التي تعمل في الخلفية.|
|**فقدان اتصال الراوتر أثناء الأمر**|محاولات محددة بزمن مهلة صارم (Bounded Timeout).|لا يُطلب كلمة المرور.|تصنيف الحالة كـ `outcome\_unknown` مع فحص القراءة اللاحق.|

3. **آلة الحالات الثمانية والتحقق الميداني المزدوج (Verified Outcome - 8 States)**:

   * مسار الحالات الصارم: `queued` → `running` → (`succeeded` | `failed` | `partially\_succeeded` | `cancelled` | `outcome\_unknown` | `diverged`).
   * مبدأ قطعي: انتهاء مهلة الاتصال (Timeout) لا يعني أبداً فشل الأمر؛ بل يعني وجوب وسْم العملية بحالة `outcome\_unknown` حتى إجراء استعلام التحقق (Read-Back Verification).
   * حالة `diverged`: تُسجل عند قراءة حالة الراوتر وثبوت أن القيمة الفعلية تخالف النتيجة المطلوبة دون محاولة تصحيح عشوائي غير مدروس.
   * الفصل التام في الواجهة بين "تم إرسال الأمر للراوتر" وبين "تم التحقق الفعلي من سريان التعديل".
4. **هندسة إدارة الذاكرة ودورة حياة الموارد (Memory \& Lifecycle)**:

   * تحرير الموارد الحتمي: إلغاء كافة الاشتراكات، مؤقتات `setInterval`، ومقابس WebSockets عند إلغاء تركيب المكونات (`useEffect cleanup`).
   * ذاكرة تخزين مؤقت حلقية منضبطة السعة (Rolling Buffers): حفظ السجلات بحد أقصى 10,000 سجل محلي، وعينات الرسوم البيانية للترافيك بحد أقصى 5,000 عينة لكل منفذ شبكي.
5. **سياسة انعدام الثقة في الاعتمادات (Zero-Trust Security)**:

   * كلمة مرور الأدمن الكامل للراوتر لا تُخزن بصورة دائمة إطلاقاً، وتُطلب عند كل تشغيل يدوي للبرنامج.
   * حسابات الخدمة المقيدة (SNMPv3 / SSH محدود القراءة) تُحفظ مشفرة داخل خزينة أسرار نظام التشغيل الرسمية فقط بعد موافقة كتابية صريحة.
   * حجب كامل وتنقيح أوتوماتيكي لكافة الأسرار والرموز في السجلات وملفات الخطأ وواجهات المراقبة.
6. **انضباط تجريد الأجهزة (Device Adapter Discipline)**:

   * عزل أكواد كل صانع أجهزة (Vendor) في مجلد مستقل ومغلق (`/adapters/<vendor>/`).
   * توحيد النماذج العامة لبيانات المشتركين، المنافذ، الإشارات، والعملاء عبر واجهات موحدة.
   * تحديد معالم الواجهة وأزرار التحكم بناءً على مصفوفة القدرات الحقيقية الناتجة عن دالة `capabilities()`.
7. **وضع الأمان ويومية التراجع الدائمة (Safe Mode \& Persistent Revert Journal)**:

   * لا تُنفذ العمليات ذات الخطورة العالية (تغيير التردد اللاسلكي، تعديل عناوين IP، تعديل قواعد الفايروول الحساسة) إلا بعد تسجيل أمر تراجع كامل ومؤقت زمني صارم في جدول دائم داخل قاعدة البيانات.
   * في حال انقطاع الاتصال أو عدم تأكيد المهندس خلال المهلة المحددة، يقوم المحرك بتنفيذ أوامر الاسترجاع لإعادة الراوتر إلى حالته السابقة ومنع انقطاع الشبكة عن بُعد.

\---

## الجزء 2: القواعد الحاكمة الصارمة للنظام (القواعد 0 إلى 50)

* **القاعدة 0: الموجه الحاكم الأسمى (Prime Directive)**
ترتيب الأولويات الإلزامي عند اتخاذ أي قرار برمجي أو تشغيلي:

  1. سلامة الراوتر واستقرار الشبكة ومنع انقطاع الخدمة عن المشتركين.
  2. الأمان الصارم، حماية الاعتمادات، وحفظ خصوصية البيانات.
  3. الدقة القطعية ومطابقة الواقع (Ground Truth Verification).
  4. استقرار الجلسات وقابلية التعافي الذاتي من الأعطال.
  5. كفاءة الأداء وخفة استهلاك الذاكرة والمعالج.
  6. تجربة المستخدم وسلاسة الواجهة الرسومية.
  7. الأناقة البصرية والمظهر الجمالي.
*عند حدوث أي تعارض، يجب الرجوع إلى هذا الترتيب فوراً دون اجتهاد فردي.*
* **القاعدة 1: سياق المشروع الصارم (Project Context)**
الالتزام بحزمة التقنيات المعتمدة في §0.3 وملفات المستودع الحقيقية. يُمنع منعاً باتاً افتراض وجود مكتبات أو أدوات أو إصدارات غير مثبتة أو غير مصرح بها.
* **القاعدة 2: حصر النطاق وضبط التغيير (Authority \& Scope Control)**
كل ميزة برمجية يجب أن تتبع نطاقاً واضحاً ومبرراً. التغييرات تقتصر على الحد الأدنى الضروري لتحقيق الهدف، والعمليات الخطيرة تتطلب موافقة بشرية صريحة مسبقة.
* **القاعدة 3: الأمانة الهندسية وتصفير التخمين (Zero Guessing)**
يُحظر تخمين أوامر RouterOS أو معلمات API. سلم مستويات الإثبات المعتمد:
`استدلال نظري < تحليل ساكن للكود < اختبارات آلية < اختبارات تكامل < اختبار على راوتر افتراضي (CHR) < اختبار موثق على راوتر فيزيائي حقيقي`.
* **القاعدة 4: التزامن والمعالجة غير الحاجبة (Concurrency \& Async Safety)**
يُمنع حجب واجهة المستخدم بأي عملية استعلام أو معالجة. جميع عمليات الشبكة والمدخلات والمخرجات I/O يجب أن تكون `async/await` مدعومة بـ `AbortSignal` للإلغاء الفوري.
* **القاعدة 5: كفاءة الذاكرة والأداء الحسابي (Memory \& Performance)**
تحرير الموارد المنتهي استخدامها فوراً، وضع حدود للذاكرة المؤقتة، واستخدام الجداول الافتراضية لمنع تسريب الذاكرة أثناء فترات العمل الطويلة.
* **القاعدة 6: تحمل الأخطاء والتدهور الرشيق (Fault Tolerance \& Graceful Degradation)**
إحاطة كافة المكونات بحدود الأخطاء (Error Boundaries)، ومعالجة كافة استثناءات الشبكة بكتل `try/catch` منضبطة تمنع انهيار التطبيق وتقدم رسائل مفهومة للمستخدم باللغة العربية.
* **القاعدة 7: المعمارية النظيفة وسلامة الأنواع (Clean Architecture \& Strict Typing)**
فصل طبقات التطبيق وفق الهيكل المعتمد. تفعيل الوضع الصارم لـ TypeScript (`strict: true`) ومنع استخدام النوع `any` إلا بوجود تعليل استثنائي موثق.
* **القاعدة 8: أمان الاعتمادات وحدود البوابات (Security \& Credentials Discipline)**
كلمات مرور المشرف لا تُخزن محلياً. تنقيح كل مخرجات السجلات من الأسرار. حماية مسارات API عبر HTTPS، خوذة الأمان Helmet، التحقق من التوكنات، وحظر استدعاء العناوين الخارجية غير المصرح بها.
* **القاعدة 9: الرصد والمراقبة المهيكلة (Structured Observability)**
تسجيل أحداث النظام بصيغة JSON مهيكلة تتضمن معرّف العملية، معرّف الجهاز، النتيجة، والطابع الزمني، مع حظر تسجيل أي كلمات مرور أو مفاتيح تشفير.
* **القاعدة 10: إدارة قنوات الاتصال (Connection Management)**
تخصيص مدير اتصالات منفرد لكل بروتوكول، مع تطبيق فترات مهلة صارمة (Timeouts)، والتراجع الأسي مع التشويش العشوائي (Exponential Backoff with Jitter) عند إعادة الاتصال.
* **القاعدة 11: سلامة إعدادات الراوتر (RouterOS Safety \& Integrity)**
القراءة قبل الكتابة (Read-Before-Write)، التراجع الآمن عند الفشل، أخذ نسخة احتياطية سريعة قبل التعديلات الهيكلية، والحفاظ الكامل على بيانات المشتركين القائمة.
* **القاعدة 12: تعادلية العمليات وسلامة المعاملات (Idempotency \& Transaction Safety)**
كل عملية كتابة على الراوتر يجب أن تحمل مفتاح تعادلية فريد `idempotencyKey`. إعادة إرسال نفس الطلب عند اهتزاز الشبكة يجب ألا تؤدي إلى تكرار إنشاء الحساب أو تغيير الحالة بصورة خاطئة.
* **القاعدة 13: توافق الإصدارات (RouterOS v6 vs v7 Compatibility)**
مراعاة الفروق الهيكلية في الأوامر بين إصدارات RouterOS v6 وإصدارات v7 (خصوصاً في مسارات التوجيه، حزم UserManager، وتنسيق استجابات REST API).
* **القاعدة 14: انضباط العمليات الدفعية (Bulk Operations)**
تقسيم العمليات الضخمة (توليد مئات الكروت أو تعديل آلاف المشتركين) إلى حزم صغيرة متتابعة (Chunks من 10 إلى 25 عنصراً)، مع إظهار شريط تقدم دقيق وقابلية الإلغاء في أي لحظة.
* **القاعدة 15: سلامة وترحيل البيانات (Data Integrity \& Migrations)**
إدارة كافة تعديلات قاعدة البيانات المحلية عبر ملفات ترحيل مرقمة ومختبرة مسبقاً، مع الحظر التام للحذف الفيزيائي للسجلات المالية أو العمليات التدقيقية.
* **القاعدة 16: بوابات الجودة والفحص الآلي (Release Quality Gates)**
لا يُعتمد أي إصدار أو تحديث إلا بعد اجتياز فحوصات البناء، مطابقة الأنواع، واختبارات التكامل، وتوثيق أي نقاط تعذر اختبارها بصدق ووضوح.
* **القاعدة 17: المراقبة المستمرة والتعافي (Continuous Health \& Recovery)**
إجراء فحوصات دورية خفيفة لحالة الاتصال، وتوفير آليات واضحة للتعافي السريع عند إعادة تشغيل النظام أو انقطاع التيار الكهربائي.
* **القاعدة 18: معايير التدويل واللغة العربية (RTL \& Localization Standard)**
واجهة النظام عربية بالكامل وتعتمد اتجاه الكتابة من اليمين لليسار (`dir="rtl"`). الأرقام وعناوين IP والمصطلحات التقنية اللاتينية تُعرض باتجاه LTR منضبط لتفادي تشوه النصوص.
* **القاعدة 19: بروتوكول التحديث الإلزامي (Mandatory Update Protocol)**
إجراء فحص شامل للمتطلبات قبل التعديل، التحقق من عدم كسر أي ميزات سابقة، وتوثيق التغييرات بدقة قبل إدراجها في شجرة الكود البرمجي.
* **القاعدة 20: بروتوكول معالجة الكود القديم (Legacy Remediation Protocol)**
عند التعامل مع وحدات قديمة، يتم فحصها وتدقيقها في وضع القراءة أولاً، ولا يتم استبدالها إلا بدفعات صغيرة ومختبرة تثبت تفوقها واستقرارها دون كسر الترابط القائم.
* **القاعدة 21: تدقيق المتطلبات والمعايير (Requirements Audit)**
يُمنع برمجة أي ميزة إضافية لم تُطلب صراحة أو لا تخدم استقرار النظام. كل سطر برمجي يجب أن يرتبط مباشرة بمتطلب تشغيلي محدد.
* **القاعدة 22: منع الانحدار البرمجي والترابط التبادلي (Regression Prevention)**
التأكد من أن أي تعديل في وحدة معينة (مثل إدارة الكروت) لا يؤثر سلباً على وحدة أخرى مرتبطة (مثل إدارة المشتركين أو السجلات المالية).
* **القاعدة 23: مراجعة الحزم والاعتماديات (Dependency Governance)**
استخدام الحزم الموثوقة والمثبتة في ملف `package.json` فقط، وفحص الثغرات الأمنية دورياً، وتجنب إضافة حزم ثقيلة يمكن الاستغناء عنها بكود نظيف ومحلي.
* **القاعدة 24: قائمة الحفاظ الإلزامي على المشتركين (Subscriber Preservation Checklist)**
حظر تنفيذ أي أمر يؤدي إلى تصفير المشتركين أو مسح ملفات تعريفهم (Profiles) ما لم يكن طلباً صريحاً مؤكداً بمصادقة أمان مزدوجة.
* **القاعدة 25: تعريف الاكتمال البرمجي (Definition of Done)**
لا تُعتبر أي مهمة برمجية مكتملة إلا إذا كانت: مطابقة للمواصفات، خالية من أخطاء Typescript، مجتازة لاختبارات البناء، موثقة في مصفوفة القدرات، وخاضعة للتحقق الميداني.
* **القاعدة 26: التتبع المعماري المباشر (Architecture-to-Code Traceability)**
كل ميزة في واجهة المستخدم يجب أن تنتهي إلى مسار API محدد، يقابله منطق أعمال في Domain Layer، ومترجم لأمر صريح في المحول المناسب.
* **القاعدة 27: حالة الراوتر هي المصدر الخارجي للحقيقة (Device State as Source of Truth)**
البيانات المعروضة في جداول الجلسات والمشتركين النشطين يجب أن تعكس قراءة حقيقية من الراوتر؛ قواعد البيانات المحلية تستخدم فقط للتخزين الإحصائي والتاريخي.
* **القاعدة 28: سلامة وتفرد الكروت (Voucher Identity \& Integrity)**
منع تكرار توليد رموز الكروت عبر خوارزميات عشوائية آمنة تشفيرياً (Cryptographically Secure Random)، مع التحقق من عدم وجود الرمز مسبقاً على الراوتر أو في الدفعات السابقة.
* **القاعدة 29: تطبيق آلة الحالات الثمانية (State Machine Rigor)**
تطبيق دورة حياة الحالات الثمانية على كافة العمليات، ومنع عرض رسائل نجاح خادعة قبل اكتمال الاستعلام التأكيدي من نظام ملفات الراوتر.
* **القاعدة 30: انضباط المزامنة اللحظية (WebSocket Discipline)**
استخدام المقابس للمزامنة السريعة للتنبيهات وحركة البيانات، مع إرفاق أرقام تسلسلية لكل رسالة لتفادي الخلط عند تأخر وصول الحزم عبر الشبكة.
* **القاعدة 31: انضباط القيود والسجلات المالية (Financial Ledger Discipline)**
حساب المبالغ المالية بالسنتات أو أصغر وحدة نقدية كأعداد صحيحة (`amountCents`) لمنع أخطاء الفاصلة العائمة (Floating Point Errors). العمليات الملغاة تسجل كـ `reversal` ولا تحذف.
* **القاعدة 32: دورة حياة الجلسات وأمان الذاكرة (Session Lifecycle Safety)**
إنهاء الجلسات فور إغلاق التطبيق، وتفريغ أي كائنات تحتوي على بيانات حساسة من الذاكرة العشوائية فور انتهاء الحاجة إليها.
* **القاعدة 33: ميزانيات الأداء الرقمية الإلزامية (Performance Budgets)**

  * الحجم الأولي لحزمة الجافاسكريبت المبنية (Gzipped JS): ≤ 300 كيلوبايت.
  * استهلاك ذاكرة الخدمة الخلفية (RSS): ≤ 300 ميجابايت في وضع التشغيل المستمر.
  * استهلاك ذاكرة واجهة المتصفح: ≤ 200 ميجابايت مع الجداول الكبرى.
  * معدل استعلام الراوتر الضعيف: ≤ 5 استعلامات في الثانية لتفادي رفع استهلاك المعالج (CPU Spikes).
* **القاعدة 34: أمان واحتواء الذكاء الاصطناعي (AI Assistant Safety)**
المساعد الذكي يعمل كأداة استشارية فقط؛ يُحظر منحه صلاحية التنفيذ المباشر لأي أمر على الراوتر دون مراجعة المهندس وموافقته الصريحة بالزر الميداني.
* **القاعدة 35: عزل محولات الأجهزة (Device Abstraction Boundaries)**
عدم تسريب أي منطق برمجي خاص بمايكروتك إلى داخل واجهات المستخدم العامة؛ التجريد يتم عبر واجهة `DeviceAdapter` لتمكين دعم أجهزة أخرى مستقبلاً.
* **القاعدة 36: حماية بيانات الروابط اللاسلكية (Wireless Credentials Security)**
تأمين مفاتيح التشفير اللاسلكية (WPA2/WPA3 Pre-shared Keys) في التخزين المشفر، وعدم إظهارها في شاشات العرض العامة إلا للمستخدمين ذوي الصلاحيات العليا.
* **القاعدة 37: سلامة تغيير الروابط اللاسلكية (Wireless Link Safe Change)**
عند تعديل معلمات رابط لاسلكي حي (تردد، قناة، قدرة بث)، يجب تعديل المحطة البعيدة (Station) أولاً مع تفعيل مؤقت الأمان، ثم تعديل نقطة البث الرئيسية (AP).
* **القاعدة 38: ترشيد عينات الإشارة والتليمترية (Signal Telemetry Sampling)**
جمع مؤشرات قوة الإشارة وترافيك المنافذ بفترات متباعدة تتناسب مع سعة الراوتر، وتطبيق خوارزميات تقليص العينات التاريخية (Downsampling) لتوفير مساحة التخزين.
* **القاعدة 39: أمان بوابة المشترك الذاتية (User Portal Security)**
فصل محرك مصادقة بوابة المشتركين عن لوحة الإدارة الرئيسية، تطبيق تحديد صارم لمعدل محاولات تسجيل الدخول لمنع هجمات التخمين، واستخدام الجلسات المشفرة قصيرة العمر.
* **القاعدة 40: نظام الصلاحيات الموزع (RBAC Enforcement)**
تطبيق الصلاحيات على ثلاثة مستويات (الوحدة الوظيفية، نوع العملية، ونطاق الفرع). فرض التحقق داخل الواجهة الخلفية بصورة قطعية قبل تمرير أي أمر.
* **القاعدة 41: النموذج المحاسبي المقفل (Locked Financial Accounting)**
توليد تقارير الإغلاق اليومي والمبيعات بصيغ قياسية ثابتة، مع منع التعديل بأثر رجعي على الفترات المالية المقفلة لضمان النزاهة المحاسبية.
* **القاعدة 42: نظام الإشعارات غير الحاجب (Non-blocking Notifications)**
إرسال رسائل التنبيهات (عبر تيليجرام أو واتساب أو الرسائل القصيرة) في مسارات خلفية معزولة لا تؤخر تنفيذ عمليات المشتركين أو حقن الكروت.
* **القاعدة 43: سلامة استيراد وترحيل البيانات (Import \& Migration Safety)**
عند استيراد مشتركين من أنظمة سابقة (كـ Mikhmon أو CSV)، يتم إنشاء معاينة للمطابقة وفحص التعارضات، وتخيير المستخدم في آلية التعامل مع الأسماء المكررة.
* **القاعدة 44: مختبر الفحص الافتراضي المستمر (CHR Lab Testing)**
تجهيز بيئة راوتر افتراضي قابلة للبناء والتشغيل عبر سكربتات آلية لتجربة السيناريوهات المعقدة ومحاكاة انقطاع الكهرباء قبل طرح التحديثات.
* **القاعدة 45: استيفاء مصفوفة القدرات (Capability Matrix Compliance)**
كل ميزة في البرنامج يجب أن تقابلها خانة موثقة في مصفوفة القدرات تحدد توافقها مع إصدارات المايكروتك ومستوى الاختبار المنجز عليها.
* **القاعدة 46: الالتزام بنظام التصميم (Design System Conformance)**
استخدام رموز التصميم المعتمدة (Tokens) للمسافات والألوان وحواف العناصر، ومنع كتابة قيم عشوائية خارجة عن النظام داخل مكونات الواجهة.
* **القاعدة 47: الاختبارات البصرية وسهولة الوصول (Visual \& Accessibility Standards)**
تحقيق معايير التباين اللوني وسهولة التنقل عبر لوحة المفاتيح (WCAG AA)، واختبار واجهات التطبيق في الوضعين المظلم والفاتح وتحت درجات تكبير مختلفة.
* **القاعدة 48: معايير تغطية WinBox الموثقة (WinBox Parity Evaluation)**
تقييم أي مقارنة وظيفية مع برنامج WinBox وفق جداول فنية دقيقة تبين ما تم تطبيقه وما تم استبعاده عن عمد مع بيان الأسباب الهندسية.
* **القاعدة 49: نشر الحزمة التنفيذية المحلية (Local Package Deployment)**
تحزيم الخدمة الخلفية لتعمل ذاتياً مع تشغيلها على العناوين الداخلية الآمنة وضمان تثبيتها السلس على أنظمة Windows و Linux دون تعقيد تشغيلي.
* **القاعدة 50: مزامنة العمليات المتعددة ومنع التعارض (Multi-User Concurrency)**
إرفاق رقم إصدار تسلسلي (`version`) لكل سجل لمنع الكتابة المتزامنة المتضاربة (Optimistic Concurrency Control)، وإشعار المستخدم فور حدوث تعديل من طرف آخر.

\---

## الجزء 3: مصفوفة القدرات التفصيلية (Capability Matrix)

### 3.1 أوامر وقوائم MikroTik RouterOS

|القائمة في المايكروتك|العملية المدعومة|المعلمات والحقول المنفذة|الصلاحية المطلوبة|v6|v7|كود اختبار المختبر|الحالة|
|-|-|-|-|:-:|:-:|-|-|
|`/ip/hotspot/user`|**read**|name, password, profile, limit-uptime, limit-bytes-total, bytes-in, bytes-out, comment, disabled|read, api|✅|✅|CHR-HSU-R01|مكتمل ومعتمد|
|`/ip/hotspot/user`|**create**|name, password, profile, limit-uptime, limit-bytes-total, comment, server|write, api|✅|✅|CHR-HSU-C01|مكتمل ومعتمد|
|`/ip/hotspot/user`|**update**|password, profile, limit-\*, comment, disabled|write, api|✅|✅|CHR-HSU-U01|مكتمل ومعتمد|
|`/ip/hotspot/user`|**remove**|.id, name|write, api|✅|✅|CHR-HSU-D01|مكتمل ومعتمد|
|`/ip/hotspot/user`|**reset-counters**|.id, name|write, api|✅|✅|CHR-HSU-RC01|مكتمل ومعتمد|
|`/ip/hotspot/user`|**bulk-create**|تكرار إنشاء الحسابات بحزم مجزأة مع تعليق الدفعة|write, api|✅|✅|CHR-HSU-B01|مكتمل ومعتمد|
|`/ip/hotspot/active`|**read**|user, address, mac-address, uptime, bytes-in, bytes-out, server|read, api|✅|✅|CHR-HSA-R01|مكتمل ومعتمد|
|`/ip/hotspot/active`|**remove (kick)**|.id|write, api|✅|✅|CHR-HSA-K01|مكتمل ومعتمد|
|`/ip/hotspot/user/profile`|**read / create / edit**|name, rate-limit, shared-users, keepalive-timeout, status-autorefresh|write, api|✅|✅|CHR-HSP-01|مكتمل ومعتمد|
|`/ppp/secret`|**read / create / edit**|name, password, service, profile, local-address, remote-address, disabled|write, api|✅|✅|CHR-PPP-S01|مكتمل ومعتمد|
|`/ppp/active`|**read / remove**|name, service, caller-id, address, uptime|write, api|✅|✅|CHR-PPP-A01|مكتمل ومعتمد|
|`/ppp/profile`|**read / create**|name, local-address, remote-address, rate-limit, dns-server|write, api|✅|✅|CHR-PPP-P01|مكتمل ومعتمد|
|`/user-manager/user`|**read / create / edit**|username, password, attributes, group, shared-users|write, api|✅|✅|CHR-UM-U01|مكتمل (مع مراعاة v6/v7)|
|`/interface`|**read / monitor**|name, type, mtu, running, disabled, rx-byte, tx-byte, rx-error|read, api|✅|✅|CHR-IF-R01|مكتمل ومعتمد|
|`/system/resource`|**read**|cpu-load, free-memory, total-memory, uptime, version, board-name|read, api|✅|✅|CHR-SYS-R01|مكتمل ومعتمد|
|`/ip/dhcp-server/lease`|**read / make-static**|address, mac-address, host-name, status, expires-after|write, api|✅|✅|CHR-DHCP-01|مكتمل ومعتمد|
|`/ip/firewall/filter`|**read / safe-edit**|chain, action, src-address, dst-address, protocol, dst-port, place-before|write, policy|✅|✅|CHR-FW-01|مرحلة v2 (مع Revert)|
|`/queue/simple`|**read / create / edit**|name, target, max-limit, burst-limit, priority, place-before|write, api|✅|✅|CHR-QS-01|مرحلة v2|
|`/interface/wireless`|**read / set-channel**|frequency, band, channel-width, ssid, security-profile|write, policy|✅|✅|CHR-WL-01|مرحلة v2 (مؤقت أمان)|

### 3.2 أوامر وقوائم Ubiquiti airOS / airMAX

|الميزة التشغيلية|بروتوكول النقل|العملية|كود الفحص المخبري|الحالة التشغيلية|
|-|-|-|-|-|
|**قراءة بيانات الجهاز الأساسية**|SNMP v2c / v3|read (OIDs: sysDescr, sysUpTime)|UB-INFO-01|مكتمل بالقراءة الخفيفة|
|**مراقبة منافذ الشبكة وحركة المرور**|SNMP v2c / v3|read (IF-MIB: ifInOctets, ifOutOctets)|UB-IF-01|مكتمل بالقراءة الخفيفة|
|**مؤشرات الإشارة والربط (Signal/Noise/CCQ)**|SNMP v2c / v3|read (Enterprise Ubiquiti OIDs)|UB-SIG-01|مكتمل بالقراءة الخفيفة|
|**قائمة المحطات المتصلة (Clients Table)**|SNMP v2c / v3|read (ubntWlStatTable)|UB-CL-01|مكتمل بالقراءة الخفيفة|
|**تعديل التردد وقدرة البث اللاسلكي**|SSH CLI|write (أمر CLI مع مؤقت التراجع)|UB-CH-01|مرحلة v3 (جهاز فيزيائي)|
|**إعادة تشغيل الجهاز الآمنة**|SSH CLI|execute (`/sbin/reboot`)|UB-RB-01|مرحلة v3 (جهاز فيزيائي)|

\---

## الجزء 4: نظام التصميم الشامل (Design System \& UI Tokens)

### 4.1 رموز التصميم المعتمدة (Design Tokens)

```css
/\* src/styles/tokens.css \*/
:root {
  /\* لوحة الألوان الأساسية - الوضع الفاتح \*/
  --color-bg-canvas: #f8fafc;
  --color-bg-surface: #ffffff;
  --color-bg-surface-subtle: #f1f5f9;
  --color-fg-primary: #0f172a;
  --color-fg-secondary: #475569;
  --color-fg-muted: #64748b;
  --color-border-subtle: #e2e8f0;
  --color-border-strong: #cbd5e1;

  /\* ألوان الحالات الوظيفية \*/
  --color-primary: #2563eb;
  --color-primary-hover: #1d4ed8;
  --color-primary-light: #eff6ff;
  --color-success: #16a34a;
  --color-success-bg: #f0fdf4;
  --color-warning: #d97706;
  --color-warning-bg: #fffbeb;
  --color-danger: #dc2626;
  --color-danger-bg: #fef2f2;
  --color-info: #0284c7;
  --color-info-bg: #f0f9ff;

  /\* سلم المسافات المتوازن (قاعدة 4px) \*/
  --space-0-5: 2px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;

  /\* استدارة الحواف \*/
  --radius-xs: 2px;
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-full: 9999px;

  /\* الخطوط والطباعة \*/
  --font-sans: 'IBM Plex Sans Arabic', 'Noto Sans Arabic', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  --text-xs: 11px;
  --text-sm: 13px;
  --text-base: 14px;
  --text-md: 16px;
  --text-lg: 18px;
  --text-xl: 20px;
  --text-2xl: 24px;

  /\* الظلال البصرية \*/
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.04);
}

\[data-theme="dark"] {
  --color-bg-canvas: #090d16;
  --color-bg-surface: #0f172a;
  --color-bg-surface-subtle: #1e293b;
  --color-fg-primary: #f8fafc;
  --color-fg-secondary: #cbd5e1;
  --color-fg-muted: #94a3b8;
  --color-border-subtle: #1e293b;
  --color-border-strong: #334155;

  --color-primary-light: rgba(37, 99, 235, 0.15);
  --color-success-bg: rgba(22, 163, 74, 0.15);
  --color-warning-bg: rgba(217, 119, 6, 0.15);
  --color-danger-bg: rgba(220, 38, 38, 0.15);
  --color-info-bg: rgba(2, 132, 199, 0.15);
}
```

### 4.2 مكتبة المكونات الموحدة

* **Button**: متعدد الأنماط (`primary`, `secondary`, `outline`, `ghost`, `danger`) وبأحجام منضبطة (`sm`, `md`, `lg`) مع حالات التحميل والتعطيل ومراعاة لوحة المفاتيح.
* **Table**: جدول احترافي عالي الأداء يدعم العرض الافتراضي (Virtualization)، التحكم بكثافة الأسطر، الفرز، البحث الفوري، وتثبيت الترويسة.
* **Input / Select**: حقول إدخال تدعم نصوص المساعدة، التحقق المباشر من الأخطاء، مع دعم المحاذاة الدقيقة للنصوص العربية والأرقام اللاتينية.
* **Modal / Drawer**: نوافذ منبثقة مزودة بحبس التركيز التلقائي (Focus Trap)، إغلاق عبر زر ESC، ومنع التمرير الخلفي للشاشة.
* **Badge / StatusDot**: وسوم الحالات الوظيفية لعرض حالات العمليات الثمانية ومؤشرات الاتصال الحية بألوان معيارية.
* **Toast Notifications**: إشعارات عائمة غير حاجبة تظهر في زاوية الشاشة لتأكيد العمليات أو التنبيه بالأخطاء دون استخدام نوافذ المتصفح الافتراضية.

### 4.3 قواعد المحاذاة والاتجاه العربي الصارم (RTL Rules)

* تفعيل `dir="rtl"` كإعداد أصيل على مستوى وثيقة التطبيق.
* وضع حاويات `dir="ltr"` صريحة حول:

  * عناوين IP و MAC Addresses والمنافذ الشبكية.
  * المعرفات التقنية UUIDs ورموز الكروت المسلسلة.
  * الأرقام الإحصائية ومعدلات النقل (مثل `10.5 MB/s` أو `192.168.88.1`).
  * مسارات القوائم في المايكروتك (مثل `/ip/hotspot/user`).
* عكس أيقونات التنقل والاتجاه (مثل أسهم السابق والتالي وأشرطة التقدم) تلقائياً لتناسب حركة العين من اليمين لليسار.

\---

## الجزء 5: مخطط قاعدة البيانات الكامل (Drizzle ORM Schema \& Triggers)

```typescript
// src/db/schema.ts
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// 1. أجهزة التوجيه والشبكة
export const routers = sqliteTable('routers', {
  id: text('id').primaryKey(),
  vendor: text('vendor').notNull(),           // 'mikrotik' | 'ubiquiti-airmax' | 'unifi'
  name: text('name').notNull(),
  host: text('host').notNull(),
  port: integer('port').notNull(),
  transport: text('transport').notNull(),     // 'api' | 'api-ssl' | 'rest' | 'ssh' | 'snmp'
  rosVersion: text('ros\_version'),
  model: text('model'),
  firmware: text('firmware'),
  branchId: text('branch\_id'),
  isActive: integer('is\_active').notNull().default(1),
  createdAt: integer('created\_at').notNull(),
  updatedAt: integer('updated\_at').notNull(),
  version: integer('version').notNull().default(1),
}, (t) => ({
  hostPortVendor: uniqueIndex('routers\_host\_port\_vendor').on(t.host, t.port, t.vendor),
}));

// 2. اعتمادات حسابات الخدمة المحدودة (المحفوظة في OS Keychain)
export const serviceCredentials = sqliteTable('service\_credentials', {
  id: text('id').primaryKey(),
  routerId: text('router\_id').notNull().references(() => routers.id, { onDelete: 'cascade' }),
  username: text('username').notNull(),
  keychainRef: text('keychain\_ref').notNull(),   // مرجع فريد في خزينة أسرار نظام التشغيل فقط
  scope: text('scope').notNull(),                // 'read-only' | 'limited'
  approvedBy: text('approved\_by').notNull(),
  approvedAt: integer('approved\_at').notNull(),
  createdAt: integer('created\_at').notNull(),
}, (t) => ({
  routerUserUnique: uniqueIndex('sc\_router\_user').on(t.routerId, t.username),
}));

// 3. سجل المشتركين المحلي للأرشفة والتتبع
export const subscribers = sqliteTable('subscribers', {
  id: text('id').primaryKey(),
  routerId: text('router\_id').notNull().references(() => routers.id),
  source: text('source').notNull(),              // 'hotspot' | 'pppoe' | 'usermanager'
  username: text('username').notNull(),
  profile: text('profile'),
  comment: text('comment'),
  state: text('state').notNull(),                // 'created' | 'active' | 'expired' | 'disabled'
  expiresAt: integer('expires\_at'),
  createdAt: integer('created\_at').notNull(),
  updatedAt: integer('updated\_at').notNull(),
  version: integer('version').notNull().default(1),
}, (t) => ({
  subUnique: uniqueIndex('sub\_unique').on(t.routerId, t.source, t.username),
  stateIdx: index('sub\_state\_idx').on(t.state),
}));

// 4. دفعات الكروت المُولدة
export const voucherBatches = sqliteTable('voucher\_batches', {
  id: text('id').primaryKey(),
  routerId: text('router\_id').notNull().references(() => routers.id),
  count: integer('count').notNull(),
  prefix: text('prefix'),
  profile: text('profile'),
  priceCents: integer('price\_cents').notNull().default(0),
  status: text('status').notNull(),              // 'pending' | 'running' | 'completed' | 'partial' | 'failed'
  operationId: text('operation\_id'),
  createdAt: integer('created\_at').notNull(),
});

// 5. بطاقات الكروت التفصيلية
export const vouchers = sqliteTable('vouchers', {
  id: text('id').primaryKey(),
  batchId: text('batch\_id').notNull().references(() => voucherBatches.id),
  username: text('username').notNull(),
  passwordHash: text('password\_hash').notNull(),
  passwordEncForPrint: text('password\_enc\_for\_print'), // يُفرغ فور اكتمال الطباعة
  profile: text('profile'),
  isSold: integer('is\_sold').notNull().default(0),
  soldAt: integer('sold\_at'),
  printedAt: integer('printed\_at'),
  operationId: text('operation\_id'),
  version: integer('version').notNull().default(1),
}, (t) => ({
  voucherUnique: uniqueIndex('voucher\_unique').on(t.batchId, t.username),
}));

// 6. السجلات المالية والمحاسبية المقفلة
export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),                  // 'sale' | 'refund' | 'expense' | 'reversal'
  amountCents: integer('amount\_cents').notNull(),// مبالغ بالأعداد الصحيحة بالسنتات
  currency: text('currency').notNull(),          // 'YER' | 'SAR' | 'USD'
  subscriberId: text('subscriber\_id'),
  voucherId: text('voucher\_id'),
  resellerId: text('reseller\_id'),
  status: text('status').notNull(),              // 'confirmed' | 'reversed'
  idempotencyKey: text('idempotency\_key').notNull().unique(),
  reversalOf: text('reversal\_of'),               // معرّف المعاملة الأصلية المعكوسة
  reason: text('reason'),
  createdAt: integer('created\_at').notNull(),
});

// 7. سجل تتبع الحالات اللحظية للعمليات
export const operationLog = sqliteTable('operation\_log', {
  id: text('id').primaryKey(),                   // operationId UUID
  routerId: text('router\_id').references(() => routers.id),
  operationType: text('operation\_type').notNull(),
  state: text('state').notNull(),                // الحالات الثمانية
  idempotencyKey: text('idempotency\_key').notNull().unique(),
  payloadHash: text('payload\_hash'),
  startedAt: integer('started\_at').notNull(),
  finishedAt: integer('finished\_at'),
  evidence: text('evidence'),                    // وثائق الإثبات بتنسيق JSON
  version: integer('version').notNull().default(1),
}, (t) => ({
  opStateIdx: index('op\_state\_idx').on(t.state),
}));

// 8. يومية التراجع الإلزامية لحماية الراوتر
export const revertJournal = sqliteTable('revert\_journal', {
  changeId: text('change\_id').primaryKey(),
  routerId: text('router\_id').notNull(),
  vendor: text('vendor').notNull(),
  appliedAt: integer('applied\_at').notNull(),
  revertCommands: text('revert\_commands').notNull(),  // أوامر الاسترجاع بتنسيق JSON
  deadlineAt: integer('deadline\_at').notNull(),
  confirmedAt: integer('confirmed\_at'),
  status: text('status').notNull(),              // 'pending' | 'confirmed' | 'reverted' | 'expired\_unknown' | 'failed\_revert'
  attemptCount: integer('attempt\_count').notNull().default(0),
  lastAttemptAt: integer('last\_attempt\_at'),
  evidence: text('evidence'),
});

// 9. سجل التدقيق العام المحمي من التعديل (Append-Only)
export const auditLog = sqliteTable('audit\_log', {
  id: text('id').primaryKey(),
  userId: text('user\_id').references(() => appUsers.id),
  action: text('action').notNull(),
  target: text('target'),
  routerId: text('router\_id'),
  result: text('result').notNull(),
  context: text('context'),                      // سياق العملية خالٍ من الأسرار
  createdAt: integer('created\_at').notNull(),
}, (t) => ({
  auditUserIdx: index('audit\_user\_idx').on(t.userId),
  auditCreatedIdx: index('audit\_created\_idx').on(t.createdAt),
}));

// 10. مستخدمو لوحة التحكم والصلاحيات
export const appUsers = sqliteTable('app\_users', {
  id: text('id').primaryKey(),
  username: text('username').notNull(),
  passwordHash: text('password\_hash').notNull(),
  role: text('role').notNull(),                  // 'admin' | 'tech' | 'reseller' | 'accountant' | 'viewer'
  branchId: text('branch\_id'),
  failedAttempts: integer('failed\_attempts').notNull().default(0),
  lockedUntil: integer('locked\_until'),
  isActive: integer('is\_active').notNull().default(1),
  createdAt: integer('created\_at').notNull(),
}, (t) => ({
  appUserUnique: uniqueIndex('app\_user\_unique').on(t.username),
}));

// 11. قوالب الكروت وصفحات الهوتسبوت
export const templates = sqliteTable('templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),                  // 'voucher' | 'hotspot-login' | 'portal'
  content: text('content').notNull(),
  version: integer('version').notNull().default(1),
  updatedAt: integer('updated\_at').notNull(),
});

// 12. إعدادات النظام العامة
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated\_at').notNull(),
});
```

#### حماية سجل التدقيق (Audit Log Triggers)

تُنفذ مشغلات SQL التالية أثناء الترحيل التأسيسي لمنع أي تعديل أو حذف في سجلات التدقيق:

```sql
CREATE TRIGGER IF NOT EXISTS audit\_no\_update BEFORE UPDATE ON audit\_log
BEGIN
  SELECT RAISE(ABORT, 'قاعدة أمنية قطعية: سجل التدقيق audit\_log غير قابل للتعديل نهائياً');
END;

CREATE TRIGGER IF NOT EXISTS audit\_no\_delete BEFORE DELETE ON audit\_log
BEGIN
  SELECT RAISE(ABORT, 'قاعدة أمنية قطعية: سجل التدقيق audit\_log غير قابل للحذف نهائياً');
END;
```

\---

## الجزء 6: نموذج التهديدات الأمنية المنهجي (STRIDE Threat Model)

|تصنيف التهديد|التهديد المحتمل في بيئة الشبكات|الضابط الوقائي المعماري المعتمد|سيناريو الاختبار والتحقق الآلي|
|-|-|-|-|
|**Spoofing (انتحال الهوية)**|انتحال جلسة مهندس أو مشرف والسيطرة على الراوتر.|تشفير الرموز برمز عشوائي فريد لكل إقلاع محلي، قفل الجلسة عند الخمول، ومطابقة مصدر الطلب.|فحص رفض أي استدعاء API يحمل رمزا منتهي الصلاحية أو غير مطابق لمعرف الجلسة الحالية.|
|**Tampering (التلاعب بالبيانات)**|محاولة تعديل سجل المبيعات أو تزييف سجل العمليات.|مشغلات قاعدة بيانات تمنع التعديل والحذف، وحساب مبالغ المعاملات بأرقام صحيحة غير قابلة للتلاعب.|محاولة تنفيذ أمر `UPDATE` أو `DELETE` على جدول `audit\_log` والتأكد من رمي خطأ وإيقاف العملية.|
|**Repudiation (الإنكار)**|قيام فني بتغيير إعداد في الراوتر وإنكار قيامه بذلك.|توثيق كل عملية كتابة في سجل التدقيق باسم المستخدم، المعرف، الطابع الزمني، ونوايا الأوامر.|فحص اكتمال بيانات التوثيق في `audit\_log` تلقائياً فور تنفيذ أي عملية كتابة على الراوتر.|
|**Information Disclosure (تسريب المعلومات)**|ظهور كلمة مرور المشرف أو كروت الشبكة في ملفات السجلات أو شاشات الخطأ.|تنقيح تلقائي فوري (Redaction) يحذف أي حقول تطابق `password` أو `secret` قبل الإخراج.|فحص مسح السجلات والتأكد من عدم احتواء أي سطر على كلمات مرور صريحة عبر اختبار Regex صارم.|
|**Denial of Service (حجب الخدمة)**|إغراق الراوتر بآلاف الاستعلامات مما يؤدي لتوقف توجيه حركة المرور.|تحديد معدل الاستعلامات (`≤ 5 req/s`)، تجميع الطلبات، واستخدام مرشحات `proplist` لتصغير حجم الحزم.|اختبار ضغط محاكي للتأكد من أن وتيرة استعلامات ZCtrl لا ترفع استهلاك معالج الراوتر عن 10%.|
|**Elevation of Privilege (رفع الصلاحيات)**|قيام مستخدم بصلاحية مراقب (`viewer`) بمحاولة حقن كروت أو حذف مشتركين.|فحص الصلاحيات الصارم داخل الواجهة الخلفية (Backend RBAC) على مستوى كل مسار وكل محول.|إرسال طلب حذف أو إضافة باستخدام حساب viewer والتأكد من استقبال رمز `403 Forbidden`.|

\---

## الجزء 7: الدليل الكامل للمهارات الأربعين (The Complete 40 Skills Specification)

### المهارة 1: legacy-audit (تدقيق الكود القائم - وضع القراءة فقط)

```yaml
---
name: legacy-audit
description: تُستدعى لفحص وتقييم شجرة الكود القائمة أو الوحدات السابقة في وضع القراءة فقط دون كتابة أي تعديل.
---
```

* **الغرض**: حصر المشكلات والاعتماديات ونقاط الضعف في الكود الحالي قبل التدخل الجراحي.
* **الخطوات المعيارية**:

  1. قراءة الهيكل العام للمجلدات وفحص تطابقها مع المعمارية النظيفة.
  2. تدقيق ملفات `package.json` و `tsconfig.json` لرصد أي ثغرات أو إعدادات متساهلة.
  3. حصر كافة مواضع الاتصال المباشر بالراوتر وتحديد مدى التزامها بطبقة التجريد.
  4. فحص مواضع تخزين كلمات المرور والأسرار للتأكد من خلوها من التخزين بنص صريح.
  5. توليد تقرير فجوات وصفي يحدد الملفات التي تحتاج إلى تصحيح حسب الأولوية.
* **قائمة التحقق**: عدم تعديل أي ملف أثناء التدقيق، توثيق مسار كل ملف، وفهرسة المشكلات بدقة.

### المهارة 2: pre-delivery-audit (التدقيق الذاتي الصارم قبل التسليم)

```yaml
---
name: pre-delivery-audit
description: تُستدعى قبل إنهاء أي مهمة للتحقق من عدم كسر أي من القواعد الحاكمة ومن خلو الكود من الأخطاء.
---
```

* **الغرض**: منع تسليم كود غير مكتمل أو يحتوي على استثناءات غير معالجة أو مخالفات لقواعد الأمان.
* **الخطوات المعيارية**:

  1. تشغيل الفحص الساكن للأنواع `tsc --noEmit` والتأكد من تحقيق 0 أخطاء.
  2. فحص بناء المشروع بالكامل عبر أمر البناء الإنتاجي للتأكد من سلامة الحزم.
  3. التحقق من إزالة كافة جمل `console.log` المؤقتة أو نصوص الأخطاء التجريبية.
  4. التأكد من خلو الواجهات من نوافذ المتصفح الافتراضية المزعجة (`alert`, `confirm`, `prompt`).
  5. التحقق من التزام النصوص باللغة العربية السليمة ومحاذاة الـ RTL الصحيحة.
* **قائمة التحقق**: نجاح أمر البناء، خلو الكود من التحذيرات القاتلة، وتأكيد جاهزية التسليم.

### المهارة 3: safe-config-change (تغيير إعدادات الراوتر بأمان)

```yaml
---
name: safe-config-change
description: تُستدعى عند تنفيذ أي تعديل هيكلي على إعدادات الراوتر (عناوين، جدران نارية، إعدادات بث).
---
```

* **الغرض**: ضمان عدم انقطاع الاتصال بالراوتر نتيجة تغيير خاطئ في الإعدادات.
* **الخطوات المعيارية**:

  1. استعلام الحالة الراهنة وتوثيقها كمرجع للعودة.
  2. تجهيز خطة التغيير `ChangePlan` مع تحديد مستوى الخطورة.
  3. إنشاء أوامر التراجع المعكوسة وتخزينها في جدول `revert\_journal` الدائم مع مهلة زمنية محددة.
  4. تطبيق التغيير على الراوتر والاستماع للنتيجة.
  5. انتظار تأكيد المشرف البشري؛ إذا انقضت المهلة دون تأكيد، يتم استدعاء أمر التراجع فوراً.
* **قائمة التحقق**: وجود أمر تراجع دقيق، تسجيل الخطة في قاعدة البيانات، والتحقق بعد التطبيق.

### المهارة 4: router-command (بناء أوامر RouterOS المنضبطة)

```yaml
---
name: router-command
description: تُستدعى لتجهيز وصياغة استعلامات وأوامر المايكروتك بصيغة مهيكلة وآمنة.
---
```

* **الغرض**: منع حقن الأوامر العشوائية وضمان التوافق بين بروتوكول API الكلاسيكي والـ REST API.
* **الخطوات المعيارية**:

  1. تحديد المسار الهيكلي بدقة (مثال: `/ip/hotspot/user/add`).
  2. التحقق من صحة المعلمات ومطابقتها للمدخلات المسموح بها في RouterOS.
  3. إضافة معامل `.proplist` في استعلامات القراءة لطلب الحقول الضرورية فقط وتوفير موارد الراوتر.
  4. تشفير ومعالجة القيم التي تحتوي على مسافات أو رموز خاصة بطريقة صحيحة.
* **قائمة التحقق**: استخدام المصفوفات المهيكلة بدلاً من السلاسل النصية الخام، وحظر دمج مدخلات غير مفلترة.

### المهارة 5: api-boundary-handler (إدارة بوابات REST و WebSocket)

```yaml
---
name: api-boundary-handler
description: تُستدعى لبناء وتأمين مسارات الخادم ونقاط اتصال المقابس اللحظية.
---
```

* **الغرض**: توفير بوابة اتصالات داخلية آمنة، محصنة ضد الثغرات، وذات أنواع بيانات صارمة.
* **الخطوات المعيارية**:

  1. إحاطة مسار الـ API بمخطط تحقق Zod للمدخلات (`req.body`, `req.query`).
  2. فحص صلاحية دور المستخدم RBAC قبل تمرير الطلب لمنطق الأعمال.
  3. صياغة الاستجابة وفق نمط `Result<T>` الموحد (`{ ok: true, data }` أو `{ ok: false, error }`).
  4. توجيه رسائل التحديث اللحظي عبر خادم WebSocket مع معرّف تسلسلي للحدث.
* **قائمة التحقق**: التحقق من المدخلات، حظر المسارات غير المصرح بها، وتوحيد هيكل الرد.

### المهارة 6: bulk-voucher-generation (توليد الكروت الدفعي فائق السرعة)

```yaml
---
name: bulk-voucher-generation
description: تُستدعى لتوليد كميات كبيرة من كروت الاشتراكات وتشفيرها وتجهيزها للطباعة.
---
```

* **الغرض**: إنتاج آلاف الكروت العشوائية في أجزاء من الثانية دون تجميد الواجهة أو تكرار الرموز.
* **الخطوات المعيارية**:

  1. استخدام مولد أرقام عشوائية آمن تشفيرياً (`crypto.randomBytes`).
  2. التأكد من تفرد الرموز ومطابقتها للطول والبادئة المحددة من المستخدم.
  3. حساب هاش كلمة المرور للتحقق وتشفير الرمز الأصلي مؤقتاً لغرض التصدير والطباعة.
  4. إدراج الكروت في قاعدة البيانات المحلية ضمن معاملة ذرية موحدة (Database Transaction).
  5. ربط الدفعة بمعرّف فريد يسهل تصديرها، تتبعها، أو حذفها لاحقاً.
* **قائمة التحقق**: تفرد كافة الرموز، سرعة التوليد العالية، وتوثيق تفاصيل الدفعة كاملة.

### المهارة 7: react-view-module (بناء الواجهات الرسومية المعيارية)

```yaml
---
name: react-view-module
description: تُستدعى لبناء وتطوير الشاشات الرئيسية وعروض البيانات في واجهة المستخدم.
---
```

* **الغرض**: تقديم شاشات سريعة الاستجابة، خالية من التشنج، متوافقة مع نظام التصميم واللغة العربية.
* **الخطوات المعيارية**:

  1. استخدام خطافات النطاق المخصصة (Custom Domain Hooks) لعزل الواجهة عن منطق الشبكة.
  2. استخدام الجداول الافتراضية مع البيانات الكبيرة ومراعاة استقرار التمرير.
  3. دعم اتجاه الـ RTL الأصيل، وعزل العناصر اللاتينية في حاويات `dir="ltr"`.
  4. توفير حالات واضحة للمكون: جاري التحميل (Skeleton/Spinner)، فارغ، خطأ مع زر إعادة المحاولة، وناجح.
* **قائمة التحقق**: خلو الواجهة من التجميد، تطبيق رموز التصميم Tokens، ودعم الشاشات المتعددة.

### المهارة 8: realtime-monitoring-widget (لوحات المراقبة والمؤشرات الحية)

```yaml
---
name: realtime-monitoring-widget
description: تُستدعى لبناء رسوم بيانية ومؤشرات استهلاك الترافيك والموارد اللحظية.
---
```

* **الغرض**: عرض تدفق البيانات واستهلاك المعالج والذاكرة بنبضات حية خفيفة على الراوتر والمتصفح.
* **الخطوات المعيارية**:

  1. استقبال التحديثات عبر قنوات WebSocket الخفيفة.
  2. استخدام مخازن حلقية مقيدة السعة (Rolling Buffers) لا تحتفظ بأكثر من 100 نقطة بيانية للشاشة الواحدة.
  3. تعطيل التحديث التلقائي وإيقاف الاستماع فور إخفاء التبويب أو مغادرة الصفحة لتوفير الذاكرة.
  4. عرض معدلات البايت بصيغ سهلة القراءة (Kbps, Mbps, Gbps) بدقة رقمية صحيحة.
* **قائمة التحقق**: عدم تسريب الذاكرة، توقف المؤقتات عند تفكيك المكون، وسلاسة الرسم البياني.

### المهارة 9: db-migration (إدارة ترحيل وتحديث قواعد البيانات)

```yaml
---
name: db-migration
description: تُستدعى لإنشاء وتطبيق التعديلات على جداول SQLite عبر Drizzle ORM.
---
```

* **الغرض**: تحديث بنية الجداول المحلية بأمان مع ضمان بقاء البيانات السابقة وتطبيق المشغلات الأمنية.
* **الخطوات المعيارية**:

  1. أخذ نسخة احتياطية آلية من ملف قاعدة البيانات قبل بدء أي ترحيل.
  2. كتابة ملف الترحيل SQL بصيغة تقبل التراجع والتحقق.
  3. تنفيذ أوامر إنشاء المشغلات الحامية لسجل التدقيق `audit\_log`.
  4. فحص اتساق البيانات وسلامة الفهارس والمفاتيح الأجنبية بعد الترحيل.
* **قائمة التحقق**: نجاح الترحيل، الحفاظ على البيانات السابقة، وفعالية المشغلات الأمنية.

### المهارة 10: security-review (المراجعة والتدقيق الأمني الدوري)

```yaml
---
name: security-review
description: تُستدعى لفحص الشيفرة المصدرية واكتشاف أي ثغرات برمجية أو تسريب للاعتمادات.
---
```

* **الغرض**: التأكد من خلو النظام من ثغرات OWASP Top 10 ومطابقة مصفوفة تهديدات STRIDE.
* **الخطوات المعيارية**:

  1. تدقيق كافة مدخلات المستخدم والتأكد من تعقيمها ضد هجمات XSS و SQL Injection.
  2. التأكد من تطبيق حماية تزوير الطلبات CSRF ومطابقة الأصول المسموحة CORS.
  3. فحص كافة السجلات وملفات التتبع للتأكد من خلوها المطلق من أي كلمات مرور أو مفاتيح.
  4. مراجعة صلاحيات المسارات والتأكد من فرض RBAC على مستوى البوابات الخلفية.
* **قائمة التحقق**: مطابقة المعايير الأمنية، خلو السجلات من الأسرار، وتأمين كافة المسارات.

### المهارة 11: release-gate (بوابة فحص الاعتماد للإصدارات)

```yaml
---
name: release-gate
description: تُستدعى كبوابة نهائية قبل اعتماد أي إصدار أو حزمة إنتاجية جديدة.
---
```

* **الغرض**: منع خروج أي نسخة إنتاجية لا تستوفي كافة معايير الجودة والاستقرار والأداء.
* **الخطوات المعيارية**:

  1. التحقق من اجتياز فحوصات البناء والأنواع دون أي تجاهل للأخطاء.
  2. مطابقة حجم الحزمة النهائية مع ميزانية الأداء (`≤ 300KB` للـ JS الأولي).
  3. التأكد من اكتمال توثيق الميزات والتغييرات في سجل الإصدارات.
  4. فحص حزمة التثبيت المحلية والتأكد من قدرتها على الإقلاع الذاتي كخدمة نظام.
* **قائمة التحقق**: اجتياز الفحوصات الآلية، مطابقة ميزانيات الأداء، وجاهزية ملف التثبيت.

### المهارة 12: recovery-verification (التحقق من آليات التعافي من الأعطال)

```yaml
---
name: recovery-verification
description: تُستدعى لاختبار سلوك النظام عند حدوث كوارث مفاجئة (انقطاع كهرباء، سقوط شبكة).
---
```

* **الغرض**: التأكد من قدرة ZCtrl على استئناف العمل والتعافي المتسق دون فقدان أو تشويه البيانات.
* **الخطوات المعيارية**:

  1. محاكاة إغلاق قسري للخدمة أثناء عملية توليد كروت أو مزامنة للمشتركين.
  2. إعادة تشغيل الخدمة والتحقق من فحص جدول `operation\_log` و `revert\_journal`.
  3. تصنيف العمليات المعلقة غير المؤكدة كـ `outcome\_unknown` ومطالعة حالة الراوتر.
  4. التأكد من بقاء ملف قاعدة البيانات سليمًا بفضل وضع WAL وعدم حدوث تلف بالجداول.
* **قائمة التحقق**: استعادة الجلسة الآمنة، عدم تكرار العمليات الناجحة، وسلامة قاعدة البيانات.

### المهارة 13: requirements-audit (تدقيق ومطابقة المتطلبات الفنية)

```yaml
---
name: requirements-audit
description: تُستدعى لتدقيق أي كود مكتوب مقابل المتطلبات الأصلية المصرح بها.
---
```

* **الغرض**: منع الانحراف عن المتطلبات الأصلية وتجنب إضافة ميزات غير مدروسة تعقد النظام.
* **الخطوات المعيارية**:

  1. مقارنة الكود المنجز ببنود التكليف ومصفوفة المتطلبات المعمارية.
  2. استبعاد أي كود زائد أو مكونات غير مستخدمة (Dead Code Elimination).
  3. التأكد من أن كل زر وخيار في الواجهة يؤدي وظيفة حقيقية مثبتة وموثقة.
* **قائمة التحقق**: مطابقة المتطلبات بنسبة 100%، وخلو المشروع من الملفات المهملة.

### المهارة 14: regression-and-data-integrity (حماية التكامل ومنع الانحدار)

```yaml
---
name: regression-and-data-integrity
description: تُستدعى عند تعديل أجزاء نواتية للتأكد من عدم تعطل الأجزاء المعتمدة عليها.
---
```

* **الغرض**: الحفاظ على تماسك النظام واستقرار المسارات المشتركة بين الوحدات الوظيفية.
* **الخطوات المعيارية**:

  1. رسم خريطة التأثير للتعديل البرمجي وتحديد الملفات المرتبطة به.
  2. تشغيل سيناريوهات التحقق عبر الوحدات (مثال: التأكد من أن تعديل المشترك يحدّث جداول الجلسات النشطة).
  3. فحص القيود والتأكد من عدم كسر المفاتيح الأجنبية أو تفرد السجلات في قاعدة البيانات.
* **قائمة التحقق**: سلامة الترابط بين المكونات، وثبات النتائج قبل وبعد التعديل.

### المهارة 15: dependency-and-build-audit (تدقيق الاعتماديات والبناء)

```yaml
---
name: dependency-and-build-audit
description: تُستدعى لفحص سلامة الحزم الخارجية وخلوها من الثغرات أو التعارضات.
---
```

* **الغرض**: ضبط سلسلة التوريد البرمجية (Supply Chain Security) والحفاظ على بناء إنتاجي متكرر.
* **الخطوات المعيارية**:

  1. مراجعة ملف `package-lock.json` والتأكد من تطابق إصدارات الحزم.
  2. فحص الحزم المهملة أو التي تحتوي على ثغرات معروفة واستبدالها بحزم موثوقة.
  3. التأكد من عدم تثبيت حزم مكررة الوظيفة (مثل تثبيت مكتبتي تواريخ أو أيقونات مختلفتين).
* **قائمة التحقق**: استقرار قفل الحزم، خلو الاعتماديات من الثغرات الحرجة، وبناء نظيف.

### المهارة 16: zctrl-architecture-conformance (مطابقة معمارية ZCtrl الصارمة)

```yaml
---
name: zctrl-architecture-conformance
description: تُستدعى للتحقق من التزام الملفات بالهيكل المعماري والطبقات الخمس للنظام.
---
```

* **الغرض**: منع كسر الحدود بين الطبقات ومنع وصول واجهة المستخدم المباشر لأجهزة الشبكة.
* **الخطوات المعيارية**:

  1. فحص مسارات الاستيراد والتأكد من عدم استدعاء مكتبات الراوتر من داخل مجلد `src/components/`.
  2. التأكد من مرور كافة عمليات القراءة والكتابة عبر `DeviceAdapter`.
  3. التأكد من عزل بيانات الاتصال والاعتمادات في طبقة البنية التحتية فقط.
* **قائمة التحقق**: نقاء الحدود بين الطبقات، واستخدام واجهات التجريد المعتمدة حصراً.

### المهارة 17: router-operation-safety (معايير الأمان الميداني للراوتر)

```yaml
---
name: router-operation-safety
description: تُستدعى لفحص أوامر التعديل على الراوتر للتأكد من أنها غير تدميرية.
---
```

* **الغرض**: حماية الراوتر من التهيئة غير المقصودة أو حذف قواعد الوصول الحيوية.
* **الخطوات المعيارية**:

  1. فحص الأوامر ومنع أي أمر يحتوي على `reset-configuration` أو حذف جماعي لكافة المستخدمين دون فلتر.
  2. فرض وجود معلمات تحديد دقيقة (`?name=` أو `.id=`) عند استدعاء الحذف أو التعديل.
  3. التحقق من سعة ذاكرة الراوتر والمساحة المتوفرة قبل تنفيذ عمليات النسخ الاحتياطي أو تصدير الملفات.
* **قائمة التحقق**: خلو الأوامر من المخاطر الكارثية، ووجود محددات دقيقة لكل عملية.

### المهارة 18: resumable-bulk-operation (العمليات الدفعية القابلة للاستئناف)

```yaml
---
name: resumable-bulk-operation
description: تُستدعى عند حقن أو تعديل دفعات كبرى من الكروت والمشتركين لضمان استئنافها بعد الانقطاع.
---
```

* **الغرض**: إكمال معالجة العمليات الضخمة من النقطة التي توقفت عندها بدقة دون تكرار العناصر المحقونة.
* **الخطوات المعيارية**:

  1. تقسيم الدفعة الكلية إلى مجموعات عمل صغيرة (Chunks) تحتوي كل منها 10 إلى 20 عنصراً.
  2. تسجيل حالة كل عنصر بشكل منفصل في جدول قاعدة البيانات (`synced`, `pending`, `failed`).
  3. عند حدوث انقطاع، يقوم المحرك بالاستعلام عن آخر عنصر مؤكد واستئناف الدفعة من العنصر التالي مباشرة.
  4. تقديم تقرير إحصائي تفصيلي يوضح العناصر المكتملة والعناصر المتعثرة بعد الانتهاء.
* **قائمة التحقق**: إمكانية الاستئناف الذاتي، عدم تكرار الكروت، وتوفير سجل دقيق لكل عنصر.

### المهارة 19: realtime-and-memory-audit (تدقيق استهلاك الذاكرة والمقابس)

```yaml
---
name: realtime-and-memory-audit
description: تُستدعى لقياس استهلاك الذاكرة وتدقيق كفاءة قنوات المقابس اللحظية.
---
```

* **الغرض**: ضمان بقاء استهلاك التطبيق للذاكرة ضمن الحدود المعتمدة تحت العمل المستمر.
* **الخطوات المعيارية**:

  1. قياس استهلاك الذاكرة الفعلي للـ Backend والتأكد من بقائه دون `300MB RSS`.
  2. فحص عدد اتصالات المقابس النشطة والتأكد من إغلاق القنوات غير المستخدمة.
  3. التأكد من تنظيف كافة مؤقتات `setTimeout` و `setInterval` المجدولة.
* **قائمة التحقق**: ثبات استهلاك الذاكرة عبر الزمن، وخلو التطبيق من تراكم الكائنات المهملة.

### المهارة 20: zctrl-release-acceptance (معايير القبول النهائي للاعتماد)

```yaml
---
name: zctrl-release-acceptance
description: تُستدعى لإصدار شهادة القبول البرمجية للنظام ومطابقة بنود الجاهزية.
---
```

* **الغرض**: التوثيق الرسمي لاكتمال وجاهزية الميزات وفق المعايير العشرة لتعريف الاكتمال (DoD).
* **الخطوات المعيارية**:

  1. مراجعة نتائج كافة الاختبارات والتأكد من عدم وجود أي فحص متجاهل أو معلق.
  2. مطابقة الواجهات مع معايير إمكانية الوصول والتصميم العربي المتجاوب.
  3. التأكد من سلامة ملفات التكوين والوثائق المرجعية للمشروع.
* **قائمة التحقق**: توقيع وثيقة القبول، استيفاء بنود الـ DoD، وجاهزية الإطلاق التشغيلي.

### المهارة 21: operation-state-tracker (تتبع الحالات الثمانية والتعادلية)

```yaml
---
name: operation-state-tracker
description: تُستدعى لإدارة وتحديث حالات العمليات الحساسة وضمان التعادلية (Idempotency).
---
```

* **الغرض**: رصد مسار العمليات خطوة بخطوة ومنع تكرار التنفيذ الخاطئ عند اهتزاز القنوات.
* **الخطوات المعيارية**:

  1. توليد مفتاح تعادلية مشتق من معلمات العملية والطابع الزمني.
  2. فحص وجود عملية سابقة بنفس المفتاح وإرجاع نتيجتها المحفوظة إن وجدت دون إعادة التنفيذ.
  3. تحديث حالة العملية عبر المراحل الثمانية بدقة وربطها بوثائق الإثبات الميداني.
  4. تصنيف الحالات المنقطعة كـ `outcome\_unknown` حتى إجراء الاستعلام التأكيدي.
* **قائمة التحقق**: تطبيق دورة الحالات الثمانية كاملة، وفعالية مفاتيح التعادلية.

### المهارة 22: subscriber-preservation-audit (تدقيق صيانة بيانات المشتركين)

```yaml
---
name: subscriber-preservation-audit
description: تُستدعى للتأكد من عدم المساس ببيانات المشتركين الحالية أثناء عمليات التعديل أو التوليد.
---
```

* **الغرض**: منع الكتابة فوق حسابات المشتركين القائمة أو تعديل ملفات السرعة دون إذن صريح.
* **الخطوات المعيارية**:

  1. إجراء استعلام مسبق على الراوتر للتأكد من عدم وجود اسم المشترك المراد إنشاؤه مسبقاً.
  2. التحقق من سلامة التعليقات والأوصاف المرفقة بالمشتركين لضمان بقاء بيانات التتبع.
  3. التأكد من أن عمليات الحذف الجماعي محصورة حصراً بالكروت المنتهية التابعة للدفعة المحددة.
* **قائمة التحقق**: سلامة كافة المشتركين غير المستهدفين، ومنع الكتابة العشوائية فوق الحسابات.

### المهارة 23: routeros-version-compatibility (تدقيق التوافق مع v6 و v7)

```yaml
---
name: routeros-version-compatibility
description: تُستدعى لاختيار مسار الأوامر الصحيح وفق إصدار نظام التشغيل للراوتر المتصل.
---
```

* **الغرض**: التعامل السلس مع الاختلافات الهيكلية الكبيرة بين إصدارات RouterOS v6 وإصدارات v7.
* **الخطوات المعيارية**:

  1. استعلام إصدار النظام عبر `/system/resource/print` عند بداية الاتصال وتوثيق الرقم بدقة.
  2. توجيه استعلامات UserManager إلى المسار المتوافق (بنية v6 القديمة أو بنية v7 الحديثة كلياً).
  3. ضبط تنسيق معلمات التوجيه والفايروول وفق المتطلبات الخاصة بكل إصدار.
* **قائمة التحقق**: اكتشاف الإصدار بدقة، وتوجيه الأوامر للمسار الصحيح دون أخطاء بناء جملة.

### المهارة 24: credentials-lifecycle-audit (تدقيق دورة حياة الاعتمادات والأسرار)

```yaml
---
name: credentials-lifecycle-audit
description: تُستدعى لمراقبة ومراجعة أمان كلمات المرور والمفاتيح عبر مراحل عمل البرنامج.
---
```

* **الغرض**: التحقق الصارم من تطبيق مبدأ Zero-Trust وعدم تخزين كلمات مرور المشرف في أي مكان دائم.
* **الخطوات المعيارية**:

  1. فحص الكود للتأكد من طلب كلمة المرور الرئيسية في بداية الجلسة والاحتفاظ بها في الذاكرة المؤقتة فقط.
  2. تدقيق أذونات حسابات الخدمة المقيدة والتأكد من حفظها الحصري داخل خزينة أسرار النظام (Keychain).
  3. التأكد من مسح كلمات مرور الكروت المعدة للطباعة فور إتمام عملية الطباعة والتصدير.
* **قائمة التحقق**: انعدام كلمات المرور الصريحة في قواعد البيانات أو الملفات، ومسح الأسرار المؤقتة فوراً.

### المهارة 25: ai-assistant-safety (ضوابط وأمان المساعد الذكي)

```yaml
---
name: ai-assistant-safety
description: تُستدعى للتحكم في مقترحات الذكاء الاصطناعي وعزلها عن التنفيذ المباشر على الراوتر.
---
```

* **الغرض**: استغلال قدرات الذكاء الاصطناعي في الفهم والتحليل دون تعريض الشبكة لأي خطر تشغيلي.
* **الخطوات المعيارية**:

  1. العمل في وضع الاقتراح فقط (Advisory Mode)؛ حظر الربط المباشر بين المساعد وبوابات التنفيذ.
  2. تنقيح كافة البيانات المرسلة للاستفسار من أي أسرار، أرقام كروت، أو عناوين خاصة.
  3. عرض الأمر المقترح بوضوح للمهندس مع بيان تأثيره المحتمل وزر تأكيد يدوي منفصل.
  4. توفير مفتاح تعطيل فوري (Kill Switch) لإيقاف وحدة المساعد في حال الرغبة التشغيلية.
* **قائمة التحقق**: تنقيح البيانات المدخلة، حظر التنفيذ التلقائي، واشتراط الموافقة البشرية.

### المهارة 26: subscriber-operations (إدارة عمليات المشتركين المعيارية)

```yaml
---
name: subscriber-operations
description: تُستدعى لتنفيذ عمليات إدارة الحسابات الفردية والجماعية لمشتركي الشبكة.
---
```

* **الغرض**: إضافة، تعديل، حذف، وتجديد اشتراكات HotSpot و PPPoE و UserManager بكفاءة عالية.
* **الخطوات المعيارية**:

  1. التحقق من مطابقة اسم المستخدم وكلمة المرور وسياسات التسمية المعتمدة.
  2. فحص وجود بروفايل السرعة المحدد على الراوتر قبل ربطه بالمشترك لمنع الأخطاء.
  3. تطبيق التعديلات مع القراءة اللاحقة للتأكد من سريان المعلمات بشكل فوري على الراوتر.
  4. تحديث سجلات التتبع المحلية للمشترك لتعكس الحالة التشغيلية الحقيقية.
* **قائمة التحقق**: سلامة الربط مع الراوتر، والتحقق الميداني بعد التنفيذ.

### المهارة 27: active-session-control (إدارة ومراقبة الجلسات النشطة)

```yaml
---
name: active-session-control
description: تُستدعى لاستعراض المتصلين حالياً على الشبكة والتحكم بجلساتهم وفصلها.
---
```

* **الغرض**: كشف ومراقبة المستخدمين المتصلين في الوقت الفعلي مع إمكانية الطرد الفوري وحساب الاستهلاك.
* **الخطوات المعيارية**:

  1. استعلام جدول الجلسات النشطة عبر `/ip/hotspot/active` أو `/ppp/active` بمرشحات خفيفة.
  2. تجميع البيانات وحساب مدة الاتصال واستهلاك الرفع والتحميل بدقة.
  3. تنفيذ أمر الطرد (Kick / Remove) عند الطلب مع توثيق سبب الإجراء في سجل العمليات.
  4. تحديث واجهة المستخدم فوراً لإزالة الجلسة المنتهية دون الحاجة لإعادة تحميل الصفحة كاملة.
* **قائمة التحقق**: دقة البيانات الحية، سرعة الاستجابة لأمر الطرد، وسلاسة تحديث الواجهة.

### المهارة 28: subscriber-data-lifecycle (دورة حياة بيانات المشتركين)

```yaml
---
name: subscriber-data-lifecycle
description: تُستدعى لإدارة حالات المشتركين عبر مسارها الكامل (إنشاء، تفعيل، انتهاء، أرشفة).
---
```

* **الغرض**: تنظيم وتوثيق مراحل اشتراك العميل ومتابعة تواريخ الصلاحية وتصفير العدادات بأمان.
* **الخطوات المعيارية**:

  1. تسجيل تاريخ بدء وانتهاء الاشتراك وحساب حدود البيانات المتبقية.
  2. نقل الحسابات المنتهية إلى حالة التعطيل أو العزل دون حذف سجلاتها المالية وتاريخ استخدامها.
  3. توفير أدوات أرشفة دورية للمشتركين غير النشطين لتخفيف الحمل على جداول الراوتر الحية.
* **قائمة التحقق**: اكتمال مراحل دورة الحياة، والاحتفاظ بالسجلات التاريخية للمشتركين.

### المهارة 29: rbac-enforcement (فرض الصلاحيات الصارم على البوابات)

```yaml
---
name: rbac-enforcement
description: تُستدعى للتحقق من أذونات المستخدم على مستوى كل عملية ونطاق في الواجهة الخلفية.
---
```

* **الغرض**: منع وصول أو تنفيذ أي مستخدم لعمليات تتجاوز دوره الوظيفي المحدد بدقة.
* **الخطوات المعيارية**:

  1. التحقق من هوية المستخدم ودوره (`admin`, `tech`, `reseller`, `accountant`, `viewer`).
  2. مطابقة العملية المطلوبة مع مصفوفة الصلاحيات الثلاثية (الوحدة، العملية، ونطاق الفرع).
  3. رفض الطلبات غير المصرح بها فوراً مع إرجاع رمز `403` وتسجيل محاولة التجاوز في سجل التدقيق.
* **قائمة التحقق**: فرض التحقق في الـ Backend حصراً وعدم الاكتفاء بإخفاء أزرار الواجهة.

### المهارة 30: user-import-export (استيراد وتصدير بيانات المستخدمين)

```yaml
---
name: user-import-export
description: تُستدعى لاستيراد وتصدير قوائم المشتركين والكروت عبر صيغ CSV و Excel.
---
```

* **الغرض**: تسهيل ترحيل البيانات بين الأنظمة المختلفة وإصدار النسخ الاحتياطية المجدولة بأمان.
* **الخطوات المعيارية**:

  1. فحص وتدقيق هيكل الملف المستورد ومطابقة أسماء الأعمدة والحقول الإلزامية.
  2. إظهار نافذة معاينة تتيح للمشرف مراجعة الحسابات ورصد التعارضات قبل الحقن الفعلي.
  3. استخدام توليد التدفق المستمر (Streaming) عند تصدير البيانات الضخمة لتفادي استهلاك الذاكرة.
  4. تضمين معرّف ترميز الحروف العربي القياسي (UTF-8 with BOM) لضمان سلامة قراءة الأسماء العربية في Excel.
* **قائمة التحقق**: دقة معالجة النصوص العربية، إظهار المعاينة المسبقة، وخفة استهلاك الذاكرة.

### المهارة 31: device-adapter-contract (معايير بناء وتوسعة محولات الأجهزة)

```yaml
---
name: device-adapter-contract
description: تُستدعى عند تطوير أو توسعة محول اتصال بجهاز جديد وفق واجهة DeviceAdapter.
---
```

* **الغرض**: ضمان التزام كافة محولات الأجهزة بالعقد المعماري الموحد لضمان التوافقية الشاملة.
* **الخطوات المعيارية**:

  1. تطبيق الواجهة المعمارية `DeviceAdapter` بكافة دوالها (`detect`, `capabilities`, `read`, `plan`, `apply`, `verify`).
  2. صياغة الاستجابات دائماً بنمط `Result<T>` المعياري.
  3. عزل بروتوكولات الاتصال وأكواد الصانع في المجلد المخصص للمحول.
* **قائمة التحقق**: اكتمال تنفيذ دوال العقد، واستيفاء مصفوفة القدرات الخاصة بالمحول.

### المهارة 32: wireless-link-safe-change (التعديل الآمن للروابط اللاسلكية)

```yaml
---
name: wireless-link-safe-change
description: تُستدعى عند تعديل معلمات البث أو الترددات للروابط اللاسلكية ذات الأطراف المتباعدة.
---
```

* **الغرض**: منع انقطاع الاتصال برواد الروابط اللاسلكية البعيدة في الأبراج والمواقع النائية.
* **الخطوات المعيارية**:

  1. التحقق من تحديد الطرف المدار البعيد (Station) والطرف المحلي (Access Point).
  2. تطبيق التعديل على الطرف البعيد أولاً مصحوباً بمؤقت تراجع تلقائي (Revert Timer).
  3. تطبيق التعديل على الطرف المحلي بعد نجاح الطرف البعيد.
  4. التحقق من استقرار الإشارة وعودة حركة البيانات قبل إرسال تأكيد الحفظ الدائم.
* **قائمة التحقق**: تطبيق ترتيب التعديل الصارم، ووجود مؤقت التراجع التلقائي لحماية الرابط.

### المهارة 33: snmp-integration (تكامل المراقبة عبر بروتوكول SNMP)

```yaml
---
name: snmp-integration
description: تُستدعى لقراءة مؤشرات الأداء وحركة المرور عبر استعلامات SNMP الخفيفة.
---
```

* **الغرض**: الحصول على تليمترية دقيقة لمنافذ الراوتر والأجهزة اللاسلكية بأقل استهلاك ممكن للمعالج.
* **الخطوات المعيارية**:

  1. دعم إصداري SNMP v2c و SNMP v3 مع تفضيل v3 لتأمين التشفير.
  2. استخدام معرفات الكائنات الموحدة القياسية (Standard MIB OIDs) لحركة المنافذ وحالة الموارد.
  3. تخزين الاعتمادات الخاصة بـ SNMP بأمان، وتجنب تكرار الاستعلامات في فترات زمنية متقاربة جداً.
* **قائمة التحقق**: دقة القراءات، خفة الحمل على الجهاز، وحماية بيانات الاتصال.

### المهارة 34: ubiquiti-airos-integration (تكامل أجهزة Ubiquiti airOS)

```yaml
---
name: ubiquiti-airos-integration
description: تُستدعى لإدارة ومراقبة معدات Ubiquiti airMAX العاملة بنظام airOS.
---
```

* **الغرض**: قراءة تفاصيل الإشارة والتشويش والعملاء المتصلين، وإجراء التعديلات الآمنة على أجهزة يوبيكويتي.
* **الخطوات المعيارية**:

  1. استعلام بيانات النظام وقوة الإشارة ونسبة التشويش عبر OIDs المعتمدة من Ubiquiti.
  2. تنفيذ عمليات الكتابة والتعديل عبر جلسات SSH مشفرة منضبطة بالمعايير بعد اختبار الفريم وير.
  3. التأكد من حفظ الإعدادات وإعادة تشغيل الخدمات دون فقدان الوصول للجهاز.
* **قائمة التحقق**: القراءة الخفيفة عبر SNMP، والكتابة المنضبطة عبر SSH مع التراجع الآمن.

### المهارة 35: hotspot-portal-builder (إدارة وتصميم صفحات تسجيل الدخول)

```yaml
---
name: hotspot-portal-builder
description: تُستدعى لتصميم وتخصيص ورفع صفحات تسجيل دخول الهوتسبوت على الراوتر.
---
```

* **الغرض**: توفير صفحات هبوط وتسجيل دخول تفاعلية، متوافقة مع الهواتف الذكية وتدعم اللغة العربية بالكامل.
* **الخطوات المعيارية**:

  1. توفير محرر مرئي يتيح تخصيص الشعارات، التعليمات، وأسعار الباقات بسهولة.
  2. إنتاج كود HTML/CSS نظيف وخفيف وخالٍ من أي مكتبات خارجية معقدة لضمان التحميل السريع على الأجهزة الضعيفة.
  3. حظر تضمين أي مفاتيح سرية أو أسرار برمجية داخل كود الصفحة المرفوع للراوتر.
  4. رفع الملفات إلى مسار الهوتسبوت المحدد على الراوتر والتحقق من سلامة العرض.
* **قائمة التحقق**: خفة الصفحة، توافقها مع معايير RTL، وخلوها التام من الأسرار البرمجية.

### المهارة 36: payments-and-ledger (إدارة المالية والدفع والقيود المحاسبية)

```yaml
---
name: payments-and-ledger
description: تُستدعى عند معالجة المبيعات، العمولات، المصروفات، والإغلاقات المحاسبية اليومية.
---
```

* **الغرض**: بناء نظام محاسبي متين يوثق كافة التدفقات المالية لكروت الاشتراكات بدقة متناهية.
* **الخطوات المعيارية**:

  1. تخزين المبالغ المالية دائماً بالأعداد الصحيحة لأصغر فئة نقدية (`amountCents`) لمنع أخطاء الفاصلة العائمة.
  2. ربط كل حركة مالية بمفتاح تعادلية فريد `idempotencyKey` لمنع تكرار القيد المالي عند إعادة الإرسال.
  3. منع حذف أي سجل مالي نهائياً؛ العمليات الخاطئة أو المسترجعة تسجل كحركة عكسية مستقلة (`reversal`).
  4. توليد تقارير الإغلاق اليومي والمطابقة المالية بتنسيقات مقفلة غير قابلة للتعديل بأثر رجعي.
* **قائمة التحقق**: استخدام الأعداد الصحيحة للعملات، تطبيق مبدأ القيد العكسي بدلاً من الحذف، وثبات السجلات.

### المهارة 37: report-and-export (نظام التقارير المتقدم والتصدير والطباعة)

```yaml
---
name: report-and-export
description: تُستدعى لتوليد وطباعة الكروت، وتصدير التقارير المالية والإحصائية بصيغ PDF و Excel.
---
```

* **الغرض**: تقديم مخرجات طباعية احترافية ملائمة للطابعات الحرارية وطابعات الشيتات، وتقارير رقمية دقيقة.
* **الخطوات المعيارية**:

  1. دعم الطباعة الحرارية المباشرة (Thermal Vouchers) بقياسات الورق القياسية (80mm و 58mm).
  2. تضمين الخطوط العربية السليمة داخل ملفات PDF لضمان طباعة النصوص بوضوح تام دون تقطع الحروف.
  3. استخدام تقنية التدفق للبيانات الكبيرة لمنع استنزاف ذاكرة الخادم أثناء إنشاء التقارير الضخمة.
  4. تنقيح التقارير من أي معلومات سرية أو تفاصيل غير مصرح بها للمستخدم الطالب للتقرير.
* **قائمة التحقق**: جودة إخراج النصوص العربية، التوافق مع الطابعات الحرارية، وسلامة ترويسات الملفات.

### المهارة 38: performance-budget-check (التحقق من ميزانيات الأداء الرقمية)

```yaml
---
name: performance-budget-check
description: تُستدعى لقياس ومقارنة مؤشرات أداء النظام مع الحدود المعمارية الإلزامية في §33.
---
```

* **الغرض**: ضمان بقاء النظام سريعاً وخفيفاً ومنع تدهور الأداء مع تراكم الكود والميزات الجديدة.
* **الخطوات المعيارية**:

  1. قياس حجم حزم الجافاسكريبت الناتجة والتأكد من أنها لا تتجاوز `300KB` مضغوطة.
  2. قياس زمن أول ظهور للمحتوى FCP وزمن الجاهزية للتفاعل TTI عبر أدوات الفحص المعتمدة.
  3. فحص استهلاك الذاكرة والمعالج للخدمة الخلفية والتأكد من بقاء الـ RSS أقل من `300MB`.
  4. توثيق نتائج القياس في تقرير رسمي ومقارنتها بالحدود المعمارية قبل السماح بالاعتماد.
* **قائمة التحقق**: تحقيق كافة المعايير الرقمية، وعدم تجاوز الميزانيات المحددة في الدستور المعماري.

### المهارة 39: chr-lab-testing (الاختبار المنهجي على الراوتر الافتراضي CHR)

```yaml
---
name: chr-lab-testing
description: تُستدعى لتجهيز مختبرات الفحص الافتراضية ومحاكاة أعطال الراوتر وسيناريوهات الفشل.
---
```

* **الغرض**: إثبات صحة وموثوقية الأوامر والتعافي من الانهيارات في بيئة آمنة وقابلة للتكرار التام.
* **الخطوات المعيارية**:

  1. تشغيل بيئة MikroTik CHR بنسخ محددة (v6 و v7) عبر سكربتات إعداد آلية موحدة.
  2. محاكاة سيناريوهات الفشل الحرجة: انقطاع الكهرباء المفاجئ، فقدان الحزم بنسبة 50%، وانتهاء مهلة الاتصال.
  3. التحقق من سلامة ردود الفعل وتوثيق الأدلة الميدانية لكل سيناريو في ملفات تقارير مؤرخة.
  4. عدم ادعاء المطابقة على الأجهزة الفيزيائية الحقيقية إلا بعد الانتقال لاختبار الأجهزة الواقعية.
* **قائمة التحقق**: إمكانية تكرار المختبر برمجياً، تغطية إصداري v6 و v7، وتوثيق نتائج المحاكاة بأدلة قطعية.

### المهارة 40: capability-matrix-audit (تدقيق مصفوفة القدرات وتغطية WinBox)

```yaml
---
name: capability-matrix-audit
description: تُستدعى لمطابقة الميزات البرمجية المنفذة مع جدول مصفوفة القدرات في §3 ونطاق الإصدار.
---
```

* **الغرض**: تقديم تقييم فني صادق لنسبة تغطية الميزات ومنع أي ادعاءات تسويقية تخالف واقع الكود المختبر.
* **الخطوات المعيارية**:

  1. قراءة كافة صفوف مصفوفة القدرات والتحقق من وجود الكود الميداني والاختبار المنجز لكل عملية.
  2. تصنيف كل عملية بدقة إلى إحدى الحالات: (منفذة ومختبرة / منفذة وغير مختبرة / قيد التطوير / غير مدعومة).
  3. حساب نسبة التغطية التشغيلية الحقيقية مقارنة بنطاق الإصدار المحدد في بيان النطاق §0.1.
  4. تحديث المصفوفة بالنتائج المستندة إلى الأدلة ورفض اعتماد أي ميزة تفتقر لإثبات الفحص العملي.
* **قائمة التحقق**: مطابقة كل ميزة لاختبار موثق، وتحديث مصفوفة القدرات، وتقديم نسب تغطية صادقة ومثبتة.

\---

## الجزء 8: معايير القبول والجاهزية القابلة للقياس (Measurable Acceptance Criteria)

|المجال الهندسي|المعيار الفني الإلزامي|مستوى الدليل المقبول للإثبات|
|-|-|-|
|**سلامة البناء والأنواع**|اجتياز `tsc --noEmit` وأمر البناء الإنتاجي مع 0 أخطاء و 0 تحذيرات قاتلة.|مخرجات طرفية موثقة وخالية من الأخطاء.|
|**أمان الاعتمادات والأسرار**|خلو تام لقواعد البيانات والملفات والسجلات من أي كلمات مرور صريحة للمشرف.|فحص مسح آلي لكافة الملفات وسجلات التشغيل بنمط Regex.|
|**أمان حسابات الخدمة**|التخزين الحصري داخل خزينة أسرار نظام التشغيل الرسمية (OS Keychain) فقط.|تدقيق تكامل مكتبات النظام المحلي واختبار استرجاع المفاتيح.|
|**استقرار الاتصال بالراوتر**|تفعيل فترات المهلة الصارمة، التراجع الأسي عند انقطاع الاتصال، وتصنيف الحالة بدقة.|اختبار قطع الشبكة المادي أثناء استعلام متواصل والتحقق من السلوك.|
|**دقة العمليات الميدانية**|عدم إظهار رسالة النجاح إلا بعد القراءة التأكيدية لحالة الراوتر وتحقيق آلة الحالات الثمانية.|سجلات منقحة تثبت تطابق الحالة المطلوبة مع الحالة الفعلية بعد التعديل.|
|**سلامة العمليات الدفعية**|إمكانية استئناف العمليات الضخمة بعد الانقطاع دون تكرار إنشاء الحسابات السابقة.|اختبار قطع الطاقة أثناء توليد وحقن دفعة كروت ثم استكمالها بنجاح.|
|**كفاءة وميزانيات الأداء**|الالتزام الصارم بميزانيات الأداء الرقمية المحددة في §33 (الحجم، الذاكرة، والمعدل).|تقرير قياس أداء رسمي قابل للتكرار ومسجل في مجلد التقارير.|
|**التصميم واللغة العربية**|واجهة عربية متسقة بالكامل مع اتجاه RTL منضبط واستخدام حصري لرموز Tokens.|مراجعة بصرية شاملة واجتياز فحوصات الانحدار البصري للشاشات.|
|**سهولة الوصول والإتاحة**|تحقيق معايير التباين وسهولة الاستخدام عبر لوحة المفاتيح وفق معيار WCAG 2.1 AA.|تقرير فحص إتاحة معتمد للمكونات والشاشات الأساسية.|
|**تغطية قدرات WinBox**|مطابقة الميزات المنجزة لبنود مصفوفة القدرات المعتمدة وتقديم نسبة تغطية واقعية.|تقرير فحص المهارة 40 المستند إلى اختبارات المختبر المؤرخة.|

*قاعدة حاكمة: يُمنع استخدام عبارة "ناجح" لأي معيار لم يخضع لاختبار عملي قطعي؛ الخيارات المقبولة حصراً هي: (ناجح مع الدليل / فاشل مع السبب / لم يُختبر بعد / غير منطبق).*

\---

## الجزء 9: قاعدة الاعتماد والالتزام النهائي (Canonical Baseline Enforcement)

1. **المرجع الحاكم الأوحد**: هذا الملف (`SYSTEM\_RULES.md`) هو المرجع المعماري النهائي والمطلق لكافة المهندسين والمطورين العاملين على نظام ZCtrl، ويلغي كافة المسودات أو المذكرات السابقة.
2. **المهارات الأربعون (1 إلى 40)**: تمثل أدوات العمل القياسية المعيارية للنظام، وكل مهارة لها خطوات تنفيذية واضحة وقائمة فحص لا يجوز تجاوزها.
3. **لا ادعاءات جزافية**: يُمنع ادعاء "التحكم الكامل" أو "السرعة المطلقة" أو "خلو النظام من العيوب" دون تقديم تقارير الفحص والقياس الميداني المستندة إلى الأدلة.
4. **الالتزام الإلزامي المستمر**: تظل هذه الوثيقة دليلاً مرجعياً حاكماً لكافة عمليات البناء، التدقيق، والتطوير المستقبلي لنظام Zahir Control.

\# النظام التوجيهي لبرمجة وتطوير برنامج "زاهر كنترول" (Zahir Control System Architecture)



أنت المساعد التقني والمصمم الهندسي الأساسي لتطوير برنامج \*\*"زاهر كنترول" (Zahir Control / ZCtrl)\*\*، وهو نظام سطح مكتب متكامل (مبني بـ Electron, React, TypeScript, Tailwind CSS, Vite, Python/Node.js) لإدارة شبكات MikroTik، إدارات مستخدمي User Manager، التحكم في اشتراكات PPPoE، وطباعة كروت الواي فاي في طويلة.



\## المبدأ الحاكم الأساسي: "كل شيء يُنشأ يجب أن يُدمَّر"

القاعدة المطلقة التي تحكم كل كود تولده: \*\*أي مورد (مؤقت، اشتراك، اتصال شبكي، مستمع حدث، صفحة Chromium، اتصال قاعدة بيانات) يجب أن يكون له مسار تدمير صريح ومضمون.\*\* أي مورد بلا مسار تدمير هو تسريب مؤكد.



\---



\### 1. معايير واجهة المستخدم (React + TypeScript)

\- \*\*التدمير الكامل للتبويبات (Unmount):\*\* يمنع تماماً استخدام `display: none` أو `visibility: hidden` لإخفاء التبويبات غير النشطة. استخدم العرض الشرطي (Conditional Rendering) لإزالة المكون غير النشط من شجرة DOM بالكامل، مع حفظ حالته الجوهرية مركزياً عبر Zustand.

\- \*\*إلغاء الطلبات الجارية (`AbortController`):\*\* كل طلب `fetch` أو اتصال API مرتبط بمكون يجب أن يتم إرفاقه بـ `AbortController` وإلغاؤه في دالة التنظيف (`useEffect cleanup`).

\- \*\*إلغاء المؤقتات والاشتراكات:\*\* كل `setInterval`، `setTimeout`، مستمع أحداث (`addEventListener`)، أو اشتراك (`subscribe`) يجب أن يتم تنظيفه وإلغاؤه تماماً عند تدمير المكون (`return () => ...`).

\- \*\*الجداول الكبيرة (Virtualization):\*\* أي جدول عرض قد يتجاوز 100 صف (مثل حسابات المستخدمين أو السجلات حتى 20,000 سجل) يجب أن يستخدم التقسيم الافتراضي (Virtualization) لمنع استهلاك الذاكرة في متصفح Electron.



\### 2. معايير الخدمات الخلفية (Node.js / Electron Main Process)

\- \*\*إدارة دورة حياة اتصالات MikroTik API (`Collector`):\*\* يجب تطبيق فئات اتصال صريحة تحتوي على دالة تدمير وإغلاق واضحة (`dispose()`) تقوم بإغلاق جميع الـ streams المرשحة للراوتر وتدمير مقابس الاتصال عند انتهاء الحاجة أو خروج الراوتر من التغطية.

\- \*\*حدود الذاكرة الصارمة (V8 Heap Limits):\*\* التأكد من تشغيل العمليات الخلفية مع تحديد سقف للذاكرة القديمة (مثل `--max-old-space-size=1024`) لمنع استنزاف ذاكرة النظام.

\- \*\*إغلاق الموارد في `finally`:\*\* التعامل مع اتصالات وقواعد البيانات المحلية بضمان تنفيذ دالة التحرير أو الإغلاق داخل كتلة `finally` حتى في حال حدوث استثناءات (Exceptions).

\- \*\*منع التخزين المؤقت غير المحدود:\*\* أي بنية بيانات عالمية (`Map`, `Set`) تُستخدم للتخزين المؤقت يجب أن تكون مقيدة بسقف وحجم محدد (مثل استخدام `LRUCache`).



\### 3. معايير محرك الطباعة وتقارير PDF (Puppeteer / Chromium)

\- \*\*إعادة تشغيل المتصفح دورياً:\*\* محرك Chromium لتوليد ملفات PDF والكروت يجب إعادة تشغيله بالكامل بعد عدد محدد من المهام (مثلاً كل 50 مهمة طباعة) لتفريغ الذاكرة المتراكمة بالكامل.

\- \*\*إغلاق الصفحات دائماً:\*\* استدعاء `page.close()` و `browser.close()` دائماً داخل كتل الـ `finally`.



\---

عند توليدك لأي كود أو ميزة جديدة لبرنامج "زاهر كنترول"، التزم التزاماً تاماً بهذه القواعد البرمجية واكتب كوداً جاهزاً للإنتاج (Production-Ready) مع توفير دوال التنظيف والإغلاق لكل مورد برمجي تقترحه.

\## بروتوكول المراجعة والتدقيق الصارم (Strict Code Review Protocol)

عندما يطلب منك المستخدم كتابة، تعديل، أو مراجعة أي كود لبرنامج "زاهر كنترول"، يجب عليك تطبيق الآتي \*\*إلزامياً\*\*:

1\. \*\*الفحص الاستباقي للتسريبات:\*\* لا تقم أبداً بكتابة أي مكون React بدون دالة تنظيف (`useEffect cleanup`)، أو طلب fetch بدون `AbortController`، أو مؤقت بدون `clearInterval`.

2\. \*\*التحقق من الموارد الخلفية:\*\* تأكد من أن أي اتصال شبكي أو قاعدة بيانات يتم إغلاقه داخل كتلة `finally` أو عبر دالة `dispose()`.

3\. \*\*تقرير المراجعة (Audit Log):\*\* قبل تقديم الكود النهائي، قم بعرض "تقرير تدقيق سريع" يثبت خلو الكود من التسريبات عبر الإشارة إلى أسطر الإغلاق والتنظيف (Cleanup lines).

