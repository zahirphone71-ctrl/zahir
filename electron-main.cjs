const { app, BrowserWindow, shell, ipcMain, safeStorage, dialog } = require('electron');
const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const net = require('net');
const http = require('http');

let mainWindow = null;
let serverProcess = null;
let isQuitting = false;
let quitCleanupDone = false;
let serverRestartAttempts = 0;
const MAX_SERVER_RESTART_ATTEMPTS = 5;
let SERVER_PORT = 3000;
let activeSessionInMemory = null;
let renderCrashTimestamps = [];
let vaultKeyStatus = {
  ok: true,
  safeStorageAvailable: false,
  ephemeralFallback: false,
  warning: null
};
let activeEncryptionKeyHex = null;

function terminateBackendServer(onDone) {
  const proc = serverProcess;
  if (!proc || proc.killed) {
    serverProcess = null;
    if (typeof onDone === 'function') onDone();
    return;
  }
  serverProcess = null;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    if (typeof onDone === 'function') onDone();
  };
  proc.once('exit', finish);
  try {
    proc.kill('SIGTERM');
    const forceTimer = setTimeout(() => {
      try {
        if (!proc.killed) proc.kill('SIGKILL');
      } catch (killErr) {
        console.warn('[Electron] Force kill backend warning:', killErr?.message || killErr);
      }
      finish();
    }, 1600);
    if (forceTimer.unref) forceTimer.unref();
  } catch (err) {
    console.warn('[Electron] Terminate backend warning:', err?.message || err);
    finish();
  }
}

// Global Exception & Rejection Handlers: log cleanly without forcing fatal exit on transient desktop errors
process.on('uncaughtException', (error) => {
  console.error('[Electron Process Uncaught Exception]', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Electron Process Unhandled Rejection]', reason);
});

// Optional safe GPU fallback when explicitly requested on problematic Windows drivers
if (process.env.ZCTRL_DISABLE_GPU === '1') {
  app.disableHardwareAcceleration();
}
// Strict V8 Heap Limit: prevent runaway memory consumption in desktop process
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=1024');

// Single Instance Lock: Prevent multiple conflicting instances from running
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[Electron] Another instance is already running. Quitting duplicate process.');
  app.quit();
  process.exit(0);
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => {
        tester.once('close', () => resolve(true)).close();
      })
      .listen(port, '127.0.0.1');
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function waitForLocalServerReady(port, maxWaitMs = 10000) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const attempt = () => {
      const req = http.get(
        { hostname: '127.0.0.1', port, path: '/api/ping', timeout: 800 },
        (res) => {
          res.resume();
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
            resolve(true);
            return;
          }
          retryOrStop();
        }
      );
      req.on('error', retryOrStop);
      req.on('timeout', () => {
        req.destroy();
        retryOrStop();
      });
    };

    const retryOrStop = () => {
      if (Date.now() - startedAt >= maxWaitMs) {
        resolve(false);
        return;
      }
      setTimeout(attempt, 100);
    };

    attempt();
  });
}

function resolveOrCreateAppEncryptionKey(userDataPath) {
  const keyPath = path.join(userDataPath, 'vault.key.enc');
  const hasExistingKeyFile = fs.existsSync(keyPath);
  const canUseSafeStorage = Boolean(safeStorage && safeStorage.isEncryptionAvailable());
  vaultKeyStatus.safeStorageAvailable = canUseSafeStorage;

  if (canUseSafeStorage) {
    if (hasExistingKeyFile) {
      try {
        const decrypted = safeStorage.decryptString(fs.readFileSync(keyPath));
        if (decrypted && decrypted.trim().length >= 32) {
          activeEncryptionKeyHex = decrypted.trim();
          vaultKeyStatus = {
            ok: true,
            safeStorageAvailable: true,
            ephemeralFallback: false,
            warning: null
          };
          return activeEncryptionKeyHex;
        }
        throw new Error('Decrypted encryption key is empty or invalid');
      } catch (err) {
        const errMsg = err?.message || String(err);
        console.error('[Electron] Failed to decrypt existing vault.key.enc:', errMsg);
        const choice = dialog.showMessageBoxSync({
          type: 'error',
          title: 'تحذير أمني: تعذر فك تشفير مفتاح الخزنة',
          message: 'تعذر فك تشفير ملف مفتاح الخزنة المحفوظ (vault.key.enc).',
          detail:
            'قد تفقد إمكانية قراءة كلمات المرور والبروفايلات المشفرة سابقاً إذا تم إنشاء مفتاح جديد.\n' +
            'اختر "إعادة التهيئة مع نسخة احتياطية" فقط إذا لم تعد بحاجة إلى الخزنة السابقة، أو "إغلاق التطبيق" لحل مشكلة صلاحيات النظام أولاً.',
          buttons: ['إغلاق التطبيق للحفاظ على البيانات', 'نسخ احتياطي للملف التالف وإنشاء مفتاح جديد'],
          defaultId: 0,
          cancelId: 0,
          noLink: true
        });
        if (choice !== 1) {
          app.exit(1);
          return '';
        }
        const corruptBackup = `${keyPath}.corrupt-${Date.now()}`;
        try {
          fs.copyFileSync(keyPath, corruptBackup);
        } catch (copyErr) {
          console.error('[Electron] Failed to preserve corrupted vault key backup:', copyErr);
        }
      }
    }

    try {
      const key = crypto.randomBytes(32).toString('hex');
      const tmp = `${keyPath}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, safeStorage.encryptString(key), { mode: 0o600 });
      fs.renameSync(tmp, keyPath);
      activeEncryptionKeyHex = key;
      vaultKeyStatus = {
        ok: true,
        safeStorageAvailable: true,
        ephemeralFallback: false,
        warning: null
      };
      return key;
    } catch (writeErr) {
      console.error('[Electron] Failed to persist safeStorage vault key:', writeErr);
      dialog.showErrorBox(
        'خطأ في حفظ مفتاح الخزنة',
        `تعذر حفظ مفتاح التشفير في نظام التشغيل: ${writeErr?.message || writeErr}`
      );
    }
  } else {
    const warnMsg = hasExistingKeyFile
      ? 'خدمة التشفير الآمنة في نظام التشغيل غير متوفرة حالياً، ولا يمكن فك تشفير مفتاح الخزنة المحفوظ.'
      : 'خدمة التشفير الآمنة في نظام التشغيل (OS Keychain / DPAPI) غير متوفرة؛ قد لا تستمر البيانات المشفرة بين الجلسات.';
    console.warn('[Electron]', warnMsg);
    vaultKeyStatus = {
      ok: !hasExistingKeyFile,
      safeStorageAvailable: false,
      ephemeralFallback: true,
      warning: warnMsg
    };
    dialog.showMessageBoxSync({
      type: 'warning',
      title: 'تنبيه خدمة التشفير (safeStorage)',
      message: warnMsg,
      detail: hasExistingKeyFile
        ? 'سيعمل التطبيق بمفتاح مؤقت لحين توفر خدمة مفاتيح النظام ولن يتم استبدال ملف vault.key.enc الموجود.'
        : 'يُنصح بتفعيل خدمة مفاتيح نظام التشغيل قبل حفظ بيانات حساسة.',
      buttons: ['حسناً'],
      defaultId: 0
    });
  }

  activeEncryptionKeyHex = crypto.randomBytes(32).toString('hex');
  vaultKeyStatus.ephemeralFallback = true;
  return activeEncryptionKeyHex;
}

function resolveBackendScriptPath() {
  const resPath = process.resourcesPath || '';
  const serverCandidates = [
    path.join(resPath, 'app.asar.unpacked', 'dist', 'server.cjs'),
    path.join(__dirname, 'dist', 'server.cjs'),
    path.join(__dirname, 'server.cjs'),
    path.join(resPath, 'app', 'dist', 'server.cjs'),
    path.join(resPath, 'dist', 'server.cjs'),
    path.join(process.cwd(), 'dist', 'server.cjs')
  ];

  for (const candidate of serverCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function startBackendServer() {
  const sPath = resolveBackendScriptPath();
  if (!sPath) {
    console.error('[Electron] Unable to locate dist/server.cjs backend bundle.');
    return false;
  }

  console.log('[Electron] Spawning isolated backend server child process from:', sPath);
  const childEnv = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: SERVER_PORT.toString()
  };

  serverProcess = spawn(process.execPath, [sPath], {
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  if (serverProcess.stdout) {
    serverProcess.stdout.on('data', (chunk) => {
      process.stdout.write(`[Backend] ${chunk}`);
    });
  }
  if (serverProcess.stderr) {
    serverProcess.stderr.on('data', (chunk) => {
      process.stderr.write(`[Backend ERR] ${chunk}`);
    });
  }

  serverProcess.on('exit', (code, signal) => {
    console.warn(`[Electron] Backend process exited (code=${code}, signal=${signal})`);
    serverProcess = null;
    if (!isQuitting) {
      serverRestartAttempts += 1;
      if (serverRestartAttempts > MAX_SERVER_RESTART_ATTEMPTS) {
        const failMsg = `توقف الخادم الخلفي عن العمل بعد ${MAX_SERVER_RESTART_ATTEMPTS} محاولات إعادة تشغيل متتالية (code=${code ?? 'unknown'}).`;
        console.error('[Electron]', failMsg);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('zctrl:backend-failed', {
            attempts: serverRestartAttempts - 1,
            code,
            signal,
            message: failMsg
          });
        }
        dialog.showErrorBox('توقف الخادم المحلي لـ ZCtrl', failMsg);
        return;
      }

      const delayMs = Math.min(10000, 500 * Math.pow(2, Math.min(serverRestartAttempts - 1, 5)));
      console.log(
        `[Electron] Respawning backend server in ${delayMs}ms (attempt ${serverRestartAttempts}/${MAX_SERVER_RESTART_ATTEMPTS})...`
      );
      setTimeout(async () => {
        if (isQuitting) return;
        const restarted = startBackendServer();
        if (restarted) {
          const ready = await waitForLocalServerReady(SERVER_PORT, 8000);
          if (ready) {
            serverRestartAttempts = 0;
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('zctrl:backend-respawned');
            }
          }
        }
      }, delayMs);
    }
  });

  return true;
}

function getAppIconPath() {
  const resPath = process.resourcesPath || '';
  const iconCandidates = [
    path.join(__dirname, 'assets', 'icon.ico'),
    path.join(__dirname, 'assets', 'icon.png'),
    path.join(__dirname, 'build', 'icon.ico'),
    path.join(__dirname, 'icon.ico'),
    path.join(resPath, 'assets', 'icon.ico'),
    path.join(resPath, 'build', 'icon.ico'),
    path.join(resPath, 'app.asar.unpacked', 'assets', 'icon.ico'),
    path.join(resPath, 'app.asar', 'assets', 'icon.ico')
  ];

  for (const iconPath of iconCandidates) {
    if (fs.existsSync(iconPath)) {
      return iconPath;
    }
  }
  return path.join(__dirname, 'assets', 'icon.ico');
}

function createWindow() {
  const resolvedIcon = getAppIconPath();
  console.log('[Electron] Using application icon:', resolvedIcon);

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'ZCtrl | نظام إدارة سيرفرات المايكروتك وتوليد الكروت',
    icon: resolvedIcon,
    backgroundColor: '#020617',
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      sandbox: true
    },
    autoHideMenuBar: true,
    show: false
  });

  mainWindow.webContents.setBackgroundThrottling(false);
  mainWindow.on('minimize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.setBackgroundThrottling(true);
    }
  });
  mainWindow.on('hide', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.setBackgroundThrottling(true);
    }
  });
  mainWindow.on('restore', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.setBackgroundThrottling(false);
    }
  });
  mainWindow.on('show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.setBackgroundThrottling(false);
    }
  });

  const appUrl = `http://127.0.0.1:${SERVER_PORT}`;
  console.log('[Electron] Loading frontend from:', appUrl);

  const loadWithFastRetry = (url, retries = 40) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.loadURL(url).catch((err) => {
      if (retries > 0) {
        setTimeout(() => loadWithFastRetry(url, retries - 1), 200);
      } else {
        console.error('[Electron] Failed to connect to local backend HTTP server:', err);
      }
    });
  };

  loadWithFastRetry(appUrl);

  mainWindow.once('ready-to-show', () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });

  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  }, 2500);

  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.toggleDevTools();
    }
  });

  // Strictly block navigation outside local Express origin; open external links safely in OS browser
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    try {
      const parsed = new URL(targetUrl);
      const isLocalBackend =
        (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') &&
        String(parsed.port || '') === String(SERVER_PORT);
      if (!isLocalBackend) {
        event.preventDefault();
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          shell.openExternal(targetUrl);
        }
      }
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Electron] Render process gone / crashed:', details);
    if (details.reason !== 'clean-exit' && mainWindow && !mainWindow.isDestroyed()) {
      const now = Date.now();
      renderCrashTimestamps = renderCrashTimestamps.filter((ts) => now - ts < 30000);
      renderCrashTimestamps.push(now);
      if (renderCrashTimestamps.length >= 3) {
        console.error('[Electron] Renderer crash loop detected (3+ crashes in 30s); halting auto-reload.');
        return;
      }
      const backoffMs = 600 * renderCrashTimestamps.length;
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.reload();
        }
      }, backoffMs);
    }
  });

  mainWindow.webContents.on('unresponsive', () => {
    console.warn('[Electron] Window temporarily busy; preserving active session without forced reload.');
  });

  mainWindow.webContents.on('responsive', () => {
    console.log('[Electron] Window responsiveness restored.');
  });

  mainWindow.on('closed', () => {
    activeSessionInMemory = null;
    mainWindow = null;
  });
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('before-quit', (event) => {
  isQuitting = true;
  if (!quitCleanupDone && serverProcess && !serverProcess.killed) {
    event.preventDefault();
    terminateBackendServer(() => {
      quitCleanupDone = true;
      app.quit();
    });
    return;
  }
  quitCleanupDone = true;
  terminateBackendServer();
});

app.whenReady().then(async () => {
  try {
    const userDataPath = app.getPath('userData');
    const appDataDir = path.join(userDataPath, 'data');
    const appLogDir = path.join(userDataPath, 'logs');

    if (!fs.existsSync(appDataDir)) fs.mkdirSync(appDataDir, { recursive: true });
    if (!fs.existsSync(appLogDir)) fs.mkdirSync(appLogDir, { recursive: true });

    // Protect master encryption key via OS keychain (DPAPI / Keychain / Secret Service)
    process.env.APP_ENCRYPTION_KEY = resolveOrCreateAppEncryptionKey(userDataPath);
    process.env.ZCTRL_DATA_DIR = appDataDir;
    process.env.ZCTRL_LOG_DIR = appLogDir;
    console.log('[Electron] User data directory configured:', appDataDir);

    // OS Keychain encryption IPC handlers
    ipcMain.handle('zctrl:safe-storage-available', () => {
      try {
        return Boolean(safeStorage && safeStorage.isEncryptionAvailable());
      } catch (err) {
        console.warn('[Electron] safeStorage availability check warning:', err?.message || err);
        return false;
      }
    });

    ipcMain.handle('zctrl:vault-key-status', () => ({ ...vaultKeyStatus }));

    ipcMain.handle('zctrl:export-vault-key', async () => {
      if (!activeEncryptionKeyHex) {
        return { success: false, error: 'مفتاح الخزنة غير مهيأ حالياً' };
      }
      try {
        const res = await dialog.showSaveDialog(mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined, {
          title: 'حفظ نسخة احتياطية لمفتاح الخزنة (ZCtrl Vault Recovery Key)',
          defaultPath: `zctrl-vault-backup-${new Date().toISOString().slice(0, 10)}.json`,
          filters: [{ name: 'JSON Files', extensions: ['json'] }]
        });
        if (res.canceled || !res.filePath) {
          return { success: false, canceled: true };
        }
        const payload = JSON.stringify(
          {
            app: 'ZCtrl',
            exportedAt: new Date().toISOString(),
            keyHex: activeEncryptionKeyHex
          },
          null,
          2
        );
        fs.writeFileSync(res.filePath, payload, { encoding: 'utf8', mode: 0o600 });
        return { success: true, filePath: res.filePath };
      } catch (err) {
        return { success: false, error: err?.message || 'فشل تصدير النسخة الاحتياطية للمفتاح' };
      }
    });

    ipcMain.handle('zctrl:retry-backend', async () => {
      serverRestartAttempts = 0;
      if (serverProcess && !serverProcess.killed) {
        return { success: true };
      }
      const started = startBackendServer();
      if (!started) {
        return { success: false, message: 'تعذر العثور على ملف الخادم الخلفي' };
      }
      const ready = await waitForLocalServerReady(SERVER_PORT, 8000);
      if (ready && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('zctrl:backend-respawned');
      }
      return { success: ready };
    });

    ipcMain.handle('zctrl:safe-storage-encrypt', (_event, plainText) => {
      if (typeof plainText !== 'string' || plainText.length > 4096) {
        return { success: false, error: 'Invalid secret input' };
      }
      try {
        if (!safeStorage || !safeStorage.isEncryptionAvailable()) {
          return { success: false, error: 'OS keychain encryption unavailable' };
        }
        const encrypted = safeStorage.encryptString(plainText);
        return { success: true, data: encrypted.toString('base64') };
      } catch (err) {
        return { success: false, error: err && err.message ? err.message : 'Encryption failed' };
      }
    });

    ipcMain.handle('zctrl:safe-storage-decrypt', (_event, cipherBase64) => {
      if (typeof cipherBase64 !== 'string' || cipherBase64.length > 16384) {
        return { success: false, error: 'Invalid cipher input' };
      }
      try {
        if (!safeStorage || !safeStorage.isEncryptionAvailable()) {
          return { success: false, error: 'OS keychain encryption unavailable' };
        }
        const buf = Buffer.from(cipherBase64, 'base64');
        const plain = safeStorage.decryptString(buf);
        return { success: true, data: plain };
      } catch (err) {
        return { success: false, error: err && err.message ? err.message : 'Decryption failed' };
      }
    });

    // Ephemeral RAM-only active router session bridge (never written to disk; cleared on disconnect/close)
    ipcMain.handle('zctrl:set-active-session', (_event, payload) => {
      if (!payload || typeof payload.host !== 'string' || !payload.host.trim() || typeof payload.username !== 'string') {
        return { success: false };
      }
      activeSessionInMemory = {
        host: payload.host.trim(),
        port: Number(payload.port) || 8728,
        username: payload.username,
        password: typeof payload.password === 'string' ? payload.password : '',
        useTls: Boolean(payload.useTls),
        timeoutMs: Number(payload.timeoutMs) || 8000,
        tlsFingerprint: typeof payload.tlsFingerprint === 'string' ? payload.tlsFingerprint : undefined,
        acceptTlsFingerprint: Boolean(payload.acceptTlsFingerprint)
      };
      return { success: true };
    });

    ipcMain.handle('zctrl:clear-active-session', () => {
      activeSessionInMemory = null;
      return { success: true };
    });

    ipcMain.handle('zctrl:restore-active-session', () => {
      if (!activeSessionInMemory) {
        return Promise.resolve({ success: false, message: 'No active in-memory session' });
      }
      const bodyStr = JSON.stringify(activeSessionInMemory);
      return new Promise((resolve) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: SERVER_PORT,
            path: '/api/mikrotik/connect',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(bodyStr)
            },
            timeout: 12000
          },
          (res) => {
            const chunks = [];
            res.on('data', (d) => chunks.push(d));
            res.on('end', () => {
              try {
                const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                if (parsed && parsed.success && parsed.token) {
                  resolve({
                    success: true,
                    token: parsed.token,
                    router: parsed.router,
                    role: parsed.role,
                    operatorName: parsed.operatorName,
                    tlsFingerprint: parsed.tlsFingerprint
                  });
                } else {
                  resolve({ success: false, message: parsed?.message || 'Restore failed' });
                }
              } catch {
                resolve({ success: false, message: 'Invalid restore response' });
              }
            });
          }
        );
        req.on('error', (err) => {
          resolve({ success: false, message: err?.message || 'Backend unavailable' });
        });
        req.on('timeout', () => {
          req.destroy();
          resolve({ success: false, message: 'Restore timeout' });
        });
        req.write(bodyStr);
        req.end();
      });
    });

    ipcMain.handle('zctrl:print-to-pdf', async (_event, payload) => {
      if (!payload || typeof payload.html !== 'string' || payload.html.length === 0 || payload.html.length > 60 * 1024 * 1024) {
        return { success: false, error: 'محتوى HTML غير صالح أو يتجاوز الحد المسموح' };
      }

      const rawName = typeof payload.fileName === 'string' && payload.fileName.trim()
        ? payload.fileName.trim()
        : `vouchers-${Date.now()}.pdf`;
      const cleanName = path
        .basename(rawName)
        .split('')
        .map((ch) => (ch.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(ch) ? '_' : ch))
        .join('');
      const finalDefaultName = cleanName.toLowerCase().endsWith('.pdf') ? cleanName : `${cleanName}.pdf`;

      let tmpHtmlPath = null;
      let pdfWin = null;
      try {
        const dialogResult = await dialog.showSaveDialog(mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined, {
          title: 'حفظ ملف PDF (جودة فيكتور)',
          defaultPath: finalDefaultName,
          filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
        });

        if (dialogResult.canceled || !dialogResult.filePath) {
          return { success: false, canceled: true };
        }

        const tempDir = app.getPath('temp');
        tmpHtmlPath = path.join(tempDir, `zctrl-pdf-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.html`);
        fs.writeFileSync(tmpHtmlPath, payload.html, { encoding: 'utf8', mode: 0o600 });

        pdfWin = new BrowserWindow({
          show: false,
          width: 1200,
          height: 1600,
          backgroundColor: '#ffffff',
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true
          }
        });

        pdfWin.webContents.on('will-navigate', (event) => {
          event.preventDefault();
        });
        pdfWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

        await pdfWin.loadFile(tmpHtmlPath);
        await pdfWin.webContents.executeJavaScript(
          'document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true',
          true
        ).catch(() => true);

        const pType = String(payload.paperType || 'a4').toLowerCase();
        const isPos = Boolean(payload.isPos) || pType.includes('thermal') || pType.startsWith('pos');
        let pageSize = 'A4';
        if (isPos) {
          const widthInches = pType.includes('58') ? 58 / 25.4 : 80 / 25.4;
          const heightMm = Math.max(60, Number(payload.paperHeightMm) || 140);
          pageSize = { width: widthInches, height: heightMm / 25.4 };
        } else if (pType === 'a3') {
          pageSize = 'A3';
        } else if (pType === 'a5') {
          pageSize = 'A5';
        } else if (pType === 'letter') {
          pageSize = 'Letter';
        }

        const pdfBuffer = await pdfWin.webContents.printToPDF({
          printBackground: true,
          preferCSSPageSize: true,
          landscape: !isPos && payload.orientation === 'landscape',
          margins: { marginType: 'none' },
          pageSize
        });

        const tmpOut = `${dialogResult.filePath}.${process.pid}.tmp`;
        fs.writeFileSync(tmpOut, pdfBuffer);
        fs.renameSync(tmpOut, dialogResult.filePath);

        return { success: true, filePath: dialogResult.filePath };
      } catch (err) {
        return { success: false, error: err && err.message ? err.message : 'فشل تصدير PDF عبر محرك سطح المكتب' };
      } finally {
        try {
          if (pdfWin && !pdfWin.isDestroyed()) pdfWin.destroy();
        } catch (winErr) {
          console.warn('[Electron] PDF window cleanup warning:', winErr?.message || winErr);
        }
        try {
          if (tmpHtmlPath && fs.existsSync(tmpHtmlPath)) fs.unlinkSync(tmpHtmlPath);
        } catch (unlinkErr) {
          console.warn('[Electron] Temp HTML cleanup warning:', unlinkErr?.message || unlinkErr);
        }
      }
    });

    // Resolve server port
    if (process.env.PORT) {
      SERVER_PORT = parseInt(process.env.PORT, 10) || 3000;
    } else {
      const is3000Free = await isPortAvailable(3000);
      SERVER_PORT = is3000Free ? 3000 : await getFreePort();
    }
    process.env.PORT = SERVER_PORT.toString();

    // Start backend child process & wait for readiness
    startBackendServer();
    const isServerReady = await waitForLocalServerReady(SERVER_PORT, 10000);
    console.log(`[Electron] Local backend ready=${isServerReady} on 127.0.0.1:${SERVER_PORT}`);

    createWindow();
  } catch (err) {
    console.error('[Electron] Startup error:', err);
    createWindow();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    isQuitting = true;
    terminateBackendServer();
    app.quit();
  }
});
