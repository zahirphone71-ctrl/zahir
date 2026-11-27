import { User, LogEntry, ElectronAPI } from '../types';
import { ScheduledTask } from '../types/mikrotik';
import { getApiBaseUrl, secureFetch } from '../lib/api';
import { safeStorage } from '../utils/safeStorage';

export class MikrotikService {
  private static logs: LogEntry[] = [];
  private static config: any = (() => {
    try {
      const saved = safeStorage.getItem('zahir_conn_config');
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      // Decrypt legacy password synchronously only if old format; modern encrypted payloads decrypt asynchronously in checkSession()
      if (parsed?.pass && parsed?._enc === true) {
        parsed.pass = MikrotikService.decryptLegacyXor(parsed.pass);
        delete parsed._enc;
      } else if (parsed?.pass && (parsed?._enc === 'os-keychain' || parsed?._enc === 'aes-gcm-v2')) {
        // Keep encrypted until async unlock in checkSession()
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  })();
  private static cache: Map<string, { data: any, timestamp: number }> = new Map();
  private static readonly MAX_CACHE_ENTRIES = 150;
  private static CACHE_TTL = 30000; // 30 seconds default TTL

  private static hasLegacyElectronInvoke(): boolean {
    return typeof window !== 'undefined' && typeof window.electronAPI?.invokeMikrotik === 'function';
  }

  /** Backward-compatible read-only decoder for legacy XOR entries saved by older versions */
  private static getLegacyStorageKey(): string {
    const deviceKey = safeStorage.getItem('zahir_device_id') || 'zahir_default';
    return deviceKey.substring(0, 16).padEnd(16, '0');
  }

  private static decryptLegacyXor(encoded: string): string {
    try {
      const key = MikrotikService.getLegacyStorageKey();
      const chars = encoded.match(/.{2}/g) || [];
      return chars.map((hex, i) =>
        String.fromCharCode(parseInt(hex, 16) ^ key.charCodeAt(i % key.length))
      ).join('');
    } catch {
      return encoded;
    }
  }

  private static getOrCreateDeviceSalt(): Uint8Array {
    let saltHex = safeStorage.getItem('zctrl_vault_salt');
    if (!saltHex || saltHex.length < 32) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      saltHex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
      safeStorage.setItem('zctrl_vault_salt', saltHex);
    }
    const pairs = saltHex.match(/.{2}/g) || [];
    return new Uint8Array(pairs.map((h) => parseInt(h, 16)));
  }

  private static async deriveBrowserVaultKey(): Promise<CryptoKey> {
    const deviceId = safeStorage.getItem('zahir_device_id') || 'zctrl_browser_device';
    const originSeed = typeof window !== 'undefined' ? window.location.origin : 'zctrl-local';
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(`${deviceId}::${originSeed}::zctrl-v2`),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: MikrotikService.getOrCreateDeviceSalt(),
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypts a secret using OS Keychain (Electron safeStorage) when running in Desktop mode,
   * or Web Crypto API AES-GCM 256-bit with a random 12-byte IV in browser mode.
   */
  static async encryptPasswordSecure(pass: string): Promise<{ cipher: string; mode: 'os-keychain' | 'aes-gcm-v2' } | null> {
    if (!pass) return { cipher: '', mode: 'aes-gcm-v2' };

    // 1. Prefer OS Keychain (Windows DPAPI / macOS Keychain / Linux Secret Service) in Electron
    if (typeof window !== 'undefined' && window.zctrlDesktopVault) {
      try {
        const available = await window.zctrlDesktopVault.isEncryptionAvailable();
        if (available) {
          const res = await window.zctrlDesktopVault.encryptSecret(pass);
          if (res?.success && typeof res.data === 'string') {
            return { cipher: res.data, mode: 'os-keychain' };
          }
        }
      } catch (err) {
        console.warn('[Vault] OS keychain encryption failed, falling back to Web Crypto:', err);
      }
    }

    // 2. Fallback to real Web Crypto AES-GCM-256 with random 96-bit IV
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      try {
        const key = await MikrotikService.deriveBrowserVaultKey();
        const iv = new Uint8Array(12);
        crypto.getRandomValues(iv);
        const cipherBuf = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          key,
          new TextEncoder().encode(pass)
        );
        const ivHex = Array.from(iv).map((b) => b.toString(16).padStart(2, '0')).join('');
        const cipherB64 = btoa(String.fromCharCode(...new Uint8Array(cipherBuf)));
        return { cipher: `${ivHex}:${cipherB64}`, mode: 'aes-gcm-v2' };
      } catch (err) {
        console.warn('[Vault] Web Crypto AES-GCM encryption failed:', err);
      }
    }

    // Never persist weak XOR or plaintext if strong crypto is unavailable
    return null;
  }

  static async decryptPasswordSecure(encoded: string, encMode?: boolean | string): Promise<string> {
    if (!encoded) return '';

    if (encMode === 'os-keychain' && typeof window !== 'undefined' && window.zctrlDesktopVault) {
      try {
        const res = await window.zctrlDesktopVault.decryptSecret(encoded);
        if (res?.success && typeof res.data === 'string') {
          return res.data;
        }
      } catch (err) {
        console.warn('[Vault] OS keychain decryption failed:', err);
      }
      return '';
    }

    if (encMode === 'aes-gcm-v2' && typeof crypto !== 'undefined' && crypto.subtle) {
      try {
        const [ivHex, cipherB64] = encoded.split(':');
        if (!ivHex || !cipherB64) return '';
        const ivPairs = ivHex.match(/.{2}/g) || [];
        const iv = new Uint8Array(ivPairs.map((h) => parseInt(h, 16)));
        const binary = atob(cipherB64);
        const cipherBytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) cipherBytes[i] = binary.charCodeAt(i);
        const key = await MikrotikService.deriveBrowserVaultKey();
        const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBytes);
        return new TextDecoder().decode(plainBuf);
      } catch {
        return '';
      }
    }

    if (encMode === true) {
      return MikrotikService.decryptLegacyXor(encoded);
    }

    return encoded;
  }

  static setCache(key: string, data: any, ttl = MikrotikService.CACHE_TTL) {
    const now = Date.now();
    // Evict expired entries first when approaching capacity
    if (MikrotikService.cache.size >= MikrotikService.MAX_CACHE_ENTRIES) {
      for (const [k, entry] of MikrotikService.cache.entries()) {
        if (entry.timestamp <= now) {
          MikrotikService.cache.delete(k);
        }
      }
    }
    // Enforce hard upper bound with FIFO eviction so memory stays strictly bounded
    while (MikrotikService.cache.size >= MikrotikService.MAX_CACHE_ENTRIES) {
      const oldestKey = MikrotikService.cache.keys().next().value;
      if (oldestKey === undefined) break;
      MikrotikService.cache.delete(oldestKey);
    }
    MikrotikService.cache.set(key, { data, timestamp: now + ttl });
  }

  static getCache(key: string) {
    const cached = MikrotikService.cache.get(key);
    if (cached) {
      if (cached.timestamp > Date.now()) {
        return cached.data;
      }
      MikrotikService.cache.delete(key);
    }
    return null;
  }

  static clearExpiredCache(): number {
    const now = Date.now();
    let removed = 0;
    for (const [k, entry] of MikrotikService.cache.entries()) {
      if (entry.timestamp <= now) {
        MikrotikService.cache.delete(k);
        removed++;
      }
    }
    return removed;
  }

  static clearCache(): void {
    MikrotikService.cache.clear();
  }

  static getCacheSize(): number {
    return MikrotikService.cache.size;
  }

  static async fetchSyslog(): Promise<any[]> {
    try {
      const res = await secureFetch(`${getApiBaseUrl()}/api/mikrotik/syslog`, { credentials: 'include' });
      if (!res.ok) return [];
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        return data.success ? data.messages : [];
      } catch {
        return [];
      }
    } catch {
      return [];
    }
  }

  static addLog(command: string, response: string, type: 'info' | 'success' | 'error' = 'info') {
    const newLog: LogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      command,
      response,
      type
    };
    MikrotikService.logs = [newLog, ...MikrotikService.logs].slice(0, 50);
    window.dispatchEvent(new CustomEvent('mikrotik-log', { detail: newLog }));
  }

  static getLogs() {
    return MikrotikService.logs;
  }

  static async checkSession(): Promise<{ connected: boolean, config?: any }> {
    if (MikrotikService.hasLegacyElectronInvoke()) {
      if (MikrotikService.config) return { connected: true, config: MikrotikService.config };
      const saved = safeStorage.getItem('zahir_conn_config');
      if (saved) {
        try {
          const cfg = JSON.parse(saved);
          if (cfg?.pass && cfg?._enc) {
            cfg.pass = await MikrotikService.decryptPasswordSecure(cfg.pass, cfg._enc);
            delete cfg._enc;
          }
          MikrotikService.config = cfg;
          return { connected: true, config: cfg };
        } catch { return { connected: false }; }
      }
      return { connected: false };
    }
    
    try {
      const response = await secureFetch(`${getApiBaseUrl()}/api/mikrotik/status`, { credentials: 'include' });
      if (response.ok) {
        const text = await response.text();
        try {
          const result = JSON.parse(text);
          if (result.success && result.connected) {
            MikrotikService.config = result.config;
            return { connected: true, config: result.config };
          }
        } catch {
          return { connected: false };
        }
      }
    } catch (err) {
      console.error("Check session failed", err);
    }
    return { connected: false };
  }

  static async disconnect(): Promise<void> {
    try {
      if (!MikrotikService.hasLegacyElectronInvoke()) {
        await secureFetch(`${getApiBaseUrl()}/api/auth/logout`, { method: 'POST', credentials: 'include' });
      } else {
        safeStorage.removeItem('zahir_conn_config');
      }
      MikrotikService.config = null;
      MikrotikService.clearCache();
    } catch (err) {
      console.error("Logout failed", err);
    }
  }

  static async getRouterUniqueId(): Promise<string> {
    try {
      // Try to get serial number first
      const rb = await MikrotikService.invoke('/system/routerboard/print');
      if (rb.success && rb.data && rb.data[0] && rb.data[0]['serial-number']) {
        return rb.data[0]['serial-number'];
      }
      // Fallback to identity name
      const id = await MikrotikService.invoke('/system/identity/print');
      if (id.success && id.data && id.data[0] && id.data[0].name) {
        return id.data[0].name;
      }
      return 'unknown-router';
    } catch {
      return 'unknown-router';
    }
  }

  private static getLang(): string {
    return safeStorage.getItem('zahir_language') || 'ar';
  }

  static async connect(config: any, remember = false): Promise<boolean> {
    const lang = MikrotikService.getLang();
    MikrotikService.config = config;
    MikrotikService.addLog(`CONNECT ${config.ip}`, "جاري محاولة المصادقة مع الراوتر عبر البروكسي الآمن...", "info");
    
    try {
      if (!MikrotikService.hasLegacyElectronInvoke()) {
        const response = await secureFetch(`${getApiBaseUrl()}/api/mikrotik/connect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            ip: config.ip,
            host: config.ip,
            user: config.user,
            username: config.user,
            pass: config.pass,
            password: config.pass,
            remember // Pass remember flag to backend if needed for session duration
          })
        });

        const text = await response.text();
        let result;
        try {
          result = JSON.parse(text);
        } catch (e) {
          if (text.trim().startsWith('<!DOCTYPE')) {
            throw new Error(lang === 'ar' ? "خطأ: السيرفر لم يستطع معالجة الطلب كبيانات. تأكد من ضبط عنوان API URL في الإعدادات المتقدمة." : "Error: Server returned HTML. Ensure API URL is set correctly in Advanced Settings.");
          }
          throw new Error("Invalid JSON response from server");
        }

        if (!response.ok || result.success === false) {
          throw new Error(result.message || result.error || "فشل الاتصال الآمن بالراوتر");
        }
        if (result.success && (result.identity || result.router)) {
          MikrotikService.config = { 
            ...MikrotikService.config, 
            identity: result.identity || result.router?.name 
          };
        }
        
        // Save partial config (no password) even if not remembering, for convenience on next login
        safeStorage.setItem('zahir_config_partial', JSON.stringify({ ip: config.ip, user: config.user }));
        
        if (remember) {
          safeStorage.setItem('zahir_remember_me', 'true');
        } else {
          safeStorage.setItem('zahir_remember_me', 'false');
        }
      } else {
        const result = await MikrotikService.invoke('/system/identity/print');
        if (!result.success) throw new Error(result.error || "فشل الاتصال");
        
        safeStorage.setItem('zahir_config_partial', JSON.stringify({ ip: config.ip, user: config.user }));
        if (remember) {
          // Encrypt password using OS Keychain (Electron safeStorage) or AES-GCM 256-bit
          const secured = await MikrotikService.encryptPasswordSecure(config.pass || '');
          if (secured) {
            const encryptedConfig = {
              ...config,
              pass: secured.cipher,
              _enc: secured.mode
            };
            safeStorage.setItem('zahir_conn_config', JSON.stringify(encryptedConfig));
            safeStorage.setItem('zahir_remember_me', 'true');
          } else {
            // Do not store plaintext/weak obfuscation if strong crypto is unavailable
            safeStorage.removeItem('zahir_conn_config');
            safeStorage.setItem('zahir_remember_me', 'false');
          }
        } else {
          safeStorage.removeItem('zahir_conn_config');
          safeStorage.setItem('zahir_remember_me', 'false');
        }
      }

      MikrotikService.addLog("AUTH", "تم تسجيل الدخول بنجاح", "success");
      return true;
    } catch (err: any) {
      MikrotikService.addLog("AUTH_ERR", err.message || "فشل الاتصال بالراوتر", "error");
      throw err;
    }
  }

  static async invoke(cmd: any, args: string[] = [], config?: any): Promise<{ success: boolean, data?: any, error?: string, offlineCache?: boolean }> {
    let finalCmd = cmd;
    let finalArgs = args;
    let finalConfig = config;

    if (cmd && typeof cmd === 'object' && cmd.cmd) {
      finalCmd = cmd.cmd;
      finalArgs = cmd.args || [];
      finalConfig = cmd; // the object contains connection parameters
    }

    const currentConfig = finalConfig || MikrotikService.config;
    let finalResult: { success: boolean, data?: any, error?: string, offlineCache?: boolean } = { success: false };
    
    try {
      if (!MikrotikService.hasLegacyElectronInvoke()) {
        // Try to use the backend proxy if available
        try {
          const response = await secureFetch(`${getApiBaseUrl()}/api/mikrotik/invoke`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              cmd: finalCmd,
              args: finalArgs
            })
          });
          
          if (response.ok) {
            const text = await response.text();
            let result;
            try {
              result = JSON.parse(text);
            } catch (e) {
              result = { success: false, error: "Invalid JSON response from server" };
            }
            
            if (result.success) {
              finalResult = result;
            } else if (result.error && (result.error.includes('ETIMEDOUT') || result.error.includes('ECONNREFUSED') || result.error.includes('fetch') || result.error.includes('Timeout'))) {
              const restResult = await MikrotikService.invokeRest(finalCmd, finalArgs, currentConfig);
              finalResult = restResult.success ? restResult : { success: false, error: result.error };
            } else {
              finalResult = { success: false, error: result.error };
            }
          } else if (response.status === 401) {
            finalResult = { success: false, error: "انتهت الجلسة أو غير مصرح لك. يرجى إعادة تسجيل الدخول." };
          } else {
            finalResult = { success: false, error: `HTTP ${response.status} Error` };
          }
        } catch (err) {
          console.error("Backend proxy failed, attempting direct REST...", err);
          const restResult = await MikrotikService.invokeRest(finalCmd, finalArgs, currentConfig);
          finalResult = restResult.success ? restResult : { success: false, error: "فشل الوصول للسيرفر أو الراوتر" };
        }
      } else {
        const electronRes = await window.electronAPI.invokeMikrotik({
          ...(finalConfig || MikrotikService.config),
          cmd: finalCmd,
          args: finalArgs
        });
        finalResult = electronRes;
      }
    } catch (e: any) {
      finalResult = { success: false, error: e.message || "حدث خطأ غير متوقع" };
    }

    // --- SMART LOCAL CACHE FALLBACK ENGINE (For Point 1: Connection Stability Resilience) ---
    const isPrintCmd = typeof finalCmd === 'string' && finalCmd.includes('/print');
    const storageKey = typeof finalCmd === 'string' ? `zahir_offline_cache_${finalCmd.replace(/\//g, '_')}` : '';

    if (finalResult.success && Array.isArray(finalResult.data) && isPrintCmd && storageKey) {
      try {
        safeStorage.setItem(storageKey, JSON.stringify({
          timestamp: Date.now(),
          data: finalResult.data
        }));
      } catch (cacheErr) {
        console.warn("Failed to write to local offline cache", cacheErr);
      }
    } else if (!finalResult.success && isPrintCmd && storageKey) {
      // If the query failed, search local storage for our cache fallback
      try {
        const savedCache = safeStorage.getItem(storageKey);
        if (savedCache) {
          const parsed = JSON.parse(savedCache);
          if (parsed && Array.isArray(parsed.data)) {
            // Found cached data! Return with success but flag as offlineCache
            console.warn(`⚠️ Router connection unstable! Fell back to offline cache for: ${finalCmd}`);
            return {
              success: true,
              data: parsed.data,
              offlineCache: true,
              error: finalResult.error
            };
          }
        }
      } catch (cacheErr) {
        console.error("Failed to parse local offline cache fallback", cacheErr);
      }
    }

    return finalResult;
  }

  /**
   * Directly calls the Mikrotik REST API from the browser.
   * Useful on mobile when backend proxy cannot reach local IPs.
   */
  private static async invokeRest(cmd: string, args: string[] = [], config?: any): Promise<{ success: boolean, data?: any, error?: string }> {
    try {
      const cfg = config || MikrotikService.config;
      if (!cfg || !cfg.host) return { success: false, error: 'Config missing' };

      // Map API path to REST path
      // /ip/hotspot/user/print -> /rest/ip/hotspot/user
      const restPath = cmd.replace(/\/print$/, '').replace(/\/get$/, '');
      const url = `${cfg.host}/rest${restPath}`;
      
      // Proplist handling for REST
      const props = args.find(a => a.startsWith('.proplist='))?.split('=')[1];
      
      const rawCreds = `${cfg.user}:${cfg.password}`;
      const encodedAuth = cfg.auth || (() => {
        const bytes = new TextEncoder().encode(rawCreds);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
      })();

      const response = await fetch(url + (props ? `?attributes=${props}` : ''), {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${encodedAuth}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        const data = await response.json();
        return { success: true, data: Array.isArray(data) ? data : [data] };
      }
      
      const errText = await response.text();
      return { success: false, error: `Direct REST Error: ${response.status} - ${errText}` };
    } catch (err: any) {
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        const lang = MikrotikService.getLang();
        return { 
          success: false, 
          error: lang === 'ar' 
            ? "خطأ أمان المتصفح (CORS/Mixed Content): المتصفح يمنع الاتصال المباشر بالراوتر لأسباب أمنية. يرجى استخدام 'تطبيق الهاتف المثبت' (PWA) أو نسخة الويندوز للاتصال المباشر، أو التأكد من مطابقة بروتوكول HTTP/HTTPS بين المتصفح والراوتر."
            : "BROWSER_SECURITY: Browser blocks direct connection for security. Please use the installed Mobile App (PWA) or Windows version for direct access, or ensure HTTP/HTTPS protocol matches between browser and router." 
        };
      }
      return { success: false, error: `Direct Connection Failed: ${err.message}` };
    }
  }

  static async fetchSystemInfo(force = false, config?: any) {
    const cached = MikrotikService.getCache('systemInfo');
    if (!force && cached) return cached;

    try {
       const res = await MikrotikService.invoke('/system/identity/print', ['.proplist=name'], config);
       if (!res.success) throw new Error("Failed to fetch identity");
       
       const resource = await MikrotikService.invoke('/system/resource/print', ['.proplist=version,board-name,cpu-load'], config);
       if (!resource.success) throw new Error("Failed to fetch resources");
       
       const info = {
         name: res.data?.[0]?.name || 'MikroTik',
         version: resource.data?.[0]?.version || '6.x',
         isV7: (resource.data?.[0]?.version?.startsWith('7')),
         board: resource.data?.[0]?.['board-name'] || 'N/A'
       };
       
       MikrotikService.setCache('systemInfo', info, 60000);
       return info;
    } catch {
      const lastKnownCache = MikrotikService.getCache('systemInfo');
      return lastKnownCache || { name: 'MikroTik', version: '6.x', isV7: false };
    }
  }

  static async fetchHotspotProfiles(): Promise<any[]> {
    const cached = MikrotikService.getCache('hotspotProfiles');
    if (cached) return cached;

    try {
      const res = await MikrotikService.invoke('/ip/hotspot/user/profile/print', ['.proplist=.id,name,shared-users,rate-limit,status-autorefresh']);
      if (res.success) {
        MikrotikService.setCache('hotspotProfiles', res.data, 300000); // 5 mins
        return res.data;
      }
      return [];
    } catch { return []; }
  }

  static async fetchDHCPLeases(): Promise<any[]> {
    try {
      const res = await MikrotikService.invoke('/ip/dhcp-server/lease/print');
      return res.success ? res.data : [];
    } catch { return []; }
  }

  static async fetchUserManagerData() {
    const sysInfo = await MikrotikService.fetchSystemInfo();
    const isV7 = sysInfo.isV7;
    const baseCmd = isV7 ? '/user-manager' : '/tool/user-manager';

    try {
      const [users, profiles, sessions] = await Promise.all([
        MikrotikService.invoke(`${baseCmd}/user/print`),
        MikrotikService.invoke(`${baseCmd}/profile/print`),
        MikrotikService.invoke(`${baseCmd}/session/print`)
      ]);

      return {
        users: users.success ? users.data : [],
        profiles: profiles.success ? profiles.data : [],
        sessions: sessions.success ? sessions.data : []
      };
    } catch {
      return { users: [], profiles: [], sessions: [] };
    }
  }

  static async fetchSSIDs(): Promise<string[]> {
    try {
      // Try standard wireless
      const res = await MikrotikService.invoke('/interface/wireless/print');
      
      let ssids: string[] = [];
      if (res.success && res.data) {
        ssids = res.data.filter((w: any) => w.disabled === 'false').map((w: any) => w.ssid);
      }

      // Try wifiwave2 (RouterOS v7) if no SSIDs found
      if (ssids.length === 0) {
        const resV7 = await MikrotikService.invoke('/interface/wifiwave2/print');
        if (resV7.success && resV7.data) {
          ssids = resV7.data.filter((w: any) => w.disabled === 'false').map((w: any) => w.configuration?.ssid || w.ssid);
        }
      }

      // Try wifi (RouterOS v7.13+)
      if (ssids.length === 0) {
        const resV713 = await MikrotikService.invoke('/interface/wifi/print');
        if (resV713.success && resV713.data) {
          ssids = resV713.data.filter((w: any) => w.disabled === 'false').map((w: any) => w.configuration?.ssid || w.ssid);
        }
      }

      return ssids.filter(s => !!s);
    } catch { return []; }
  }

  static async fetchUsers(): Promise<User[]> {
    MikrotikService.addLog("/ip/hotspot/user/print", "جلب قائمة المستخدمين والنشطين (محسن)...", "info");
    
    try {
      const userProps = '.id,name,password,profile,uptime,bytes-in,bytes-out,last-logged-in,last-logged-out,disabled,mac-address,comment';
      const activeProps = '.id,user,mac-address,address,uptime,session-time-left';

      const [usersRes, activeRes] = await Promise.all([
        MikrotikService.invoke('/ip/hotspot/user/print', [`.proplist=${userProps}`]),
        MikrotikService.invoke('/ip/hotspot/active/print', [`.proplist=${activeProps}`])
      ]);
      
      if (usersRes.success && Array.isArray(usersRes.data)) {
        const activeMap = new Map();
        if (activeRes.success && Array.isArray(activeRes.data)) {
          activeRes.data.filter(Boolean).forEach((a: any) => {
            if (a.user) activeMap.set(a.user, a);
          });
        }

        const users = (usersRes.data || []).filter(Boolean).map((u: any, index: number) => {
          const active = u.name ? activeMap.get(u.name) : null;
          return {
            id: u['.id'] || index.toString(),
            username: u.name || 'Unknown',
            password: u.password || '****',
            profile: u.profile || 'default',
            status: (active ? 'online' : 'offline') as 'online' | 'offline', 
            macAddress: active ? active['mac-address'] : (u['mac-address'] || 'N/A'),
            bytesIn: parseInt(u['bytes-in']) || 0,
            bytesOut: parseInt(u['bytes-out']) || 0,
            uptime: u.uptime || '0s',
            lastLoggedOut: u['last-logged-out'] || u['last-logged-in'] || 'N/A',
            disabled: u.disabled === 'true'
          };
        });

        MikrotikService.setCache('users', users, 15000); // 15s cache
        return users;
      }
      return [];
    } catch (e: any) {
      MikrotikService.addLog("FETCH_USERS_ERROR", e.message || "فشل جلب المستخدمين", "error");
      return [];
    }
  }

  static async fetchIPBindings(): Promise<any[]> {
    try {
      const res = await MikrotikService.invoke('/ip/hotspot/ip-binding/print');
      return res.success ? res.data : [];
    } catch { return []; }
  }

  static async addIPBinding(data: any) {
    return this.invoke('/ip/hotspot/ip-binding/add', this.formatArgs(data));
  }

  static async deleteIPBinding(id: string) {
    return this.invoke('/ip/hotspot/ip-binding/remove', [`=.id=${id}`]);
  }

  static async fetchWalledGarden(): Promise<any[]> {
    try {
      const res = await MikrotikService.invoke('/ip/hotspot/walled-garden/print');
      return res.success ? res.data : [];
    } catch { return []; }
  }

  static async addWalledGarden(data: any) {
    return this.invoke('/ip/hotspot/walled-garden/add', this.formatArgs(data));
  }

  static async deleteWalledGarden(id: string) {
    return this.invoke('/ip/hotspot/walled-garden/remove', [`=.id=${id}`]);
  }

  static async fetchCookies(): Promise<any[]> {
    try {
      const res = await MikrotikService.invoke('/ip/hotspot/cookie/print');
      return res.success ? res.data : [];
    } catch { return []; }
  }

  static async clearCookies() {
    const cookies = await this.fetchCookies();
    if (!cookies || cookies.length === 0) return { success: true };

    // Process deletions in parallel batches of 10 to avoid flooding the router
    const BATCH_SIZE = 10;
    for (let i = 0; i < cookies.length; i += BATCH_SIZE) {
      const batch = cookies.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map((c: any) => this.invoke('/ip/hotspot/cookie/remove', [`=.id=${c['.id']}`]))
      );
    }
    return { success: true };
  }

  static async fetchHotspotUserProfiles(): Promise<any[]> {
    try {
      const res = await MikrotikService.invoke('/ip/hotspot/user/profile/print');
      return res.success ? res.data : [];
    } catch { return []; }
  }

  static async addHotspotUserProfile(data: any) {
    return this.invoke('/ip/hotspot/user/profile/add', this.formatArgs(data));
  }

  static async updateHotspotUserProfile(id: string, data: any) {
    return this.invoke('/ip/hotspot/user/profile/set', [`=.id=${id}`, ...this.formatArgs(data)]);
  }

  static async deleteHotspotUserProfile(id: string) {
    return this.invoke('/ip/hotspot/user/profile/remove', [`=.id=${id}`]);
  }

  static async fetchHotspotServerProfiles(): Promise<any[]> {
    try {
      const res = await MikrotikService.invoke('/ip/hotspot/profile/print');
      return res.success ? res.data : [];
    } catch { return []; }
  }

  static async updateHotspotServerProfile(id: string, data: any) {
    return this.invoke('/ip/hotspot/profile/set', [`=.id=${id}`, ...this.formatArgs(data)]);
  }

  static async fetchIPPools(): Promise<any[]> {
    try {
      const res = await MikrotikService.invoke('/ip/pool/print');
      return res.success ? res.data : [];
    } catch { return []; }
  }

  static async fetchUserManagerProfiles(): Promise<any[]> {
    try {
      const { baseCmd } = await MikrotikService.getRouterVersion();
      const res = await MikrotikService.invoke(`${baseCmd}/profile/print`);
      return res.success ? res.data : [];
    } catch { return []; }
  }

  static async addUserManagerProfile(data: any) {
    const { baseCmd } = await MikrotikService.getRouterVersion();
    return MikrotikService.invoke(`${baseCmd}/profile/add`, this.formatArgs(data));
  }

  static async updateUserManagerProfile(id: string, data: any) {
    const { baseCmd } = await MikrotikService.getRouterVersion();
    return MikrotikService.invoke(`${baseCmd}/profile/set`, [`=.id=${id}`, ...this.formatArgs(data)]);
  }

  static async deleteUserManagerProfile(id: string) {
    const { baseCmd } = await MikrotikService.getRouterVersion();
    return MikrotikService.invoke(`${baseCmd}/profile/remove`, [`=.id=${id}`]);
  }

  static async fetchUserManagerGroups(): Promise<any[]> {
    try {
      const { baseCmd } = await MikrotikService.getRouterVersion();
      const res = await MikrotikService.invoke(`${baseCmd}/group/print`);
      return res.success ? res.data : [];
    } catch { return []; }
  }

  // --- PPPoE Methods ---
  static async fetchPPPoEData() {
    try {
      const [secrets, active, profiles] = await Promise.all([
        this.invoke('/ppp/secret/print'),
        this.invoke('/ppp/active/print'),
        this.invoke('/ppp/profile/print')
      ]);

      return {
        secrets: secrets.success ? secrets.data : [],
        active: active.success ? active.data : [],
        profiles: profiles.success ? profiles.data : []
      };
    } catch {
      return { secrets: [], active: [], profiles: [] };
    }
  }

  public static formatArgs(data: any): string[] {
    return Object.entries(data)
      .filter(([_, v]) => v !== undefined && v !== null && String(v).trim() !== '')
      .map(([k, v]) => {
        let val = v;
        if (typeof v === 'boolean') val = v ? 'yes' : 'no';
        if (v === 'true') val = 'yes';
        if (v === 'false') val = 'no';
        return `=${k}=${val}`;
      });
  }

  /** Cached helper to determine if the router is RouterOS v7+ */
  private static async getRouterVersion(): Promise<{ isV7: boolean; baseCmd: string }> {
    // Use cached systemInfo if available to avoid redundant network calls
    const cached = MikrotikService.getCache('systemInfo');
    if (cached) return { isV7: cached.isV7, baseCmd: cached.isV7 ? '/user-manager' : '/tool/user-manager' };

    const resource = await MikrotikService.invoke('/system/resource/print');
    const isV7 = !!(resource.success && resource.data?.[0]?.version?.startsWith('7'));
    // Cache it so subsequent calls within 60s are free
    MikrotikService.setCache('systemInfo', { isV7 }, 60000);
    return { isV7, baseCmd: isV7 ? '/user-manager' : '/tool/user-manager' };
  }

  static async addPPPoESecret(data: any) {
    return this.invoke('/ppp/secret/add', this.formatArgs(data));
  }

  static async updatePPPoESecret(id: string, data: any) {
    return this.invoke('/ppp/secret/set', [`=.id=${id}`, ...this.formatArgs(data)]);
  }

  static async deletePPPoESecret(id: string) {
    return this.invoke('/ppp/secret/remove', [`=.id=${id}`]);
  }

  static async disconnectPPPoESession(id: string) {
    return this.invoke('/ppp/active/remove', [`=.id=${id}`]);
  }

  static async addPPPoEProfile(data: any) {
    return this.invoke('/ppp/profile/add', this.formatArgs(data));
  }

  static async updatePPPoEProfile(id: string, data: any) {
    return this.invoke('/ppp/profile/set', [`=.id=${id}`, ...this.formatArgs(data)]);
  }

  static async deletePPPoEProfile(id: string) {
    return this.invoke('/ppp/profile/remove', [`=.id=${id}`]);
  }

  static async bulkAction(cmd: string, ids: string[]): Promise<{ success: boolean, results: any[] }> {
    try {
      const promises = ids.map(id => this.invoke(cmd, [`=.id=${id}`]));
      const results = await Promise.all(promises);
      const allSuccess = results.every(res => res.success);
      return { success: allSuccess, results };
    } catch (err) {
      return { success: false, results: [] };
    }
  }

  static async deleteUser(id: string): Promise<boolean> {
    MikrotikService.addLog("/ip/hotspot/user/remove", `جاري حذف المستخدم ${id}...`, "info");
    try {
      const result = await MikrotikService.invoke('/ip/hotspot/user/remove', [`=.id=${id}`]);
      
      if (result.success) {
        MikrotikService.addLog("DELETE_USER", "تم الحذف بنجاح من المايكروتك", "success");
        return true;
      } else {
        throw new Error(result.error);
      }
    } catch (e: any) {
      MikrotikService.addLog("DELETE_ERROR", e.message || "فشل حذف المستخدم", "error");
      return false;
    }
  }

  static async toggleCyberShield(enabled: boolean): Promise<void> {
    const status = enabled ? "تفعيل" : "تعطيل";
    MikrotikService.addLog("CYBER-SHIELD", `جاري ${status} درع الحماية...`, "info");
    const dns = enabled ? "1.1.1.3,1.0.0.3" : "8.8.8.8,8.8.4.4";
    await MikrotikService.invoke('/ip/dns/set', [`=servers=${dns}`]);
    await MikrotikService.invoke('/ip/dns/cache/clear');
  }

  static async toggleVpnBlocker(enabled: boolean): Promise<void> {
    MikrotikService.addLog("VPN-BLOCK", enabled ? "تفعيل الحظر" : "تعطيل الحظر", "info");
  }

  static async toggleSafeSearch(enabled: boolean): Promise<void> {
    MikrotikService.addLog("SAFE-SEARCH", enabled ? "تفعيل" : "تعطيل", "info");
  }

  static async fetchQueues(): Promise<any[]> {
    try {
      const res = await MikrotikService.invoke('/queue/simple/print');
      return res.success ? res.data : [];
    } catch { return []; }
  }

  static async fetchFirewallRules(): Promise<any[]> {
    try {
      const res = await MikrotikService.invoke('/ip/firewall/filter/print');
      return res.success ? res.data : [];
    } catch { return []; }
  }

  static async ping(address: string, count: number = 4): Promise<any[]> {
    MikrotikService.addLog("PING", `جاري فحص الاتصال بـ ${address}...`, "info");
    try {
      const res = await MikrotikService.invoke('/ping', [`=address=${address}`, `=count=${count}`]);
      return res.success ? res.data : [];
    } catch { return []; }
  }

  static async traceroute(address: string): Promise<any[]> {
    MikrotikService.addLog("TRACEROUTE", `جاري تتبع المسار لـ ${address}...`, "info");
    try {
      const res = await MikrotikService.invoke('/tool/traceroute', [`=address=${address}`, '=count=1']);
      return res.success ? res.data : [];
    } catch { return []; }
  }

  static async fetchNeighbors(): Promise<any[]> {
    try {
      const res = await MikrotikService.invoke('/ip/neighbor/print');
      return res.success ? res.data : [];
    } catch { return []; }
  }

  static async fetchNetwatch(): Promise<any[]> {
    try {
      const res = await MikrotikService.invoke('/tool/netwatch/print');
      return res.success ? res.data : [];
    } catch { return []; }
  }

  static async dnsLookup(name: string): Promise<any[]> {
    try {
      const res = await MikrotikService.invoke('/resolve', [`=domain-name=${name}`]);
      return res.success ? res.data : [];
    } catch { return []; }
  }

  static async sendWOL(mac: string, interfaceName: string): Promise<boolean> {
    try {
      const res = await MikrotikService.invoke('/tool/wol', [`=mac=${mac}`, `=interface=${interfaceName}`]);
      return res.success;
    } catch { return false; }
  }

  static async fetchFiles(): Promise<any[]> {
    try {
      const res = await MikrotikService.invoke('/file/print');
      return res.success ? res.data : [];
    } catch { return []; }
  }

  static async deleteFile(id: string): Promise<boolean> {
    try {
      const res = await MikrotikService.invoke('/file/remove', [`=.id=${id}`]);
      return res.success;
    } catch { return false; }
  }



  static async checkUpgrade(): Promise<any> {
    try {
      const res = await MikrotikService.invoke('/system/package/update/check-for-updates');
      return res.success ? res.data[0] : null;
    } catch { return null; }
  }

  // Network, Wireless & Hotspot Portal Methods
  static async getWirelessInterfaces(): Promise<any[]> {
    try {
      const response = await secureFetch(`${getApiBaseUrl()}/api/mikrotik/wireless`);
      const result = await response.json();
      return result.success ? result.data : [];
    } catch {
      return [];
    }
  }

  static async updateWirelessInterface(data: any): Promise<{ success: boolean; message: string }> {
    try {
      const response = await secureFetch(`${getApiBaseUrl()}/api/mikrotik/wireless/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await response.json();
    } catch (e: any) {
      return { success: false, message: e?.message || 'فشل تحديث إعدادات الشبكة اللاسلكية' };
    }
  }

  static async getNetworkAntennas(): Promise<{ registrationTable: any[]; neighbors: any[]; remoteCaps: any[] }> {
    try {
      const response = await secureFetch(`${getApiBaseUrl()}/api/mikrotik/network/antennas`);
      const result = await response.json();
      return result.success ? result.data : { registrationTable: [], neighbors: [], remoteCaps: [] };
    } catch {
      return { registrationTable: [], neighbors: [], remoteCaps: [] };
    }
  }

  static async kickWirelessClient(id: string, macAddress?: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await secureFetch(`${getApiBaseUrl()}/api/mikrotik/wireless/antennas/kick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, macAddress })
      });
      return await response.json();
    } catch (e: any) {
      return { success: false, message: e?.message || 'فشل فصل الجهاز / العميل' };
    }
  }

  static async getHotspotServerProfiles(): Promise<{ profiles: any[]; servers: any[]; files: any[] }> {
    try {
      const response = await secureFetch(`${getApiBaseUrl()}/api/mikrotik/hotspot/server-profiles`);
      const result = await response.json();
      return result.success ? result.data : { profiles: [], servers: [], files: [] };
    } catch {
      return { profiles: [], servers: [], files: [] };
    }
  }

  static async saveHotspotServerProfile(data: any): Promise<{ success: boolean; message: string }> {
    try {
      const response = await secureFetch(`${getApiBaseUrl()}/api/mikrotik/hotspot/server-profiles/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await response.json();
    } catch (e: any) {
      return { success: false, message: e?.message || 'فشل تحديث بروفايل بوابة تسجيل الدخول' };
    }
  }

  static async createHotspotServerProfile(data: any): Promise<{ success: boolean; message: string }> {
    try {
      const response = await secureFetch(`${getApiBaseUrl()}/api/mikrotik/hotspot/server-profiles/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await response.json();
    } catch (e: any) {
      return { success: false, message: e?.message || 'فشل إنشاء بروفايل الهوتسبوت' };
    }
  }

  static async applyLoginPageTemplate(profileId: string, folderName: string, dnsName?: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await secureFetch(`${getApiBaseUrl()}/api/mikrotik/hotspot/login-page/apply-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId, folderName, dnsName })
      });
      return await response.json();
    } catch (e: any) {
      return { success: false, message: e?.message || 'فشل تطبيق مجلد صفحة الدخول' };
    }
  }

  static async toggleWirelessInterface(id: string, disabled: boolean, name?: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await secureFetch(`${getApiBaseUrl()}/api/mikrotik/wireless/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, disabled, name })
      });
      return await response.json();
    } catch (e: any) {
      return { success: false, message: e?.message || 'فشل تغيير حالة الواجهة اللاسلكية' };
    }
  }

  static async createVirtualAp(data: {
    masterInterface: string;
    name?: string;
    ssid: string;
    securityProfile?: string;
    disabled?: boolean;
    comment?: string;
    hideSsid?: boolean;
  }): Promise<{ success: boolean; message: string }> {
    try {
      const response = await secureFetch(`${getApiBaseUrl()}/api/mikrotik/wireless/add-vap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await response.json();
    } catch (e: any) {
      return { success: false, message: e?.message || 'فشل إنشاء نقطة البث الافتراضية' };
    }
  }

  static async pingHost(address: string, count: number = 4): Promise<{ success: boolean; data?: any; message?: string }> {
    try {
      const response = await secureFetch(`${getApiBaseUrl()}/api/mikrotik/network/ping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, count })
      });
      return await response.json();
    } catch (e: any) {
      return { success: false, message: e?.message || 'فشل تنفيذ أمر فحص الاتصال (Ping)' };
    }
  }

  static async deleteRouterFile(name: string, id?: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await secureFetch(`${getApiBaseUrl()}/api/mikrotik/files/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, id })
      });
      return await response.json();
    } catch (e: any) {
      return { success: false, message: e?.message || 'فشل حذف الملف من ذاكرة الراوتر' };
    }
  }

  static async deployHotspotPortal(data: {
    profileId?: string;
    profileName?: string;
    folderName: string;
    dnsName?: string;
    files: Record<string, string>;
  }): Promise<{ success: boolean; message: string }> {
    try {
      const response = await secureFetch(`${getApiBaseUrl()}/api/mikrotik/hotspot/login-page/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await response.json();
    } catch (e: any) {
      return { success: false, message: e?.message || 'فشل تثبيت ونشر صفحة تسجيل الدخول في المايكروتك' };
    }
  }

  // ==========================================
  // Access Points (Ubiquiti, TP-Link, Ruijie, CAPsMAN, Generic) APIs
  // ==========================================

  static async fetchApInfo(apMac: string, apIp?: string, apSource?: string): Promise<{ success: boolean; data?: any; error?: string; requiresCredentials?: boolean; [key: string]: any }> {
    try {
      const response = await secureFetch(`${getApiBaseUrl()}/api/ap/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apMac, apIp, apSource })
      });
      return await response.json();
    } catch (e: any) {
      return { success: false, error: e?.message || 'فشل الاتصال بنقطة الوصول' };
    }
  }

  static async changeApSsid(data: {
    apMac: string;
    apIp?: string;
    apSource?: string;
    request: { ssid?: string; ssid2g?: string; ssid5g?: string; hideSsid?: boolean };
  }): Promise<{ success: boolean; message: string; requiresCredentials?: boolean }> {
    try {
      const response = await secureFetch(`${getApiBaseUrl()}/api/ap/set-ssid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await response.json();
    } catch (e: any) {
      return { success: false, message: e?.message || 'فشل تغيير اسم الشبكة' };
    }
  }

  static async rebootAp(data: {
    apMac: string;
    apIp?: string;
    apSource?: string;
  }): Promise<{ success: boolean; message: string; requiresCredentials?: boolean }> {
    try {
      const response = await secureFetch(`${getApiBaseUrl()}/api/ap/reboot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await response.json();
    } catch (e: any) {
      return { success: false, message: e?.message || 'فشل إعادة تشغيل نقطة الوصول' };
    }
  }

  static async saveApCredentials(data: {
    mac: string;
    ip: string;
    vendor?: string;
    model?: string;
    username: string;
    password: string;
    port?: number;
    useHttps?: boolean;
    testConnection?: boolean;
  }): Promise<{ success: boolean; message: string; data?: any; info?: any; warning?: boolean }> {
    try {
      const response = await secureFetch(`${getApiBaseUrl()}/api/ap/save-credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await response.json();
    } catch (e: any) {
      return { success: false, message: e?.message || 'فشل حفظ بيانات الدخول' };
    }
  }

  static async getApCredentials(): Promise<{ success: boolean; data: any[] }> {
    try {
      const response = await secureFetch(`${getApiBaseUrl()}/api/ap/credentials`);
      return await response.json();
    } catch {
      return { success: false, data: [] };
    }
  }

  static async deleteApCredentials(mac: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await secureFetch(`${getApiBaseUrl()}/api/ap/credentials/${encodeURIComponent(mac)}`, {
        method: 'DELETE'
      });
      return await response.json();
    } catch (e: any) {
      return { success: false, message: e?.message || 'فشل حذف بيانات الدخول' };
    }
  }

  static async getApLogs(vendor?: string, errorsOnly?: boolean): Promise<{ success: boolean; data: any[] }> {
    try {
      const params = new URLSearchParams();
      if (vendor) params.set('vendor', vendor);
      if (errorsOnly) params.set('errors', 'true');
      const response = await secureFetch(`${getApiBaseUrl()}/api/ap/logs?${params.toString()}`);
      return await response.json();
    } catch {
      return { success: false, data: [] };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCHEDULED TASKS (ROUTEROS /system/scheduler)
  // ═══════════════════════════════════════════════════════════════════════════
  static async getScheduledTasks(): Promise<{ success: boolean; data: ScheduledTask[]; message?: string }> {
    try {
      const response = await secureFetch(`${getApiBaseUrl()}/api/mikrotik/schedulers`, { credentials: 'include' });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        return { success: false, data: [], message: err.message || 'فشل جلب المهام المجدولة' };
      }
      const result = await response.json();
      return { success: true, data: result.data || [] };
    } catch (e: any) {
      return { success: false, data: [], message: e?.message || 'خطأ في الاتصال بجلب المهام المجدولة' };
    }
  }

  static async addScheduledTask(task: Partial<ScheduledTask>): Promise<{ success: boolean; message: string }> {
    try {
      const response = await secureFetch(`${getApiBaseUrl()}/api/mikrotik/schedulers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(task)
      });
      const result = await response.json();
      return result;
    } catch (e: any) {
      return { success: false, message: e?.message || 'فشل إضافة المهمة المجدولة' };
    }
  }

  static async updateScheduledTask(id: string, updates: Partial<ScheduledTask>): Promise<{ success: boolean; message: string }> {
    try {
      const response = await secureFetch(`${getApiBaseUrl()}/api/mikrotik/schedulers/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updates)
      });
      const result = await response.json();
      return result;
    } catch (e: any) {
      return { success: false, message: e?.message || 'فشل تحديث المهمة المجدولة' };
    }
  }

  static async deleteScheduledTask(id: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await secureFetch(`${getApiBaseUrl()}/api/mikrotik/schedulers/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const result = await response.json();
      return result;
    } catch (e: any) {
      return { success: false, message: e?.message || 'فشل حذف المهمة المجدولة' };
    }
  }

  static async runScheduledTask(id: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await secureFetch(`${getApiBaseUrl()}/api/mikrotik/schedulers/${encodeURIComponent(id)}/run`, {
        method: 'POST',
        credentials: 'include'
      });
      const result = await response.json();
      return result;
    } catch (e: any) {
      return { success: false, message: e?.message || 'فشل تشغيل المهمة المجدولة' };
    }
  }
}
