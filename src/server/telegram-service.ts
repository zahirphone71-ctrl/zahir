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

const DATA_DIR = process.env.ZCTRL_DATA_DIR || path.join(process.cwd(), '.zctrl_data');
const TELEGRAM_CONFIG_FILE = path.join(DATA_DIR, 'telegram_config.json');

const DEFAULT_CONFIG: TelegramConfig = {
  enabled: false,
  botToken: '',
  chatId: '',
  notifyOnDisconnect: true,
  notifyOnHighCpu: true,
  notifyOnVoucherBatch: true,
  notifyOnDailyReport: true
};

export class TelegramAlertService {
  private config: TelegramConfig = { ...DEFAULT_CONFIG };
  private lastAlertTimes = new Map<string, number>();

  constructor() {
    this.loadConfig();
  }

  private loadConfig() {
    try {
      if (fs.existsSync(TELEGRAM_CONFIG_FILE)) {
        const raw = fs.readFileSync(TELEGRAM_CONFIG_FILE, 'utf-8');
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
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(TELEGRAM_CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (e) {
      console.error('[TelegramService] Failed to save config:', e);
    }
    return { ...this.config };
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
    throttleMinutes: number = 5
  ): Promise<boolean> {
    if (!this.config.enabled || !this.config.botToken || !this.config.chatId) {
      return false;
    }

    const throttleKey = `${title}_${level}`;
    const now = Date.now();
    const lastSent = this.lastAlertTimes.get(throttleKey) || 0;
    if (now - lastSent < throttleMinutes * 60 * 1000) {
      return false; // Throttled
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
      this.lastAlertTimes.set(throttleKey, now);
      return true;
    }
    return false;
  }
}

export const telegramAlertService = new TelegramAlertService();
