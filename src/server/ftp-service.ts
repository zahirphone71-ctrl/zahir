// ============================================================
//  خدمة FTP للتعامل مع ملفات الراوتر
//  تدعم v6/v7، UTF-8 بدون BOM، مهلة، إعادة استخدام الاتصال
// ============================================================

import { Client } from 'basic-ftp';
import { EventEmitter } from 'events';
import { Readable, PassThrough } from 'stream';

export interface FtpConnectionConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  secure?: boolean;
  timeoutMs?: number;
}

export interface FtpFileEntry {
  name: string;
  isDirectory: boolean;
  size: number;
  modifiedAt?: Date;
  path: string;
}

export interface FtpOperationResult {
  success: boolean;
  message: string;
  data?: string | Buffer;
  files?: FtpFileEntry[];
  path?: string;
  error?: string;
  errorType?: 'timeout' | 'auth' | 'not_found' | 'permission' | 'connection' | 'encoding' | 'unknown';
}

const DEFAULT_TIMEOUT_MS = 15000;
const CLEANUP_INTERVAL_MS = 120000;
const IDLE_TIMEOUT_MS = 300000;

export class MikroTikFileService extends EventEmitter {
  private pool = new Map<string, { client: Client; lastUsed: number }>();

  constructor() {
    super();
    this.startCleanup();
  }

  // ----- الحصول على اتصال (مع إعادة الاستخدام) -----
  async getConnection(config: FtpConnectionConfig): Promise<Client> {
    const key = `${config.host}:${config.port}:${config.username}`;
    const entry = this.pool.get(key);
    if (entry && Date.now() - entry.lastUsed < IDLE_TIMEOUT_MS) {
      try {
        await entry.client.list('/');
        entry.lastUsed = Date.now();
        return entry.client;
      } catch {
        try { await entry.client.close(); } catch { /* ignore */ }
        this.pool.delete(key);
      }
    }

    const client = new Client(config.timeoutMs || DEFAULT_TIMEOUT_MS);
    try {
      await client.access({
        host: config.host,
        port: config.port || 21,
        user: config.username,
        password: config.password,
        secure: config.secure || false,
      });
      this.pool.set(key, { client, lastUsed: Date.now() });
      return client;
    } catch (err) {
      try { await client.close(); } catch { /* ignore */ }
      throw err;
    }
  }

  // ----- قطع اتصال معين -----
  async disconnect(config: FtpConnectionConfig): Promise<void> {
    const key = `${config.host}:${config.port}:${config.username}`;
    const entry = this.pool.get(key);
    if (entry) {
      try { await entry.client.close(); } catch { /* تجاهل */ }
      this.pool.delete(key);
    }
  }

  private cleanupTimer: NodeJS.Timeout | null = null;

  // ----- إغلاق جميع الاتصالات -----
  async closeAll(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    for (const [key, entry] of this.pool) {
      try { await entry.client.close(); } catch { /* تجاهل */ }
    }
    this.pool.clear();
  }

  // ----- تنظيف دوري -----
  private startCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.pool) {
        if (now - entry.lastUsed > IDLE_TIMEOUT_MS) {
          try { entry.client.close(); } catch { /* تجاهل */ }
          this.pool.delete(key);
        }
      }
    }, CLEANUP_INTERVAL_MS);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  // ----- قراءة ملف نصي -----
  async readFile(config: FtpConnectionConfig, remotePath: string): Promise<FtpOperationResult> {
    try {
      const client = await this.getConnection(config);
      const passThrough = new PassThrough();
      const chunks: Buffer[] = [];
      passThrough.on('data', (chunk) => chunks.push(chunk));
      await client.downloadTo(passThrough, remotePath);
      const buffer = Buffer.concat(chunks);
      let content = buffer.toString('utf-8');
      if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1); // إزالة BOM
      return { success: true, message: 'تمت القراءة', data: content };
    } catch (err: any) {
      return this.handleError(err, remotePath);
    }
  }

  // ----- كتابة ملف نصي (UTF-8 بدون BOM) -----
  async writeFile(config: FtpConnectionConfig, remotePath: string, content: string): Promise<FtpOperationResult> {
    try {
      const client = await this.getConnection(config);
      const dir = remotePath.substring(0, remotePath.lastIndexOf('/'));
      if (dir) await this.ensureDir(client, dir);
      const buffer = Buffer.from(content, 'utf-8');
      await client.uploadFrom(Readable.from(buffer), remotePath);
      return { success: true, message: 'تمت الكتابة', path: remotePath };
    } catch (err: any) {
      return this.handleError(err, remotePath);
    }
  }

  // ----- سرد محتويات مجلد -----
  async listDirectory(config: FtpConnectionConfig, remotePath: string): Promise<FtpOperationResult> {
    try {
      const client = await this.getConnection(config);
      const list = await client.list(remotePath);
      const files: FtpFileEntry[] = list.map(item => ({
        name: item.name,
        isDirectory: item.isDirectory,
        size: item.size,
        modifiedAt: item.modifiedAt,
        path: remotePath + '/' + item.name,
      }));
      return { success: true, message: 'تم السرد', files };
    } catch (err: any) {
      return this.handleError(err, remotePath);
    }
  }

  // ----- حذف ملف -----
  async deleteFile(config: FtpConnectionConfig, remotePath: string): Promise<FtpOperationResult> {
    try {
      const client = await this.getConnection(config);
      await client.remove(remotePath);
      return { success: true, message: 'تم الحذف', path: remotePath };
    } catch (err: any) {
      return this.handleError(err, remotePath);
    }
  }

  // ----- حذف مجلد (بمحتوياته) -----
  async deleteDirectory(config: FtpConnectionConfig, remotePath: string): Promise<FtpOperationResult> {
    try {
      const client = await this.getConnection(config);
      await client.removeDir(remotePath);
      return { success: true, message: 'تم حذف المجلد', path: remotePath };
    } catch (err: any) {
      return this.handleError(err, remotePath);
    }
  }

  // ----- كشف مسار الهوتسبوت تلقائياً -----
  async detectHotspotPath(config: FtpConnectionConfig): Promise<FtpOperationResult> {
    try {
      const client = await this.getConnection(config);
      try {
        await client.list('hotspot');
        return { success: true, message: 'RouterOS v7', path: 'hotspot', data: 'v7' };
      } catch {
        /* غير موجود */
      }
      try {
        await client.list('flash/hotspot');
        return { success: true, message: 'RouterOS v6', path: 'flash/hotspot', data: 'v6' };
      } catch {
        /* غير موجود */
      }
      return { success: true, message: 'لم يتم العثور على مجلد، سيتم استخدام "hotspot"', path: 'hotspot', data: 'unknown' };
    } catch (err: any) {
      return this.handleError(err, 'detect');
    }
  }

  // ----- قراءة كل ملفات البوابة من مجلد -----
  async readAllPortalFiles(config: FtpConnectionConfig, folder: string): Promise<{
    success: boolean;
    message: string;
    fileContents?: Map<string, string>;
    remotePath?: string;
  }> {
    try {
      const listResult = await this.listDirectory(config, folder);
      if (!listResult.success || !listResult.files) {
        return { success: false, message: listResult.message };
      }

      const fileContents = new Map<string, string>();
      const errors: string[] = [];

      for (const entry of listResult.files) {
        if (entry.isDirectory) continue;
        const ext = entry.name.split('.').pop()?.toLowerCase() || '';
        if (!['html', 'htm', 'css', 'js', 'json', 'txt', 'xml', 'svg'].includes(ext)) continue;
        const readResult = await this.readFile(config, entry.path);
        if (readResult.success && readResult.data !== undefined) {
          fileContents.set(entry.name, readResult.data as string);
        } else {
          errors.push(entry.name);
        }
        await this.delay(50);
      }

      return {
        success: errors.length === 0,
        message: errors.length === 0
          ? `تمت قراءة ${fileContents.size} ملف بنجاح`
          : `تمت قراءة ${fileContents.size} ملف، فشل ${errors.length}: ${errors.join(', ')}`,
        fileContents,
        remotePath: folder,
      };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  // ----- مساعد: تأكد من وجود المجلد -----
  private async ensureDir(client: Client, dirPath: string): Promise<void> {
    const parts = dirPath.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current += '/' + part;
      try {
        await client.list(current);
      } catch {
        await client.ensureDir(current);
      }
    }
  }

  // ----- مساعد: معالجة الأخطاء -----
  private handleError(err: any, path?: string): FtpOperationResult {
    let errorType: FtpOperationResult['errorType'] = 'unknown';
    let message = err.message || 'خطأ غير معروف';
    if (err.code === 'ETIMEDOUT') errorType = 'timeout';
    else if (err.code === 'ECONNREFUSED') errorType = 'connection';
    else if (err.code === 'EACCESS' || err.message.includes('Permission denied')) errorType = 'permission';
    else if (err.message.includes('Not found') || err.message.includes('550')) errorType = 'not_found';
    else if (err.message.includes('Authentication')) errorType = 'auth';
    else if (err.message.includes('UTF-8')) errorType = 'encoding';
    return { success: false, message, error: message, errorType, path };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const ftpService = new MikroTikFileService();
