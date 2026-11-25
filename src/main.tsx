import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// Global Resilience: Prevent unhandled rejections or benign extension/window errors from unmounting React DOM
if (typeof window !== 'undefined') {
  // 1. Ensure Event.prototype.target always returns a valid object (fallback to window) to prevent React DOM getEventTarget nodeType TypeError
  try {
    const origTargetDesc = Object.getOwnPropertyDescriptor(Event.prototype, 'target');
    if (origTargetDesc && origTargetDesc.get) {
      const origGet = origTargetDesc.get;
      Object.defineProperty(Event.prototype, 'target', {
        get: function() {
          const t = origGet.call(this);
          return t != null ? t : window;
        },
        configurable: true,
        enumerable: true
      });
    }
  } catch (e) {
    // Ignore property descriptor errors
  }

  // 2. Ensure window.fetch remains writable and resilient for /api/* requests across Web & Electron (file://)
  try {
    const rawFetch = window.fetch.bind(window);
    const resilientFetch: typeof window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      let targetInput = input;
      const isStringInput = typeof input === 'string';
      const isApiPath = isStringInput && (input.startsWith('/api/') || input === '/api');

      if (isApiPath && window.location.protocol === 'file:') {
        const params = new URLSearchParams(window.location.search);
        const port = params.get('port') || '3000';
        targetInput = `http://127.0.0.1:${port}${input}`;
      }

      try {
        return await rawFetch(targetInput, init);
      } catch (err: any) {
        if (err?.name === 'AbortError' || init?.signal?.aborted) {
          throw err;
        }
        // Automatic fast retry on transient local server startup/restart hiccup for /api/* calls
        if (isApiPath) {
          await new Promise((r) => setTimeout(r, 450));
          if (init?.signal?.aborted) throw err;
          return await rawFetch(targetInput, init);
        }
        throw err;
      }
    };

    Object.defineProperty(window, 'fetch', {
      value: resilientFetch,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  } catch (e) {
    // Ignore property descriptor errors
  }

  window.addEventListener('unhandledrejection', (event) => {
    const reasonStr = String(event.reason?.message || event.reason || '');
    if (
      reasonStr.includes('WebSocket') ||
      reasonStr.includes('vite') ||
      reasonStr.includes('closed without opening') ||
      reasonStr.includes('nodeType')
    ) {
      event.preventDefault();
      return;
    }
    console.warn('[ZCtrl Global Trapper] Prevented unhandled rejection from crashing UI:', event.reason);
    event.preventDefault();
  });

  window.addEventListener('error', (event) => {
    const msg = event.message || '';
    if (
      msg.includes('ResizeObserver') ||
      msg.includes('Script error') ||
      msg.includes('NetworkError') ||
      msg.includes('Failed to fetch') ||
      msg.includes('Cannot set property fetch') ||
      msg.includes('chrome-extension') ||
      msg.includes('WebSocket') ||
      msg.includes('closed without opening') ||
      msg.includes('nodeType') ||
      msg.includes('getEventTarget')
    ) {
      event.preventDefault();
      return;
    }
    console.warn('[ZCtrl Global Trapper] Prevented window error from crashing UI:', event.error || event.message);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary isInline={false} fallbackTitle="خطأ في بدء تشغيل برنامج ZCtrl">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
