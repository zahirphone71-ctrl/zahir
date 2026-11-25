/**
 * Universal safe print and export helper for ZCtrl.
 * Avoids window.open popup blocker issues in iframe and sandbox environments
 * by using a sandboxed/hidden <iframe> or direct document download.
 */

export const printHtmlSafely = async (
  html: string,
  options: {
    fileName?: string;
    onFallbackDownload?: () => void;
    onError?: (err: any) => void;
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {}
): Promise<boolean> => {
  const { fileName = 'print-document.html', onFallbackDownload, onError, signal, timeoutMs = 10000 } = options;

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  return new Promise((resolve) => {
    let timer: any = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
    };

    if (signal) {
      signal.addEventListener('abort', () => {
        cleanup();
        resolve(false);
      }, { once: true });
    }

    timer = setTimeout(() => {
      console.warn('[printHtmlSafely] Print timeout reached, triggering download fallback');
      downloadHtmlSafely(html, fileName);
      if (onFallbackDownload) onFallbackDownload();
      resolve(true);
    }, timeoutMs);

    try {
      const oldFrame = document.getElementById('zctrl-print-iframe');
      if (oldFrame) {
        oldFrame.remove();
      }

      const iframe = document.createElement('iframe');
      iframe.id = 'zctrl-print-iframe';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.visibility = 'hidden';
      iframe.setAttribute('aria-hidden', 'true');
      document.body.appendChild(iframe);

      const frameDoc = iframe.contentWindow?.document;
      if (!frameDoc || !iframe.contentWindow) {
        cleanup();
        downloadHtmlSafely(html, fileName);
        if (onFallbackDownload) onFallbackDownload();
        resolve(true);
        return;
      }

      frameDoc.open();
      frameDoc.write(html);
      frameDoc.close();

      const triggerPrint = () => {
        cleanup();
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          resolve(true);
        } catch (printErr) {
          console.warn('[printHtmlSafely] iframe print was blocked or failed, downloading HTML:', printErr);
          downloadHtmlSafely(html, fileName);
          if (onFallbackDownload) onFallbackDownload();
          resolve(true);
        }
      };

      if (frameDoc.readyState === 'complete') {
        setTimeout(triggerPrint, 350);
      } else {
        iframe.onload = () => {
          setTimeout(triggerPrint, 350);
        };
        setTimeout(triggerPrint, 700);
      }
    } catch (err) {
      cleanup();
      console.error('[printHtmlSafely] Error initiating print:', err);
      downloadHtmlSafely(html, fileName);
      if (onError) onError(err);
      resolve(false);
    }
  });
};

export const downloadHtmlSafely = (html: string, fileName: string = 'document.html'): void => {
  try {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName.endsWith('.html') ? fileName : `${fileName}.html`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (document.body.contains(a)) document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  } catch (err) {
    console.error('[downloadHtmlSafely] Failed to download HTML file:', err);
  }
};
