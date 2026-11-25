const { contextBridge, ipcRenderer } = require('electron');

// Strict, minimal preload bridge for OS Keychain credential protection (Windows DPAPI / macOS Keychain / Linux Secret Service).
// Never exposes raw ipcRenderer, fs, or Node globals.
contextBridge.exposeInMainWorld('zctrlDesktopVault', {
  isDesktop: true,
  getPlatform: () => process.platform,
  isEncryptionAvailable: () => ipcRenderer.invoke('zctrl:safe-storage-available'),
  encryptSecret: (plainText) => ipcRenderer.invoke('zctrl:safe-storage-encrypt', plainText),
  decryptSecret: (cipherBase64) => ipcRenderer.invoke('zctrl:safe-storage-decrypt', cipherBase64)
});
