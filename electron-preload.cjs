const { contextBridge, ipcRenderer } = require('electron');

// Strict, minimal preload bridge for OS Keychain credential protection (Windows DPAPI / macOS Keychain / Linux Secret Service).
// Never exposes raw ipcRenderer, fs, or Node globals.
contextBridge.exposeInMainWorld('zctrlDesktopVault', {
  isDesktop: true,
  getPlatform: () => process.platform,
  isEncryptionAvailable: () => ipcRenderer.invoke('zctrl:safe-storage-available'),
  encryptSecret: (plainText) => ipcRenderer.invoke('zctrl:safe-storage-encrypt', plainText),
  decryptSecret: (cipherBase64) => ipcRenderer.invoke('zctrl:safe-storage-decrypt', cipherBase64),
  getVaultKeyStatus: () => ipcRenderer.invoke('zctrl:vault-key-status'),
  exportVaultKeyBackup: () => ipcRenderer.invoke('zctrl:export-vault-key')
});

contextBridge.exposeInMainWorld('zctrlDesktopPrint', {
  isDesktop: true,
  printToPdf: (payload) => ipcRenderer.invoke('zctrl:print-to-pdf', payload)
});

contextBridge.exposeInMainWorld('zctrlDesktopSession', {
  isDesktop: true,
  setActiveSession: (payload) => ipcRenderer.invoke('zctrl:set-active-session', payload),
  clearActiveSession: () => ipcRenderer.invoke('zctrl:clear-active-session'),
  restoreBackendSession: () => ipcRenderer.invoke('zctrl:restore-active-session'),
  retryBackend: () => ipcRenderer.invoke('zctrl:retry-backend'),
  onBackendRespawned: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = () => callback();
    ipcRenderer.on('zctrl:backend-respawned', handler);
    return () => ipcRenderer.removeListener('zctrl:backend-respawned', handler);
  },
  onBackendFailed: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('zctrl:backend-failed', handler);
    return () => ipcRenderer.removeListener('zctrl:backend-failed', handler);
  }
});
