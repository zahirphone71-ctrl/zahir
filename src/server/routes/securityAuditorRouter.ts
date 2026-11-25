import type { Request, Response } from 'express';
import { MikrotikAPI, type MikrotikClient } from '../mikrotik-api.ts';

export interface AuditCheckItem {
  id: string;
  category: 'حسابات والوصول' | 'المنافذ والخدمات' | 'الجدار الناري والتوجيه' | 'السكربتات والمهام' | 'النظام والوقت';
  title: string;
  path: string;
  officialRecommendation: string;
  status: 'compliant' | 'vulnerable' | 'warning';
  currentValue: string;
  fixAvailable: boolean;
  explanation: string;
}

export interface ScriptAuditItem {
  id: string;
  name: string;
  sourceLength: number;
  runCount: number;
  lastStarted?: string;
  hasScheduler: boolean;
  schedulerInterval?: string;
  isFaultyOrUseless: boolean;
  reason: string;
}

/**
 * فحص المايكروتك ومطابقة إعداداته مع توصيات شركة MikroTik الرسمية
 */
export const auditSecurityApi = async (req: Request, res: Response) => {
  const client: MikrotikClient = (req as any).routerClient || MikrotikAPI;
  if (!client || !client.isConnected()) {
    return res.status(401).json({
      success: false,
      message: 'الراوتر غير متصل حالياً. يرجى تسجيل الدخول للراوتر أولاً.'
    });
  }

  try {
    const checks: AuditCheckItem[] = [];

    // 1. فحص حساب admin الافتراضي
    const users = await client.querySafe('/user/print');
    const adminUser = users.find((u: any) => u.name === 'admin');
    if (adminUser) {
      const isSoleUser = users.length === 1;
      checks.push({
        id: 'admin_user',
        category: 'حسابات والوصول',
        title: 'حساب المدير الافتراضي (admin)',
        path: '/user',
        officialRecommendation: 'توصي شركة MikroTik بإنشاء حساب مدير باسم مخصص وحظر أو إعادة تسمية حساب admin الافتراضي لمنع هجمات التخمين.',
        status: isSoleUser ? 'vulnerable' : 'warning',
        currentValue: `حساب admin موجود ومفعل (${users.length} حسابات مدير)`,
        fixAvailable: false, // يتطلب تدخلاً يدوياً لكتابة اسم مستخدم وكلمة مرور جديدة للمدير
        explanation: 'حساب admin هو الهدف الأول لبرامج الاختراق الآلية (Botnets) التي تجرب ملايين كلمات المرور.'
      });
    } else {
      checks.push({
        id: 'admin_user',
        category: 'حسابات والوصول',
        title: 'حساب المدير الافتراضي (admin)',
        path: '/user',
        officialRecommendation: 'توصي شركة MikroTik بتعطيل حساب admin الافتراضي واستخدام اسم مخصص.',
        status: 'compliant',
        currentValue: 'تم استبدال حساب admin بحسابات مخصصة',
        fixAvailable: false,
        explanation: 'الراوتر محمي من هجمات التخمين القياسية الموجهة لحساب admin.'
      });
    }

    // 2. فحص الخدمات المفتوحة الخطرة (Telnet & FTP)
    const services = await client.querySafe('/ip/service/print');
    const telnetSrv = services.find((s: any) => s.name === 'telnet');
    const ftpSrv = services.find((s: any) => s.name === 'ftp');
    const wwwSrv = services.find((s: any) => s.name === 'www');
    const apiSrv = services.find((s: any) => s.name === 'api');
    const winboxSrv = services.find((s: any) => s.name === 'winbox');

    const telnetEnabled = telnetSrv && (telnetSrv.disabled === 'false' || telnetSrv.disabled === 'no' || !telnetSrv.disabled);
    const ftpEnabled = ftpSrv && (ftpSrv.disabled === 'false' || ftpSrv.disabled === 'no' || !ftpSrv.disabled);

    if (telnetEnabled || ftpEnabled) {
      checks.push({
        id: 'insecure_services',
        category: 'المنافذ والخدمات',
        title: 'البروتوكولات غير المشفرة (Telnet / FTP)',
        path: '/ip/service',
        officialRecommendation: 'توصي MikroTik بتعطيل خدمتي Telnet و FTP فوراً لأنهما تنقلان كلمات المرور بنص صريح غير مشفر (Cleartext).',
        status: 'vulnerable',
        currentValue: `Telnet: ${telnetEnabled ? 'مفعل (خطر)' : 'معطل'} | FTP: ${ftpEnabled ? 'مفعل (خطر)' : 'معطل'}`,
        fixAvailable: true,
        explanation: 'يمكن لأي مخترق أو مشترك على نفس الشبكة التنصت واستخراج بيانات المرور وكلمات السر بسهولة.'
      });
    } else {
      checks.push({
        id: 'insecure_services',
        category: 'المنافذ والخدمات',
        title: 'البروتوكولات غير المشفرة (Telnet / FTP)',
        path: '/ip/service',
        officialRecommendation: 'تعطيل Telnet و FTP.',
        status: 'compliant',
        currentValue: 'Telnet و FTP معطلان بالكامل',
        fixAvailable: false,
        explanation: 'لا توجد خدمات نص صريح مفتوحة على الراوتر.'
      });
    }

    // 3. فحص واجهة الويب (WWW - Port 80)
    const wwwEnabled = wwwSrv && (wwwSrv.disabled === 'false' || wwwSrv.disabled === 'no' || !wwwSrv.disabled);
    const wwwHasIpRestriction = wwwSrv?.address && wwwSrv.address.trim().length > 0;
    if (wwwEnabled && !wwwHasIpRestriction) {
      checks.push({
        id: 'www_service_unrestricted',
        category: 'المنافذ والخدمات',
        title: 'واجهة الويب غير المشفرة (HTTP Port 80)',
        path: '/ip/service',
        officialRecommendation: 'توصي MikroTik بحصر منفذ الويب (80) على عناوين الإدارة المحلية (Available From) أو استخدام HTTPS (443).',
        status: 'warning',
        currentValue: 'منفذ 80 متاح لأي عنوان IP بدون تقييد',
        fixAvailable: true,
        explanation: 'يسمح للمشتركين بفتح صفحة تسجيل الدخول للراوتر ومحاولة تخمين كلمة المرور.'
      });
    } else {
      checks.push({
        id: 'www_service_unrestricted',
        category: 'المنافذ والخدمات',
        title: 'واجهة الويب (HTTP Port 80)',
        path: '/ip/service',
        officialRecommendation: 'تقييد الوصول لواجهة الويب أو تشفيرها.',
        status: 'compliant',
        currentValue: wwwEnabled ? `مقيدة لـ: ${wwwSrv.address}` : 'الخدمة معطلة ومؤمنة',
        fixAvailable: false,
        explanation: 'الوصول لواجهة الويب مقيد أو محمي.'
      });
    }

    // 4. فحص الـ DNS Open Resolver
    const dnsSettings = await client.querySafe('/ip/dns/print');
    const allowRemote = dnsSettings[0]?.['allow-remote-requests'] === 'yes' || dnsSettings[0]?.['allow-remote-requests'] === 'true';
    const fwFilters = await client.querySafe('/ip/firewall/filter/print');
    
    // Check if there is an input rule dropping DNS from WAN
    const dropsDnsFromWan = fwFilters.some((f: any) => 
      f.chain === 'input' && 
      (f.action === 'drop' || f.action === 'reject') && 
      (f['dst-port'] === '53' || f['dst-port']?.includes('53'))
    );

    if (allowRemote && !dropsDnsFromWan) {
      checks.push({
        id: 'dns_open_resolver',
        category: 'الجدار الناري والتوجيه',
        title: 'ثغرة خادم الـ DNS المفتوح (DNS Open Resolver)',
        path: '/ip/dns & /ip/firewall/filter',
        officialRecommendation: 'عند تفعيل allow-remote-requests لخدمة الهوتسبوت، توصي MikroTik رسمياً بوضع قاعدة في جدار الحماية لإسقاط طلبات الـ DNS الواردة من منفذ الإنترنت WAN.',
        status: 'vulnerable',
        currentValue: 'allow-remote-requests=yes بدون حظر DNS من الـ WAN',
        fixAvailable: true,
        explanation: 'يتم استغلال الراوتر في هجمات الحرمان من الخدمة (DDoS Amplification) واستهلاك خط الإنترنت بالكامل.'
      });
    } else {
      checks.push({
        id: 'dns_open_resolver',
        category: 'الجدار الناري والتوجيه',
        title: 'حماية خادم الـ DNS المحلي',
        path: '/ip/dns',
        officialRecommendation: 'حظر الـ DNS الخارجي أو تعطيل allow-remote-requests.',
        status: 'compliant',
        currentValue: allowRemote ? 'مفعل ومحمي بقواعد جدار حماية من WAN' : 'allow-remote-requests معطل',
        fixAvailable: false,
        explanation: 'الراوتر محمي من هجمات تضخيم الـ DNS.'
      });
    }

    // 5. فحص بروتوكولات الاكتشاف MNDP و CDP و LLDP على الـ WAN
    const neighborSettings = await client.querySafe('/ip/neighbor/discovery-settings/print');
    const discList = neighborSettings[0]?.['discover-interface-list'] || neighborSettings[0]?.['discovery-interfaces'] || 'all';
    const isDiscUnrestricted = discList === 'all' || discList === '!none' || discList === '';

    if (isDiscUnrestricted) {
      checks.push({
        id: 'neighbor_discovery_wan',
        category: 'النظام والوقت',
        title: 'بث بروتوكول الاكتشاف (MNDP / CDP / LLDP)',
        path: '/ip/neighbor/discovery-settings',
        officialRecommendation: 'توصي MikroTik بتعطيل اكتشاف الجيران على منافذ الإنترنت الخارجية WAN لمنع تسريب اسم الراوتر وإصداره وماك أدرس الجهاز.',
        status: 'warning',
        currentValue: `واجهات الاكتشاف: ${discList || 'الكل (all)'}`,
        fixAvailable: true,
        explanation: 'المزود أو المخترقين على شبكة WAN يمكنهم قراءة نوع الراوتر وإصدار RouterOS واستهدافه بثغرات مخصصة.'
      });
    } else {
      checks.push({
        id: 'neighbor_discovery_wan',
        category: 'النظام والوقت',
        title: 'بث بروتوكول الاكتشاف (MNDP / CDP / LLDP)',
        path: '/ip/neighbor/discovery-settings',
        officialRecommendation: 'حصر الاكتشاف على الشبكة المحلية.',
        status: 'compliant',
        currentValue: `مقيد بقائمة: ${discList}`,
        fixAvailable: false,
        explanation: 'بروتوكولات الاكتشاف معزولة عن منافذ الإنترنت.'
      });
    }

    // 6. فحص خادم الماك أدرس (MAC Server / MAC Winbox)
    const macWinbox = await client.querySafe('/tool/mac-server/mac-winbox/print');
    const macWinboxList = macWinbox[0]?.['allowed-interface-list'] || macWinbox[0]?.interface || 'all';
    const isMacWinboxOpen = macWinboxList === 'all' || macWinboxList === '';

    if (isMacWinboxOpen) {
      checks.push({
        id: 'mac_winbox_open',
        category: 'المنافذ والخدمات',
        title: 'خادم الدخول عبر الماك (MAC-Winbox Server)',
        path: '/tool/mac-server/mac-winbox',
        officialRecommendation: 'توصي MikroTik بحصر الاتصال عبر MAC-Winbox على واجهات الإدارة المحلية فقط ومنعه عن منافذ الإنترنت.',
        status: 'vulnerable',
        currentValue: 'مفتوح لجميع الواجهات (all)',
        fixAvailable: true,
        explanation: 'يمكن محاولة تسجيل الدخول وتخمين كلمات السر عبر طبقة الـ Ethernet Layer 2 من شبكة المزود.'
      });
    } else {
      checks.push({
        id: 'mac_winbox_open',
        category: 'المنافذ والخدمات',
        title: 'خادم الدخول عبر الماك (MAC-Winbox Server)',
        path: '/tool/mac-server/mac-winbox',
        officialRecommendation: 'حصر MAC-Winbox على الواجهات المحلية.',
        status: 'compliant',
        currentValue: `محصور بقائمة: ${macWinboxList}`,
        fixAvailable: false,
        explanation: 'خادم الماك وينبوكس مؤمن.'
      });
    }

    // 7. فحص خادم قياس السرعة (Bandwidth Server)
    const bwServer = await client.querySafe('/tool/bandwidth-server/print');
    const bwEnabled = bwServer[0]?.enabled === 'yes' || bwServer[0]?.enabled === 'true';

    if (bwEnabled) {
      checks.push({
        id: 'bandwidth_server',
        category: 'المنافذ والخدمات',
        title: 'خادم قياس السرعة (Bandwidth Test Server)',
        path: '/tool/bandwidth-server',
        officialRecommendation: 'توصي MikroTik بتعطيل Bandwidth Server إلا عند الحاجة له مؤقتاً لتجنب استهلاك معالج الراوتر والذاكرة بهجمات حرمان الخدمة.',
        status: 'warning',
        currentValue: 'مفعل ونشط (enabled=yes)',
        fixAvailable: true,
        explanation: 'يمكن لمخترق تشغيل فحص سرعة مستمر يؤدي لرفع استهلاك المعالج إلى 100% وإسقاط الراوتر.'
      });
    } else {
      checks.push({
        id: 'bandwidth_server',
        category: 'المنافذ والخدمات',
        title: 'خادم قياس السرعة (Bandwidth Test Server)',
        path: '/tool/bandwidth-server',
        officialRecommendation: 'إبقاء Bandwidth Server معطلاً.',
        status: 'compliant',
        currentValue: 'معطل ومؤمن (enabled=no)',
        fixAvailable: false,
        explanation: 'خادم قياس السرعة معطل ولا يمكن استغلاله لإرهاق المعالج.'
      });
    }

    // 8. فحص جدار الحماية (Firewall Filter Input Drop WAN & Invalid)
    const hasDropInvalid = fwFilters.some((f: any) => 
      f.chain === 'input' && 
      f.action === 'drop' && 
      f['connection-state']?.includes('invalid')
    );
    const hasDropWanInput = fwFilters.some((f: any) => 
      f.chain === 'input' && 
      f.action === 'drop' && 
      (f['in-interface-list']?.includes('WAN') || f['in-interface']?.includes('ether1') || !f['in-interface'])
    );

    if (!hasDropInvalid || !hasDropWanInput) {
      checks.push({
        id: 'firewall_input_protection',
        category: 'الجدار الناري والتوجيه',
        title: 'قواعد جدار الحماية لسلسلة الدخول (Input Filter Rules)',
        path: '/ip/firewall/filter',
        officialRecommendation: 'توصي MikroTik بإسقاط الحزم التالفة (Drop Invalid) وإسقاط كافة الاتصالات الواردة من منفذ الإنترنت WAN لحماية الراوتر نفسه.',
        status: 'vulnerable',
        currentValue: `Drop Invalid: ${hasDropInvalid ? 'نعم' : 'لا'} | Drop WAN: ${hasDropWanInput ? 'نعم' : 'لا'}`,
        fixAvailable: true,
        explanation: 'عدم وجود قواعد حماية يسمح بالاتصال المباشر بالراوتر وتجربة المنافذ الداخلية من خارج الشبكة.'
      });
    } else {
      checks.push({
        id: 'firewall_input_protection',
        category: 'الجدار الناري والتوجيه',
        title: 'قواعد جدار الحماية لسلسلة الدخول (Input Chain)',
        path: '/ip/firewall/filter',
        officialRecommendation: 'إسقاط الحزم التالفة وحظر الوصول من WAN.',
        status: 'compliant',
        currentValue: 'سلسلة الـ Input محمية بقواعد إسقاط معتمدة',
        fixAvailable: false,
        explanation: 'منافذ الراوتر محمية من المحاولات الخارجية.'
      });
    }

    // 9. فحص السكربتات العشوائية والتالفة
    const scripts = await client.querySafe('/system/script/print');
    const schedulers = await client.querySafe('/system/scheduler/print');
    
    let faultyScriptCount = 0;
    scripts.forEach((sc: any) => {
      const src = (sc.source || '').trim();
      const name = (sc.name || '').toLowerCase();
      if (src.length === 0 || name.startsWith('zctrl_setup_') || name.startsWith('temp_') || name.startsWith('test_')) {
        faultyScriptCount++;
      }
    });

    if (faultyScriptCount > 0) {
      checks.push({
        id: 'scripts_audit',
        category: 'السكربتات والمهام',
        title: 'فحص ونظافة سكربتات النظام (System Scripts)',
        path: '/system/script',
        officialRecommendation: 'توصي MikroTik بحذف السكربتات المؤقتة، العشوائية، التالفة، أو التي تحتوي مصادر فارغة لمنع استهلاك الذاكرة وتداخل المهام.',
        status: 'warning',
        currentValue: `تم رصد ${faultyScriptCount} سكربت عشوائي أو تالف يحتاج للتنظيف`,
        fixAvailable: true,
        explanation: 'السكربتات المتروكة أو العشوائية تشوش سجلات النظام وقد تستهلك موارد المعالج عند تشغيلها دورياً.'
      });
    } else {
      checks.push({
        id: 'scripts_audit',
        category: 'السكربتات والمهام',
        title: 'فحص ونظافة سكربتات النظام (System Scripts)',
        path: '/system/script',
        officialRecommendation: 'الحفاظ على سكربتات نظيفة ومفيدة.',
        status: 'compliant',
        currentValue: `إجمالي السكربتات: ${scripts.length} (كلها نظيفة ومفيدة)`,
        fixAvailable: false,
        explanation: 'الراوتر نظيف وخالٍ من السكربتات العشوائية أو المخلفات.'
      });
    }

    // 10. فحص مزامنة الوقت (NTP Client)
    const ntpClient = await client.querySafe('/system/ntp/client/print');
    const ntpEnabled = ntpClient[0]?.enabled === 'yes' || ntpClient[0]?.enabled === 'true';
    if (!ntpEnabled) {
      checks.push({
        id: 'system_ntp',
        category: 'النظام والوقت',
        title: 'مزامنة الوقت التلقائية (NTP Client)',
        path: '/system/ntp/client',
        officialRecommendation: 'توصي MikroTik بتفعيل NTP Client دائماً لضبط ساعة وتاريخ الراوتر بدقة لحساب صلاحية كروت المشتركين وتوثيق السجلات وشهادات SSL.',
        status: 'warning',
        currentValue: 'عميل NTP معطل (الوقت قد يفقد المزامنة عند انقطاع الكهرباء)',
        fixAvailable: true,
        explanation: 'عدم دقة الوقت يتسبب في احتساب خاطئ لصلاحية كروت الهوتسبوت واليوزر منجر وفشل شهادات الأمان.'
      });
    } else {
      checks.push({
        id: 'system_ntp',
        category: 'النظام والوقت',
        title: 'مزامنة الوقت التلقائية (NTP Client)',
        path: '/system/ntp/client',
        officialRecommendation: 'تفعيل NTP Client وتزويده بسيرفرات موثوقة.',
        status: 'compliant',
        currentValue: 'NTP مفعل ومضبوط بسيرفرات عالمية',
        fixAvailable: false,
        explanation: 'ساعة الراوتر متزامنة بدقة.'
      });
    }

    // الإحصائيات العامة
    const total = checks.length;
    const compliant = checks.filter(c => c.status === 'compliant').length;
    const vulnerable = checks.filter(c => c.status === 'vulnerable').length;
    const warning = checks.filter(c => c.status === 'warning').length;
    const score = Math.round((compliant / total) * 100);

    return res.json({
      success: true,
      score,
      summary: {
        total,
        compliant,
        vulnerable,
        warning,
        fixable: checks.filter(c => c.fixAvailable).length
      },
      checks
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: `حدث خطأ أثناء فحص الراوتر: ${err.message || String(err)}`
    });
  }
};

/**
 * تنفيذ الإصلاح التلقائي الفوري لجميع الإعدادات المخالفة لتوصيات MikroTik الرسمية
 */
export const autoFixSecurityApi = async (req: Request, res: Response) => {
  const client: MikrotikClient = (req as any).routerClient || MikrotikAPI;
  if (!client || !client.isConnected()) {
    return res.status(401).json({
      success: false,
      message: 'الراوتر غير متصل حالياً.'
    });
  }

  const { checkIds = [] } = req.body; // If empty or all, fixes all fixable items
  const fixAll = !Array.isArray(checkIds) || checkIds.length === 0;

  const appliedFixes: string[] = [];
  const errors: string[] = [];

  try {
    // 1. إنشاء قائمة الإدارة الآمنة فوراً لضمان عدم قفل الراوتر على المدير أبداً
    await client.querySafe('/ip/firewall/address-list/add', [
      '=list=MGMT-ALLOW',
      '=address=10.0.0.0/8',
      '=comment=ZCtrl Safe Admin'
    ]);
    await client.querySafe('/ip/firewall/address-list/add', [
      '=list=MGMT-ALLOW',
      '=address=192.168.0.0/16',
      '=comment=ZCtrl Safe LAN'
    ]);
    await client.querySafe('/ip/firewall/address-list/add', [
      '=list=MGMT-ALLOW',
      '=address=172.16.0.0/12',
      '=comment=ZCtrl Safe Private'
    ]);

    // 2. إصلاح البروتوكولات غير المشفرة (Telnet و FTP)
    if (fixAll || checkIds.includes('insecure_services')) {
      try {
        await client.querySafe('/ip/service/set', ['=numbers=telnet', '=disabled=yes']);
        await client.querySafe('/ip/service/set', ['=numbers=ftp', '=disabled=yes']);
        appliedFixes.push('تم تعطيل خدمتي Telnet و FTP بالكامل لحظر نقل البيانات غير المشفرة.');
      } catch (e: any) {
        errors.push(`فشل تعطيل Telnet/FTP: ${e.message}`);
      }
    }

    // 3. إصلاح واجهة الويب (WWW) وحصرها على الشبكات المحلية
    if (fixAll || checkIds.includes('www_service_unrestricted')) {
      try {
        await client.querySafe('/ip/service/set', [
          '=numbers=www',
          '=address=10.0.0.0/8,192.168.0.0/16,172.16.0.0/12'
        ]);
        appliedFixes.push('تم تقييد واجهة الويب (HTTP 80) لتسمح بالدخول فقط من نطاقات الإدارة المحلية الموثوقة.');
      } catch (e: any) {
        errors.push(`فشل تقييد واجهة الويب: ${e.message}`);
      }
    }

    // 4. إصلاح ثغرة DNS Open Resolver
    if (fixAll || checkIds.includes('dns_open_resolver')) {
      try {
        // حظر استعلامات DNS الواردة من منفذ الإنترنت في جدار الحماية
        await client.querySafe('/ip/firewall/filter/add', [
          '=chain=input',
          '=action=drop',
          '=protocol=udp',
          '=dst-port=53',
          '=in-interface-list=WAN',
          '=comment=SEC|Block-External-DNS-UDP'
        ]);
        await client.querySafe('/ip/firewall/filter/add', [
          '=chain=input',
          '=action=drop',
          '=protocol=tcp',
          '=dst-port=53',
          '=in-interface-list=WAN',
          '=comment=SEC|Block-External-DNS-TCP'
        ]);
        appliedFixes.push('تم إضافة قواعد جدار ناري لحظر استعلامات الـ DNS من منفذ الإنترنت WAN لمنع هجمات الـ DDoS Amplification.');
      } catch (e: any) {
        errors.push(`فشل تأمين الـ DNS: ${e.message}`);
      }
    }

    // 5. إصلاح خادم الماك ووينبوكس (MAC Server)
    if (fixAll || checkIds.includes('mac_winbox_open')) {
      try {
        await client.querySafe('/interface/list/add', ['=name=MGMT-IFACES', '=comment=ZCtrl Safe MGMT']);
        const bridges = await client.querySafe('/interface/bridge/print');
        if (bridges.length > 0) {
          await client.querySafe('/interface/list/member/add', [
            '=list=MGMT-IFACES',
            `=interface=${bridges[0].name}`
          ]);
        }
        await client.querySafe('/tool/mac-server/mac-winbox/set', ['=allowed-interface-list=MGMT-IFACES']);
        appliedFixes.push('تم حصر الوصول عبر MAC-Winbox على واجهات الإدارة المحلية فقط لمنع الوصول من شبكة المزود.');
      } catch (e: any) {
        errors.push(`فشل حصر MAC-Winbox: ${e.message}`);
      }
    }

    // 6. إصلاح خادم فحص السرعة (Bandwidth Test Server)
    if (fixAll || checkIds.includes('bandwidth_server')) {
      try {
        await client.querySafe('/tool/bandwidth-server/set', ['=enabled=no']);
        appliedFixes.push('تم إيقاف خادم قياس السرعة (Bandwidth Server) لحماية المعالج من هجمات الإرهاق.');
      } catch (e: any) {
        errors.push(`فشل إيقاف Bandwidth Server: ${e.message}`);
      }
    }

    // 7. إصلاح وقاية جدار الحماية (Firewall Filter Protection)
    if (fixAll || checkIds.includes('firewall_input_protection')) {
      try {
        // حماية منافذ الإدارة أولاً
        await client.querySafe('/ip/firewall/filter/add', [
          '=chain=input',
          '=action=accept',
          '=protocol=tcp',
          '=dst-port=8728,8729,8291',
          '=src-address-list=MGMT-ALLOW',
          '=comment=SEC|Allow-ZCtrl-Safe-Admin'
        ]);
        // إسقاط الحزم التالفة Invalid
        await client.querySafe('/ip/firewall/filter/add', [
          '=chain=input',
          '=action=drop',
          '=connection-state=invalid',
          '=comment=SEC|Drop-Invalid-Input'
        ]);
        // السماح بالاتصالات السابقة
        await client.querySafe('/ip/firewall/filter/add', [
          '=chain=input',
          '=action=accept',
          '=connection-state=established,related',
          '=comment=SEC|Allow-Established-Input'
        ]);
        // السماح بالـ ICMP (Ping)
        await client.querySafe('/ip/firewall/filter/add', [
          '=chain=input',
          '=action=accept',
          '=protocol=icmp',
          '=comment=SEC|Allow-ICMP-Safe'
        ]);
        appliedFixes.push('تم تثبيت قواعد الحماية الأساسية لسلسلة الـ Input وإسقاط الحزم التالفة وفق معايير MikroTik.');
      } catch (e: any) {
        errors.push(`فشل تحديث قواعد الجدار الناري: ${e.message}`);
      }
    }

    // 8. إصلاح مزامنة الوقت (NTP Client)
    if (fixAll || checkIds.includes('system_ntp')) {
      try {
        await client.querySafe('/system/ntp/client/set', ['=enabled=yes']);
        await client.querySafe('/system/ntp/client/servers/add', [
          '=address=162.159.200.1',
          '=comment=Cloudflare NTP'
        ]);
        await client.querySafe('/system/ntp/client/servers/add', [
          '=address=216.239.35.0',
          '=comment=Google NTP'
        ]);
        appliedFixes.push('تم تفعيل مزامنة الوقت عبر NTP وربطه بسيرفرات Cloudflare و Google العالمية.');
      } catch (e: any) {
        errors.push(`فشل تفعيل NTP: ${e.message}`);
      }
    }

    // 9. تنظيف السكربتات العشوائية والتالفة
    if (fixAll || checkIds.includes('scripts_audit')) {
      try {
        const scripts = await client.querySafe('/system/script/print');
        let cleaned = 0;
        for (const sc of scripts) {
          const name = (sc.name || '').toLowerCase();
          const src = (sc.source || '').trim();
          if (src.length === 0 || name.startsWith('zctrl_setup_') || name.startsWith('temp_') || name.startsWith('test_')) {
            await client.querySafe('/system/script/remove', [`=.id=${sc['.id']}`]);
            cleaned++;
          }
        }
        if (cleaned > 0) {
          appliedFixes.push(`تم تنظيف وحذف ${cleaned} سكربت عشوائي ومؤقت وتالف من الراوتر.`);
        }
      } catch (e: any) {
        errors.push(`فشل تنظيف السكربتات: ${e.message}`);
      }
    }

    return res.json({
      success: true,
      message: `تم تطبيق ${appliedFixes.length} إصلاحات أمنية بنجاح وفق توصيات MikroTik الرسمية`,
      appliedFixes,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: `حدث خطأ أثناء تطبيق الإصلاحات: ${err.message || String(err)}`
    });
  }
};

/**
 * فحص وتحليل كافة السكربتات المجدولة وسكربتات النظام لكشف السكربتات العشوائية والتالفة
 */
export const auditScriptsApi = async (req: Request, res: Response) => {
  const client: MikrotikClient = (req as any).routerClient || MikrotikAPI;
  if (!client || !client.isConnected()) {
    return res.status(401).json({ success: false, message: 'الراوتر غير متصل.' });
  }

  try {
    const scripts = await client.querySafe('/system/script/print');
    const schedulers = await client.querySafe('/system/scheduler/print');

    const schedulerMap = new Map<string, any>();
    schedulers.forEach((sc: any) => {
      if (sc['on-event']) {
        schedulerMap.set(sc['on-event'].trim(), sc);
      }
    });

    const scriptItems: ScriptAuditItem[] = [];

    scripts.forEach((sc: any) => {
      const name = sc.name || '';
      const src = (sc.source || '').trim();
      const runCount = Number(sc['run-count'] || 0);
      const sched = schedulerMap.get(name);

      let isFaulty = false;
      let reason = 'سكربت نشط ومفيد';

      if (src.length === 0) {
        isFaulty = true;
        reason = 'كود السكربت فارغ تماماً ولا يحتوي أي تعليمات';
      } else if (name.startsWith('zctrl_setup_') || name.startsWith('temp_') || name.startsWith('test_')) {
        isFaulty = true;
        reason = 'سكربت مؤقت أو تجريبي قديم تم تركه في الراوتر';
      } else if (runCount === 0 && !sched && (sc.comment || '').includes('old')) {
        isFaulty = true;
        reason = 'سكربت مهمل وغير مجدول لم يعمل سابقاً';
      }

      scriptItems.push({
        id: sc['.id'] || name,
        name,
        sourceLength: src.length,
        runCount,
        lastStarted: sc['last-started'],
        hasScheduler: !!sched,
        schedulerInterval: sched ? sched.interval : undefined,
        isFaultyOrUseless: isFaulty,
        reason
      });
    });

    // كشف المجدولات التي تشير إلى سكربتات محذوفة أو غير موجودة
    const existingScriptNames = new Set(scripts.map((s: any) => s.name));
    const brokenSchedulers: any[] = [];
    schedulers.forEach((sched: any) => {
      const targetScript = sched['on-event'];
      if (targetScript && !existingScriptNames.has(targetScript) && !targetScript.startsWith(':')) {
        brokenSchedulers.push({
          id: sched['.id'],
          name: sched.name,
          targetScript,
          interval: sched.interval,
          reason: `المجدول يشير إلى سكربت غير موجود (${targetScript})`
        });
      }
    });

    const faultyCount = scriptItems.filter(s => s.isFaultyOrUseless).length + brokenSchedulers.length;

    return res.json({
      success: true,
      totalScripts: scripts.length,
      totalSchedulers: schedulers.length,
      faultyCount,
      scripts: scriptItems,
      brokenSchedulers
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: `فشل فحص السكربتات: ${err.message || String(err)}` });
  }
};

/**
 * تنظيف وتطهير الراوتر فوراً من جميع السكربتات العشوائية، التالفة، والمجدولات المعلقة
 */
export const cleanScriptsApi = async (req: Request, res: Response) => {
  const client: MikrotikClient = (req as any).routerClient || MikrotikAPI;
  if (!client || !client.isConnected()) {
    return res.status(401).json({ success: false, message: 'الراوتر غير متصل.' });
  }

  try {
    const scripts = await client.querySafe('/system/script/print');
    const schedulers = await client.querySafe('/system/scheduler/print');

    let removedScripts = 0;
    let removedSchedulers = 0;

    // 1. حذف السكربتات الفارغة، المؤقتة، والتالفة
    for (const sc of scripts) {
      const name = sc.name || '';
      const src = (sc.source || '').trim();
      const isTempOrBroken = src.length === 0 || 
        name.startsWith('zctrl_setup_') || 
        name.startsWith('temp_') || 
        name.startsWith('test_');

      if (isTempOrBroken) {
        await client.querySafe('/system/script/remove', [`=.id=${sc['.id']}`]);
        removedScripts++;
        // حذف المجدول المرتبط به إن وجد
        const relatedSched = schedulers.find((s: any) => s['on-event'] === name);
        if (relatedSched) {
          await client.querySafe('/system/scheduler/remove', [`=.id=${relatedSched['.id']}`]);
          removedSchedulers++;
        }
      }
    }

    // 2. حذف المجدولات التالفة التي تشير إلى سكربت غير موجود
    const remainingScriptNames = new Set(
      (await client.querySafe('/system/script/print')).map((s: any) => s.name)
    );

    const freshSchedulers = await client.querySafe('/system/scheduler/print');
    for (const sched of freshSchedulers) {
      const targetScript = sched['on-event'];
      if (targetScript && !remainingScriptNames.has(targetScript) && !targetScript.startsWith(':')) {
        await client.querySafe('/system/scheduler/remove', [`=.id=${sched['.id']}`]);
        removedSchedulers++;
      }
    }

    return res.json({
      success: true,
      message: `تم تنظيف وتطهير الراوتر بنجاح: تم حذف ${removedScripts} سكربت عشوائي/تالف و ${removedSchedulers} مجدول معلق`,
      summary: {
        removedScripts,
        removedSchedulers
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: `فشل تنظيف السكربتات: ${err.message || String(err)}` });
  }
};

/**
 * تشخيص واستكشاف منافذ وعناوين IP الإدارة المضبوطة على الراوتر تلقائياً
 */
export const discoverManagementPortsAndIpsApi = async (req: Request, res: Response) => {
  const client: MikrotikClient = (req as any).routerClient || MikrotikAPI;
  if (!client || !client.isConnected()) {
    return res.status(401).json({
      success: false,
      message: 'الراوتر غير متصل حالياً لاستخراج منافذ الإدارة الداخلية.'
    });
  }

  try {
    // 1. جلب عناوين IP المضبوطة على كافة الواجهات والبريدج
    const addresses = await client.querySafe('/ip/address/print');
    const parsedIps = addresses.map((a: any) => ({
      address: a.address || '',
      ip: (a.address || '').split('/')[0],
      subnet: (a.address || '').split('/')[1] || '24',
      network: a.network || '',
      interface: a.interface || '',
      comment: a.comment || '',
      disabled: a.disabled === 'true' || a.disabled === 'yes'
    })).filter((a: any) => !a.disabled);

    // 2. جلب خدمات الإدارة ومنافذها
    const services = await client.querySafe('/ip/service/print');
    const parsedServices = services.map((s: any) => ({
      name: s.name || '',
      port: Number(s.port || 0),
      enabled: s.disabled !== 'true' && s.disabled !== 'yes',
      address: s.address || 'متاح للجميع',
      isLoginRecommended: s.name === 'api' || s.name === 'api-ssl'
    }));

    // العثور على منفذ API الموصى به
    const apiSrv = parsedServices.find((s: any) => s.name === 'api');
    const apiSslSrv = parsedServices.find((s: any) => s.name === 'api-ssl');
    const winboxSrv = parsedServices.find((s: any) => s.name === 'winbox');
    const webSrv = parsedServices.find((s: any) => s.name === 'www');

    let recommendedPort = 8728;
    let useSsl = false;
    let statusMessage = '';

    if (apiSrv && apiSrv.enabled) {
      recommendedPort = apiSrv.port;
      useSsl = false;
      statusMessage = `منفذ الـ API (${apiSrv.port}) مفعل ونشط وهو المنفذ المعتمد لتسجيل الدخول للبرنامج.`;
    } else if (apiSslSrv && apiSslSrv.enabled) {
      recommendedPort = apiSslSrv.port;
      useSsl = true;
      statusMessage = `منفذ API-SSL (${apiSslSrv.port}) مفعل ونشط وهو المنفذ المشفر المعتمد.`;
    } else {
      statusMessage = `تنبيه: خدمة الـ API مغلقة حالياً. منفذ WinBox هو (${winboxSrv?.port || 8291}) ومنفذ Web هو (${webSrv?.port || 80}). يرجى تمكين خدمة api من قائمة IP > Services.`;
    }

    // ترشيح أفضل عنوان IP للإدارة (أولوية للبريدج أو الواجهة المحلية)
    let recommendedIp = parsedIps[0]?.ip || '192.168.88.1';
    const bridgeIp = parsedIps.find((a: any) => a.interface.toLowerCase().includes('bridge') || a.interface.toLowerCase().includes('lan'));
    if (bridgeIp) {
      recommendedIp = bridgeIp.ip;
    }

    return res.json({
      success: true,
      managementIps: parsedIps,
      managementServices: parsedServices,
      recommendedLogin: {
        ip: recommendedIp,
        port: recommendedPort,
        useSsl,
        statusMessage
      }
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: `فشل استخراج منافذ وعناوين الإدارة: ${err.message || String(err)}`
    });
  }
};
