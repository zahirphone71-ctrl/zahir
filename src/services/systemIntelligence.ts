import { MikrotikService } from './mikrotikService';
import { ConnectionConfig } from '../types';

export interface SystemHealth {
  status: 'optimal' | 'warning' | 'critical';
  cpuUsage: number;
  memoryUsage: number;
  activeUsers: number;
  uptime: string;
  recommendations: string[];
  securityScore: number;
  securityAlerts: string[];
}

export interface UserInsight {
  userId: string;
  mac: string;
  brand: string;
  deviceType: 'mobile' | 'pc' | 'iot' | 'unknown';
  pattern: 'normal' | 'heavy' | 'suspicious';
  expiryPrediction: string;
  eligibleForGracePeriod: boolean;
}

export class SystemIntelligenceService {
  
  static async getSecurityAudit(config: ConnectionConfig, lang: 'ar' | 'en' = 'ar') {
    const alerts: string[] = [];
    let score = 100;

    try {
      // 1. Check services
      const services = await MikrotikService.invoke('/ip/service/print', [], config);
      if (services.success && Array.isArray(services.data)) {
        const sensitive = ['telnet', 'www', 'ftp'];
        services.data.forEach((s: any) => {
          if (sensitive.includes(s.name) && s.disabled === 'false') {
            score -= 10;
            alerts.push(lang === 'ar' ? `⚠️ خدمة ${s.name} مفعلة، يفضل تعطيلها.` : `⚠️ Service ${s.name} is enabled, recommended to disable.`);
          }
        });
      }

      // 2. Check users
      const users = await MikrotikService.invoke('/user/print', [], config);
      if (users.success && Array.isArray(users.data)) {
        const defaultAdmin = users.data.find((u: any) => u.name === 'admin');
        if (defaultAdmin) {
          score -= 15;
          alerts.push(lang === 'ar' ? '🚨 اسم المستخدم الافتراضي (admin) لا يزال مستخدماً.' : '🚨 Default username (admin) is still in use.');
        }
      }
    } catch (e) { console.error(e); }

    return { score, alerts };
  }

  static async getSystemHealth(config: ConnectionConfig, lang: 'ar' | 'en' = 'ar'): Promise<SystemHealth> {
    try {
      const res = await MikrotikService.invoke('/system/resource/print', [], config);
      const security = await this.getSecurityAudit(config, lang);

      if (res.success && res.data) {
        const data = Array.isArray(res.data) ? res.data[0] : res.data;
        const cpu = parseInt(data['cpu-load'] || '0');
        const memory = 100 - (parseInt(data['free-memory'] || '0') / parseInt(data['total-memory'] || '1') * 100);
        
        const recommendations: string[] = [];
        let status: 'optimal' | 'warning' | 'critical' = 'optimal';

        if (cpu > 80) {
          status = 'critical';
          recommendations.push(lang === 'ar' ? '⚠️ استهلاك المعالج مرتفع جداً، يرجى التحقق من العمليات النشطة.' : '⚠️ CPU usage is very high, check active processes.');
        }
        
        if (security.score < 70) {
          recommendations.push(lang === 'ar' ? '🛡️ تم اكتشاف ثغرات أمنية، يرجى مراجعة صفحة الأمان.' : '🛡️ Security vulnerabilities detected, check security page.');
        }

        return {
          status,
          cpuUsage: isNaN(cpu) ? 10 : cpu,
          memoryUsage: Math.round(isNaN(memory) ? 20 : memory),
          activeUsers: 0,
          uptime: data.uptime || '0s',
          recommendations,
          securityScore: security.score,
          securityAlerts: security.alerts
        };
      }
    } catch (e) {
      console.error(e);
    }
    return {
      status: 'optimal', cpuUsage: 10, memoryUsage: 20, activeUsers: 0, uptime: '0s', recommendations: [], securityScore: 100, securityAlerts: []
    };
  }

  static fingerprintDevice(mac: string, hostname: string = ''): { brand: string, type: 'mobile' | 'pc' | 'iot' | 'unknown' } {
    if (!mac) return { brand: 'Unknown', type: 'unknown' };
    const oui = mac.toUpperCase().substring(0, 8).replace(/[:-]/g, '');
    const h = hostname ? hostname.toLowerCase() : '';

    // Type detection based on hostname cues
    let type: 'mobile' | 'pc' | 'iot' | 'unknown' = 'unknown';
    if (h.includes('iphone') || h.includes('android') || h.includes('galaxy') || h.includes('mobile')) type = 'mobile';
    else if (h.includes('desktop') || h.includes('pc') || h.includes('macbook') || h.includes('laptop')) type = 'pc';
    else if (h.includes('smart-') || h.includes('cam-') || h.includes('tv')) type = 'iot';

    const brands: Record<string, string> = {
      '000C29': 'VMware', '28D244': 'Xiaomi', '3C5AB3': 'Huawei', '408D5C': 'Samsung',
      '5065F3': 'Apple', 'A4D18C': 'Apple', 'FC253F': 'Apple', 'BC926B': 'Apple',
      'AC87A3': 'Apple', 'D022BE': 'Apple', '186024': 'TP-Link', '244BFE': 'Sony'
    };

    return { 
      brand: brands[oui] || (h ? h.split('-')[0].charAt(0).toUpperCase() + h.split('-')[0].slice(1) : 'Generic Device'),
      type 
    };
  }

  static async getTurboModeStatus(config: ConnectionConfig): Promise<boolean> {
    try {
      const res = await MikrotikService.invoke(
        '/ip/firewall/filter/print',
        ['?comment=TURBO_MODE_ENABLED'],
        config
      );
      return Boolean(res.success && Array.isArray(res.data) && res.data.some((r: any) => r.disabled !== 'true'));
    } catch {
      return false;
    }
  }

  static async toggleTurboMode(config: ConnectionConfig, enabled: boolean): Promise<boolean> {
    try {
      const existing = await MikrotikService.invoke(
        '/ip/firewall/filter/print',
        ['?comment=TURBO_MODE_ENABLED'],
        config
      );
      if (!existing.success) return false;
      const rules = Array.isArray(existing.data) ? existing.data : [];

      if (enabled) {
        if (rules.length > 0) {
          for (const rule of rules) {
            if (rule['.id'] && rule.disabled === 'true') {
              const enableRes = await MikrotikService.invoke(
                '/ip/firewall/filter/set',
                [`=.id=${rule['.id']}`, '=disabled=no'],
                config
              );
              if (!enableRes.success) return false;
            }
          }
          return true;
        }
        const addRes = await MikrotikService.invoke(
          '/ip/firewall/filter/add',
          [
            '=chain=forward',
            '=action=fasttrack-connection',
            '=connection-state=established,related',
            '=comment=TURBO_MODE_ENABLED'
          ],
          config
        );
        return Boolean(addRes.success);
      }

      for (const rule of rules) {
        if (rule['.id']) {
          const rmRes = await MikrotikService.invoke(
            '/ip/firewall/filter/remove',
            [`=.id=${rule['.id']}`],
            config
          );
          if (!rmRes.success) return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  static analyzeUserActivity(userData: any, lang: 'ar' | 'en' = 'ar'): UserInsight {
    const bytesIn = parseInt(userData['bytes-in'] || '0');
    const bytesOut = parseInt(userData['bytes-out'] || '0');
    const totalGB = (bytesIn + bytesOut) / (1024 * 1024 * 1024);

    let pattern: 'normal' | 'heavy' | 'suspicious' = 'normal';
    if (totalGB > 50) pattern = 'suspicious';
    else if (totalGB > 10) pattern = 'heavy';

    const device = this.fingerprintDevice(userData['mac-address'], userData['name']);

    return {
      userId: userData['.id'] || userData['id'] || '',
      mac: userData['mac-address'] || '',
      brand: device.brand,
      deviceType: device.type,
      pattern,
      expiryPrediction: lang === 'ar' ? 'متوقع غداً' : 'Expected tomorrow',
      eligibleForGracePeriod: true
    };
  }

  /**
   * خوارزمية التصفية الذكية (Fuzzy Search Logic)
   */
  static fuzzySearch(term: string, list: any[], keys: string[]) {
    if (!term) return list;
    const normalizedTerm = term.toLowerCase().trim();
    return list.filter(item => {
      return keys.some(key => {
        const val = String(item[key] || '').toLowerCase();
        return val.includes(normalizedTerm) || normalizedTerm.includes(val);
      });
    });
  }

  /**
   * خوارزمية التوزيع الديناميكي (Applied via Mikrotik API)
   * تنفذ نظام PCQ لضمان عدالة التوزيع بين المستخدمين النشطين
   */
  static async applyDynamicQoS(config: ConnectionConfig): Promise<boolean> {
    try {
      const typesRes = await MikrotikService.invoke('/queue/type/print', [], config);
      if (!typesRes.success) return false;
      const existingTypes = new Set(
        (Array.isArray(typesRes.data) ? typesRes.data : []).map((t: any) => t?.name).filter(Boolean)
      );

      if (!existingTypes.has('Zahir_Smart_Down')) {
        const downRes = await MikrotikService.invoke(
          '/queue/type/add',
          ['=name=Zahir_Smart_Down', '=kind=pcq', '=pcq-classifier=dst-address', '=pcq-rate=0'],
          config
        );
        if (!downRes.success) return false;
      }

      if (!existingTypes.has('Zahir_Smart_Up')) {
        const upRes = await MikrotikService.invoke(
          '/queue/type/add',
          ['=name=Zahir_Smart_Up', '=kind=pcq', '=pcq-classifier=src-address', '=pcq-rate=0'],
          config
        );
        if (!upRes.success) return false;
      }

      const queuesRes = await MikrotikService.invoke('/queue/simple/print', ['?name=Zahir_Smart_FairChoice'], config);
      if (!queuesRes.success) return false;
      const existingQueue = Array.isArray(queuesRes.data) && queuesRes.data[0];

      if (existingQueue && existingQueue['.id']) {
        const updRes = await MikrotikService.invoke(
          '/queue/simple/set',
          [
            `=.id=${existingQueue['.id']}`,
            '=target=0.0.0.0/0',
            '=queue=Zahir_Smart_Up/Zahir_Smart_Down',
            '=disabled=no',
            '=comment=DYNAMIC_OPTIMIZATION'
          ],
          config
        );
        return Boolean(updRes.success);
      }

      const res = await MikrotikService.invoke(
        '/queue/simple/add',
        [
          '=name=Zahir_Smart_FairChoice',
          '=target=0.0.0.0/0',
          '=queue=Zahir_Smart_Up/Zahir_Smart_Down',
          '=comment=DYNAMIC_OPTIMIZATION'
        ],
        config
      );

      return Boolean(res.success);
    } catch (e) {
      console.error('QoS optimization failed:', e);
      return false;
    }
  }

  static async performSelfHealing(config: ConnectionConfig): Promise<boolean> {
    try {
      const res = await MikrotikService.invoke('/ip/hotspot/cookie/print', [], config);
      if (!res.success || !Array.isArray(res.data)) {
        return false;
      }
      for (const c of res.data) {
        if (c['.id']) {
          const rm = await MikrotikService.invoke('/ip/hotspot/cookie/remove', [`=.id=${c['.id']}`], config);
          if (!rm.success) return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  }
}
