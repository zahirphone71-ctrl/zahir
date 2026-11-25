الخطة الهندسية الشاملة لإنشاء نظام Zahir Control (ZCtrl)
منصة متكاملة للتحكم والإدارة الكاملة في MikroTik والمشتركين والمستخدمين والبروفايلات
خطة تأسيس Production-Grade
 RouterOS 7.x


الهدف هو بناء برنامج Zahir Control (ZCtrl) ليكون منصة إدارة مركزية واحترافية لشبكات MikroTik، بمستوى وظيفي قريب من WinBox، مع واجهة أكثر سهولة وتنظيماً، وإدارة متكاملة للمشتركين والبطاقات والحسابات والبروفايلات والخدمات والشبكات.

لا ينبغي أن يكون البرنامج مجرد مولّد كروت HotSpot، بل نظام تشغيل إداري متكامل للشبكة، يستطيع إدارة أجهزة MikroTik ومراقبتها والتحكم في مواردها وإدارة دورة حياة المشترك بالكامل.

ملاحظة هندسية مهمة: لا يوجد تحكم مطلق يتجاوز صلاحيات الراوتر وإمكانات إصداره وعتاده. لكن يمكن بناء تغطية وظيفية واسعة جداً لواجهات RouterOS، بحيث يستطيع المستخدم تنفيذ كل العمليات التي تسمح بها صلاحياته، مع إظهار الوظائف غير المدعومة بدلاً من الادعاء بتنفيذها.

وسأبني الخطة على التقنيات الأساسية المعتمدة في مشروعك:
- Frontend: React 18 + TypeScript.
- UI: Tailwind CSS.
- Backend: Node.js + Express.
- Database: SQLite كبداية، مع تصميم يسمح بالانتقال إلى PostgreSQL.
- Router Integration: MikroTik RouterOS API وAPI-SSL.
- Real-time: WebSocket.
- Background Jobs: Workers وQueues.
- الهدف: تطبيق ويب قابل للتشغيل كتطبيق Desktop أو Mobile عند الحاجة.

1. الرؤية النهائية للنظام




















13













يُقسم النظام إلى ستة أنظمة رئيسية مترابطة:
النظام	المسؤولية
Router Management	التحكم الشامل في أجهزة MikroTik
Subscriber Management	إدارة المشتركين وحساباتهم
Profiles Management	إدارة البروفايلات والسرعات والصلاحيات
HotSpot & PPP	إدارة خدمات الدخول والمصادقة
Network Monitoring	مراقبة الشبكة والموارد والأداء
Card Studio	إنشاء وطباعة وتوزيع كروت الاشتراك

وتعمل جميع هذه الأنظمة من خلال طبقة مركزية واحدة، حتى لا تتكرر العمليات أو تتعارض البيانات بين الوحدات.
النتيجة المستهدفة
يستطيع مدير الشبكة من لوحة واحدة:
1. إضافة عدد كبير من أجهزة MikroTik وإدارتها مركزياً.
2. الدخول إلى إعدادات كل راوتر والتحكم في عناصره.
3. إنشاء المشتركين وتعديلهم وحذفهم وتعطيلهم.
4. إدارة HotSpot Users وPPP Secrets وRADIUS Users.
5. إنشاء البروفايلات وتعديل السرعات والحصص والصلاحيات.
6. إدارة User Manager إن كان متاحاً ومهيأً.
7. إنشاء مجموعات كروت وتوزيعها وطباعتها.
8. متابعة المتصلين وفصلهم وتغيير صلاحياتهم.
9. مراقبة استهلاك الإنترنت والسرعة والموارد.
10. إدارة الشبكات والواجهات والجسور وVLAN وDHCP وDNS.
11. إدارة Firewall وNAT وQueues وRouting.
12. الاحتفاظ بسجل كامل لكل عملية إدارية.
13. استعادة البيانات والإعدادات عند الأعطال.
14. تنفيذ التغييرات دون فقدان المشتركين الحاليين أو قطع خدماتهم قدر الإمكان.

2. المعمارية الهندسية الأساسية







promwad.com


يجب أن تعتمد المنظومة على معمارية متعددة الطبقات، مع فصل كامل بين واجهة المستخدم والعمليات الحساسة والاتصال بالراوتر.
                  ZCTRL PLATFORM
                         |
          +--------------+--------------+
          |                             |
       FRONTEND                       API GATEWAY
   React + TypeScript               Node + Express
          |                             |
          |                    Authentication / RBAC
          |                             |
          |                    Application Services
          |                             |
          |              +--------------+-------------+
          |              |              |             |
          |         Router Engine   Subscriber     Profile
          |              |           Engine        Engine
          |              |              |             |
          |              +--------------+-------------+
          |                             |
          |                       Job Queue
          |                             |
          |                       Worker Pool
          |                             |
          |                      Router Adapter
          |                             |
          |                    RouterOS API / SSL
          |                             |
          |                    MikroTik Devices
          |
       WebSocket
          |
    Live Monitoring

       DATABASE
   SQLite / PostgreSQL


قواعد المعمارية الإلزامية
- لا يتصل React بالراوتر مباشرة.
- جميع اتصالات MikroTik تمر عبر Backend.
- لا تحفظ كلمات مرور الراوترات كنصوص صريحة.
- كل عملية تعديل تمر بمرحلة تحقق قبل التنفيذ.
- كل عملية حساسة لها سجل تدقيق.
- كل راوتر له اتصال وحالة مستقلة.
- لا يسمح بفشل راوتر واحد بتعطيل بقية الأجهزة.
- لا تنفذ عمليات متزامنة غير محدودة على الراوتر.
- لا يتم تعديل إعدادات موجودة لمجرد أن البرنامج يريد فرض إعداداته الافتراضية.
- لا تنفذ عمليات حذف جماعي دون مراجعة وحماية واستعادة.
3. نظام التحكم الكامل في MikroTik RouterOS
هذه أهم وحدة في المشروع، ويجب أن تكون مستقلة وقابلة للتوسع، وألا تقتصر على مجموعة أوامر ثابتة.




















8










3.1 إدارة الأجهزة والاتصالات
يجب توفير شاشة مركزية لإدارة جميع الراوترات.

الوظائف المطلوبة:
- إضافة راوتر جديد.
- تعديل بيانات الاتصال.
- حذف راوتر من قاعدة البرنامج دون حذف إعداداته.
- اتصال وفصل وإعادة اتصال.
- اكتشاف الراوترات المتاحة بطريقة آمنة.
- اختبار بيانات الدخول.
- عرض عنوان IP وMAC Address.
- عرض اسم الجهاز Identity.
- عرض موديل الجهاز Board Name.
- عرض إصدار RouterOS.
- عرض المعمارية Architecture.
- عرض مستوى الترخيص License.
- عرض وقت التشغيل Uptime.
- عرض حالة الاتصال.
- عرض CPU وRAM ومساحة التخزين.
- عرض عدد الواجهات والمستخدمين والجلسات.
- تصنيف الراوترات حسب الموقع أو الفرع.
- تجميع الراوترات في مجموعات.
- تحديد راوتر افتراضي لكل فرع.
ميزة مهمة: يجب أن يكون لكل راوتر ملف تعريف مستقل يتضمن إصدار RouterOS، والميزات المدعومة، وحالة الحزم، والصلاحيات، وطرق الاتصال.
3.2 إدارة جميع أقسام RouterOS
يجب بناء وحدات تغطي الأقسام التالية:
القسم	الوظائف
System	Identity, Clock, Resources, Packages, Scheduler
Users	حسابات مديري الراوتر وصلاحياتهم
Interfaces	Ethernet, VLAN, Bridge, Bonding
Wireless	WiFi, Security, Registration
WiFi CAPsMAN	إدارة نقاط الوصول المتوافقة
IP Addresses	إضافة وتعديل العناوين
IP Pools	إنشاء وإدارة مجموعات العناوين
DHCP	DHCP Server, Client, Networks, Leases
DNS	DNS Servers, Static Entries, Cache
HotSpot	Servers, Profiles, Users, Active
PPP	Secrets, Active, Profiles, Servers
RADIUS	Clients, Authentication, Accounting
User Manager	Users, Profiles, Limitations, Sessions
Firewall	Filter, NAT, Mangle, RAW, Address Lists
Queues	Simple Queues, Queue Tree, Queue Types
Routing	Routes, Rules, Tables, OSPF, BGP
VPN	WireGuard, IPsec, L2TP, SSTP, OpenVPN
Certificates	إنشاء واستيراد وإدارة الشهادات
ARP	Static وDynamic ARP
Neighbor	اكتشاف الأجهزة المجاورة
Tools	Ping, Traceroute, Torch, Bandwidth Test
Logs	قراءة وتصنيف وتحليل السجلات
Files	إدارة الملفات والتصدير والاستيراد
Backup	إنشاء النسخ الاحتياطية واستعادتها
Scripts	إدارة سكربتات RouterOS
Scheduler	إدارة المهام المجدولة
Netwatch	مراقبة الأجهزة والخدمات
SNMP	مراقبة الأجهزة عبر SNMP
Container	إدارة الحاويات عند دعم الجهاز
MPLS	إدارة MPLS عند دعم الإصدار والعتاد

كل قسم يجب أن يحتوي على العمليات الأساسية:
- List / Read.
- Add / Create.
- Edit / Update.
- Enable / Disable.
- Delete / Remove.
- Move / Reorder عند دعم ذلك.
- Search / Filter.
- Import / Export.
- Bulk Operations.
- تفاصيل العنصر وسجل تغييراته.
لا يعني ذلك أن كل خاصية متاحة على جميع أجهزة MikroTik؛ يجب اكتشاف القدرات الفعلية لكل جهاز.
3.3 إدارة الواجهات والشبكات







forum.mikrotik.com


يجب أن تكون هناك لوحة متكاملة للشبكة:

Interfaces Manager
- عرض كل المنافذ.
- حالة Link Up/Down.
- سرعة المنفذ.
- Duplex.
- MTU.
- Traffic RX/TX.
- أخطاء الإرسال والاستقبال.
- تفعيل وتعطيل الواجهات.
- تغيير الأسماء.
- إضافة VLAN.
- إدارة Bridge Ports.
- إدارة Bonding.
- إعدادات WiFi عند توفرها.
IP & Network Manager
- إضافة IP Address.
- تعديل وحذف العناوين.
- إدارة Subnets.
- إدارة Address Pools.
- إدارة DHCP Server.
- إدارة DHCP Leases.
- تحويل Lease إلى Static.
- إدارة DNS.
- إدارة ARP.
- إدارة IPv4 وIPv6.
- إدارة IP Routes.
3.4 إدارة Firewall وNAT







mikrotik.wiki


يجب بناء محرر Firewall متكامل.

يتضمن:
1. Filter Rules.
2. NAT Rules.
3. Mangle Rules.
4. RAW Rules.
5. Address Lists.
6. Layer7 Protocols.
7. Connection Tracking.
8. Firewall Counters.
9. ترتيب القواعد.
10. تعطيل وتفعيل القواعد.
11. نسخ القواعد.
12. البحث والتصفية.
13. استيراد وتصدير القواعد.
شرط الأمان: لا يجوز أن ينفذ النظام تغييراً في Firewall يؤدي إلى قطع اتصال الإدارة بالراوتر دون فحص مسبق، وخطة تراجع، وآلية تحقق من بقاء الاتصال.
3.5 إدارة السرعات والـ Queues
يجب دعم:
- Simple Queues.
- Queue Tree.
- Queue Types.
- PCQ.
- Burst.
- Priority.
- Parent Queues.
- Target Address.
- Max Limit.
- Limit At.
- Packet Marks.
- Connection Marks.
مع إمكانية عرض السرعة الحالية والسرعة المحددة ومقارنة الأداء الفعلي بالمسموح.

4. نظام إدارة المشتركين Subscribers Management







onezeroart.com


هذه الوحدة يجب أن تكون مركز إدارة العملاء والاشتراكات، وليس مجرد جدول للمستخدمين.
4.1 ملف المشترك الموحد
كل مشترك يجب أن يمتلك ملفاً مستقلاً يحتوي على:
البيانات	التفاصيل
Subscriber ID	رقم داخلي فريد
Full Name	اسم المشترك
Phone	رقم الهاتف
Username	اسم الدخول
Password	كلمة المرور المشفرة أو المحمية
Service Type	HotSpot أو PPP أو RADIUS
Router	الراوتر المرتبط
Profile	البروفايل الحالي
IP Address	عنوان IP
MAC Address	عنوان MAC
Start Date	تاريخ البداية
Expiry Date	تاريخ الانتهاء
Subscription Status	حالة الاشتراك
Download	حجم التنزيل
Upload	حجم الرفع
Total Usage	إجمالي الاستهلاك
Last Login	آخر دخول
Notes	الملاحظات

يجب الفصل بين هوية العميل وبين حساب المصادقة؛ فقد يكون للمشترك أكثر من حساب أو أكثر من خدمة.
4.2 حالات المشترك
يجب دعم الحالات التالية:
- Active: فعال.
- Disabled: معطل.
- Expired: منتهي.
- Suspended: موقوف.
- Pending: ينتظر التفعيل.
- Exhausted: انتهت حصته.
- Blocked: محظور.
- Archived: مؤرشف.
يجب أن تكون الحالة مشتقة من بيانات الاشتراك الفعلية، لا مجرد قيمة يغيرها البرنامج دون التأكد من الراوتر أو خادم RADIUS.
4.3 العمليات على المشتركين
العملية	النتيجة
Create	إنشاء مشترك
Edit	تعديل بياناته
Delete	حذف حسابه وفق سياسة الحذف
Disable	تعطيل الحساب
Enable	إعادة التفعيل
Suspend	إيقاف الخدمة
Resume	استعادة الخدمة
Change Profile	تغيير البروفايل
Change Password	تغيير كلمة المرور
Reset Password	إعادة تعيين كلمة المرور
Disconnect	فصل الجلسة
Reconnect	السماح باتصال جديد
Extend	تمديد الاشتراك
Renew	تجديد الاشتراك
Transfer	نقل المشترك لراوتر آخر
Change IP	تغيير IP
Change MAC	تغيير MAC
Reset Counters	تصفير الإحصائيات وفق الصلاحيات
View History	عرض سجل العمليات

4.4 الإدارة الجماعية
يجب توفير عمليات جماعية مثل:
- إنشاء 100 أو 1000 مشترك دفعة واحدة.
- تغيير بروفايل مجموعة.
- تمديد اشتراكات مجموعة.
- تعطيل مجموعة.
- تفعيل مجموعة.
- تغيير كلمة مرور مجموعة.
- نقل مجموعة إلى راوتر آخر.
- تصدير المشتركين.
- استيراد بيانات المشتركين.
- اكتشاف التكرار والتعارض.
لكن التنفيذ الجماعي يجب أن يعمل بنظام دفعات مع متابعة النتائج لكل مستخدم، لا بتنفيذ أمر ضخم دون مراقبة.
4.5 شاشة المشترك التفصيلية







wiki.splynx.com


يجب أن تحتوي على تبويبات:
1. المعلومات الأساسية.
2. الحسابات وبيانات الدخول.
3. الاشتراكات.
4. البروفايلات.
5. الجلسات الحالية.
6. الاستهلاك.
7. سجل الدخول.
8. سجل التغييرات.
9. عمليات الدفع إن تم إضافة وحدة مالية.
10. الملاحظات.

5. نظام HotSpot Management
يجب أن يوفر تحكماً شاملاً في HotSpot.
5.1 HotSpot Servers
- عرض السيرفرات.
- إنشاء Server.
- تعديل إعداداته.
- تعطيله وتفعيله.
- ربطه بالواجهة أو Bridge.
- إدارة Address Pool.
- إدارة DNS Name.
- إدارة Login Methods.
- إدارة HTTP وHTTPS.
- إدارة صفحات الدخول.
- إدارة ملفات HotSpot.
5.2 HotSpot Users
- إنشاء مستخدم.
- تعديل المستخدم.
- حذف المستخدم.
- تعطيل المستخدم.
- تغيير كلمة المرور.
- تحديد Profile.
- تحديد Server.
- تحديد MAC Address.
- تحديد IP Address.
- تحديد Shared Users.
- تحديد Limits.
- تحديد مدة الاستخدام.
- مراقبة المستخدم المتصل.
- فصل المستخدم.
- عرض استهلاكه.
5.3 HotSpot Active
يجب أن تكون هناك شاشة لحظية تعرض:
- Username.
- IP.
- MAC.
- Server.
- Uptime.
- Session Time Left.
- Download Bytes.
- Upload Bytes.
- Rate RX/TX.
- Radius Status.
مع إجراءات مباشرة لفصل الجلسة أو الانتقال إلى ملف المشترك.
5.4 HotSpot Profiles
إدارة:
- Rate Limit.
- Session Timeout.
- Idle Timeout.
- Keepalive Timeout.
- Shared Users.
- Address Pool.
- Transparent Proxy.
- MAC Cookie Timeout.
- Login By.
- On Login.
- On Logout.
ويجب التعامل مع خصائص كل إصدار بحسب ما يدعمه.

6. نظام PPP Management







fathsite.blogspot.com


يجب أن يغطي PPP جميع المكونات المهمة:
PPP Secrets
- إنشاء الحسابات.
- تعديل الحسابات.
- حذف الحسابات.
- تفعيل وتعطيل الحساب.
- Username / Password.
- Service.
- Profile.
- Local Address.
- Remote Address.
- Caller ID.
- Routes.
- Limits.
- Comment.
PPP Active
- عرض المتصلين.
- عرض عنوان IP.
- عرض مدة الاتصال.
- عرض استهلاك البيانات.
- عرض الخدمة المستخدمة.
- فصل المستخدم.
- متابعة إعادة الاتصال.
PPP Profiles
- Local Address.
- Remote Address.
- Rate Limit.
- Session Timeout.
- Idle Timeout.
- Use Encryption.
- Only One.
- Queue Type.
- Change TCP MSS.
- Scripts.
ويجب دعم الخدمات المختلفة مثل PPPoE وL2TP وSSTP وPPTP وOpenVPN حيثما يدعمها الإصدار.

7. نظام Profiles Management
من أهم وحدات النظام
يجب عدم التعامل مع كلمة Profile باعتبارها نوعاً واحداً؛ فهناك أنواع مختلفة من البروفايلات في RouterOS.
أنواع البروفايلات المطلوبة
النوع	وظيفته
HotSpot User Profile	خصائص مستخدمي HotSpot
PPP Profile	خصائص حسابات PPP
User Manager Profile	باقات RADIUS
User Manager Limitation	حدود الوقت والاستهلاك
RADIUS Profile	خصائص المصادقة والتفويض
Queue Profile	إعدادات التحكم في السرعة
WiFi Security Profile	إعدادات الحماية اللاسلكية
DHCP Network Profile	إعدادات الشبكة الموزعة

خصائص كل بروفايل
- الاسم.
- الوصف.
- نوع الخدمة.
- السرعة Download.
- السرعة Upload.
- مدة الاشتراك.
- حجم التحميل.
- حجم الرفع.
- الحد الإجمالي.
- عدد الأجهزة المسموح بها.
- عدد الجلسات المتزامنة.
- وقت بداية الباقة.
- وقت انتهاء الباقة.
- أوقات السماح.
- أيام الأسبوع.
- سياسة التجديد.
- سياسة انتهاء الاشتراك.
- سياسة استهلاك البيانات.
محرك Profile Engine
يجب أن يكون هناك محرك موحد لإدارة البروفايلات يقوم بالآتي:
1. قراءة البروفايلات الموجودة في الراوتر.
2. مقارنة البروفايلات بقاعدة بيانات ZCtrl.
3. إظهار البروفايلات المتعارضة.
4. إنشاء البروفايلات الجديدة.
5. تحديث البروفايلات المحددة.
6. إظهار المشتركين المرتبطين بالبروفايل.
7. حساب أثر تعديل البروفايل.
8. تطبيق التغييرات بعد الموافقة.
9. التحقق من نجاح التحديث.
10. حفظ سجل التغييرات.
مثال مهم: عند تغيير سرعة بروفايل من 4Mbps إلى 8Mbps، يجب أن يستطيع النظام تحديد جميع المشتركين المرتبطين به، وتوضيح هل سيؤثر التغيير على الجلسات الحالية أو الاتصالات الجديدة، ثم تنفيذ الإجراء المناسب دون حذف الحسابات.

8. نظام User Manager وRADIUS







mikrotik.co.id


هذه الوحدة مهمة جداً لإدارة المشتركين مركزياً.

يجب أن تشمل:
- إدارة User Manager.
- إدارة المستخدمين.
- إدارة مجموعات المستخدمين.
- إدارة Profiles.
- إدارة Limitations.
- ربط المستخدمين بالبروفايلات.
- مراقبة الجلسات.
- إحصائيات Download وUpload.
- إدارة مدة الاشتراك.
- إدارة صلاحية الباقة.
- إدارة خصائص RADIUS.
- إدارة Authentication.
- إدارة Accounting.
- إدارة RADIUS Clients.
- إدارة Disconnect Requests عند دعمها.
يجب أن يدعم البرنامج أيضاً العمل مع خادم RADIUS خارجي، لأن User Manager ليس متاحاً أو مناسباً لجميع الأجهزة وحالات التوسع.

مبدأ معماري مهم: يجب فصل واجهة إدارة RADIUS عن واجهة User Manager، مع توفير طبقة Adapter تسمح بالتبديل بينهما دون تغيير نظام المشتركين بالكامل.

9. نظام Card Studio لتوليد كروت الاشتراك




















10










يجب أن يكون استوديو الكروت نظاماً متكاملاً وليس مجرد مولّد أرقام.
الوظائف
- إنشاء مجموعات الكروت.
- اختيار الراوتر.
- اختيار الخدمة.
- اختيار البروفايل.
- تحديد عدد الكروت.
- إنشاء Username وPassword.
- توليد كلمات مرور آمنة.
- منع تكرار الحسابات.
- تخزين بيانات الكروت.
- طباعة PDF.
- تصدير Excel وCSV.
- إنشاء تصاميم متعددة.
- تصميم بطاقات مخصصة.
- QR Code.
- Barcode.
- إخفاء وإظهار كلمة المرور.
- تسجيل حالة كل كرت.
حالات الكرت
- Generated.
- Available.
- Sold.
- Activated.
- Expired.
- Used.
- Disabled.
- Revoked.
محرك توليد الكروت
يجب أن يدعم:
- Prefix.
- Suffix.
- طول اسم المستخدم.
- طول كلمة المرور.
- أرقام فقط.
- أحرف وأرقام.
- منع الأحرف المتشابهة.
- منع التكرار.
- تحديد نمط الترقيم.
- ربط كل مجموعة بعملية إنشاء محددة.
ويجب أن يكون إنشاء الكروت عملية قابلة للاستئناف عند فشل الاتصال بالراوتر، مع منع تكرار الحسابات أو فقدان سجلات الكروت.

10. نظام مراقبة الشبكة Network Monitoring







dwp.my.id


يجب توفير مراقبة لحظية وتاريخية.
مراقبة الراوتر
- CPU Usage.
- RAM Usage.
- Storage.
- Uptime.
- Temperature عند دعمها.
- Voltage عند دعمها.
- RouterOS Version.
- Interface Status.
- Active Connections.
- Packet Rate.
- Traffic Rate.
- Errors.
- Dropped Packets.
مراقبة المشتركين
- المتصلون حالياً.
- غير المتصلين.
- أكثر المشتركين استهلاكاً.
- المستخدمون الذين تجاوزوا حدودهم.
- الجلسات غير الطبيعية.
- محاولات الدخول الفاشلة.
- المستخدمون الذين لديهم أكثر من جلسة.
مراقبة الواجهات
- Bandwidth RX.
- Bandwidth TX.
- Graphs.
- Packet Counters.
- Interface Errors.
- Link Changes.
- Traffic History.
التنبيهات
يجب أن ينبه النظام عند:
- انقطاع الراوتر.
- ارتفاع CPU.
- انخفاض RAM.
- امتلاء التخزين.
- انقطاع WAN.
- انقطاع DHCP.
- توقف RADIUS.
- فشل المصادقة.
- ارتفاع عدد الجلسات.
- تجاوز استهلاك الشبكة حداً معيناً.

11. نظام Multi-Router Management
يجب أن يدير النظام أكثر من راوتر من قاعدة بيانات مركزية.







waveteliot.com


الوظائف المطلوبة:
- إضافة عدد غير محدود من الأجهزة من ناحية تصميم البرنامج، مع حدود تشغيلية حسب الموارد.
- تصنيف الأجهزة حسب الفروع.
- إدارة كل راوتر بشكل منفصل.
- مراقبة كل الراوترات من شاشة واحدة.
- إدارة المشتركين حسب الراوتر.
- نقل المشتركين بين الأجهزة.
- مزامنة البيانات.
- مقارنة الإعدادات.
- اكتشاف الاختلافات.
- توزيع البروفايلات.
- توزيع إعدادات مختارة.
- إنشاء تقارير شاملة.
تنبيه: لا يجوز تطبيق إعدادات راوتر على جميع الأجهزة لمجرد أنها متشابهة؛ يجب فحص الموديل والإصدار والواجهات والتكوين قبل تنفيذ أي تغيير.

12. محرك الاتصال بـ MikroTik RouterOS
هذا المحرك هو القلب التقني للنظام.
12.1 وسائل الاتصال
يجب دعم ثلاث وسائل:
الطريقة	الاستخدام
RouterOS API	الخيار الأساسي للتحكم البرمجي الشامل
API-SSL	الاتصال المشفر عبر API
REST API	عمليات CRUD والاستعلامات المناسبة في RouterOS v7

توضح وثائق MikroTik أن API يتيح جمع البيانات وتعديل إعدادات RouterOS، ويستخدم المنفذين الافتراضيين 8728 و8729. كما أن REST واجهة JSON مبنية على Console API وتتوفر في RouterOS 7.1beta4 وما بعده، لكنها لا توفر مراقبة مستمرة عبر أمر واحد مثل أوامر monitor المتواصلة. 
MikroTik Documentation+1


لذلك أوصي بأن يكون API-SSL هو وسيلة التحكم الأساسية، مع استخدام REST حيث يناسب، وليس الاعتماد على REST وحده.
12.2 RouterOS Adapter
يجب بناء طبقة مستقلة لكل إصدار أو مجموعة ميزات:
RouterOS Integration
        |
    Capability Detector
        |
    Version Adapter
        |
    Command Builder
        |
    Validation Engine
        |
    Execution Engine
        |
    Result Parser
        |
    Verification Engine


Capability Detector
عند الاتصال بالراوتر:
1. يقرأ الإصدار.
2. يقرأ الموديل.
3. يقرأ المعمارية.
4. يقرأ الحزم المثبتة.
5. يقرأ الصلاحيات.
6. يختبر الوظائف المدعومة.
7. ينشئ تقرير قدرات الجهاز.
Command Builder
مسؤوليته:
- بناء أوامر RouterOS الصحيحة.
- تحويل بيانات البرنامج إلى خصائص RouterOS.
- التحقق من القيم.
- منع حقن الأوامر.
- دعم escaping الصحيح.
- منع تنفيذ أوامر غير معروفة.
Execution Engine
مسؤوليته:
- إدارة الاتصالات.
- تنفيذ الأوامر.
- تحديد المهلة.
- إعادة المحاولة عند الأخطاء المؤقتة فقط.
- التحكم في التزامن.
- تصنيف الأخطاء.
- حفظ نتائج التنفيذ.
Verification Engine
بعد كل عملية:
- قراءة العنصر بعد التعديل.
- مقارنة القيمة المطلوبة بالقيمة الفعلية.
- التأكد من نجاح العملية.
- تسجيل الفرق.
- إعادة المحاولة عند الحاجة وبشكل آمن.
- إعلان الفشل إذا لم يتحقق التغيير.
12.3 الإدارة العامة عبر Console API
لتحقيق أقرب تغطية ممكنة لـ WinBox، يجب توفير مستويين:

المستوى الأول: الإدارة المرئية المنظمة

شاشات متخصصة لجميع أقسام RouterOS.

المستوى الثاني: Advanced Router Terminal

واجهة أوامر متقدمة للمسؤولين المخولين، تعرض النتائج والأخطاء وتوفر أدوات تنفيذ آمنة.

لا ينبغي اعتبار API أو REST بديلاً عن كل ميزات WinBox الرسومية؛ فبعض الوظائف تعتمد على طريقة العرض أو البروتوكولات الخاصة أو أدوات مستقلة. لذلك يجب وضع مصفوفة توضح ما هو مدعوم بالكامل وما هو جزئي وما هو غير مدعوم.

13. حماية المشتركين والإعدادات الموجودة
شرط غير قابل للتنازل
هذه أهم قاعدة تشغيلية في المشروع.

يجب تصميم ZCtrl باعتباره نظام إدارة آمن لشبكة تعمل بالفعل، وليس أداة لإعادة تهيئة الراوتر من الصفر.
13.1 وضعان للتشغيل
الوضع	وظيفته
Observe / Manage	إدارة الإعدادات الموجودة دون فرض إعادة بناء الشبكة
Provision / Setup	إنشاء إعدادات جديدة بموافقة صريحة

الوضع الافتراضي عند إضافة راوتر موجود يجب أن يكون Observe / Manage.
13.2 ممنوعات النظام
لا ينفذ النظام تلقائياً:
- حذف HotSpot Users.
- حذف PPP Secrets.
- حذف User Manager Users.
- حذف Profiles الموجودة.
- إعادة إنشاء Bridge موجود.
- تغيير IP Address.
- تغيير DHCP Pool.
- حذف DHCP Leases.
- إعادة بناء Firewall.
- تغيير RADIUS Server.
- تعطيل واجهة مستخدمة.
- استبدال HotSpot Server.
- إعادة ضبط الراوتر.
- حذف ملفات المستخدمين.
- استبدال إعدادات WAN.
إلا إذا طلب المسؤول عملية محددة ووافق على أثرها.
13.3 آلية التعديل الآمن
#chatgpt-mermaid-_r_nl_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(13, 13, 13);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-_r_nl_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-_r_nl_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-_r_nl_ .error-icon{fill:rgb(243, 243, 243);}#chatgpt-mermaid-_r_nl_ .error-text{fill:rgb(13, 13, 13);stroke:rgb(13, 13, 13);}#chatgpt-mermaid-_r_nl_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-_r_nl_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-_r_nl_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-_r_nl_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-_r_nl_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-_r_nl_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-_r_nl_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-_r_nl_ .marker.cross{stroke:rgb(143, 143, 143);}#chatgpt-mermaid-_r_nl_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-_r_nl_ p{margin:0;}#chatgpt-mermaid-_r_nl_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(13, 13, 13);}#chatgpt-mermaid-_r_nl_ .cluster-label text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-_r_nl_ .cluster-label span{color:rgb(13, 13, 13);}#chatgpt-mermaid-_r_nl_ .cluster-label span p{background-color:transparent;}#chatgpt-mermaid-_r_nl_ .label text,#chatgpt-mermaid-_r_nl_ span{fill:rgb(13, 13, 13);color:rgb(13, 13, 13);}#chatgpt-mermaid-_r_nl_ .node rect,#chatgpt-mermaid-_r_nl_ .node circle,#chatgpt-mermaid-_r_nl_ .node ellipse,#chatgpt-mermaid-_r_nl_ .node polygon,#chatgpt-mermaid-_r_nl_ .node path{fill:rgb(222, 234, 251);stroke:rgb(83, 154, 248);stroke-width:1px;}#chatgpt-mermaid-_r_nl_ .rough-node .label text,#chatgpt-mermaid-_r_nl_ .node .label text,#chatgpt-mermaid-_r_nl_ .image-shape .label,#chatgpt-mermaid-_r_nl_ .icon-shape .label{text-anchor:middle;}#chatgpt-mermaid-_r_nl_ .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#chatgpt-mermaid-_r_nl_ .rough-node .label,#chatgpt-mermaid-_r_nl_ .node .label,#chatgpt-mermaid-_r_nl_ .image-shape .label,#chatgpt-mermaid-_r_nl_ .icon-shape .label{text-align:center;}#chatgpt-mermaid-_r_nl_ .node.clickable{cursor:pointer;}#chatgpt-mermaid-_r_nl_ .root .anchor path{fill:rgb(143, 143, 143)!important;stroke-width:0;stroke:rgb(143, 143, 143);}#chatgpt-mermaid-_r_nl_ .arrowheadPath{fill:rgb(143, 143, 143);}#chatgpt-mermaid-_r_nl_ .edgePath .path{stroke:rgb(143, 143, 143);stroke-width:1px;}#chatgpt-mermaid-_r_nl_ .flowchart-link{stroke:rgb(143, 143, 143);fill:none;}#chatgpt-mermaid-_r_nl_ .edgeLabel{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-_r_nl_ .edgeLabel p{background-color:rgb(252, 252, 252);}#chatgpt-mermaid-_r_nl_ .edgeLabel rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-_r_nl_ .labelBkg{background-color:rgba(252, 252, 252, 0.5);}#chatgpt-mermaid-_r_nl_ .cluster rect{fill:rgb(243, 243, 243);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-_r_nl_ .cluster text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-_r_nl_ .cluster span{color:rgb(13, 13, 13);}#chatgpt-mermaid-_r_nl_ div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:12px;background:rgb(243, 243, 243);border:1px solid rgba(0, 0, 0, 0.1);border-radius:2px;pointer-events:none;z-index:100;}#chatgpt-mermaid-_r_nl_ .flowchartTitleText{text-anchor:middle;font-size:18px;fill:rgb(13, 13, 13);}#chatgpt-mermaid-_r_nl_ rect.text{fill:none;stroke-width:0;}#chatgpt-mermaid-_r_nl_ .icon-shape,#chatgpt-mermaid-_r_nl_ .image-shape{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-_r_nl_ .icon-shape p,#chatgpt-mermaid-_r_nl_ .image-shape p{background-color:rgb(252, 252, 252);padding:2px;}#chatgpt-mermaid-_r_nl_ .icon-shape .label rect,#chatgpt-mermaid-_r_nl_ .image-shape .label rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-_r_nl_ .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#chatgpt-mermaid-_r_nl_ .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#chatgpt-mermaid-_r_nl_ .node .neo-node{stroke:rgb(83, 154, 248);}#chatgpt-mermaid-_r_nl_ [data-look="neo"].node rect,#chatgpt-mermaid-_r_nl_ [data-look="neo"].cluster rect,#chatgpt-mermaid-_r_nl_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-_r_nl_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_nl_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-_r_nl_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-_r_nl_-gradient);stroke-width:1px;}#chatgpt-mermaid-_r_nl_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_nl_ [data-look="neo"].node .neo-line path{stroke:rgb(83, 154, 248);filter:none;}#chatgpt-mermaid-_r_nl_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-_r_nl_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_nl_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-_r_nl_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-_r_nl_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_nl_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-_r_nl_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_nl_ .node text{font-size:14px;font-weight:600;letter-spacing:normal;fill:rgb(0, 79, 153);}#chatgpt-mermaid-_r_nl_ .edgeLabels text{font-size:13px;font-weight:600;letter-spacing:-0.08px;fill:rgb(0, 79, 153);}#chatgpt-mermaid-_r_nl_ .node tspan[font-weight="normal"],#chatgpt-mermaid-_r_nl_ .edgeLabels tspan[font-weight="normal"]{font-weight:600;}#chatgpt-mermaid-_r_nl_ .edgeLabel .label rect{opacity:1;rx:13px;ry:13px;fill:rgb(245, 250, 255);stroke:rgb(206, 219, 229);stroke-width:1px;}#chatgpt-mermaid-_r_nl_ .node rect,#chatgpt-mermaid-_r_nl_ .node circle,#chatgpt-mermaid-_r_nl_ .node ellipse,#chatgpt-mermaid-_r_nl_ .node polygon,#chatgpt-mermaid-_r_nl_ .node path{fill:rgb(229, 243, 255);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-_r_nl_ .node rect{rx:16px;ry:16px;}#chatgpt-mermaid-_r_nl_ .mermaid-decision .label-container{fill:rgb(245, 250, 255);stroke:rgb(206, 219, 229);stroke-dasharray:2,2;}#chatgpt-mermaid-_r_nl_ .edgePaths .flowchart-link{stroke:rgb(143, 143, 143);stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;}#chatgpt-mermaid-_r_nl_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-_r_nl_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}طلب تعديلقراءة الإعداد الحاليحفظ Snapshotتحليل التأثير والتبعياتهل يوجد خطر؟إظهار التحذير وطلب الموافقةإنشاء خطة التنفيذموافقة المسؤول؟إلغاء العمليةتنفيذ محدودالتحقق من النتيجةنجاح؟تسجيل العمليةتقييم التراجع الآمنRollback أو Recoveryنعملالانعمنعملا





13.4 التعديل التفاضلي
يجب أن يقارن النظام:
- الحالة الحالية للراوتر.
- الحالة المطلوبة.
- العناصر التي تحتاج تعديلاً فقط.
- العناصر التي لا تحتاج تغييراً.
- العناصر المتعارضة.
- العناصر التي قد تؤثر على المشتركين.
مثال:

إذا كان الراوتر يحتوي على 500 مشترك، ويريد المسؤول تغيير DNS فقط، فيجب تعديل DNS وحده دون إعادة إنشاء المستخدمين أو البروفايلات أو DHCP أو HotSpot.
13.5 نظام التراجع
يجب توفير:
- Snapshot قبل التعديل.
- Export قبل التعديل.
- Binary Backup عند الحاجة.
- سجل أوامر التنفيذ.
- سجل النتائج.
- خطة Rollback.
- التحقق من استعادة الخدمة.
يجب التمييز بين استعادة إعدادات الراوتر واستعادة قاعدة بيانات البرنامج؛ فهما عمليتان منفصلتان.

كما أن تحميل Backup كامل قد يعيد حالة الراوتر بصورة أوسع مما هو مطلوب، ولذلك يجب ألا يكون وسيلة التراجع الافتراضية لكل تعديل صغير.

14. الأمان والحماية Security Architecture







onitsolutions.au


يجب تطبيق الأمان على جميع طبقات النظام.
14.1 حماية الدخول
- تسجيل دخول آمن.
- Password Hashing باستخدام Argon2id.
- MFA للمسؤولين.
- إدارة الجلسات.
- انتهاء الجلسات.
- إبطال الجلسات.
- حماية CSRF.
- حماية XSS.
- Rate Limiting.
- منع Brute Force.
- سياسات كلمات مرور قوية.
14.2 صلاحيات المستخدمين RBAC
يجب توفير أدوار مختلفة:
الدور	الصلاحيات
Super Admin	جميع الوظائف
Network Admin	إدارة الشبكات والراوترات
Subscriber Manager	إدارة المشتركين
Profile Manager	إدارة البروفايلات
Card Operator	توليد الكروت
Monitoring	المشاهدة والمراقبة
Accountant	التقارير المالية عند وجودها
Read Only	مشاهدة فقط

ويجب أن تكون الصلاحيات على مستوى العمليات والراوترات والبيانات، لا مجرد إخفاء الأزرار من الواجهة.
14.3 حماية بيانات الراوترات
- تشفير بيانات الاعتماد أثناء التخزين باستخدام تشفير موثوق مثل AES-256-GCM.
- مفتاح التشفير خارج قاعدة البيانات.
- دعم تدوير المفاتيح.
- منع ظهور كلمات المرور في السجلات.
- عدم إرسال كلمات المرور للواجهة إلا عند الضرورة.
- التحقق من شهادات TLS.
- دعم شهادات موثوقة.
- منع الاتصال غير المشفر في بيئة الإنتاج.
- تقييد عناوين الإدارة.
- عدم كشف API للإنترنت دون ضرورة وضوابط.
توضح وثائق MikroTik أن صلاحيات مستخدمي الراوتر تتضمن سياسات منفصلة مثل api وrest-api وread وwrite وsensitive، ولذلك يجب اختبار الصلاحيات الفعلية بدلاً من افتراض أن كل حساب يستطيع تنفيذ جميع العمليات. 
MikroTik Documentation+1

14.4 سجل التدقيق Audit Log
يجب تسجيل:
- من نفذ العملية؟
- على أي راوتر؟
- متى؟
- ما العنصر الذي تم تعديله؟
- ما القيمة القديمة؟
- ما القيمة الجديدة؟
- ما نتيجة التنفيذ؟
- هل تم التراجع؟
- ما سبب الفشل؟
ويجب حماية السجل من التعديل غير المصرح به.

15. تصميم قاعدة البيانات
يجب ألا تعتمد قاعدة البيانات على جدول واحد للمستخدمين أو على تخزين كل البيانات في JSON غير منظم.
الجداول الأساسية
الجدول	المحتوى
routers	بيانات أجهزة MikroTik
router_capabilities	قدرات الأجهزة
router_credentials	بيانات الاتصال المشفرة
router_snapshots	نسخ الحالات
subscribers	ملفات المشتركين
subscriber_accounts	حسابات الدخول
subscriptions	الاشتراكات
profiles	تعريفات الباقات
profile_versions	إصدارات البروفايلات
hotspot_users	حسابات HotSpot
ppp_secrets	حسابات PPP
radius_users	حسابات RADIUS
user_manager_profiles	بروفايلات User Manager
active_sessions	الجلسات
cards	بيانات الكروت
card_batches	مجموعات الكروت
card_templates	قوالب التصميم
usage_records	الاستهلاك
router_commands	أوامر التنفيذ
command_results	نتائج التنفيذ
audit_logs	سجل العمليات
jobs	المهام
notifications	التنبيهات
admins	مستخدمو البرنامج
roles	الأدوار
permissions	الصلاحيات
backups	معلومات النسخ الاحتياطية

قاعدة أساسية
يجب التفريق بين:
1. بيانات البرنامج.
2. البيانات الفعلية على الراوتر.
3. البيانات المستلمة من RADIUS.
4. البيانات التاريخية.
5. البيانات المحسوبة.
لا يجوز أن تصبح قاعدة بيانات ZCtrl هي المرجع الوحيد لحالة المشترك دون التحقق من المصدر الذي ينفذ المصادقة فعلياً.

16. مزامنة البيانات Synchronization Engine
هذه الوحدة تمنع اختلاف المعلومات بين ZCtrl وMikroTik.

يجب توفير ثلاثة أنواع من المزامنة:

1. Pull Synchronization

قراءة بيانات الراوتر وتحديث قاعدة البرنامج.

2. Push Synchronization

إرسال تغييرات محددة من البرنامج إلى الراوتر.

3. Reconciliation

مقارنة النظامين واكتشاف الاختلافات والتعارضات.

مثال:

إذا حذف المسؤول مستخدماً من الراوتر مباشرة عبر WinBox، فيجب أن يكتشف ZCtrl ذلك ويعرض حالة الحساب الصحيحة، بدلاً من إظهاره فعالاً بصورة مضللة.
قواعد المزامنة
- عدم الكتابة فوق البيانات الأحدث دون مراجعة.
- دعم المزامنة الجزئية.
- دعم المزامنة الكاملة.
- دعم التوقف والاستئناف.
- اكتشاف التغييرات الخارجية.
- معالجة التعارضات.
- عدم تكرار إنشاء المستخدمين.
- استخدام معرفات مستقرة قدر الإمكان.
- تسجيل تاريخ آخر مزامنة ناجحة.
- فصل الأخطاء عن البيانات الصحيحة.
إدارة المهام
يجب أن تعمل المهام في Background Workers، مثل:
- مزامنة المستخدمين.
- قراءة الإحصائيات.
- توليد الكروت.
- تصدير التقارير.
- النسخ الاحتياطية.
- فحص الأجهزة.
- تنفيذ عمليات Bulk.
مع Queue وRetry محدود وIdempotency لمنع تكرار العمليات عند انقطاع الاتصال.

17. نظام إدارة العمليات والتغييرات Operation Engine
لا يكفي أن يكون البرنامج قادراً على إرسال أوامر إلى الراوتر؛ يجب أن يمتلك نظاماً لإدارة العمليات من البداية للنهاية.

كل عملية يجب أن تمر بمراحل موحدة:
1. استقبال الطلب.
2. التحقق من صلاحية المستخدم.
3. التحقق من اتصال الراوتر.
4. قراءة الحالة الحالية.
5. التحقق من صحة البيانات.
6. تحليل التأثير والتبعيات.
7. إنشاء خطة تنفيذ.
8. عرض المعاينة عند العمليات الحساسة.
9. تنفيذ العملية.
10. التحقق من النتيجة.
11. تحديث قاعدة البيانات.
12. تسجيل العملية.
13. إرسال إشعار بالنتيجة.
تصنيف العمليات
التصنيف	أمثلة	مستوى الحماية
Read	عرض المستخدمين والواجهات	منخفض
Write	تعديل اسم مستخدم	متوسط
Service	إعادة تشغيل خدمة	مرتفع
Network	تعديل IP أو Bridge	مرتفع جداً
Security	تعديل Firewall	مرتفع جداً
Destructive	حذف مجموعة مستخدمين	موافقة صريحة
Recovery	استعادة Backup	موافقة متعددة المراحل

لوحة العمليات
يجب توفير شاشة تعرض:
- العملية.
- الراوتر.
- المسؤول.
- وقت البدء.
- وقت الانتهاء.
- نسبة الإنجاز.
- عدد العناصر الناجحة.
- عدد العناصر الفاشلة.
- الأخطاء.
- إمكانية الإلغاء عندما يكون ذلك آمناً.
- إمكانية استئناف العمليات المدعومة.

18. واجهة المستخدم والتصميم البصري UI/UX




















12










يجب أن تكون الواجهة بمستوى برامج إدارة الشبكات الاحترافية.
18.1 الهيكل الرئيسي
القائمة الجانبية:
1. Dashboard.
2. Routers.
3. Network.
4. Subscribers.
5. HotSpot.
6. PPP.
7. User Manager.
8. Profiles.
9. Cards Studio.
10. Sessions.
11. Queues.
12. Firewall.
13. Routing.
14. Wireless.
15. CAPsMAN.
16. Monitoring.
17. Reports.
18. Logs.
19. Backups.
20. Settings.
18.2 نظام التصميم Design System
يجب إنشاء مكتبة تصميم موحدة تحتوي على:
- Design Tokens.
- Color Palette.
- Typography.
- Spacing Scale.
- Border Radius.
- Shadows.
- Icons.
- Buttons.
- Inputs.
- Selects.
- Tables.
- Tabs.
- Modals.
- Drawers.
- Notifications.
- Charts.
- Loading States.
- Empty States.
- Error States.
18.3 الألوان المقترحة
العنصر	اللون
Primary	#2563EB
Secondary	#0F172A
Background	#F8FAFC
Dark Background	#0B1220
Success	#16A34A
Warning	#F59E0B
Danger	#DC2626
Text	#1E293B
Muted	#64748B

يجب أن تكون جميع الألوان قابلة للتعديل من Design Tokens، وليس موزعة بصورة عشوائية داخل المكونات.
18.4 الخطوط
- العربية: IBM Plex Sans Arabic أو Cairo.
- الإنجليزية: Inter.
- أرقام الإحصائيات: خط يدعم الأرقام بوضوح.
- دعم RTL وLTR بصورة صحيحة.
18.5 الجداول الاحترافية
كل جدول يجب أن يدعم:
- البحث الفوري.
- التصفية المتقدمة.
- الترتيب.
- إخفاء وإظهار الأعمدة.
- تحديد الأعمدة.
- التحديد الجماعي.
- Pagination.
- Virtual Scrolling.
- تصدير البيانات.
- تحديث البيانات لحظياً.
- حفظ إعدادات العرض.
- قائمة إجراءات لكل صف.
18.6 الحركة والانتقالات
- انتقالات بين الصفحات.
- فتح وإغلاق النوافذ.
- تحديث البطاقات.
- مؤشرات الاتصال.
- رسوم بيانية متحركة باعتدال.
- Loading Skeleton.
- إشعارات نجاح وفشل.
يجب ألا تؤثر الحركة على الأداء أو إمكانية الوصول.

19. لوحة التحكم الرئيسية Dashboard







freeispradius.net


يجب أن تكون لوحة التحكم مركزاً لمتابعة الشبكة.
البطاقات الأساسية
البطاقة	البيانات
Total Routers	إجمالي الراوترات
Online Routers	الراوترات المتصلة
Offline Routers	الراوترات المنقطعة
Total Subscribers	إجمالي المشتركين
Active Subscribers	المشتركين الفعالون
Online Users	المتصلون حالياً
Expired Users	المنتهية اشتراكاتهم
Active Profiles	البروفايلات المستخدمة
Bandwidth	استهلاك الشبكة
CPU	متوسط أحمال الراوترات
Memory	حالة الذاكرة
Pending Jobs	العمليات المعلقة

الرسوم البيانية
- استهلاك الإنترنت خلال 24 ساعة.
- استهلاك الأسبوع والشهر.
- نمو عدد المشتركين.
- توزيع الباقات.
- حالة الراوترات.
- أكثر المشتركين استهلاكاً.
- حالات انتهاء الاشتراكات.
- عدد الجلسات اليومية.
يجب ألا تعرض اللوحة بيانات تقديرية على أنها بيانات فعلية، وأن يظهر وقت آخر تحديث ومصدر البيانات.

20. التقارير والإحصائيات
يجب أن يوفر النظام تقارير تشغيلية وإدارية:

تقارير المشتركين
- جميع المشتركين.
- المشتركين الفعالين.
- المنتهية اشتراكاتهم.
- الموقوفين.
- المشتركين حسب الراوتر.
- المشتركين حسب البروفايل.
تقارير الشبكة
- استهلاك كل راوتر.
- استهلاك كل واجهة.
- استهلاك المشترك.
- معدلات الاتصال.
- الانقطاعات.
- أخطاء الاتصال.
تقارير الكروت
- الكروت المولدة.
- الكروت المباعة.
- الكروت المستخدمة.
- الكروت المنتهية.
- الكروت المعطلة.
التصدير
- PDF.
- Excel.
- CSV.
- تقارير مطبوعة بتصميم احترافي.

21. الاختبارات وضمان الجاهزية للإنتاج
لا يجوز إعلان النظام Production-Ready لمجرد أن الواجهة تعمل وأن الاتصال بالراوتر ناجح.

يجب أن تكون هناك استراتيجية اختبار كاملة.
21.1 الاختبارات المطلوبة
نوع الاختبار	ما الذي يختبره؟
Unit Testing	الدوال والوحدات المنفردة
Integration Testing	تكامل الوحدات وقاعدة البيانات
API Testing	واجهات Backend
RouterOS Integration	الاتصال الفعلي بالراوتر
E2E Testing	رحلة المستخدم كاملة
Security Testing	الثغرات والحماية
Load Testing	ضغط الاستخدام
Performance Testing	السرعة واستهلاك الموارد
Recovery Testing	الاستعادة والتراجع
Compatibility Testing	اختلاف الأجهزة والإصدارات
UI Testing	التصميم والتفاعل
Regression Testing	منع عودة الأخطاء السابقة

21.2 اختبارات MikroTik الفعلية
يجب توفير مختبر RouterOS حقيقي أو CHR، مع أجهزة اختبار إضافية عند الحاجة.

الاختبارات الأساسية:
1. الاتصال الصحيح والخاطئ.
2. فقدان الاتصال أثناء العملية.
3. إعادة الاتصال.
4. إضافة مستخدم.
5. تعديل مستخدم.
6. تعطيل مستخدم.
7. فصل مستخدم متصل.
8. إضافة بروفايل.
9. تعديل بروفايل.
10. تغيير سرعة مشترك.
11. إنشاء HotSpot.
12. إنشاء PPP Secret.
13. قراءة الجلسات.
14. قراءة استهلاك المستخدمين.
15. تعديل DHCP.
16. تعديل Firewall.
17. إنشاء Backup.
18. استعادة إعدادات الاختبار.
19. المزامنة بعد التعديل المباشر من WinBox.
20. اختبار صلاحيات الحسابات المحدودة.
21.3 اختبارات الحفاظ على المشتركين
هذه مجموعة اختبارات إلزامية مستقلة:
- تشغيل البرنامج على راوتر يحتوي على مشتركين فعليين أو بيانات اختبار مماثلة.
- التأكد من عدم حذف أي حساب عند الاتصال الأول.
- التأكد من عدم تعديل البروفايلات دون طلب.
- التأكد من عدم إعادة إنشاء DHCP.
- التأكد من عدم تغيير إعدادات WAN.
- التأكد من استمرار الجلسات خلال عمليات القراءة.
- التأكد من أن فشل عملية تعديل لا يؤدي إلى حذف الحساب.
- التأكد من استعادة الحالة الصحيحة بعد انقطاع الاتصال.
- التأكد من عدم تكرار المستخدمين بعد إعادة المحاولة.
21.4 معايير قبول الإنتاج
أقترح اعتماد الحدود التالية كمعايير مشروع أولية:
المؤشر	معيار القبول
تغطية اختبارات الوحدات	80% على الأقل
نجاح اختبارات العمليات الحرجة	100%
فقدان بيانات المشتركين	صفر
عمليات الحذف غير المصرح بها	صفر
العمليات الحرجة دون Audit Log	صفر
تسرب بيانات الاعتماد في Logs	صفر
العمليات الجماعية دون تتبع نتائج	صفر
نجاح النسخ الاحتياطي والاستعادة	100% في اختبارات القبول
الوظائف المدعومة دون توثيق	صفر

نسبة التغطية وحدها لا تكفي؛ يجب قياس تغطية الفروع والسيناريوهات والأخطاء، واختبار السلوك على أجهزة فعلية.

22. إدارة الأعطال والتعافي Disaster Recovery
يجب أن يتعامل البرنامج مع السيناريوهات التالية:
المشكلة	الإجراء
انقطاع الإنترنت	إعادة اتصال تدريجية
انقطاع الراوتر	إيقاف العمليات غير الممكنة
انتهاء المهلة	تصنيف العملية وإظهار نتيجتها
قاعدة البيانات غير متاحة	إيقاف الكتابة بأمان
فشل Worker	إعادة تشغيله واستعادة المهام الآمنة
تعطل Backend	استعادة الخدمة
فشل المزامنة	الاحتفاظ بآخر حالة معروفة
فشل تعديل إعداد	التحقق والتراجع المناسب
امتلاء القرص	تنبيه وإيقاف الأعمال غير الضرورية
تلف قاعدة البيانات	استعادة نسخة سليمة

سياسة النسخ الاحتياطي
- نسخ احتياطية دورية لقاعدة بيانات ZCtrl.
- نسخ احتياطية لبيانات الراوترات.
- نسخ مشفرة لملفات النسخ.
- الاحتفاظ بنسخ يومية وأسبوعية وشهرية.
- اختبار الاستعادة دورياً.
- تخزين نسخة خارج الخادم.
- عدم حفظ مفاتيح التشفير بجانب النسخ الاحتياطية.

23. البنية التقنية ومكتبات التنفيذ
هذه التقنيات المقترحة لتنفيذ النظام مع الالتزام بالمكدس الأساسي.
الطبقة	التقنية
Frontend	React 18
Language	TypeScript
UI	Tailwind CSS
State	Zustand أو Redux Toolkit
Data Fetching	TanStack Query
Tables	TanStack Table
Charts	ECharts أو Recharts
Forms	React Hook Form
Validation	Zod
Backend	Node.js + Express
Database	SQLite WAL
Future Database	PostgreSQL
ORM	Prisma أو Drizzle
Router Connection	RouterOS API Client
Secure Transport	TLS
Real-time	WebSocket
Queue	BullMQ عند استخدام Redis
Cache	Redis عند الحاجة
Testing	Vitest
API Testing	Supertest
E2E	Playwright
Security	Argon2id + AES-GCM
Monitoring	Prometheus + Grafana
Deployment	Nginx + PM2 أو Docker

ملاحظة تقنية: إذا استخدمت SQLite، فيجب أن يكون هناك تصميم يمنع التنافس غير المنضبط على الكتابة، مع معاملات ومهاجرات Schema واختبارات استعادة. وعند توسع عدد العمليات والعمال والمستخدمين، يكون PostgreSQL خيار الانتقال الإنتاجي الأنسب. كذلك لا يحتاج النظام إلى Redis في كل حالة؛ يعتمد ذلك على عدد العمال وطبيعة النشر.

24. تقسيم المشروع إلى وحدات برمجية
أقترح ألا يبنى النظام في ملف واحد أو مجموعة ملفات ضخمة مترابطة.
zctrl/
│
├── frontend/
│   ├── dashboard/
│   ├── routers/
│   ├── network/
│   ├── subscribers/
│   ├── hotspot/
│   ├── ppp/
│   ├── radius/
│   ├── user-manager/
│   ├── profiles/
│   ├── card-studio/
│   ├── monitoring/
│   ├── reports/
│   ├── audit/
│   └── settings/
│
├── backend/
│   ├── api/
│   ├── auth/
│   ├── security/
│   ├── services/
│   ├── router-engine/
│   │   ├── connection/
│   │   ├── adapters/
│   │   ├── capabilities/
│   │   ├── commands/
│   │   ├── validators/
│   │   ├── executor/
│   │   ├── verification/
│   │   └── recovery/
│   │
│   ├── subscriber-engine/
│   ├── profile-engine/
│   ├── hotspot-engine/
│   ├── ppp-engine/
│   ├── radius-engine/
│   ├── card-engine/
│   ├── sync-engine/
│   ├── monitoring-engine/
│   ├── audit-engine/
│   ├── backup-engine/
│   └── workers/
│
├── database/
│   ├── schema/
│   ├── migrations/
│   ├── repositories/
│   └── seeds/
│
├── shared/
│   ├── types/
│   ├── constants/
│   ├── validators/
│   └── utilities/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── routeros/
│   ├── security/
│   ├── e2e/
│   └── performance/
│
├── deployment/
│   ├── docker/
│   ├── nginx/
│   ├── scripts/
│   └── monitoring/
│
└── documentation/
    ├── architecture/
    ├── api/
    ├── routeros/
    ├── security/
    ├── testing/
    └── operations/



25. مراحل تنفيذ المشروع من البداية حتى الإنتاج
لا أنصح ببناء جميع الوحدات دفعة واحدة؛ الأفضل بناء نواة قوية ثم إضافة الوحدات وربطها تدريجياً.
خارطة التنفيذ المقترحة
1. المرحلة الأولى: تأسيس النواة الهندسية
   أولوية قصوى
   - إعداد المشروع والبنية.
   - قاعدة البيانات.
   - Authentication وRBAC.
   - تشفير بيانات الراوترات.
   - RouterOS Connection Engine.
   - Capability Detection.
   - Audit Log.
   - Backup وRecovery.
2. المرحلة الثانية: التحكم الأساسي بالراوتر
   - إضافة الأجهزة والاتصال بها.
   - System وInterfaces.
   - IP وDHCP وDNS.
   - Bridge وVLAN.
   - Firewall وNAT.
   - Queues وRouting.
   - Terminal المتقدم.
3. المرحلة الثالثة: نظام المشتركين
   أولوية قصوى
   - Subscriber Engine.
   - HotSpot Users.
   - PPP Secrets.
   - Active Sessions.
   - إضافة وتعديل وتعطيل الحسابات.
   - فصل وإعادة اتصال المستخدمين.
   - المزامنة مع الراوتر.
4. المرحلة الرابعة: البروفايلات والخدمات
   - HotSpot Profiles.
   - PPP Profiles.
   - User Manager.
   - RADIUS.
   - Limitations.
   - إدارة السرعات والحصص.
   - محرك تغيير البروفايلات.
5. المرحلة الخامسة: استوديو الكروت
   - توليد الحسابات.
   - مجموعات الكروت.
   - التصاميم.
   - الطباعة.
   - QR Code.
   - إدارة المخزون والحالات.
6. المرحلة السادسة: المراقبة والإدارة المتقدمة
   - Real-time Monitoring.
   - Multi-Router.
   - CAPsMAN.
   - VPN.
   - Wireless.
   - تقارير وتحليلات.
   - تنبيهات ذكية.
7. المرحلة السابعة: الاختبارات والإطلاق
   شرط إطلاق الإنتاج
   - اختبارات RouterOS الفعلية.
   - اختبارات الأمان.
   - اختبارات الضغط.
   - اختبارات الحفاظ على المشتركين.
   - اختبارات النسخ والاستعادة.
   - إصلاح جميع الأخطاء الحرجة.
   - مراجعة التصميم.
   - Production Deployment.

26. مصفوفة المهارات المطلوبة لتنفيذ المشروع
هذه ليست مجرد قائمة لغات برمجة؛ إنها المهارات التي يجب توافرها في الفريق أو أدوات التطوير أو الوكلاء الهندسيين المسؤولين عن كل وحدة.
المجال	المهارات المطلوبة
Architecture	Software Architecture, DDD, Modular Design
Frontend	React 18, TypeScript, Hooks
UI/UX	Figma, Design Systems, RTL, Responsive Design
Styling	Tailwind CSS, CSS Architecture
Backend	Node.js, Express, REST API
Database	SQLite, SQL, PostgreSQL, Migrations
RouterOS	RouterOS CLI, API, API-SSL, REST
MikroTik Network	IP, VLAN, DHCP, DNS, NAT
Firewall	Filter, Mangle, RAW, Connection Tracking
Wireless	WiFi, Wireless, CAPsMAN
PPP	PPPoE, L2TP, SSTP, PPP Profiles
HotSpot	HotSpot, Captive Portal, Sessions
RADIUS	Authentication, Accounting, User Manager
Subscriber Systems	CRM, Account Lifecycle, Subscription Management
Profiles	Rate Limits, Quotas, Expiration, Policy Engines
Security	RBAC, MFA, TLS, Encryption, Threat Modeling
Sync	Reconciliation, Conflict Resolution, Idempotency
Workers	Queues, Background Jobs, Retry Policies
Monitoring	WebSocket, Metrics, Prometheus
Reporting	PDF, Excel, CSV, Data Visualization
Testing	Vitest, Supertest, Playwright
Network Testing	RouterOS CHR, Physical Router Labs
Performance	Profiling, Caching, Virtualization
Recovery	Backup, Restore, Rollback, Disaster Recovery
Deployment	Linux, Nginx, PM2, Docker
Documentation	Architecture Docs, API Docs, Runbooks

مهارات متقدمة يجب ألا تغيب
1. تحليل اختلافات RouterOS بين الإصدارات.
2. فهم بنية أوامر MikroTik API.
3. إدارة الجلسات المتزامنة.
4. تصميم محركات إدارة المشتركين.
5. تحليل التأثير قبل تغيير الإعدادات.
6. بناء أنظمة آمنة للتعديل الجماعي.
7. اكتشاف تعارضات المزامنة.
8. تصميم واجهات كثيفة البيانات مثل WinBox.
9. اختبار انقطاع الاتصال أثناء التنفيذ.
10. تصميم أنظمة استعادة دون فقدان البيانات.

27. كيف نحقق مستوى تحكم قريباً من WinBox؟
هذه نقطة مهمة جداً، ويجب أن تكون لها خطة مستقلة.




















8










لا يكفي أن نقول إن البرنامج يتحكم في MikroTik بالكامل؛ يجب إثبات ذلك بمصفوفة تغطية.
مصفوفة التكافؤ الوظيفي
وظيفة WinBox	المطلوب في ZCtrl
System	كامل حسب قدرات الجهاز
Interfaces	كامل حسب قدرات الجهاز
Bridge	كامل حسب قدرات الجهاز
IP	كامل حسب قدرات الجهاز
DHCP	كامل حسب قدرات الجهاز
DNS	كامل حسب قدرات الجهاز
Firewall	كامل حسب قدرات الجهاز
Queues	كامل حسب قدرات الجهاز
Routing	كامل حسب قدرات الجهاز
HotSpot	كامل حسب قدرات الجهاز
PPP	كامل حسب قدرات الجهاز
RADIUS	كامل حسب قدرات الجهاز
User Manager	كامل حسب الحزمة والإصدار
Wireless	حسب العتاد والحزم
CAPsMAN	حسب الإصدار ونوع WiFi
VPN	حسب البروتوكول والدعم
Files	حسب الصلاحيات
Scripts	حسب الصلاحيات
Scheduler	حسب الصلاحيات
Logs	كامل حسب الصلاحيات
Tools	حسب دعم الأوامر
Advanced Terminal	تغطية أوامر RouterOS المسموحة

ثلاث طبقات لتحقيق التكافؤ
الطبقة الأولى: GUI Management

واجهات متخصصة لكل إعداد في الراوتر.

الطبقة الثانية: Advanced Console

تنفيذ أوامر RouterOS المسموحة من خلال واجهة إدارية محمية.

الطبقة الثالثة: Capability Coverage

مصفوفة توثق كل أمر ووظيفة:
- Supported: مدعوم بالكامل.
- Partial: مدعوم جزئياً.
- Unsupported: غير مدعوم.
- Restricted: يتطلب صلاحيات إضافية.
- Incompatible: غير متوافق مع الإصدار أو الجهاز.
بهذا لا تكون هناك وظيفة مجهولة أو زر شكلي لا ينفذ شيئاً.

28. شروط النجاح النهائية للمشروع
أعتبر النظام جاهزاً للإنتاج عندما يحقق جميع النقاط التالية:
قائمة اعتماد ZCtrl
التحكم في MikroTik
- [ ] إدارة الأجهزة والاتصالات.
- [ ] تغطية أقسام RouterOS الأساسية والمتقدمة.
- [ ] دعم API-SSL.
- [ ] إدارة Terminal.
- [ ] كشف الوظائف غير المدعومة.

المشتركون والمستخدمون
- [ ] ملف موحد لكل مشترك.
- [ ] إدارة HotSpot.
- [ ] إدارة PPP.
- [ ] إدارة RADIUS وUser Manager.
- [ ] إدارة الجلسات.
- [ ] إدارة الاشتراكات والصلاحيات.

البروفايلات والكروت
- [ ] جميع أنواع البروفايلات.
- [ ] إدارة السرعات والحصص.
- [ ] محرك تجديد الاشتراكات.
- [ ] توليد الكروت والطباعة.
- [ ] مزامنة الكروت مع الحسابات الفعلية.

الأمان والاستقرار
- [ ] RBAC وMFA.
- [ ] تشفير بيانات الاعتماد.
- [ ] سجل تدقيق كامل.
- [ ] Snapshot وRollback.
- [ ] حماية المشتركين الحاليين.
- [ ] اختبار استعادة النسخ الاحتياطية.

التصميم والجودة
- [ ] تصميم احترافي موحد.
- [ ] RTL وLTR.
- [ ] جداول احترافية.
- [ ] مراقبة لحظية.
- [ ] اختبارات الأداء.
- [ ] اختبارات الإنتاج.

29. توصياتي الهندسية الحاسمة
هناك ستة قرارات أعتبرها أساسية لنجاح ZCtrl:
1. لا تبنِ النظام حول HotSpot فقط: اجعل RouterOS Engine هو المركز، والمشتركون والبروفايلات خدمات مبنية فوقه.
2. لا تجعل قاعدة بيانات البرنامج بديلاً عن الراوتر: يجب أن يتعرف البرنامج على التغييرات التي تتم من WinBox أو Terminal.
3. لا تجعل Profile Engine يفرض إعداداته: يجب أن يقرأ البروفايلات الموجودة ويعمل معها ويحافظ عليها.
4. لا تجعل أي تحديث يعيد بناء الشبكة: التحديثات يجب أن تكون تفاضلية ومحدودة ومراجعة.
5. لا تساوِ بين نجاح إرسال الأمر ونجاح العملية: يجب قراءة النتيجة والتحقق من الحالة الفعلية.
6. لا تطلق النظام دون مختبر RouterOS واختبارات الحفاظ على المشتركين: فالنجاح على قاعدة بيانات تجريبية لا يثبت سلامة التشغيل على شبكة حقيقية.

30. الشكل النهائي الذي يجب أن يصل إليه ZCtrl




















13










النتيجة النهائية المطلوبة هي منصة تحتوي على أربعة محركات رئيسية مترابطة:
ZAHIR CONTROL
Central Network Management Platform

Router Engine
إدارة وتحكم MikroTik

Subscriber Engine
المشتركون والحسابات

Profile Engine
الباقات والسرعات والصلاحيات

Monitoring Engine
المراقبة والتحليل والمزامنة



Security + Database + Sync + Audit + Recovery


القرار النهائي
أوصي بأن يكون أول إصدار فعلي من ZCtrl هو إصدار Core Management Foundation، ويحتوي على:
- محرك اتصال MikroTik متكامل.
- نظام اكتشاف قدرات الراوتر.
- إدارة جميع المستخدمين والمشتركين الحاليين.
- إدارة HotSpot وPPP.
- إدارة البروفايلات.
- مراقبة الجلسات.
- المزامنة الثنائية.
- الأمان والنسخ الاحتياطي والتراجع.
- واجهة إدارية احترافية.
وبعد إثبات استقرار هذه النواة، تتم إضافة Firewall وRouting وCAPsMAN وVPN وبقية وظائف WinBox.

الهدف ليس بناء برنامج يستطيع إرسال أوامر كثيرة إلى MikroTik؛ الهدف بناء نظام يستطيع فهم حالة الشبكة، وإدارة مواردها، وتنفيذ التغييرات الصحيحة، والتحقق منها، وحماية المشتركين الحاليين حتى عند حدوث الأعطال.

للمرجعية الفنية أثناء التنفيذ: RouterOS API، وRouterOS REST API، وRouterOS User Permissions، وUser Manager، وQueues.

يمكن اعتماد هذه الخطة أساساً لوثيقة ZCtrl Master Engineering & Implementation Specification v1.0، ثم تحويل كل قسم منها إلى متطلبات تنفيذية وملفات ومكونات واختبارات قبول محددة.