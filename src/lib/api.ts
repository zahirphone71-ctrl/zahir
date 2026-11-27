import { safeStorage } from '../utils/safeStorage';

/**
 * API Helper for fetching with dynamic base URL and credentials
 */
export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  const stored = safeStorage.getItem('zahir_api_url');
  if (stored && stored.trim()) {
    const clean = stored.trim().replace(/\/+$/, '');
    // Prevent accidental raw router IP (without http/https or on HTTPS web origin) from hijacking local API calls
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      safeStorage.removeItem('zahir_api_url');
      return '';
    }
    if (window.location.protocol === 'https:' && clean.startsWith('http://')) {
      safeStorage.removeItem('zahir_api_url');
      return '';
    }
    return clean;
  }
  return '';
}

export async function secureFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const customHeaders = new Headers(init?.headers || {});

  const token = safeStorage.getItem('zahir_auth_token');
  if (token && !customHeaders.has('Authorization')) {
    customHeaders.set('Authorization', `Bearer ${token}`);
  }

  const routerToken =
    safeStorage.getItem('zcontrol_active_token') ||
    safeStorage.getItem('zctrl_router_token');
  if (routerToken && !customHeaders.has('X-Router-Token')) {
    customHeaders.set('X-Router-Token', routerToken);
  }

  if (!customHeaders.has('X-Requested-With')) {
    customHeaders.set('X-Requested-With', 'XMLHttpRequest');
  }

  const baseUrl = getApiBaseUrl();
  let finalInput = input;
  if (baseUrl && typeof input === 'string' && input.startsWith('/')) {
    finalInput = `${baseUrl}${input}`;
  }

  const credentials = init?.credentials ?? 'same-origin';

  try {
    return await fetch(finalInput, {
      ...init,
      credentials,
      headers: customHeaders
    });
  } catch (err: any) {
    // If a custom baseUrl was configured and failed to fetch, automatically clear it and fall back to same-origin
    if (baseUrl && finalInput !== input && err?.name !== 'AbortError') {
      safeStorage.removeItem('zahir_api_url');
      return fetch(input, {
        ...init,
        credentials,
        headers: customHeaders
      });
    }
    throw err;
  }
}

export async function safeParseJson<T = any>(res: Response): Promise<T | null> {
  try {
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function apiRequest<T = any>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  const res = await secureFetch(input, init);
  const data = await safeParseJson<T>(res);
  if (!res.ok) {
    const serverMsg = (data as any)?.message || (data as any)?.error;
    return {
      ok: false,
      status: res.status,
      data,
      error: serverMsg || `فشل الطلب (رمز الاستجابة: ${res.status})`
    };
  }
  return { ok: true, status: res.status, data };
}
