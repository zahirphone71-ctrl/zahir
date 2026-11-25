import http from 'http';
import https from 'https';
import crypto from 'crypto';

export interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
  timeoutMs?: number;
  followRedirects?: boolean;
  maxRedirects?: number;
  signal?: AbortSignal;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

// Agent pool with keepAlive for socket reuse & performance
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 4,
  timeout: 10000,
  keepAliveMsecs: 5000
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 4,
  timeout: 10000,
  keepAliveMsecs: 5000,
  rejectUnauthorized: false // Allow self-signed certificates on APs
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

      const agent = targetUrl.protocol === 'https:' ? httpsAgent : httpAgent;

      const reqOpts: http.RequestOptions = {
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
        path: targetUrl.pathname + targetUrl.search,
        method: opts.method || 'GET',
        headers: {
          'Connection': 'keep-alive',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
          ...opts.headers
        },
        agent,
        timeout: timeoutMs + 2000
      };

      try {
        (reqOpts as any).signal = ac.signal;
      } catch {}

      const reqModule = targetUrl.protocol === 'https:' ? https : http;

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
