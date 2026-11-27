import http from 'http';
import https from 'https';
import net from 'net';
import tls from 'tls';
import crypto from 'crypto';
import { tlsPinStore, type TlsPinStore } from '../tlsPinStore.ts';
import { appLogger } from '../rotatingLogger.ts';

export interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
  timeoutMs?: number;
  followRedirects?: boolean;
  maxRedirects?: number;
  signal?: AbortSignal;
  strictTls?: boolean;
  tlsFingerprint?: string;
  trustOnFirstUse?: boolean;
  pinStore?: TlsPinStore;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

// Agent pool with keepAlive for HTTP socket reuse & performance
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 4,
  timeout: 10000,
  keepAliveMsecs: 5000
});

export function buildUrl(urlStr: string): URL {
  if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://')) {
    return new URL(`http://${urlStr}`);
  }
  return new URL(urlStr);
}

export function httpRequest(urlStr: string, opts: HttpRequestOptions = {}): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const followRedirects = opts.followRedirects !== false;
    const maxRedirects = opts.maxRedirects || 3;
    const timeoutMs = opts.timeoutMs || 8000;

    const attempt = (targetUrl: URL, redirectCount: number) => {
      if (redirectCount > maxRedirects) {
        return reject(new Error(`Too many redirects (max ${maxRedirects})`));
      }

      let aborted = false;
      const ac = new AbortController();

      const onExternalAbort = () => {
        aborted = true;
        ac.abort();
      };

      if (opts.signal) {
        if (opts.signal.aborted) {
          return reject(new Error('Request aborted'));
        }
        opts.signal.addEventListener('abort', onExternalAbort, { once: true });
      }

      const timer = setTimeout(() => {
        aborted = true;
        ac.abort();
      }, timeoutMs);

      const isHttps = targetUrl.protocol === 'https:';
      const targetPort = Number(targetUrl.port) || (isHttps ? 443 : 80);

      const reqOpts: https.RequestOptions = {
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port: targetPort,
        path: targetUrl.pathname + targetUrl.search,
        method: opts.method || 'GET',
        headers: {
          'Connection': isHttps ? 'close' : 'keep-alive',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
          ...opts.headers
        },
        agent: isHttps ? undefined : httpAgent,
        timeout: timeoutMs + 2000
      };

      if (isHttps) {
        const pinStore = opts.pinStore || tlsPinStore;
        const strictTls = opts.strictTls !== false;
        const trustOnFirstUse = opts.trustOnFirstUse === true;
        const pinnedAgent = new https.Agent({ keepAlive: false, rejectUnauthorized: false });
        pinnedAgent.createConnection = ((_options: any, onCreated?: (err: Error | null, socket?: any) => void) => {
          const sock = tls.connect({
            host: targetUrl.hostname,
            port: targetPort,
            servername: net.isIP(targetUrl.hostname) ? undefined : targetUrl.hostname,
            rejectUnauthorized: false,
            timeout: timeoutMs
          });

          let settled = false;
          const finishError = (err: Error) => {
            if (settled) return;
            settled = true;
            try {
              sock.destroy(err);
            } catch (sockErr) {
              appLogger.warn('httpUtil', 'Failed to destroy TLS socket cleanly', {
                error: sockErr instanceof Error ? sockErr.message : String(sockErr)
              });
            }
            if (onCreated) onCreated(err);
          };

          const onAbort = () => finishError(new Error('Request aborted during TLS handshake'));
          ac.signal.addEventListener('abort', onAbort, { once: true });

          sock.once('secureConnect', () => {
            ac.signal.removeEventListener('abort', onAbort);
            if (settled) return;
            try {
              const peerCert = typeof sock.getPeerCertificate === 'function' ? sock.getPeerCertificate() : null;
              const actualFp = peerCert?.fingerprint256 ? String(peerCert.fingerprint256) : '';
              const certText = (v: string | string[] | undefined): string | undefined =>
                Array.isArray(v) ? v[0] : v;
              const pinKey = `ap:${targetUrl.hostname}:${targetPort}`;
              const verifyResult = pinStore.verifyOrTofu(pinKey, actualFp, {
                expectedFingerprint: opts.tlsFingerprint,
                strictTls,
                trustOnFirstUse,
                subject: certText(peerCert?.subject?.CN),
                issuer: certText(peerCert?.issuer?.CN)
              });

              if (!verifyResult.ok) {
                if (verifyResult.reason === 'untrusted_tofu' && sock.authorized) {
                  pinStore.setPin(pinKey, actualFp, {
                    subject: certText(peerCert?.subject?.CN),
                    issuer: certText(peerCert?.issuer?.CN)
                  });
                } else {
                  const errMsg =
                    verifyResult.reason === 'mismatch'
                      ? `TLS fingerprint mismatch for ${targetUrl.hostname}:${targetPort} (expected ${verifyResult.pinnedFingerprint || ''}, got ${actualFp})`
                      : `Untrusted TLS certificate for ${targetUrl.hostname}:${targetPort} (${actualFp || 'missing'})`;
                  if (verifyResult.reason === 'mismatch') {
                    appLogger.error('security', 'AP HTTPS TLS fingerprint mismatch detected', {
                      host: targetUrl.hostname,
                      port: targetPort,
                      expected: verifyResult.pinnedFingerprint,
                      actual: actualFp
                    });
                  }
                  const err: any = new Error(errMsg);
                  err.code = verifyResult.reason === 'mismatch' ? 'TLS_FINGERPRINT_MISMATCH' : 'TLS_UNTRUSTED_TOFU';
                  err.actualFingerprint = actualFp;
                  err.pinnedFingerprint = verifyResult.pinnedFingerprint;
                  finishError(err);
                  return;
                }
              }

              settled = true;
              if (onCreated) onCreated(null, sock);
            } catch (err: any) {
              finishError(err);
            }
          });

          sock.once('error', (err) => {
            ac.signal.removeEventListener('abort', onAbort);
            finishError(err);
          });

          return undefined as any;
        }) as typeof pinnedAgent.createConnection;
        reqOpts.agent = pinnedAgent;
      }

      try {
        (reqOpts as any).signal = ac.signal;
      } catch (signalErr) {
        appLogger.warn('httpUtil', 'Failed to bind AbortSignal to HTTP request options', {
          error: signalErr instanceof Error ? signalErr.message : String(signalErr)
        });
      }

      const reqModule = isHttps ? https : http;

      const req = reqModule.request(reqOpts, (res) => {
        if (aborted) {
          res.resume();
          return;
        }

        if (
          followRedirects &&
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location &&
          redirectCount < maxRedirects
        ) {
          let loc = res.headers.location;
          if (!loc.startsWith('http')) {
            loc = `${targetUrl.protocol}//${targetUrl.host}${loc.startsWith('/') ? '' : '/'}${loc}`;
          }
          res.resume();
          clearTimeout(timer);
          if (opts.signal) {
            opts.signal.removeEventListener('abort', onExternalAbort);
          }
          try {
            attempt(new URL(loc), redirectCount + 1);
          } catch (err) {
            reject(err);
          }
          return;
        }

        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          body += chunk;
        });

        res.on('end', () => {
          clearTimeout(timer);
          if (opts.signal) {
            opts.signal.removeEventListener('abort', onExternalAbort);
          }
          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (v !== undefined) {
              headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
            }
          }
          resolve({
            status: res.statusCode || 0,
            headers,
            body
          });
        });
      });

      req.on('error', (err: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        if (opts.signal) {
          opts.signal.removeEventListener('abort', onExternalAbort);
        }
        if (err.name === 'AbortError' || aborted) {
          reject(new Error('timeout'));
        } else {
          reject(err);
        }
      });

      if (opts.body) {
        req.write(opts.body);
      }
      req.end();
    };

    try {
      attempt(buildUrl(urlStr), 0);
    } catch (e) {
      reject(e);
    }
  });
}

/** إنشاء AbortController مرتبط بـ Express request (إصلاح 10) */
export function createRequestAbortController(req: http.IncomingMessage): AbortController {
  const ac = new AbortController();
  req.on('close', () => {
    ac.abort();
  });
  return ac;
}

export function parseJson<T = any>(text: string): T | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function extractFromHtml(html: string, regex: RegExp): string | null {
  const m = html.match(regex);
  return m?.[1] || null;
}

export function extractCookie(header: string | undefined): string {
  if (!header) return '';
  return header
    .split(',')
    .map((c) => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}
