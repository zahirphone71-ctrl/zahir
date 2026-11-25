import { secureFetch, safeParseJson } from '../lib/api';

function getEndpoint(serviceType: string, id?: string): string {
  const cleanType = (serviceType || 'hotspot').toLowerCase();
  let base = '/api/mikrotik/hotspot/profiles';
  if (cleanType === 'pppoe' || cleanType === 'ppp') {
    base = '/api/mikrotik/ppp/profiles';
  } else if (cleanType === 'userman' || cleanType === 'user-manager') {
    base = '/api/mikrotik/userman/profiles';
  }
  return id ? `${base}/${encodeURIComponent(id)}` : base;
}

async function safeParseResponse(res: Response): Promise<{ success: boolean; message?: string; [key: string]: any }> {
  const json = await safeParseJson<{ success?: boolean; message?: string; [key: string]: any }>(res);
  if (json) {
    if (!res.ok && json.success === undefined) {
      return { ...json, success: false, message: json.message || `فشل السيرفر في تنفيذ العملية (رمز الاستجابة: ${res.status})` };
    }
    return { success: res.ok && json.success !== false, ...json };
  }
  if (!res.ok) {
    return { success: false, message: `فشل السيرفر في تنفيذ العملية (رمز الاستجابة: ${res.status})` };
  }
  return { success: false, message: 'استجابة غير صالحة من السيرفر' };
}

export const routerProfilesApi = {
  create: async (data: any, signal?: AbortSignal) => {
    const serviceType = data.serviceType || 'hotspot';
    const profilePayload = {
      ...(data.profileData || {}),
      ...data,
      serviceType
    };
    const endpoint = getEndpoint(serviceType);

    try {
      const res = await secureFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profilePayload),
        signal,
        credentials: 'include'
      });
      return await safeParseResponse(res);
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
      return { success: false, message: err?.message || 'فشلت معالجة استجابة السيرفر' };
    }
  },

  update: async (data: any, signal?: AbortSignal) => {
    const serviceType = data.serviceType || 'hotspot';
    const profilePayload = {
      ...(data.profileData || {}),
      ...data,
      serviceType
    };
    const rawId = String(data.id || profilePayload.id || '').trim();
    const targetId =
      rawId.startsWith('*')
        ? rawId
        : (data.oldName || data.name || rawId || profilePayload.oldName || profilePayload.name);
    const endpoint = getEndpoint(serviceType, targetId);

    try {
      const res = await secureFetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profilePayload),
        signal,
        credentials: 'include'
      });
      return await safeParseResponse(res);
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
      return { success: false, message: err?.message || 'فشلت معالجة استجابة السيرفر' };
    }
  },

  delete: async (
    serviceType: 'hotspot' | 'pppoe' | 'userman',
    idOrName: string,
    profileNameOrSignal?: string | AbortSignal,
    maybeSignal?: AbortSignal
  ) => {
    const profileName = typeof profileNameOrSignal === 'string' ? profileNameOrSignal : idOrName;
    const signal = typeof profileNameOrSignal === 'string' ? maybeSignal : profileNameOrSignal;
    const urlKey = String(idOrName || profileName).trim();
    const endpoint = getEndpoint(serviceType, urlKey);

    try {
      const res = await secureFetch(endpoint, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceType,
          id: urlKey,
          profileName: String(profileName || urlKey).trim()
        }),
        signal,
        credentials: 'include'
      });
      return await safeParseResponse(res);
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
      return { success: false, message: err?.message || 'فشلت معالجة استجابة السيرفر' };
    }
  }
};
