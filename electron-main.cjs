const { app, BrowserWindow, shell, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const http = require('http');

// Global Exception & Rejection Handlers to prevent crash dialogs
process.on('uncaughtException', (error) => {
  console.error('[Electron Process Uncaught Exception]', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Electron Process Unhandled Rejection]', reason);
});

// Windows stability switches: prevent DWM native occlusion blanking
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
// Strict V8 Heap Limit: prevent runaway memory consumption in desktop process
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=1024');

// Single Instance Lock: Prevent multiple conflicting instances from running
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[Electron] Another instance is already running. Quitting duplicate process.');
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let SERVER_PORT = 3000;

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

function waitForLocalServerReady(port, maxWaitMs = 8000) {
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
      setTimeout(attempt, 80);
    };

    attempt();
  });
}

async function startBackendServer() {
  process.env.NODE_ENV = 'production';
  process.env.PORT = SERVER_PORT.toString();

  const resPath = process.resourcesPath || '';
  const serverCandidates = [
    path.join(__dirname, 'dist', 'server.cjs'),
    path.join(__dirname, 'server.cjs'),
    path.join(resPath, 'app.asar', 'dist', 'server.cjs'),
    path.join(resPath, 'app', 'dist', 'server.cjs'),
    path.join(resPath, 'dist', 'server.cjs'),
    path.join(process.cwd(), 'dist', 'server.cjs')
  ];

  let serverStarted = false;
  for (const sPath of serverCandidates) {
    if (fs.existsSync(sPath)) {
      try {
        console.log('[Electron] Loading internal backend server from:', sPath);
        require(sPath);
        serverStarted = true;
        break;
      } catch (e) {
        console.error('[Electron] Error requiring server bundle from ' + sPath + ':', e);
      }
    }
  }

  if (!serverStarted) {
    try {
      require('./dist/server.cjs');
      serverStarted = true;
    } catch (err) {
      console.error('[Electron] Failed to load server from fallback ./dist/server.cjs:', err);
    }
  }
  return serverStarted;
}

function getAppIconPath() {
  const resPath = process.resourcesPath || '';
  const iconCandidates = [
    path.join(__dirname, 'build', 'icon.ico'),
    path.join(__dirname, 'icon.ico'),
    path.join(__dirname, 'build', 'icon.png'),
    path.join(__dirname, 'icon.png'),
    path.join(__dirname, 'public', 'icon.png'),
    path.join(__dirname, 'dist', 'icon.png'),
    path.join(resPath, 'build', 'icon.ico'),
    path.join(resPath, 'build', 'icon.png'),
    path.join(resPath, 'app', 'build', 'icon.ico'),
    path.join(resPath, 'app', 'icon.ico'),
    path.join(resPath, 'app.asar', 'build', 'icon.ico'),
    path.join(resPath, 'app.asar', 'build', 'icon.png')
  ];

  for (const iconPath of iconCandidates) {
    if (fs.existsSync(iconPath)) {
      return iconPath;
    }
  }
  return path.join(__dirname, 'icon.png');
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
    backgroundColor: '#020617', // Match slate-950
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true, // Secure: Requests route through Express backend proxy with CORS allowlist
      sandbox: true
    },
    autoHideMenuBar: true,
    show: false
  });

  // Keep rendering steady when active/visible, throttle cleanly when minimized/hidden
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
    if (!mainWindow) return;
    mainWindow.loadURL(url).catch((err) => {
      if (retries > 0) {
        setTimeout(() => loadWithFastRetry(url, retries - 1), 150);
      } else {
        console.error('[Electron] Falling back to direct dist load:', err);
        const resPath = process.resourcesPath || '';
        const directDist = path.join(__dirname, 'dist', 'index.html');
        const appDist = path.join(resPath, 'app', 'dist', 'index.html');
        const asarDist = path.join(resPath, 'app.asar', 'dist', 'index.html');
        if (fs.existsSync(directDist)) {
          mainWindow.loadFile(directDist, { query: { port: String(SERVER_PORT) } });
        } else if (fs.existsSync(appDist)) {
          mainWindow.loadFile(appDist, { query: { port: String(SERVER_PORT) } });
        } else if (fs.existsSync(asarDist)) {
          mainWindow.loadFile(asarDist, { query: { port: String(SERVER_PORT) } });
        }
      }
    });
  };

  loadWithFastRetry(appUrl);

  // Show window as soon as content is ready
  mainWindow.once('ready-to-show', () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });

  // Fallback: If ready-to-show hasn't fired in 2500ms, display window gracefully
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  }, 2500);

  // Enable F12 DevTools for diagnostics
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.toggleDevTools();
    }
  });

  // Security: strictly prevent loading untrusted external web content inside the desktop app window
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    try {
      const parsed = new URL(targetUrl);
      const isLocalBackend =
        (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') &&
        String(parsed.port || '') === String(SERVER_PORT);
      const isLocalFile = parsed.protocol === 'file:';
      if (!isLocalBackend && !isLocalFile) {
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

  // Automatic crash recovery ONLY on true renderer process crash (never force-reload on transient busy periods so user session stays intact)
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('[Electron] Render process gone / crashed:', details);
    if (details.reason !== 'clean-exit' && mainWindow) {
      console.log('[Electron] Automatically reloading window after renderer crash...');
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.reload();
        }
      }, 600);
    }
  });

  mainWindow.webContents.on('unresponsive', () => {
    console.warn('[Electron] Window temporarily busy; preserving active session without forced reload.');
  });

  mainWindow.webContents.on('responsive', () => {
    console.log('[Electron] Window responsiveness restored.');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// When duplicate instance is launched, focus the existing window
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  try {
    // 1. Configure reliable writable paths in UserData
    const userDataPath = app.getPath('userData');
    const appDataDir = path.join(userDataPath, 'data');
    const appLogDir = path.join(userDataPath, 'logs');
    
    if (!fs.existsSync(appDataDir)) fs.mkdirSync(appDataDir, { recursive: true });
    if (!fs.existsSync(appLogDir)) fs.mkdirSync(appLogDir, { recursive: true });

    process.env.ZCTRL_DATA_DIR = appDataDir;
    process.env.ZCTRL_LOG_DIR = appLogDir;
    console.log('[Electron] User data directory configured:', appDataDir);

    // 1b. Register OS Keychain encryption IPC handlers (Windows DPAPI / macOS Keychain / Linux Secret Service)
    ipcMain.handle('zctrl:safe-storage-available', () => {
      try {
        return Boolean(safeStorage && safeStorage.isEncryptionAvailable());
      } catch {
        return false;
      }
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

    // 2. Resolve server port
    if (process.env.PORT) {
      SERVER_PORT = parseInt(process.env.PORT, 10) || 3000;
    } else {
      const is3000Free = await isPortAvailable(3000);
      if (is3000Free) {
        SERVER_PORT = 3000;
      } else {
        SERVER_PORT = await getFreePort();
        console.log(`[Electron] Port 3000 is occupied. Automatically bound to dynamic free port: ${SERVER_PORT}`);
      }
    }
    process.env.PORT = SERVER_PORT.toString();

    // 3. Start backend & wait until HTTP /api/ping is actually accepting requests (eliminates blank startup flash)
    await startBackendServer();
    const isServerReady = await waitForLocalServerReady(SERVER_PORT, 8000);
    console.log(`[Electron] Local backend ready=${isServerReady} on port ${SERVER_PORT}`);

    // 4. Create UI Window
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
    app.quit();
  }
});
