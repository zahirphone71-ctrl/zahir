import React, { useCallback } from 'react';
import { safeStorage } from '../utils/safeStorage';
import type {
  SimpleQueue,
  HotspotIpBinding,
  DhcpLease,
  WirelessInterface,
  WirelessClientStation,
  NeighborAntenna,
  AccessPointItem,
  HotspotServerProfile,
  HotspotServerInstance,
  RouterStorageFile,
  ScheduledTask
} from '../types/mikrotik';
import type { ShowToastFn } from './mikrotikContextTypes';

export interface NetworkPortalActionsDeps {
  fetchWithToken: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  showToast: ShowToastFn;
  syncNow: (force?: boolean) => Promise<void>;
  refreshQueues: () => Promise<void>;
  setSimpleQueues: React.Dispatch<React.SetStateAction<SimpleQueue[]>>;
  setWirelessInterfaces: React.Dispatch<React.SetStateAction<WirelessInterface[]>>;
  setRegistrationTable: React.Dispatch<React.SetStateAction<WirelessClientStation[]>>;
  setNeighbors: React.Dispatch<React.SetStateAction<NeighborAntenna[]>>;
  setRemoteCaps: React.Dispatch<React.SetStateAction<any[]>>;
  setAccessPoints: React.Dispatch<React.SetStateAction<AccessPointItem[]>>;
  setHotspotServerProfiles: React.Dispatch<React.SetStateAction<HotspotServerProfile[]>>;
  setHotspotServers: React.Dispatch<React.SetStateAction<HotspotServerInstance[]>>;
  setRouterFiles: React.Dispatch<React.SetStateAction<RouterStorageFile[]>>;
  setScheduledTasks: React.Dispatch<React.SetStateAction<ScheduledTask[]>>;
  setIsLoadingWireless: React.Dispatch<React.SetStateAction<boolean>>;
  setIsLoadingAntennas: React.Dispatch<React.SetStateAction<boolean>>;
  setIsLoadingAccessPoints: React.Dispatch<React.SetStateAction<boolean>>;
  setIsLoadingPortalProfiles: React.Dispatch<React.SetStateAction<boolean>>;
  setIsLoadingSchedulers: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useNetworkPortalActions(deps: NetworkPortalActionsDeps) {
  const {
    fetchWithToken,
    showToast,
    syncNow,
    refreshQueues,
    setSimpleQueues,
    setWirelessInterfaces,
    setRegistrationTable,
    setNeighbors,
    setRemoteCaps,
    setAccessPoints,
    setHotspotServerProfiles,
    setHotspotServers,
    setRouterFiles,
    setScheduledTasks,
    setIsLoadingWireless,
    setIsLoadingAntennas,
    setIsLoadingAccessPoints,
    setIsLoadingPortalProfiles,
    setIsLoadingSchedulers
  } = deps;

  // Queues
  const addQueue = async (q: Partial<SimpleQueue>) => {
    try {
      const res = await fetchWithToken('/api/mikrotik/queues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(q)
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        showToast(data.message || 'تمت إضافة قاعدة السرعة بنجاح', 'success');
        await refreshQueues();
        return { success: true, message: data.message || 'تمت الإضافة بنجاح' };
      }
      const errMsg = data?.message || 'تعذر إضافة القاعدة';
      showToast(errMsg, 'error');
      return { success: false, message: errMsg };
    } catch (e: any) {
      const errMsg = e?.message || 'تعذر إضافة القاعدة';
      showToast(errMsg, 'error');
      return { success: false, message: errMsg };
    }
  };

  const updateQueue = async (id: string, q: Partial<SimpleQueue>) => {
    try {
      const res = await fetchWithToken(`/api/mikrotik/queues/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(q)
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        showToast(data.message || 'تم تحديث القاعدة بنجاح', 'success');
        await refreshQueues();
        return { success: true, message: data.message || 'تم التحديث' };
      }
      const errMsg = data?.message || 'تعذر تحديث القاعدة';
      showToast(errMsg, 'error');
      return { success: false, message: errMsg };
    } catch (e: any) {
      const errMsg = e?.message || 'تعذر تحديث القاعدة';
      showToast(errMsg, 'error');
      return { success: false, message: errMsg };
    }
  };

  const deleteQueue = async (id: string) => {
    try {
      const res = await fetchWithToken(`/api/mikrotik/queues/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        showToast(data.message || 'تم حذف القاعدة بنجاح', 'success');
        setSimpleQueues((prev) => prev.filter((item) => item.id !== id && item.name !== id));
        await refreshQueues();
        return { success: true, message: data.message || 'تم الحذف' };
      }
      const errMsg = data?.message || 'تعذر حذف القاعدة';
      showToast(errMsg, 'error');
      return { success: false, message: errMsg };
    } catch (e: any) {
      const errMsg = e?.message || 'تعذر حذف القاعدة';
      showToast(errMsg, 'error');
      return { success: false, message: errMsg };
    }
  };

  const batchDeleteQueues = async (ids: string[]) => {
    if (!ids || ids.length === 0) return { success: false, message: 'لم يتم تحديد أي قاعدة' };
    try {
      const res = await fetchWithToken('/api/mikrotik/queues/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        showToast(data.message || 'تم حذف القواعد المحددة بنجاح', 'success');
        await refreshQueues();
        return { success: true, message: data.message || 'تم الحذف' };
      }
      const errMsg = data?.message || 'فشل حذف بعض القواعد';
      showToast(errMsg, 'error');
      return { success: false, message: errMsg };
    } catch (err: any) {
      const errMsg = err?.message || 'تعذر حذف القواعد المحددة';
      showToast(errMsg, 'error');
      return { success: false, message: errMsg };
    }
  };

  const batchToggleQueues = async (ids: string[], disabled: boolean) => {
    if (!ids || ids.length === 0) return { success: false, message: 'لم يتم تحديد أي قاعدة' };
    try {
      const res = await fetchWithToken('/api/mikrotik/queues/batch-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, disabled })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        showToast(data.message || 'تم تعديل حالة القواعد بنجاح', 'success');
        await refreshQueues();
        return { success: true, message: data.message || 'تم التعديل' };
      }
      const errMsg = data?.message || 'فشل تعديل حالة القواعد';
      showToast(errMsg, 'error');
      return { success: false, message: errMsg };
    } catch (err: any) {
      const errMsg = err?.message || 'تعذر تعديل حالة القواعد المحددة';
      showToast(errMsg, 'error');
      return { success: false, message: errMsg };
    }
  };

  // IP Bindings
  const addIpBinding = async (b: Partial<HotspotIpBinding>) => {
    try {
      const res = await fetchWithToken('/api/mikrotik/ip-bindings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(b)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message, 'success');
        await syncNow(true);
        return { success: true, message: data.message };
      }
      const msg = data.message || 'فشل إضافة الجهاز إلى IP Binding';
      showToast(msg, 'error');
      return { success: false, message: msg };
    } catch (e: any) {
      const msg = e?.message || 'تعذر إضافة الجهاز';
      showToast(msg, 'error');
      return { success: false, message: msg };
    }
  };

  const deleteIpBinding = async (id: string) => {
    try {
      const res = await fetchWithToken(`/api/mikrotik/ip-bindings/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message, 'success');
        await syncNow(true);
        return { success: true, message: data.message };
      }
      const msg = data.message || 'فشل حذف العنصر';
      showToast(msg, 'error');
      return { success: false, message: msg };
    } catch (e: any) {
      const msg = e?.message || 'تعذر حذف العنصر';
      showToast(msg, 'error');
      return { success: false, message: msg };
    }
  };

  const batchDeleteIpBindings = async (ids: string[]) => {
    if (!ids || ids.length === 0) return { success: false, message: 'لم يتم تحديد أي عنصر' };
    try {
      const res = await fetchWithToken('/api/mikrotik/ip-bindings/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message, 'success');
        await syncNow(true);
        return { success: true, message: data.message };
      }
      const msg = data.message || 'فشل حذف بعض العناصر';
      showToast(msg, 'error');
      return { success: false, message: msg };
    } catch (err: any) {
      showToast('تعذر حذف العناصر المحددة', 'error');
      return { success: false, message: err?.message };
    }
  };

  // DHCP Leases
  const addDhcpLease = async (l: Partial<DhcpLease>) => {
    try {
      const res = await fetchWithToken('/api/mikrotik/dhcp/leases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(l)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message, 'success');
        await syncNow(true);
        return { success: true, message: data.message };
      }
      const msg = data.message || 'فشل حجز العنوان';
      showToast(msg, 'error');
      return { success: false, message: msg };
    } catch (e: any) {
      const msg = e?.message || 'تعذر حجز العنوان';
      showToast(msg, 'error');
      return { success: false, message: msg };
    }
  };

  const makeStaticDhcpLeases = async (ids: string[]) => {
    if (!ids || ids.length === 0) return { success: false, message: 'لم يتم تحديد أي عنوان' };
    try {
      const res = await fetchWithToken('/api/mikrotik/dhcp/leases/make-static', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message, 'success');
        await syncNow(true);
        return { success: true, message: data.message };
      }
      const msg = data.message || 'فشل تحويل الحجز إلى ثابت';
      showToast(msg, 'error');
      return { success: false, message: msg };
    } catch (e: any) {
      const msg = e?.message || 'تعذر تحويل الحجز إلى ثابت';
      showToast(msg, 'error');
      return { success: false, message: msg };
    }
  };

  const deleteDhcpLease = async (id: string) => {
    try {
      const res = await fetchWithToken(`/api/mikrotik/dhcp/leases/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message, 'success');
        await syncNow(true);
        return { success: true, message: data.message };
      }
      const msg = data.message || 'فشل حذف حجز العنوان';
      showToast(msg, 'error');
      return { success: false, message: msg };
    } catch (e: any) {
      const msg = e?.message || 'تعذر حذف حجز العنوان';
      showToast(msg, 'error');
      return { success: false, message: msg };
    }
  };

  const batchDeleteDhcpLeases = async (ids: string[]) => {
    if (!ids || ids.length === 0) return { success: false, message: 'لم يتم تحديد أي حجز' };
    try {
      const res = await fetchWithToken('/api/mikrotik/dhcp/leases/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message, 'success');
        await syncNow(true);
        return { success: true, message: data.message };
      }
      showToast(data.message || 'فشل حذف بعض الحجوزات', 'error');
      return { success: false, message: data.message };
    } catch (err: any) {
      showToast('تعذر حذف الحجوزات المحددة', 'error');
      return { success: false, message: err?.message };
    }
  };

  // Firewall Quick Harden
  const applyQuickHarden = async () => {
    try {
      const res = await fetchWithToken('/api/mikrotik/firewall/quick-harden', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message, 'success');
        await syncNow();
        return { success: true, message: data.message };
      }
      showToast(data.message || 'فشل تطبيق الحماية السريعة', 'error');
      return { success: false, message: data.message };
    } catch (e: any) {
      showToast(e?.message || 'تعذر تطبيق الحماية السريعة', 'error');
      return { success: false, message: e.message };
    }
  };

  // Reboot & Command
  const rebootRouter = async () => {
    try {
      const res = await fetchWithToken('/api/mikrotik/system/reboot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmReboot: true })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message, 'info');
        await syncNow();
        return { success: true, message: data.message };
      }
      return { success: false, message: data.message };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const runCommand = useCallback(
    async (cmd: string) => {
      try {
        const res = await fetchWithToken('/api/mikrotik/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: cmd })
        });
        const data = await res.json();
        return { success: Boolean(res.ok && data.success), output: data.output || data.message || '' };
      } catch (e: any) {
        return { success: false, output: `Error executing command: ${e.message}` };
      }
    },
    [fetchWithToken]
  );

  // Wireless & Antennas
  const fetchWirelessData = useCallback(async () => {
    try {
      setIsLoadingWireless(true);
      const res = await fetchWithToken('/api/mikrotik/wireless');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setWirelessInterfaces(data.data);
      }
    } catch {
    } finally {
      setIsLoadingWireless(false);
    }
  }, [fetchWithToken, setIsLoadingWireless, setWirelessInterfaces]);

  const updateWirelessInterface = async (id: string, updates: Partial<WirelessInterface>) => {
    try {
      const res = await fetchWithToken('/api/mikrotik/wireless/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        await fetchWirelessData();
        return { success: true, message: data.message };
      }
      showToast(data.message, 'error');
      return { success: false, message: data.message };
    } catch (e: any) {
      showToast('تعذر تحديث إعدادات الشبكة اللاسلكية', 'error');
      return { success: false, message: e.message };
    }
  };

  const toggleWirelessInterface = async (id: string, disabled: boolean, name?: string) => {
    try {
      const res = await fetchWithToken('/api/mikrotik/wireless/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, disabled, name })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        await fetchWirelessData();
        return { success: true, message: data.message };
      }
      showToast(data.message, 'error');
      return { success: false, message: data.message };
    } catch (e: any) {
      showToast('تعذر تغيير حالة الواجهة اللاسلكية', 'error');
      return { success: false, message: e.message };
    }
  };

  const createVirtualAp = async (vapData: {
    masterInterface: string;
    name?: string;
    ssid: string;
    securityProfile?: string;
    disabled?: boolean;
    comment?: string;
    hideSsid?: boolean;
  }) => {
    try {
      const res = await fetchWithToken('/api/mikrotik/wireless/add-vap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vapData)
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        await fetchWirelessData();
        return { success: true, message: data.message };
      }
      showToast(data.message, 'error');
      return { success: false, message: data.message };
    } catch (e: any) {
      showToast('تعذر إنشاء نقطة البث الافتراضية', 'error');
      return { success: false, message: e.message };
    }
  };

  const pingHost = async (address: string, count: number = 4) => {
    try {
      const res = await fetchWithToken('/api/mikrotik/network/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, count })
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, message: e.message || 'تعذر إجراء فحص الاتصال (Ping)' };
    }
  };

  const fetchHotspotServerProfiles = useCallback(async () => {
    try {
      setIsLoadingPortalProfiles(true);
      const res = await fetchWithToken('/api/mikrotik/hotspot/server-profiles');
      const data = await res.json();
      if (data.success && data.data) {
        if (Array.isArray(data.data.profiles)) setHotspotServerProfiles(data.data.profiles);
        if (Array.isArray(data.data.servers)) setHotspotServers(data.data.servers);
        if (Array.isArray(data.data.files)) setRouterFiles(data.data.files);
      }
    } catch {
    } finally {
      setIsLoadingPortalProfiles(false);
    }
  }, [fetchWithToken, setIsLoadingPortalProfiles, setHotspotServerProfiles, setHotspotServers, setRouterFiles]);

  const deleteRouterFile = async (name: string, id?: string) => {
    try {
      const res = await fetchWithToken('/api/mikrotik/files/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, id })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        await fetchHotspotServerProfiles();
        return { success: true, message: data.message };
      }
      showToast(data.message, 'error');
      return { success: false, message: data.message };
    } catch (e: any) {
      showToast('فشل حذف الملف من الراوتر', 'error');
      return { success: false, message: e.message };
    }
  };

  const fetchAntennasData = useCallback(async () => {
    try {
      setIsLoadingAntennas(true);
      setIsLoadingAccessPoints(true);
      const res = await fetchWithToken('/api/mikrotik/network/antennas');
      const data = await res.json();
      if (data.success && data.data) {
        if (Array.isArray(data.data.registrationTable)) setRegistrationTable(data.data.registrationTable);
        if (Array.isArray(data.data.neighbors)) setNeighbors(data.data.neighbors);
        if (Array.isArray(data.data.remoteCaps)) setRemoteCaps(data.data.remoteCaps);
        if (Array.isArray(data.data.accessPoints)) setAccessPoints(data.data.accessPoints);
      }
    } catch {
    } finally {
      setIsLoadingAntennas(false);
      setIsLoadingAccessPoints(false);
    }
  }, [fetchWithToken, setIsLoadingAntennas, setIsLoadingAccessPoints, setRegistrationTable, setNeighbors, setRemoteCaps, setAccessPoints]);

  const fetchAccessPointsData = useCallback(async () => {
    try {
      setIsLoadingAccessPoints(true);
      const res = await fetchWithToken('/api/mikrotik/network/access-points');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setAccessPoints(data.data);
      }
    } catch {
    } finally {
      setIsLoadingAccessPoints(false);
    }
  }, [fetchWithToken, setIsLoadingAccessPoints, setAccessPoints]);

  const updateAccessPointComment = async (apData: { macAddress?: string; ipAddress?: string; iface?: string; comment: string }) => {
    try {
      const res = await fetchWithToken('/api/mikrotik/network/access-points/set-comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apData)
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        await fetchAntennasData();
        return { success: true, message: data.message };
      }
      showToast(data.message, 'error');
      return { success: false, message: data.message };
    } catch (e: any) {
      showToast('تعذر حفظ اسم أو ملاحظات نقطة الوصول', 'error');
      return { success: false, message: e.message };
    }
  };

  const kickWirelessClient = async (id: string, mac: string) => {
    try {
      const res = await fetchWithToken('/api/mikrotik/wireless/antennas/kick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, macAddress: mac })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        await fetchAntennasData();
        return { success: true, message: data.message };
      }
      showToast(data.message, 'error');
      return { success: false, message: data.message };
    } catch (e: any) {
      showToast('فشل فصل الجهاز', 'error');
      return { success: false, message: e.message };
    }
  };

  // Anti-Sharing
  const fetchAntiSharingStatus = useCallback(async () => {
    try {
      const res = await fetchWithToken('/api/mikrotik/network/anti-sharing/status');
      return await res.json();
    } catch (e: any) {
      return { success: false, message: e.message || 'تعذر جلب حالة حماية مشاركة الإنترنت' };
    }
  }, [fetchWithToken]);

  const applyAntiSharing = useCallback(
    async (params?: { lanInterface?: string; createBackup?: boolean }) => {
      try {
        const res = await fetchWithToken('/api/mikrotik/network/anti-sharing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params || {})
        });
        const data = await res.json();
        if (data.success) {
          showToast(data.message || 'تم تفعيل إجراءات منع مشاركة وبث الإنترنت بنجاح', 'success');
          syncNow(true).catch(() => {});
        } else {
          showToast(data.message || 'فشل تطبيق بعض إجراءات منع المشاركة', 'error');
        }
        return data;
      } catch (e: any) {
        showToast('خطأ أثناء تنفيذ إجراءات منع المشاركة', 'error');
        return { success: false, message: e.message };
      }
    },
    [fetchWithToken, showToast, syncNow]
  );

  const revertAntiSharing = useCallback(async () => {
    try {
      const res = await fetchWithToken('/api/mikrotik/network/anti-sharing/revert', {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'تم إلغاء تفعيل قواعد منع المشاركة بنجاح', 'info');
        syncNow(true).catch(() => {});
      } else {
        showToast(data.message || 'تعذر إلغاء تفعيل القواعد', 'error');
      }
      return data;
    } catch (e: any) {
      showToast('خطأ أثناء إلغاء تفعيل القواعد', 'error');
      return { success: false, message: e.message };
    }
  }, [fetchWithToken, showToast, syncNow]);

  // Portal & Files
  const updateHotspotServerProfile = async (id: string, updates: Partial<HotspotServerProfile>) => {
    try {
      const res = await fetchWithToken('/api/mikrotik/hotspot/server-profiles/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        await fetchHotspotServerProfiles();
        return { success: true, message: data.message };
      }
      showToast(data.message, 'error');
      return { success: false, message: data.message };
    } catch (e: any) {
      showToast('تعذر تحديث بروفايل بوابة تسجيل الدخول', 'error');
      return { success: false, message: e.message };
    }
  };

  const createHotspotServerProfile = async (profile: Partial<HotspotServerProfile>) => {
    try {
      const res = await fetchWithToken('/api/mikrotik/hotspot/server-profiles/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        await fetchHotspotServerProfiles();
        return { success: true, message: data.message };
      }
      showToast(data.message, 'error');
      return { success: false, message: data.message };
    } catch (e: any) {
      showToast('تعذر إنشاء بروفايل البوابة', 'error');
      return { success: false, message: e.message };
    }
  };

  const applyLoginPageTemplate = async (profileId: string, folderName: string, dnsName?: string) => {
    try {
      const res = await fetchWithToken('/api/mikrotik/hotspot/login-page/apply-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId, folderName, dnsName })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        await fetchHotspotServerProfiles();
        return { success: true, message: data.message };
      }
      showToast(data.message, 'error');
      return { success: false, message: data.message };
    } catch (e: any) {
      showToast('فشل تعيين مجلد صفحة الدخول', 'error');
      return { success: false, message: e.message };
    }
  };

  const deployHotspotPortal = async (deployData: {
    profileId?: string;
    profileName?: string;
    folderName: string;
    dnsName?: string;
    files: Record<string, string>;
    config?: any;
  }) => {
    try {
      const res = await fetchWithToken('/api/mikrotik/hotspot/login-page/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deployData)
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        await fetchHotspotServerProfiles();
        return { success: true, message: data.message };
      }
      showToast(data.message, 'error');
      return { success: false, message: data.message };
    } catch (e: any) {
      showToast('فشل نشر وتثبيت صفحة الدخول على المايكروتك', 'error');
      return { success: false, message: e.message };
    }
  };

  const getHotspotPortalConfig = async (folderName: string) => {
    try {
      const res = await fetchWithToken('/api/mikrotik/hotspot/login-page/get-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderName })
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const readRouterFile = useCallback(
    async (filePath: string) => {
      try {
        const res = await fetchWithToken(`/api/mikrotik/files/read?path=${encodeURIComponent(filePath)}`);
        const data = await res.json();
        return {
          success: Boolean(data.success),
          data: data.data,
          content: data.data,
          message: data.message
        };
      } catch (err: any) {
        return { success: false, message: err.message };
      }
    },
    [fetchWithToken]
  );

  const writeRouterFile = useCallback(
    async (filePath: string, content: string) => {
      try {
        const res = await fetchWithToken('/api/mikrotik/files/write', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: filePath, content })
        });
        return await res.json();
      } catch (err: any) {
        return { success: false, message: err.message };
      }
    },
    [fetchWithToken]
  );

  const detectHotspotPath = useCallback(async () => {
    try {
      const res = await fetchWithToken('/api/mikrotik/files/detect-hotspot-path');
      return await res.json();
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }, [fetchWithToken]);

  const listRouterDirectory = useCallback(
    async (dirPath: string) => {
      try {
        const res = await fetchWithToken(`/api/mikrotik/files/list?path=${encodeURIComponent(dirPath)}`);
        return await res.json();
      } catch (err: any) {
        return { success: false, message: err.message };
      }
    },
    [fetchWithToken]
  );

  const readAllPortalFiles = useCallback(
    async (folder?: string) => {
      try {
        const query = folder ? `?folder=${encodeURIComponent(folder)}` : '';
        const res = await fetchWithToken(`/api/mikrotik/files/read-all-portal${query}`);
        return await res.json();
      } catch (err: any) {
        return { success: false, message: err.message };
      }
    },
    [fetchWithToken]
  );

  const deployPortalFiles = useCallback(
    async (params: {
      targetFolder: string;
      files: Record<string, string>;
      mode: 'full' | 'incremental';
      modifiedFiles?: string[];
      updateProfile?: boolean;
      profileName?: string;
      dnsName?: string;
    }) => {
      try {
        const res = await fetchWithToken('/api/mikrotik/files/deploy-portal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params)
        });
        const data = await res.json();
        if (data.success) {
          await fetchHotspotServerProfiles();
        }
        return data;
      } catch (err: any) {
        return { success: false, message: err.message };
      }
    },
    [fetchWithToken, fetchHotspotServerProfiles]
  );

  const validatePortalFile = useCallback(
    async (content: string, fileName: string) => {
      try {
        const res = await fetchWithToken('/api/mikrotik/files/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, fileName })
        });
        return await res.json();
      } catch {
        return {
          success: false,
          validation: { isValid: false, errors: [], warnings: [], info: [] },
          security: { isSafe: false, issues: [], severity: 'critical' }
        };
      }
    },
    [fetchWithToken]
  );

  // Scheduled Tasks
  const fetchScheduledTasks = useCallback(async () => {
    setIsLoadingSchedulers(true);
    try {
      const res = await fetchWithToken('/api/mikrotik/schedulers');
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setScheduledTasks(json.data);
          safeStorage.setItem('zctrl_cached_scheduled_tasks', JSON.stringify(json.data));
        }
      }
    } catch (e: any) {
      console.warn('Could not fetch scheduled tasks:', e);
    } finally {
      setIsLoadingSchedulers(false);
    }
  }, [fetchWithToken, setIsLoadingSchedulers, setScheduledTasks]);

  const addScheduledTask = useCallback(
    async (task: Partial<ScheduledTask>) => {
      try {
        const res = await fetchWithToken('/api/mikrotik/schedulers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(task)
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
          showToast(data.message || 'تمت إضافة المهمة المجدولة بنجاح', 'success');
          await fetchScheduledTasks();
          return { success: true, message: data.message || 'تمت الإضافة بنجاح' };
        }
        const errMsg = data?.message || 'تعذر إضافة المهمة المجدولة إلى الراوتر';
        showToast(errMsg, 'error');
        return { success: false, message: errMsg };
      } catch (e: any) {
        const errMsg = e?.message || 'تعذر الاتصال بالراوتر لإضافة المهمة';
        showToast(errMsg, 'error');
        return { success: false, message: errMsg };
      }
    },
    [fetchWithToken, fetchScheduledTasks, showToast]
  );

  const updateScheduledTask = useCallback(
    async (id: string, updates: Partial<ScheduledTask>) => {
      try {
        const res = await fetchWithToken(`/api/mikrotik/schedulers/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
          showToast(data.message || 'تم تحديث المهمة المجدولة بنجاح', 'success');
          await fetchScheduledTasks();
          return { success: true, message: data.message || 'تم التحديث بنجاح' };
        }
        const errMsg = data?.message || 'تعذر تحديث المهمة المجدولة في الراوتر';
        showToast(errMsg, 'error');
        return { success: false, message: errMsg };
      } catch (e: any) {
        const errMsg = e?.message || 'تعذر الاتصال بالراوتر لتحديث المهمة';
        showToast(errMsg, 'error');
        return { success: false, message: errMsg };
      }
    },
    [fetchWithToken, fetchScheduledTasks, showToast]
  );

  const deleteScheduledTask = useCallback(
    async (id: string) => {
      try {
        const res = await fetchWithToken(`/api/mikrotik/schedulers/${encodeURIComponent(id)}`, {
          method: 'DELETE'
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
          setScheduledTasks((prev) => {
            const next = prev.filter((t) => t.id !== id);
            safeStorage.setItem('zctrl_cached_scheduled_tasks', JSON.stringify(next));
            return next;
          });
          showToast(data.message || 'تم حذف المهمة المجدولة بنجاح', 'success');
          return { success: true, message: data.message || 'تم الحذف بنجاح' };
        }
        const errMsg = data?.message || 'تعذر حذف المهمة المجدولة من الراوتر';
        showToast(errMsg, 'error');
        return { success: false, message: errMsg };
      } catch (e: any) {
        const errMsg = e?.message || 'تعذر الاتصال بالراوتر لحذف المهمة';
        showToast(errMsg, 'error');
        return { success: false, message: errMsg };
      }
    },
    [fetchWithToken, setScheduledTasks, showToast]
  );

  const toggleScheduledTask = useCallback(
    async (id: string, disabled: boolean) => {
      try {
        const res = await fetchWithToken(`/api/mikrotik/schedulers/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ disabled })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
          setScheduledTasks((prev) => {
            const next = prev.map((t) => (t.id === id ? { ...t, disabled } : t));
            safeStorage.setItem('zctrl_cached_scheduled_tasks', JSON.stringify(next));
            return next;
          });
          showToast(disabled ? 'تم تعطيل المهمة المجدولة' : 'تم تفعيل المهمة المجدولة بنجاح', 'success');
          return { success: true, message: data.message || 'تم التغيير' };
        }
        const errMsg = data?.message || 'تعذر تغيير حالة المهمة المجدولة';
        showToast(errMsg, 'error');
        return { success: false, message: errMsg };
      } catch (e: any) {
        const errMsg = e?.message || 'تعذر الاتصال بالراوتر لتغيير حالة المهمة';
        showToast(errMsg, 'error');
        return { success: false, message: errMsg };
      }
    },
    [fetchWithToken, setScheduledTasks, showToast]
  );

  const runScheduledTask = useCallback(
    async (id: string) => {
      try {
        const res = await fetchWithToken(`/api/mikrotik/schedulers/${encodeURIComponent(id)}/run`, {
          method: 'POST'
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
          showToast(data.message || 'تم تنفيذ أمر المهمة المجدولة بنجاح', 'success');
          await fetchScheduledTasks();
          return { success: true, message: data.message || 'تم التنفيذ' };
        }
        const errMsg = data?.message || 'تعذر تنفيذ المهمة المجدولة على الراوتر';
        showToast(errMsg, 'error');
        return { success: false, message: errMsg };
      } catch (e: any) {
        const errMsg = e?.message || 'تعذر الاتصال بالراوتر لتنفيذ المهمة';
        showToast(errMsg, 'error');
        return { success: false, message: errMsg };
      }
    },
    [fetchWithToken, fetchScheduledTasks, showToast]
  );

  const batchDeleteScheduledTasks = useCallback(
    async (ids: string[]) => {
      if (!ids || ids.length === 0) return { success: false, message: 'لم يتم تحديد أي مهمة' };
      try {
        const results = await Promise.all(
          ids.map(async (id) => {
            try {
              const r = await fetchWithToken(`/api/mikrotik/schedulers/${encodeURIComponent(id)}`, { method: 'DELETE' });
              const d = await r.json().catch(() => ({}));
              return { id, ok: r.ok && d.success };
            } catch {
              return { id, ok: false };
            }
          })
        );
        const deletedIds = new Set(results.filter((r) => r.ok).map((r) => r.id));
        if (deletedIds.size > 0) {
          setScheduledTasks((prev) => {
            const next = prev.filter((t) => !deletedIds.has(t.id));
            safeStorage.setItem('zctrl_cached_scheduled_tasks', JSON.stringify(next));
            return next;
          });
        }
        if (deletedIds.size === ids.length) {
          showToast(`تم حذف ${deletedIds.size} مهمة مجدولة بنجاح`, 'success');
          return { success: true, message: `تم حذف ${deletedIds.size} مهمة` };
        }
        const errMsg = deletedIds.size > 0 ? `تم حذف ${deletedIds.size} من أصل ${ids.length} مهمة فقط` : 'فشل حذف المهام المحددة من الراوتر';
        showToast(errMsg, 'error');
        return { success: false, message: errMsg };
      } catch (e: any) {
        const errMsg = e?.message || 'تعذر حذف المهام المحددة';
        showToast(errMsg, 'error');
        return { success: false, message: errMsg };
      }
    },
    [fetchWithToken, setScheduledTasks, showToast]
  );

  const batchToggleScheduledTasks = useCallback(
    async (ids: string[], disabled: boolean) => {
      if (!ids || ids.length === 0) return { success: false, message: 'لم يتم تحديد أي مهمة' };
      try {
        const results = await Promise.all(
          ids.map(async (id) => {
            try {
              const r = await fetchWithToken(`/api/mikrotik/schedulers/${encodeURIComponent(id)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ disabled })
              });
              const d = await r.json().catch(() => ({}));
              return { id, ok: r.ok && d.success };
            } catch {
              return { id, ok: false };
            }
          })
        );
        const updatedIds = new Set(results.filter((r) => r.ok).map((r) => r.id));
        if (updatedIds.size > 0) {
          setScheduledTasks((prev) => {
            const next = prev.map((t) => (updatedIds.has(t.id) ? { ...t, disabled } : t));
            safeStorage.setItem('zctrl_cached_scheduled_tasks', JSON.stringify(next));
            return next;
          });
        }
        if (updatedIds.size === ids.length) {
          showToast(disabled ? `تم تعطيل ${updatedIds.size} مهمة مجدولة` : `تم تفعيل ${updatedIds.size} مهمة مجدولة`, 'success');
          return { success: true, message: 'تم التحديث' };
        }
        const errMsg = updatedIds.size > 0 ? `تم تحديث ${updatedIds.size} من أصل ${ids.length} مهمة فقط` : 'فشل تحديث حالة المهام المحددة';
        showToast(errMsg, 'error');
        return { success: false, message: errMsg };
      } catch (e: any) {
        const errMsg = e?.message || 'تعذر تحديث حالة المهام المحددة';
        showToast(errMsg, 'error');
        return { success: false, message: errMsg };
      }
    },
    [fetchWithToken, setScheduledTasks, showToast]
  );

  return {
    addQueue,
    updateQueue,
    deleteQueue,
    batchDeleteQueues,
    batchToggleQueues,
    addIpBinding,
    deleteIpBinding,
    batchDeleteIpBindings,
    addDhcpLease,
    makeStaticDhcpLeases,
    deleteDhcpLease,
    batchDeleteDhcpLeases,
    applyQuickHarden,
    rebootRouter,
    runCommand,
    fetchWirelessData,
    updateWirelessInterface,
    toggleWirelessInterface,
    createVirtualAp,
    fetchAntennasData,
    fetchAccessPointsData,
    updateAccessPointComment,
    kickWirelessClient,
    pingHost,
    deleteRouterFile,
    fetchHotspotServerProfiles,
    updateHotspotServerProfile,
    createHotspotServerProfile,
    applyLoginPageTemplate,
    deployHotspotPortal,
    getHotspotPortalConfig,
    readRouterFile,
    writeRouterFile,
    detectHotspotPath,
    listRouterDirectory,
    readAllPortalFiles,
    deployPortalFiles,
    validatePortalFile,
    fetchScheduledTasks,
    addScheduledTask,
    updateScheduledTask,
    deleteScheduledTask,
    runScheduledTask,
    toggleScheduledTask,
    batchDeleteScheduledTasks,
    batchToggleScheduledTasks,
    fetchAntiSharingStatus,
    applyAntiSharing,
    revertAntiSharing
  };
}
