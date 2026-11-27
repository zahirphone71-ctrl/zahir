import fs from 'fs';
import path from 'path';

export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  chatId: string;
  notifyOnDisconnect: boolean;
  notifyOnHighCpu: boolean;
  notifyOnVoucherBatch: boolean;
  notifyOnDailyReport: boolean;
}

const DEFAULT_CONFIG: TelegramConfig = {
  enabled: false,
  botToken: '',
  chatId: '',
  notifyOnDisconnect: true,
  notifyOnHighCpu: true,
  notifyOnVoucherBatch: true,
  notifyOnDailyReport: true
};

interface AlertThrottleRecord {
  sentAt: number;
  expiresAt: number;
}

export class TelegramAlertService {
  private static readonly MAX_THROTTLE_KEYS = 200;
  private readonly dataDir: string;
  private readonly configFile: string;
  private config: TelegramConfig = { ...DEFAULT_CONFIG };
  private lastAlertTimes = new Map<string, AlertThrottleRecord>();

  constructor(customDataDir?: string) {
    this.dataDir = customDataDir || process.env.ZCTRL_DATA_DIR || path.join(process.cwd(), '.zctrl_data');
    this.configFile = path.join(this.dataDir, 'telegram_config.json');
    this.loadConfig();
  }

  private loadConfig() {
    try {
      if (fs.existsSync(this.configFile)) {
        const raw = fs.readFileSync(this.configFile, 'utf-8');
        this.config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.warn('[TelegramService] Failed to load config:', e);
    }
  }

  public getConfig(): TelegramConfig {
    return { ...this.config };
  }

  public saveConfig(newConfig: Partial<TelegramConfig>): TelegramConfig {
    this.config = { ...this.config, ...newConfig };
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      const tmp = `${this.configFile}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.config, null, 2), { encoding: 'utf-8', mode: 0o600 });
      fs.renameSync(tmp, this.configFile);
    } catch (e) {
      console.error('[TelegramService] Failed to save config:', e);
    }
    return { ...this.config };
  }

  private buildThrottleKey(title: string, level: string, categoryKey?: string): string {
    if (categoryKey && categoryKey.trim()) {
      return `${categoryKey.trim().toLowerCase()}_${level}`;
    }
    // Strip variable IPs, MACs, ports, and numbers so dynamic titles map to a bounded category key
    const normalizedTitle = String(title || 'alert')
      .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, '#ip')
      .replace(/\b(?:[0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}\b/g, '#mac')
      .replace(/\d+/g, '#')
      .trim()
      .slice(0, 80);
    return `${normalizedTitle}_${level}`;
  }

  private pruneThrottleMap(now: number): void {
    for (const [k, rec] of this.lastAlertTimes.entries()) {
      if (now >= rec.expiresAt) {
        this.lastAlertTimes.delete(k);
      }
    }
    while (this.lastAlertTimes.size > TelegramAlertService.MAX_THROTTLE_KEYS) {
      const oldestKey = this.lastAlertTimes.keys().next().value;
      if (!oldestKey) break;
      this.lastAlertTimes.delete(oldestKey);
    }
  }

  public getThrottleMapSize(): number {
    return this.lastAlertTimes.size;
  }

  public async sendMessage(
    text: string,
    overrideToken?: string,
    overrideChatId?: string
  ): Promise<{ success: boolean; message: string }> {
    const token = (overrideToken || this.config.botToken || '').trim();
    const chatId = (overrideChatId || this.config.chatId || '').trim();

    if (!token || !chatId) {
      return { success: false, message: 'بيانات بوت تيليجرام (Token و Chat ID) غير مهيأة' };
    }

    try {
      const url = `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        })
      });

      const resData = (await response.json()) as any;
      if (resData && resData.ok) {
        return { success: true, message: 'تم إرسال إشعار تيليجرام بنجاح' };
      } else {
        return {
          success: false,
          message: resData?.description || 'فشل إرسال رسالة تيليجرام (تحقق من صحة التوكن و Chat ID)'
        };
      }
    } catch (err: any) {
      return { success: false, message: `تعذر الاتصال بخوادم تيليجرام: ${err?.message || 'خطأ شبكة'}` };
    }
  }

  /**
   * إرسال تنبيه منظم مع كتم التكرار (Debounce) لمنع إغراق المستخدم بالرسائل
   */
  public async sendAlert(
    title: string,
    details: string,
    level: 'info' | 'warning' | 'danger' | 'success' = 'info',
    throttleMinutes: number = 5,
    categoryKey?: string
  ): Promise<boolean> {
    if (!this.config.enabled || !this.config.botToken || !this.config.chatId) {
      return false;
    }

    const now = Date.now();
    this.pruneThrottleMap(now);

    const throttleMs = Math.max(0, throttleMinutes) * 60 * 1000;
    const throttleKey = this.buildThrottleKey(title, level, categoryKey);
    if (throttleMs > 0) {
      const existing = this.lastAlertTimes.get(throttleKey);
      if (existing && now < existing.expiresAt) {
        return false; // Throttled
      }
    }

    const icons = {
      info: 'ℹ️',
      warning: '⚠️',
      danger: '🚨',
      success: '✅'
    };

    const header = `${icons[level] || '🔔'} <b>[ZCtrl MikroTik Alert]</b>`;
    const timeStr = new Date().toLocaleString('ar-EG', { hour12: true });

    const formattedMessage = `${header}
<b>${title}</b>

${details}

⏱ <i>الوقت: ${timeStr}</i>
🛡 <i>نظام إدارة شبكات المايكروتك ZCtrl</i>`;

    const result = await this.sendMessage(formattedMessage);
    if (result.success) {
      if (throttleMs > 0) {
        this.lastAlertTimes.delete(throttleKey);
        this.lastAlertTimes.set(throttleKey, { sentAt: now, expiresAt: now + throttleMs });
        this.pruneThrottleMap(now);
      }
      return true;
    }
    return false;
  }
}

export const telegramAlertService = new TelegramAlertService();
