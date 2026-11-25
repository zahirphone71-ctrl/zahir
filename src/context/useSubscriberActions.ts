import React from 'react';
import type {
  HotspotUser,
  HotspotProfile,
  PPPSecret,
  PPPProfile,
  UsermanUser,
  UsermanProfile
} from '../types/mikrotik';
import type { ShowToastFn } from './mikrotikContextTypes';

export interface SubscriberActionsDeps {
  fetchWithToken: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  showToast: ShowToastFn;
  syncNow: (force?: boolean) => Promise<void>;
  refreshProfiles: (systemType?: 'hotspot' | 'pppoe' | 'userman') => Promise<void>;
  runWorkerTask: (type: string, payload: any) => Promise<any>;
  setUsers: React.Dispatch<React.SetStateAction<HotspotUser[]>>;
  setProfiles: React.Dispatch<React.SetStateAction<HotspotProfile[]>>;
  setPppSecrets: React.Dispatch<React.SetStateAction<PPPSecret[]>>;
  setPppProfiles: React.Dispatch<React.SetStateAction<PPPProfile[]>>;
  setUsermanUsers: React.Dispatch<React.SetStateAction<UsermanUser[]>>;
  setUsermanProfiles: React.Dispatch<React.SetStateAction<UsermanProfile[]>>;
  setSelectedUsersForPrint: (users: HotspotUser[]) => void;
}

export function useSubscriberActions(deps: SubscriberActionsDeps) {
  const {
    fetchWithToken,
    showToast,
    syncNow,
    refreshProfiles,
    runWorkerTask,
    setUsers,
    setProfiles,
    setPppSecrets,
    setPppProfiles,
    setUsermanUsers,
    setUsermanProfiles,
    setSelectedUsersForPrint
  } = deps;

  const addUser = async (user: Partial<HotspotUser>) => {
    try {
      const res = await fetchWithToken('/api/mikrotik/hotspot/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user)
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        await syncNow(true);
        return { success: true, message: data.message };
      } else {
        showToast(data.message, 'error');
        return { success: false, message: data.message };
      }
    } catch (err: any) {
      showToast('حدث خطأ أثناء إضافة المستخدم', 'error');
      return { success: false, message: err.message };
    }
  };

  const updateUser = async (id: string, updates: Partial<HotspotUser>, skipSync?: boolean) => {
    try {
      const res = await fetchWithToken(`/api/mikrotik/hotspot/users/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (data.success) {
        setUsers((prev) =>
          prev.map((u) => {
            if (u.id === id || (u as any)['.id'] === id || u.name === id || (updates.name && u.name === updates.name)) {
              return { ...u, ...updates };
            }
            return u;
          })
        );
        if (!skipSync) {
          showToast(data.message, 'success');
          syncNow(true).catch(() => {});
        }
        return { success: true, message: data.message };
      } else {
        showToast(data.message, 'error');
        return { success: false, message: data.message };
      }
    } catch (err: any) {
      showToast('تعذر تحديث بيانات المستخدم', 'error');
      return { success: false, message: err.message };
    }
  };

  const deleteUser = async (id: string) => {
    try {
      const res = await fetchWithToken(`/api/mikrotik/hotspot/users/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setUsers((prev) => prev.filter((u) => u.id !== id && (u as any)['.id'] !== id && u.name?.toLowerCase() !== id.toLowerCase()));
        showToast(data.message, 'success');
        syncNow(true).catch(() => {});
        return { success: true, message: data.message };
      } else {
        showToast(data.message, 'error');
        return { success: false, message: data.message };
      }
    } catch (err: any) {
      showToast('تعذر حذف المستخدم', 'error');
      return { success: false, message: err.message };
    }
  };

  const batchSubscriberAction = async (params: {
    system: 'hotspot' | 'pppoe' | 'userman';
    action: 'delete' | 'change_profile' | 'renew' | 'toggle_status' | 'disconnect' | 'edit';
    ids: string[];
    payload?: any;
  }): Promise<{ success: boolean; message: string; count?: number }> => {
    if (!params.ids || params.ids.length === 0) {
      return { success: false, message: 'لم يتم تحديد أي مشترك' };
    }
    try {
      const batchBatches = await runWorkerTask('PREPARE_BATCH_PAYLOAD', {
        ids: params.ids,
        action: params.action,
        value: params.payload,
        payload: params.payload,
        system: params.system
      });

      let totalCount = 0;
      let lastMessage = '';

      for (const batchParams of batchBatches) {
        const effectiveBatchPayload =
          batchParams.payload !== undefined ? batchParams.payload : batchParams.value !== undefined ? batchParams.value : params.payload;
        const res = await fetchWithToken('/api/mikrotik/subscribers/batch-action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system: batchParams.system || params.system,
            action: batchParams.action || params.action,
            ids: batchParams.ids,
            payload: effectiveBatchPayload,
            value: effectiveBatchPayload
          })
        });
        const data = await res.json();
        if (data.success) {
          totalCount += data.count !== undefined ? data.count : batchParams.ids.length;
          lastMessage = data.message || lastMessage;
        } else {
          throw new Error(data.message || 'فشلت معالجة إحدى الدفعات على المايكروتك');
        }
      }

      showToast(lastMessage || 'تمت العملية الجماعية بنجاح', 'success');
      const idSet = new Set(params.ids);
      if (params.action === 'delete') {
        if (params.system === 'hotspot') {
          setUsers((prev) => prev.filter((u) => !idSet.has(u.id) && !idSet.has((u as any)['.id']) && !idSet.has(u.name)));
        } else if (params.system === 'pppoe') {
          setPppSecrets((prev) => prev.filter((s) => !idSet.has(s.id) && !idSet.has((s as any)['.id']) && !idSet.has(s.name)));
        } else if (params.system === 'userman') {
          setUsermanUsers((prev) => prev.filter((u) => !idSet.has(u.id) && !idSet.has((u as any)['.id']) && !idSet.has(u.name)));
        }
      } else if (params.action === 'change_profile') {
        const newProfile = params.payload?.profile;
        if (newProfile) {
          if (params.system === 'hotspot') {
            setUsers((prev) => prev.map((u) => (idSet.has(u.id) || idSet.has((u as any)['.id']) || idSet.has(u.name) ? { ...u, profile: newProfile } : u)));
          } else if (params.system === 'pppoe') {
            setPppSecrets((prev) => prev.map((s) => (idSet.has(s.id) || idSet.has((s as any)['.id']) || idSet.has(s.name) ? { ...s, profile: newProfile } : s)));
          } else if (params.system === 'userman') {
            setUsermanUsers((prev) => prev.map((u) => (idSet.has(u.id) || idSet.has((u as any)['.id']) || idSet.has(u.name) ? { ...u, profile: newProfile } : u)));
          }
        }
      } else if (params.action === 'toggle_status') {
        const disabled = !params.payload?.enable;
        if (params.system === 'hotspot') {
          setUsers((prev) => prev.map((u) => (idSet.has(u.id) || idSet.has((u as any)['.id']) || idSet.has(u.name) ? { ...u, disabled } : u)));
        } else if (params.system === 'pppoe') {
          setPppSecrets((prev) => prev.map((s) => (idSet.has(s.id) || idSet.has((s as any)['.id']) || idSet.has(s.name) ? { ...s, disabled } : s)));
        } else if (params.system === 'userman') {
          setUsermanUsers((prev) => prev.map((u) => (idSet.has(u.id) || idSet.has((u as any)['.id']) || idSet.has(u.name) ? { ...u, disabled } : u)));
        }
      } else if (params.action === 'renew') {
        if (params.system === 'hotspot') {
          setUsers((prev) =>
            prev.map((u) =>
              idSet.has(u.id) || idSet.has((u as any)['.id']) || idSet.has(u.name)
                ? { ...u, uptime: '0s', bytesIn: 0, bytesOut: 0, disabled: false }
                : u
            )
          );
        } else if (params.system === 'pppoe') {
          setPppSecrets((prev) =>
            prev.map((s) => (idSet.has(s.id) || idSet.has((s as any)['.id']) || idSet.has(s.name) ? { ...s, disabled: false } : s))
          );
        } else if (params.system === 'userman') {
          setUsermanUsers((prev) =>
            prev.map((u) =>
              idSet.has(u.id) || idSet.has((u as any)['.id']) || idSet.has(u.name)
                ? { ...u, uptime: '0s', bytesIn: 0, bytesOut: 0, disabled: false }
                : u
            )
          );
        }
      } else if (params.action === 'edit' && params.payload) {
        const cleanPayload = Object.fromEntries(Object.entries(params.payload).filter(([, v]) => v !== undefined));
        if (params.system === 'hotspot') {
          setUsers((prev) => prev.map((u) => (idSet.has(u.id) || idSet.has((u as any)['.id']) || idSet.has(u.name) ? { ...u, ...cleanPayload } : u)));
        } else if (params.system === 'pppoe') {
          setPppSecrets((prev) => prev.map((s) => (idSet.has(s.id) || idSet.has((s as any)['.id']) || idSet.has(s.name) ? { ...s, ...cleanPayload } : s)));
        } else if (params.system === 'userman') {
          setUsermanUsers((prev) => prev.map((u) => (idSet.has(u.id) || idSet.has((u as any)['.id']) || idSet.has(u.name) ? { ...u, ...cleanPayload } : u)));
        }
      }
      await syncNow(true);
      return { success: true, message: lastMessage || 'تمت العملية الجماعية بنجاح', count: totalCount };
    } catch (err: any) {
      showToast(err?.message || 'تعذر إكمال العملية الجماعية. تحقق من الاتصال بالراوتر', 'error');
      return { success: false, message: err?.message || 'خطأ في الاتصال' };
    }
  };

  const batchDeleteUsers = async (ids: string[]) => batchSubscriberAction({ system: 'hotspot', action: 'delete', ids });
  const batchDeletePPPSecrets = async (ids: string[]) => batchSubscriberAction({ system: 'pppoe', action: 'delete', ids });
  const batchDeleteUsermanUsers = async (ids: string[]) => batchSubscriberAction({ system: 'userman', action: 'delete', ids });

  const generateVoucherBatch = async (params: any) => {
    try {
      const res = await fetchWithToken('/api/mikrotik/hotspot/cards/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        await syncNow();
        if (data.users && data.users.length > 0) {
          setSelectedUsersForPrint(data.users);
        }
        return { success: true, message: data.message, batchId: data.batchId, users: data.users };
      } else {
        showToast(data.message, 'error');
        return { success: false, message: data.message };
      }
    } catch (err: any) {
      showToast('فشل توليد الكروت', 'error');
      return { success: false, message: err.message };
    }
  };

  const addProfile = async (prof: Partial<HotspotProfile>) => {
    try {
      const res = await fetchWithToken('/api/mikrotik/hotspot/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prof)
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        if (data.profile) {
          setProfiles((prev) => [...prev.filter((p) => p.name !== data.profile.name), data.profile]);
        } else {
          setProfiles((prev) => [
            ...prev.filter((p) => p.name !== prof.name),
            { id: prof.name || 'new', name: prof.name || '', sharedUsers: prof.sharedUsers || 1, startsAt: prof.startsAt || 'first-login', ...prof } as any
          ]);
        }
        refreshProfiles('hotspot').catch(() => {});
        return { success: true, message: data.message };
      } else {
        showToast(data.message, 'error');
        return { success: false, message: data.message };
      }
    } catch (err: any) {
      showToast('تعذر إضافة البروفايل', 'error');
      return { success: false, message: err.message };
    }
  };

  const updateProfile = async (id: string, updates: Partial<HotspotProfile>) => {
    try {
      const res = await fetchWithToken(`/api/mikrotik/hotspot/profiles/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        setProfiles((prev) => prev.map((p) => (p.id === id || p.name === id ? { ...p, ...updates } : p)));
        refreshProfiles('hotspot').catch(() => {});
        return { success: true, message: data.message };
      } else {
        showToast(data.message, 'error');
        return { success: false, message: data.message };
      }
    } catch (err: any) {
      showToast('تعذر تحديث البروفايل', 'error');
      return { success: false, message: err.message };
    }
  };

  const deleteProfile = async (id: string) => {
    try {
      const res = await fetchWithToken(`/api/mikrotik/hotspot/profiles/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        setProfiles((prev) => prev.filter((p) => p.id !== id && p.name !== id));
        refreshProfiles('hotspot').catch(() => {});
        return { success: true, message: data.message };
      } else {
        showToast(data.message, 'error');
        return { success: false, message: data.message };
      }
    } catch (err: any) {
      showToast('تعذر حذف البروفايل', 'error');
      return { success: false, message: err.message };
    }
  };

  const kickUser = async (id: string, username: string, skipSync?: boolean) => {
    try {
      const res = await fetchWithToken('/api/mikrotik/hotspot/active/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, user: username })
      });
      const data = await res.json();
      if (data.success) {
        if (!skipSync) {
          showToast(data.message, 'info');
          await syncNow(true);
        }
        return { success: true, message: data.message };
      }
      if (!skipSync) showToast(data.message || 'تعذر فصل المستخدم', 'error');
      return { success: false, message: data.message };
    } catch (e: any) {
      if (!skipSync) showToast('تعذر فصل المستخدم', 'error');
      return { success: false, message: e.message };
    }
  };

  const addPPPSecret = async (secret: Partial<PPPSecret>) => {
    try {
      const res = await fetchWithToken('/api/mikrotik/ppp/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(secret)
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        await syncNow(true);
        return { success: true, message: data.message };
      }
      showToast(data.message || 'تعذر إضافة مشترك البرودباند', 'error');
      return { success: false, message: data.message };
    } catch (e: any) {
      showToast('تعذر إضافة مشترك البرودباند', 'error');
      return { success: false, message: e.message };
    }
  };

  const updatePPPSecret = async (id: string, updates: Partial<PPPSecret>, skipSync?: boolean) => {
    try {
      const res = await fetchWithToken(`/api/mikrotik/ppp/secrets/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (data.success) {
        setPppSecrets((prev) =>
          prev.map((s) => {
            if (s.id === id || (s as any)['.id'] === id || s.name === id || (updates.name && s.name === updates.name)) {
              return { ...s, ...updates };
            }
            return s;
          })
        );
        if (!skipSync) {
          showToast(data.message, 'success');
          syncNow(true).catch(() => {});
        }
        return { success: true, message: data.message };
      }
      if (!skipSync) showToast(data.message || 'تعذر تحديث بيانات مشترك البرودباند', 'error');
      return { success: false, message: data.message };
    } catch (e: any) {
      if (!skipSync) showToast('تعذر تحديث بيانات مشترك البرودباند', 'error');
      return { success: false, message: e.message };
    }
  };

  const deletePPPSecret = async (id: string, skipSync?: boolean) => {
    try {
      const res = await fetchWithToken(`/api/mikrotik/ppp/secrets/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setPppSecrets((prev) => prev.filter((s) => s.id !== id && (s as any)['.id'] !== id && s.name?.toLowerCase() !== id.toLowerCase()));
        if (!skipSync) {
          showToast(data.message, 'success');
          syncNow(true).catch(() => {});
        }
        return { success: true, message: data.message };
      }
      if (!skipSync) showToast(data.message || 'تعذر حذف مشترك البرودباند', 'error');
      return { success: false, message: data.message };
    } catch (e: any) {
      if (!skipSync) showToast('تعذر حذف مشترك البرودباند', 'error');
      return { success: false, message: e.message };
    }
  };

  const addPPPProfile = async (profile: Partial<PPPProfile>) => {
    try {
      const res = await fetchWithToken('/api/mikrotik/ppp/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        if (data.profile) {
          setPppProfiles((prev) => [...prev.filter((p) => p.name !== data.profile.name), data.profile]);
        } else {
          setPppProfiles((prev) => [
            ...prev.filter((p) => p.name !== profile.name),
            { id: profile.name || 'new', name: profile.name || '', sharedUsers: profile.sharedUsers || 1, startsAt: profile.startsAt || 'first-login', ...profile } as any
          ]);
        }
        refreshProfiles('pppoe').catch(() => {});
        return { success: true, message: data.message };
      }
      return { success: false, message: data.message };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const updatePPPProfile = async (id: string, updates: Partial<PPPProfile>) => {
    try {
      const res = await fetchWithToken(`/api/mikrotik/ppp/profiles/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        setPppProfiles((prev) => prev.map((p) => (p.id === id || p.name === id ? { ...p, ...updates } : p)));
        refreshProfiles('pppoe').catch(() => {});
        return { success: true, message: data.message };
      }
      return { success: false, message: data.message };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const deletePPPProfile = async (id: string) => {
    try {
      const res = await fetchWithToken(`/api/mikrotik/ppp/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        setPppProfiles((prev) => prev.filter((p) => p.id !== id && p.name !== id));
        refreshProfiles('pppoe').catch(() => {});
        return { success: true, message: data.message };
      }
      return { success: false, message: data.message };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const disconnectPPPActive = async (id: string, username: string, skipSync?: boolean) => {
    try {
      const res = await fetchWithToken('/api/mikrotik/ppp/active/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: username })
      });
      const data = await res.json();
      if (data.success) {
        if (!skipSync) {
          showToast(data.message, 'info');
          await syncNow(true);
        }
        return { success: true, message: data.message };
      }
      if (!skipSync) showToast(data.message || 'تعذر فصل جلسة PPPoE', 'error');
      return { success: false, message: data.message };
    } catch (e: any) {
      if (!skipSync) showToast('تعذر فصل جلسة PPPoE', 'error');
      return { success: false, message: e.message };
    }
  };

  const addUsermanUser = async (user: Partial<UsermanUser>) => {
    try {
      const res = await fetchWithToken('/api/mikrotik/userman/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user)
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        await syncNow(true);
        return { success: true, message: data.message };
      }
      showToast(data.message || 'تعذر إضافة مشترك اليوزر مانجر', 'error');
      return { success: false, message: data.message };
    } catch (e: any) {
      showToast('تعذر إضافة مشترك اليوزر مانجر', 'error');
      return { success: false, message: e.message };
    }
  };

  const updateUsermanUser = async (id: string, updates: Partial<UsermanUser>, skipSync?: boolean) => {
    try {
      const res = await fetchWithToken(`/api/mikrotik/userman/users/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (data.success) {
        setUsermanUsers((prev) =>
          prev.map((u) => {
            if (u.id === id || (u as any)['.id'] === id || u.name === id || (updates.name && u.name === updates.name)) {
              return { ...u, ...updates };
            }
            return u;
          })
        );
        if (!skipSync) {
          showToast(data.message, 'success');
          syncNow(true).catch(() => {});
        }
        return { success: true, message: data.message };
      }
      if (!skipSync) showToast(data.message || 'تعذر تحديث بيانات مشترك اليوزر مانجر', 'error');
      return { success: false, message: data.message };
    } catch (e: any) {
      if (!skipSync) showToast('تعذر تحديث بيانات مشترك اليوزر مانجر', 'error');
      return { success: false, message: e.message };
    }
  };

  const deleteUsermanUser = async (id: string) => {
    try {
      const res = await fetchWithToken(`/api/mikrotik/userman/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setUsermanUsers((prev) => prev.filter((u) => u.id !== id && (u as any)['.id'] !== id && u.name?.toLowerCase() !== id.toLowerCase()));
        showToast(data.message, 'success');
        syncNow(true).catch(() => {});
        return { success: true, message: data.message };
      }
      showToast(data.message || 'تعذر حذف مشترك اليوزر مانجر', 'error');
      return { success: false, message: data.message };
    } catch (e: any) {
      showToast('تعذر حذف مشترك اليوزر مانجر', 'error');
      return { success: false, message: e.message };
    }
  };

  const addUsermanProfile = async (profile: Partial<UsermanProfile>) => {
    try {
      const res = await fetchWithToken('/api/mikrotik/userman/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        if (data.profile) {
          setUsermanProfiles((prev) => [...prev.filter((p) => p.name !== data.profile.name), data.profile]);
        } else {
          setUsermanProfiles((prev) => [
            ...prev.filter((p) => p.name !== profile.name),
            {
              id: profile.name || 'new',
              name: profile.name || '',
              overrideSharedUsers: profile.overrideSharedUsers || 1,
              startsAt: profile.startsAt || 'first-auth',
              ...profile
            } as any
          ]);
        }
        refreshProfiles('userman').catch(() => {});
        return { success: true, message: data.message };
      }
      return { success: false, message: data.message };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const updateUsermanProfile = async (id: string, updates: Partial<UsermanProfile>) => {
    try {
      const res = await fetchWithToken(`/api/mikrotik/userman/profiles/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        setUsermanProfiles((prev) => prev.map((p) => (p.id === id || p.name === id ? { ...p, ...updates } : p)));
        refreshProfiles('userman').catch(() => {});
        return { success: true, message: data.message };
      }
      return { success: false, message: data.message };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const deleteUsermanProfile = async (id: string) => {
    try {
      const res = await fetchWithToken(`/api/mikrotik/userman/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        setUsermanProfiles((prev) => prev.filter((p) => p.id !== id && p.name !== id));
        refreshProfiles('userman').catch(() => {});
        return { success: true, message: data.message };
      }
      return { success: false, message: data.message };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const disconnectUsermanActive = async (id: string, username: string, skipSync?: boolean, nasIp?: string) => {
    try {
      const res = await fetchWithToken('/api/mikrotik/userman/active/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, user: username, nasIp })
      });
      const data = await res.json();
      if (data.success) {
        if (!skipSync) {
          showToast(data.message, 'info');
          await syncNow(true);
        }
        return { success: true, message: data.message };
      }
      if (!skipSync) showToast(data.message || 'تعذر فصل جلسة اليوزر مانجر', 'error');
      return { success: false, message: data.message };
    } catch (e: any) {
      if (!skipSync) showToast('تعذر فصل جلسة اليوزر مانجر', 'error');
      return { success: false, message: e.message };
    }
  };

  return {
    addUser,
    updateUser,
    deleteUser,
    batchDeleteUsers,
    batchSubscriberAction,
    generateVoucherBatch,
    addProfile,
    updateProfile,
    deleteProfile,
    kickUser,
    addPPPSecret,
    updatePPPSecret,
    deletePPPSecret,
    batchDeletePPPSecrets,
    addPPPProfile,
    updatePPPProfile,
    deletePPPProfile,
    disconnectPPPActive,
    addUsermanUser,
    updateUsermanUser,
    deleteUsermanUser,
    batchDeleteUsermanUsers,
    addUsermanProfile,
    updateUsermanProfile,
    deleteUsermanProfile,
    disconnectUsermanActive
  };
}
