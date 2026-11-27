import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useMikroTik } from '../context/MikroTikContext';
import {
  HotspotUser,
  PPPSecret,
  UsermanUser
} from '../types/mikrotik';
import {
  Users,
  Activity,
  Network,
  Shield,
  Wifi,
  UserX,
  CheckSquare,
  Square,
  RefreshCw
} from 'lucide-react';
import { formatBytes, exportUsersToCsv } from '../lib/formatters';
import { safeStorage } from '../utils/safeStorage';
import { secureFetch, safeParseJson } from '../lib/api';
import { ErrorBoundary } from './ErrorBoundary';
import { FloatingSubscribersActionBar } from './FloatingSubscribersActionBar';
import { SubscriberActionModals, ActionModalType } from './SubscriberActionModals';
import { SubscribersFilterBar, SearchColumn } from './subscribers/SubscribersFilterBar';
import { SubscribersTable, SubscriberRowItem } from './subscribers/SubscribersTable';
import { ColumnCustomizerModal } from './subscribers/ColumnCustomizerModal';
import { AdvancedFilterPanel } from './subscribers/AdvancedFilterPanel';
import { PdfExportModal } from './PdfExportModal';
import { DEFAULT_COLUMN_KEYS } from './subscribers/tableColumnsConfig';
import {
  reconcileSubscriberEdit,
  reconcileBatchAction,
  ActionDebouncer
} from '../utils/reconciliation';
import {
  SubscriberSystem,
  TableDensity,
  ColumnSortState,
  StatusFilterType,
  AdvancedFilterState
} from './subscribers/types';
import {
  getHotspotUserStatus,
  getPPPSecretStatus,
  getUsermanUserStatus,
  detectDeviceType,
  parseDurationToSeconds,
  calculateRemainingTime,
  calculateRemainingData,
  parseMikrotikDateTime,
  parseCreationDateFromComment,
  getStoredDisconnectTime,
  recordDisconnectTime,
  clearStoredDisconnectTime,
  calculateSubscriberIdleInfo,
  calculateSubscriberDisconnectInfo,
  parseProfileFromComment,
  resolveProfileLimits,
  parseDataLimitToBytes
} from './subscribers/subscriberUtils';

export type { SubscriberSystem };

// Map to cache expensive regex comment parsing
const commentParseCache = new Map<string, { cleanComment: string, extractedCreatedAt: string | undefined }>();

const MAX_COMMENT_PARSE_CACHE = 10000;

const getParsedComment = (rawComment: string, existingCreatedAt?: string) => {
  const cacheKey = `${rawComment}|${existingCreatedAt || ''}`;
  if (commentParseCache.has(cacheKey)) {
    const cached = commentParseCache.get(cacheKey)!;
    commentParseCache.delete(cacheKey);
    commentParseCache.set(cacheKey, cached);
    return cached;
  }

  let cleanComment = rawComment;
  let extractedCreatedAt = existingCreatedAt;

  if (!extractedCreatedAt) {
    extractedCreatedAt = parseCreationDateFromComment(rawComment);
  }

  if (cleanComment.startsWith('ZCtrl')) {
    cleanComment = cleanComment
      .replace(/^ZCtrl\s*\|[^|]*\|Price:[^|]*\|?/i, '')
      .replace(/^ZCtrl\s*\[Batch\s*[^\]]*\]/i, '')
      .replace(/Price:\s*\d+(?:\.\d+)?/i, '')
      .trim();
  }

  if (extractedCreatedAt) {
    cleanComment = cleanComment
      .replace(/(\d{4})[-/](\d{2})[-/](\d{2})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/, '')
      .replace(/(\d{2})[-/](\d{2})[-/](\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/, '')
      .replace(/(?:created\s+on|created|تاريخ\s+التوليد|تاريخ\s+الانشاء|تاريخ|توليد|بتاريخ|في|at|on)\s*:?\s*/gi, '')
      .trim();
  }

  cleanComment = cleanComment.replace(/^[\s\-_,:;|]*/g, '').replace(/[\s\-_,:;|]*$/g, '').trim();
  if (/^[\s\-_,:;|]*$/.test(cleanComment)) {
    cleanComment = '';
  }

  const result = { cleanComment, extractedCreatedAt };
  // LRU eviction to prevent sudden CPU spikes from clearing entire cache
  if (commentParseCache.size >= MAX_COMMENT_PARSE_CACHE) {
    const oldestKey = commentParseCache.keys().next().value;
    if (oldestKey !== undefined) {
      commentParseCache.delete(oldestKey);
    }
  }
  commentParseCache.set(cacheKey, result);
  return result;
};

interface SubscribersManagerViewProps {
  initialSystem?: SubscriberSystem;
  onNavigateToPrint?: (users: any[]) => void;
}

export const SubscribersManagerView: React.FC<SubscribersManagerViewProps> = ({
  initialSystem = 'hotspot',
  onNavigateToPrint
}) => {
  const {
    users: hotspotUsers,
    profiles: hotspotProfiles,
    activeUsers: hotspotActive,
    dhcpLeases,
    pppSecrets,
    pppProfiles,
    pppActive,
    usermanUsers,
    usermanProfiles,
    usermanActive,
    updateUser: updateHotspotUser,
    batchDeleteUsers: batchDeleteHotspotUsers,
    batchSubscriberAction,
    kickUser: kickHotspotUser,
    updatePPPSecret,
    deletePPPSecret,
    disconnectPPPActive,
    disconnectUsermanActive,
    updateUsermanUser,
    batchDeleteUsermanUsers,
    addUser,
    addPPPSecret,
    addUsermanUser,
    syncNow: refreshData,
    isConnected,
    showToast
  } = useMikroTik();

  const [activeSystem, setActiveSystem] = useState<SubscriberSystem>(initialSystem);
  const [activeSubTab, setActiveSubTab] = useState<'subscribers' | 'sessions'>('subscribers');

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchColumn, setSearchColumn] = useState<SearchColumn>('all');
  const [selectedProfile, setSelectedProfile] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState<boolean>(false);

  // Advanced Filters State
  const initialAdvancedFilters: AdvancedFilterState = useMemo(() => ({
    activity: 'all',
    expiry: 'all',
    expiryFrom: '',
    expiryTo: '',
    selectedProfiles: []
  }), []);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilterState>(initialAdvancedFilters);
  const [isAdvancedFilterOpen, setIsAdvancedFilterOpen] = useState<boolean>(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);

  // Sync initialSystem
  useEffect(() => {
    if (initialSystem) {
      setActiveSystem(initialSystem);
      setSelectedIds([]);
      setSelectedSessionIds([]);
      setSelectedProfile('all');
      setStatusFilter('all');
      setSearchQuery('');
      setAdvancedFilters(initialAdvancedFilters);
    }
  }, [initialSystem, initialAdvancedFilters]);

  // Only fetch on mount if local data is empty (avoids duplicate request with setCurrentActiveTab)
  useEffect(() => {
    if (isConnected && hotspotUsers.length === 0 && pppSecrets.length === 0 && usermanUsers.length === 0) {
      refreshData().catch((err) => {
        console.warn('Initial subscriber data refresh failed:', err);
      });
    }
    // Trigger only when connection state becomes ready with empty initial lists
  }, [isConnected]);

  const advancedActiveCount = useMemo(() => {
    return (
      (advancedFilters.activity !== 'all' ? 1 : 0) +
      (advancedFilters.expiry !== 'all' ? 1 : 0) +
      (advancedFilters.selectedProfiles.length > 0 ? 1 : 0) +
      (advancedFilters.expiryFrom || advancedFilters.expiryTo ? 1 : 0)
    );
  }, [advancedFilters]);

  const handleResetAdvancedFilters = () => setAdvancedFilters(initialAdvancedFilters);
  const handleClearAdvancedActivity = () => setAdvancedFilters((prev) => ({ ...prev, activity: 'all' }));
  const handleClearAdvancedExpiry = () => setAdvancedFilters((prev) => ({ ...prev, expiry: 'all' }));
  const handleClearAdvancedProfiles = () => setAdvancedFilters((prev) => ({ ...prev, selectedProfiles: [] }));
  const handleClearAdvancedDateRange = () =>
    setAdvancedFilters((prev) => ({ ...prev, expiryFrom: '', expiryTo: '' }));

  // Table Customization State
  const [density, setDensity] = useState<TableDensity>(() => {
    return (safeStorage.getItem('set_app_density') as TableDensity) || 'normal';
  });

  const handleDensityChange = (newDensity: TableDensity) => {
    setDensity(newDensity);
    safeStorage.setItem('set_app_density', newDensity);
  };

  useEffect(() => {
    const handleUpdate = () => {
      const savedDensity = safeStorage.getItem('set_app_density') as TableDensity;
      if (savedDensity && (savedDensity === 'compact' || savedDensity === 'normal' || savedDensity === 'relaxed')) {
        setDensity(savedDensity);
      }
      const savedCols = safeStorage.getItem('subscribers_visible_cols');
      if (savedCols) {
        try {
          const parsed = JSON.parse(savedCols);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setVisibleColumns(parsed.filter((k: string) => k !== 'actions'));
          }
        } catch (err) {
          console.warn('Failed to parse saved subscriber columns:', err);
        }
      }
    };

    handleUpdate();
    window.addEventListener('zctrl:table-settings-changed', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('zctrl:table-settings-changed', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    try {
      const saved = safeStorage.getItem('subscribers_visible_cols');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.filter((k: string) => k !== 'actions');
        }
      }
      return DEFAULT_COLUMN_KEYS.filter((k) => k !== 'actions');
    } catch {
      return DEFAULT_COLUMN_KEYS.filter((k) => k !== 'actions');
    }
  });
  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    try {
      const saved = safeStorage.getItem('subscribers_col_order');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.filter((k: string) => k !== 'actions');
        }
      }
      return DEFAULT_COLUMN_KEYS.filter((k) => k !== 'actions');
    } catch {
      return DEFAULT_COLUMN_KEYS.filter((k) => k !== 'actions');
    }
  });
  const [isColumnCustomizerOpen, setIsColumnCustomizerOpen] = useState(false);
  const [activeActionModal, setActiveActionModal] = useState<ActionModalType>(null);

  // Sorting State
  const [sortState, setSortState] = useState<ColumnSortState>({
    key: 'username',
    direction: 'asc'
  });

  // Debounced State Reconciliation Controller
  const actionDebouncerRef = useRef(new ActionDebouncer());

  useEffect(() => {
    const debouncer = actionDebouncerRef.current;
    return () => {
      debouncer.cancel();
    };
  }, []);

  // Single edit: state and effect for loading vouchers map
  const [voucherMap, setVoucherMap] = useState<Map<string, { price: number; batchId?: string; isSynced?: boolean; profileName?: string; timeLimit?: string; dataLimit?: string | number }>>(new Map());

  useEffect(() => {
    let isMounted = true;
    let activeController: AbortController | null = null;
    const fetchVouchers = async () => {
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;
      try {
        const res = await secureFetch('/api/vouchers/price-map', { signal: controller.signal });
        if (res.ok) {
          const json = await safeParseJson(res);
          const mapData = json?.data || {};
          if (isMounted) {
            const newMap = new Map<string, { price: number; batchId?: string; isSynced?: boolean; profileName?: string; timeLimit?: string; dataLimit?: string | number }>();
            Object.keys(mapData).forEach(key => {
              const item = mapData[key];
              newMap.set(key.toLowerCase(), {
                price: typeof item.price === 'number' ? item.price : parseFloat(item.price) || 0,
                batchId: item.batchId,
                isSynced: item.isSynced ?? true,
                profileName: item.profileName || item.profile || undefined,
                timeLimit: item.timeLimit || item.limitUptime || undefined,
                dataLimit: item.dataLimit || item.limitBytesTotal || undefined
              });
            });
            setVoucherMap(newMap);
          }
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.warn('Could not load vouchers map for price matching:', err);
        }
      }
    };
    fetchVouchers();
    const handleVoucherChange = () => {
      fetchVouchers();
    };
    window.addEventListener('zctrl:vouchers-changed', handleVoucherChange);
    return () => {
      isMounted = false;
      activeController?.abort();
      window.removeEventListener('zctrl:vouchers-changed', handleVoucherChange);
    };
  }, [hotspotUsers.length, pppSecrets.length, usermanUsers.length]);

  // Quick helper to extract price from comment if available
  const parsePriceFromComment = (comment?: string): number | undefined => {
    if (!comment) return undefined;
    const match = comment.match(/(?:سعر|سعر الكرت|Price|price)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
    if (match) {
      const val = parseFloat(match[1]);
      return isNaN(val) ? undefined : val;
    }
    return undefined;
  };

  // Quick single item edit state

  // Save Column settings to localStorage
  const handleToggleColumn = (key: string) => {
    setVisibleColumns((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      safeStorage.setItem('subscribers_visible_cols', JSON.stringify(next));
      return next;
    });
  };

  const handleSetAllVisible = (keys: string[]) => {
    setVisibleColumns(keys);
    safeStorage.setItem('subscribers_visible_cols', JSON.stringify(keys));
  };

  const handleChangeOrder = (newOrder: string[]) => {
    setColumnOrder(newOrder);
    safeStorage.setItem('subscribers_col_order', JSON.stringify(newOrder));
  };

  const handleResetDefaultColumns = () => {
    const defaultCols = DEFAULT_COLUMN_KEYS.filter((k) => k !== 'actions');
    setVisibleColumns(defaultCols);
    setColumnOrder(defaultCols);
    safeStorage.removeItem('subscribers_visible_cols');
    safeStorage.removeItem('subscribers_col_order');
    showToast('تمت إعادة ضبط أعمدة الجدول إلى الوضع الافتراضي', 'info');
  };

  // Sorting Handler
  const handleSortChange = (columnKey: string) => {
    setSortState((prev) => {
      if (prev.key === columnKey) {
        return {
          key: columnKey,
          direction: prev.direction === 'asc' ? 'desc' : 'asc'
        };
      }
      return {
        key: columnKey,
        direction: 'asc'
      };
    });
  };

  // Optimize DHCP Leases map for instant lookup O(1)
  const dhcpLeasesMap = useMemo(() => {
    const map = new Map<string, any>();
    if (Array.isArray(dhcpLeases)) {
      dhcpLeases.forEach((l) => {
        if (!l) return;
        const mac = String(l.macAddress || l['mac-address'] || '').toLowerCase().replace(/[:-]/g, '');
        if (mac) {
          map.set(mac, l);
        }
      });
    }
    return map;
  }, [dhcpLeases]);

  // Optimize Hotspot Active map and Set for instant lookup O(1)
  const hotspotActiveMap = useMemo(() => {
    const map = new Map<string, any>();
    if (Array.isArray(hotspotActive)) {
      hotspotActive.forEach((a) => {
        if (!a) return;
        const u = String(a?.user || (a as any)?.name || '').toLowerCase();
        if (u) map.set(u, a);
      });
    }
    return map;
  }, [hotspotActive]);

  const hotspotActiveSet = useMemo(() => {
    return new Set<string>(hotspotActiveMap.keys());
  }, [hotspotActiveMap]);

  // Optimize PPP Active map and Set for instant lookup O(1)
  const pppActiveMap = useMemo(() => {
    const map = new Map<string, any>();
    if (Array.isArray(pppActive)) {
      pppActive.forEach((a) => {
        if (!a) return;
        const u = String(a?.name || (a as any)?.user || '').toLowerCase();
        if (u) map.set(u, a);
      });
    }
    return map;
  }, [pppActive]);

  const pppActiveSet = useMemo(() => {
    return new Set<string>(pppActiveMap.keys());
  }, [pppActiveMap]);

  // Optimize Userman Active map and Set for instant lookup O(1) with RADIUS bridge
  const usermanActiveMap = useMemo(() => {
    const map = new Map<string, any>();
    if (Array.isArray(usermanActive)) {
      usermanActive.forEach((a) => {
        if (!a) return;
        const u = String(a?.user || (a as any)?.name || (a as any)?.username || '').toLowerCase();
        if (u) map.set(u, a);
      });
    }
    if (Array.isArray(usermanUsers)) {
      const umUserNames = new Set(usermanUsers.map((u) => String(u?.name || '').toLowerCase()));
      if (Array.isArray(hotspotActive)) {
        hotspotActive.forEach((ha) => {
          const u = String(ha?.user || (ha as any)?.name || '').toLowerCase();
          if (u && umUserNames.has(u) && !map.has(u)) {
            map.set(u, {
              id: ha?.id || (ha as any)?.['.id'] || `hs-${u}`,
              user: ha?.user || (ha as any)?.name || u,
              nasIp: 'Hotspot / RADIUS',
              assignedIp: ha?.address || '',
              callerId: ha?.macAddress || (ha as any)?.['mac-address'] || '',
              macAddress: ha?.macAddress || (ha as any)?.['mac-address'] || '',
              uptime: ha?.uptime || '0s',
              bytesIn: ha?.bytesIn || 0,
              bytesOut: ha?.bytesOut || 0,
              idleTime: (ha as any)?.idleTime || (ha as any)?.['idle-time'] || '0s'
            });
          }
        });
      }
      if (Array.isArray(pppActive)) {
        pppActive.forEach((pa) => {
          const u = String(pa?.name || (pa as any)?.user || '').toLowerCase();
          if (u && umUserNames.has(u) && !map.has(u)) {
            map.set(u, {
              id: pa?.id || (pa as any)?.['.id'] || `ppp-${u}`,
              user: pa?.name || (pa as any)?.user || u,
              nasIp: 'PPPoE / RADIUS',
              assignedIp: pa?.address || '',
              callerId: pa?.callerId || (pa as any)?.['caller-id'] || '',
              macAddress: pa?.callerId || (pa as any)?.['caller-id'] || '',
              uptime: pa?.uptime || '0s',
              bytesIn: pa?.bytesIn || 0,
              bytesOut: pa?.bytesOut || 0,
              idleTime: (pa as any)?.idleTime || '0s'
            });
          }
        });
      }
    }
    return map;
  }, [usermanActive, usermanUsers, hotspotActive, pppActive]);

  const usermanActiveSet = useMemo(() => {
    return new Set<string>(usermanActiveMap.keys());
  }, [usermanActiveMap]);

  const activeUsermanSessionsList = useMemo(() => {
    return Array.from(usermanActiveMap.values());
  }, [usermanActiveMap]);

  // Track previous active sessions to capture disconnect events in real-time
  const prevActiveUsersRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let currentActiveNames: Set<string>;
    if (activeSystem === 'hotspot') {
      currentActiveNames = hotspotActiveSet;
    } else if (activeSystem === 'pppoe') {
      currentActiveNames = pppActiveSet;
    } else {
      currentActiveNames = usermanActiveSet;
    }

    if (prevActiveUsersRef.current.size > 0) {
      const nowIso = new Date().toISOString();
      for (const prevUser of prevActiveUsersRef.current) {
        if (!currentActiveNames.has(prevUser)) {
          recordDisconnectTime(prevUser, nowIso);
        }
      }
    }

    for (const activeUser of currentActiveNames) {
      clearStoredDisconnectTime(activeUser);
    }

    prevActiveUsersRef.current = currentActiveNames;
  }, [activeSystem, hotspotActiveSet, pppActiveSet, usermanActiveSet]);

  // Convert raw entities to normalized row items
  const normalizedHotspotItems: SubscriberRowItem[] = useMemo(() => {
    if (!Array.isArray(hotspotUsers)) return [];
    return hotspotUsers.map((u, idx) => {
      const uName = String(u?.name || '').toLowerCase();
      const activeObj = hotspotActiveMap.get(uName);

      const mac = activeObj?.macAddress || u?.macAddress || '';
      const cleanMac = mac.toLowerCase().replace(/[:-]/g, '');
      const lease = cleanMac ? dhcpLeasesMap.get(cleanMac) : undefined;
      const hostName = lease?.hostName || lease?.['host-name'] || (activeObj as any)?.hostName || (activeObj as any)?.['host-name'] || '';

      const rawComment = u?.comment ? String(u.comment) : '';
      const { cleanComment, extractedCreatedAt } = getParsedComment(rawComment, u?.createdAt);

      const codeName = String(u?.name || '');
      const matchedVoucher = voucherMap.get(codeName.toLowerCase());
      const extractedPrice = matchedVoucher?.price ?? u?.price ?? parsePriceFromComment(rawComment);
      const isVoucher = Boolean(matchedVoucher || u?.isVoucher || rawComment.includes('ZCtrl') || rawComment.includes('Batch'));

      // Accurate Profile Resolution:
      let resolvedProfile = String(u?.profile || '').trim();
      if (!resolvedProfile && matchedVoucher?.profileName) {
        resolvedProfile = matchedVoucher.profileName.trim();
      }
      if (!resolvedProfile && rawComment) {
        const pFromComment = parseProfileFromComment(rawComment);
        if (pFromComment) resolvedProfile = pFromComment.trim();
      }
      if (!resolvedProfile) {
        resolvedProfile = 'default';
      }

      // Accurate Speed Resolution:
      const matchedProfile = hotspotProfiles.find(
        (p) => String(p.name).toLowerCase().trim() === resolvedProfile.toLowerCase().trim()
      );
      const status = getHotspotUserStatus(u, hotspotActiveSet, matchedProfile, matchedVoucher);
      const resolvedRateLimit = (u as any)?.rateLimit || matchedProfile?.rateLimit || '';
      const ipAddress = activeObj?.address || (u as any)?.address || (activeObj as any)?.['address'] || '';

      const rawObj = (u as any)?.raw || u;
      const rawIdleTime = activeObj?.idleTime || (activeObj as any)?.['idle-time'] || rawObj?.['idle-time'] || rawObj?.idleTime || '';
      const routerDisconnect = u?.lastLoggedOut || rawObj?.['last-logged-out'] || rawObj?.lastLoggedOut;
      const storedDisconnect = getStoredDisconnectTime(codeName);
      const effectiveDisconnect = routerDisconnect || storedDisconnect;

      const resolvedLimitUptime = u?.limitUptime ? String(u.limitUptime) : (matchedProfile?.sessionTimeout || matchedVoucher?.timeLimit || '');
      const resolvedLimitBytes =
        Number(u?.limitBytesTotal) ||
        parseDataLimitToBytes(matchedVoucher?.dataLimit) ||
        (matchedProfile?.dataQuotaMb ? Math.round(Number(matchedProfile.dataQuotaMb) * 1024 * 1024) : 0);
      const resolvedLimits = resolveProfileLimits(
        resolvedProfile,
        matchedProfile,
        { limitUptime: resolvedLimitUptime || undefined, limitBytesTotal: resolvedLimitBytes || undefined },
        matchedVoucher
      );

      return {
        id: String(u?.id || u?.['.id'] || u?.name || `hs-${idx}`),
        name: codeName || 'مستخدم',
        password: u?.password ? String(u.password) : '',
        profile: resolvedProfile,
        rateLimit: resolvedRateLimit,
        ipAddress,
        // Use active session uptime if online, otherwise user total uptime
        uptime: activeObj?.uptime ? String(activeObj.uptime) : String(u?.uptime || '0s'),
        bytesIn: activeObj?.bytesIn ? Number(activeObj.bytesIn) : Number(u?.bytesIn) || 0,
        bytesOut: activeObj?.bytesOut ? Number(activeObj.bytesOut) : Number(u?.bytesOut) || 0,
        limitUptime: resolvedLimitUptime,
        limitBytesTotal: resolvedLimitBytes,
        comment: cleanComment,
        disabled: Boolean(u?.disabled),
        macAddress: activeObj?.macAddress ? String(activeObj.macAddress) : u?.macAddress ? String(u.macAddress) : '',
        callerId: activeObj?.macAddress ? String(activeObj.macAddress) : u?.macAddress ? String(u.macAddress) : '',
        hostName,
        createdAt: u?.createdAt || extractedCreatedAt || (rawObj as any)?.createdAt || '',
        price: extractedPrice,
        isVoucher,
        status,
        idleTime: rawIdleTime,
        lastLoggedOut: effectiveDisconnect,
        lastLoggedIn: u?.lastLoggedIn || rawObj?.['last-logged-in'],
        disconnectTime: effectiveDisconnect,
        raw: {
          ...rawObj,
          ...u,
          activeObj,
          idleTime: rawIdleTime,
          'idle-time': rawIdleTime,
          lastLoggedOut: effectiveDisconnect,
          'last-logged-out': effectiveDisconnect,
          createdAt: u?.createdAt || extractedCreatedAt || (rawObj as any)?.createdAt || '',
          _matchedProfile: matchedProfile,
          _resolvedTimeSec: resolvedLimits.timeLimitSec,
          _resolvedDataBytes: resolvedLimits.dataLimitBytes
        }
      };
    });
  }, [hotspotUsers, hotspotActiveMap, hotspotActiveSet, dhcpLeasesMap, voucherMap, hotspotProfiles]);

  const normalizedPppItems: SubscriberRowItem[] = useMemo(() => {
    if (!Array.isArray(pppSecrets)) return [];
    return pppSecrets.map((s, idx) => {
      const sName = String(s?.name || '').toLowerCase();
      const activeObj = pppActiveMap.get(sName);

      const mac = activeObj?.callerId || s?.callerId || '';
      const cleanMac = mac.toLowerCase().replace(/[:-]/g, '');
      const lease = cleanMac ? dhcpLeasesMap.get(cleanMac) : undefined;
      const hostName = lease?.hostName || lease?.['host-name'] || (activeObj as any)?.hostName || (activeObj as any)?.['host-name'] || '';

      const rawComment = s?.comment ? String(s.comment) : '';
      const { cleanComment, extractedCreatedAt } = getParsedComment(rawComment);

      const codeName = String(s?.name || '');
      const matchedVoucher = voucherMap.get(codeName.toLowerCase());
      const extractedPrice = matchedVoucher?.price ?? (s as any)?.price ?? parsePriceFromComment(rawComment);
      const isVoucher = Boolean(matchedVoucher || (s as any)?.isVoucher || rawComment.includes('ZCtrl') || rawComment.includes('Batch'));

      // Accurate Profile Resolution:
      let resolvedProfile = String(s?.profile || '').trim();
      if (!resolvedProfile && matchedVoucher?.profileName) {
        resolvedProfile = matchedVoucher.profileName.trim();
      }
      if (!resolvedProfile && rawComment) {
        const pFromComment = parseProfileFromComment(rawComment);
        if (pFromComment) resolvedProfile = pFromComment.trim();
      }
      if (!resolvedProfile) {
        resolvedProfile = 'default';
      }

      // Accurate Speed Resolution:
      const matchedProfile = pppProfiles.find(
        (p) => String(p.name).toLowerCase().trim() === resolvedProfile.toLowerCase().trim()
      );
      const status = getPPPSecretStatus(s, pppActiveSet, matchedProfile, matchedVoucher);
      const resolvedRateLimit = (s as any)?.rateLimit || matchedProfile?.rateLimit || '';
      const ipAddress = activeObj?.address || (s as any)?.remoteAddress || (s as any)?.localAddress || '';

      const rawObj = (s as any)?.raw || s;
      const rawIdleTime = activeObj?.idleTime || (activeObj as any)?.['idle-time'] || rawObj?.['idle-time'] || rawObj?.idleTime || '';
      const routerDisconnect = s?.lastLoggedOut || rawObj?.['last-logged-out'] || rawObj?.lastLoggedOut;
      const storedDisconnect = getStoredDisconnectTime(codeName);
      const effectiveDisconnect = routerDisconnect || storedDisconnect;
      const resolvedLimitUptime = s?.limitUptime ? String(s.limitUptime) : (matchedVoucher?.timeLimit || '');
      const resolvedLimitBytes =
        Number(s?.limitBytesTotal) ||
        parseDataLimitToBytes(matchedVoucher?.dataLimit) ||
        ((matchedProfile as any)?.dataQuotaMb ? Math.round(Number((matchedProfile as any).dataQuotaMb) * 1024 * 1024) : 0);
      const resolvedLimits = resolveProfileLimits(
        resolvedProfile,
        matchedProfile,
        { limitUptime: resolvedLimitUptime || undefined, limitBytesTotal: resolvedLimitBytes || undefined },
        matchedVoucher
      );

      return {
        id: String(s?.id || s?.['.id'] || s?.name || `ppp-${idx}`),
        name: codeName || 'مشترك PPPoE',
        password: s?.password ? String(s.password) : '',
        profile: resolvedProfile,
        rateLimit: resolvedRateLimit,
        ipAddress,
        uptime: String(activeObj?.uptime || '0s'),
        bytesIn: activeObj?.bytesIn ? Number(activeObj.bytesIn) : 0,
        bytesOut: activeObj?.bytesOut ? Number(activeObj.bytesOut) : 0,
        limitUptime: resolvedLimitUptime,
        limitBytesTotal: resolvedLimitBytes,
        comment: cleanComment,
        disabled: Boolean(s?.disabled),
        macAddress: activeObj?.callerId ? String(activeObj.callerId) : s?.callerId ? String(s.callerId) : '',
        callerId: activeObj?.callerId ? String(activeObj.callerId) : s?.callerId ? String(s.callerId) : '',
        hostName,
        createdAt: extractedCreatedAt,
        price: extractedPrice,
        isVoucher,
        status,
        idleTime: rawIdleTime,
        lastLoggedOut: effectiveDisconnect,
        lastLoggedIn: s?.lastLoggedIn || rawObj?.['last-logged-in'],
        disconnectTime: effectiveDisconnect,
        raw: {
          ...rawObj,
          ...s,
          activeObj,
          idleTime: rawIdleTime,
          'idle-time': rawIdleTime,
          lastLoggedOut: effectiveDisconnect,
          'last-logged-out': effectiveDisconnect,
          _matchedProfile: matchedProfile,
          _resolvedTimeSec: resolvedLimits.timeLimitSec,
          _resolvedDataBytes: resolvedLimits.dataLimitBytes
        }
      };
    });
  }, [pppSecrets, pppActiveMap, pppActiveSet, dhcpLeasesMap, voucherMap, pppProfiles]);

  const normalizedUsermanItems: SubscriberRowItem[] = useMemo(() => {
    if (!Array.isArray(usermanUsers)) return [];
    return usermanUsers.map((u, idx) => {
      const uName = String(u?.name || '').toLowerCase();
      const activeObj = usermanActiveMap.get(uName);
      const rawObj = (u as any)?.raw || u;

      const mac =
        activeObj?.callerId ||
        activeObj?.macAddress ||
        (u as any)?.callerId ||
        (u as any)?.macAddress ||
        (u as any)?.latestMac ||
        (rawObj as any)?.latestMac ||
        '';
      const cleanMac = mac.toLowerCase().replace(/[:-]/g, '');
      const lease = cleanMac ? dhcpLeasesMap.get(cleanMac) : undefined;
      const hostName =
        lease?.hostName ||
        lease?.['host-name'] ||
        (activeObj as any)?.hostName ||
        (activeObj as any)?.['host-name'] ||
        (u as any)?.hostName ||
        (u as any)?.latestHostName ||
        (rawObj as any)?.latestHostName ||
        '';

      const rawComment = u?.comment ? String(u.comment) : '';
      const { cleanComment, extractedCreatedAt } = getParsedComment(rawComment, u?.createdAt);

      const codeName = String(u?.name || '');
      const matchedVoucher = voucherMap.get(codeName.toLowerCase());
      const extractedPrice = matchedVoucher?.price ?? u?.price ?? parsePriceFromComment(rawComment);
      const isVoucher = Boolean(matchedVoucher || u?.isVoucher || rawComment.includes('ZCtrl') || rawComment.includes('Batch'));

      // Accurate Profile Resolution:
      let resolvedProfile = String(u?.profile || (u as any)?.['actual-profile'] || (u as any)?.group || '').trim();
      if (!resolvedProfile && matchedVoucher?.profileName) {
        resolvedProfile = matchedVoucher.profileName.trim();
      }
      if (!resolvedProfile && rawComment) {
        const pFromComment = parseProfileFromComment(rawComment);
        if (pFromComment) resolvedProfile = pFromComment.trim();
      }
      if (!resolvedProfile) {
        resolvedProfile = 'default';
      }

      // Accurate Speed & Limits Resolution:
      const matchedProfile = usermanProfiles.find(
        (p) => String(p.name).toLowerCase().trim() === resolvedProfile.toLowerCase().trim()
      );
      const status = getUsermanUserStatus(u, usermanActiveSet, matchedProfile, matchedVoucher);
      const resolvedRateLimit = (u as any)?.rateLimit || matchedProfile?.rateLimit || '';
      const ipAddress = activeObj?.assignedIp || activeObj?.address || (u as any)?.assignedIp || (activeObj as any)?.['assigned-ip'] || (activeObj as any)?.['host-ip'] || '';

      const rawIdleTime = (activeObj as any)?.idleTime || (activeObj as any)?.['idle-time'] || rawObj?.['idle-time'] || rawObj?.idleTime || '';
      const routerDisconnect =
        u?.lastLoggedOut ||
        rawObj?.['last-logged-out'] ||
        rawObj?.lastLoggedOut ||
        rawObj?.['last-seen'] ||
        rawObj?.lastSeen ||
        rawObj?.latestSession?.['to-time'] ||
        rawObj?.latestSession?.toTime;
      const storedDisconnect = getStoredDisconnectTime(codeName);
      const effectiveDisconnect = routerDisconnect || storedDisconnect;

      const resolvedLimitUptime =
        u?.limitUptime
          ? String(u.limitUptime)
          : (matchedProfile?.uptimeLimit || matchedVoucher?.timeLimit || '');
      const resolvedLimitBytes =
        Number(u?.limitBytesTotal) ||
        Number((matchedProfile as any)?.transferLimit) ||
        Number((matchedProfile as any)?.downloadLimit) ||
        ((matchedProfile as any)?.transferLimitMb ? Math.round(Number((matchedProfile as any).transferLimitMb) * 1024 * 1024) : 0) ||
        ((matchedProfile as any)?.downloadLimitMb ? Math.round(Number((matchedProfile as any).downloadLimitMb) * 1024 * 1024) : 0) ||
        ((matchedProfile as any)?.dataQuotaMb ? Math.round(Number((matchedProfile as any).dataQuotaMb) * 1024 * 1024) : 0) ||
        parseDataLimitToBytes(matchedVoucher?.dataLimit);

      const resolvedLimits = resolveProfileLimits(
        resolvedProfile,
        matchedProfile,
        { limitUptime: resolvedLimitUptime || undefined, limitBytesTotal: resolvedLimitBytes || undefined },
        matchedVoucher
      );

      const effectiveCreatedAt = u?.createdAt || extractedCreatedAt || (rawObj as any)?.createdAt || '';

      return {
        id: String(u?.id || u?.['.id'] || u?.name || `um-${idx}`),
        name: codeName || 'مشترك يوزر مانجر',
        password: u?.password ? String(u.password) : '',
        profile: resolvedProfile,
        rateLimit: resolvedRateLimit,
        ipAddress,
        uptime: activeObj?.uptime ? String(activeObj.uptime) : String(u?.uptime || '0s'),
        bytesIn: activeObj?.bytesIn ? Number(activeObj.bytesIn) : Number(u?.bytesIn) || 0,
        bytesOut: activeObj?.bytesOut ? Number(activeObj.bytesOut) : Number(u?.bytesOut) || 0,
        limitUptime: resolvedLimitUptime,
        limitBytesTotal: resolvedLimitBytes,
        comment: cleanComment,
        disabled: u?.state === 'disabled' || Boolean((u as any)?.disabled),
        macAddress: mac,
        callerId: mac,
        hostName,
        createdAt: effectiveCreatedAt,
        price: extractedPrice,
        isVoucher,
        status,
        idleTime: rawIdleTime,
        lastLoggedOut: effectiveDisconnect,
        lastLoggedIn: u?.lastLoggedIn || rawObj?.['last-logged-in'],
        disconnectTime: effectiveDisconnect,
        raw: {
          ...rawObj,
          ...u,
          activeObj,
          idleTime: rawIdleTime,
          'idle-time': rawIdleTime,
          lastLoggedOut: effectiveDisconnect,
          'last-logged-out': effectiveDisconnect,
          createdAt: effectiveCreatedAt,
          endTime: (u as any)?.endTime || (rawObj as any)?.endTime || (rawObj as any)?.['end-time'] || (rawObj as any)?.['till-time'],
          _matchedProfile: matchedProfile,
          _resolvedTimeSec: resolvedLimits.timeLimitSec,
          _resolvedDataBytes: resolvedLimits.dataLimitBytes
        }
      };
    });
  }, [usermanUsers, usermanActiveMap, usermanActiveSet, dhcpLeasesMap, voucherMap, usermanProfiles]);

  // Current active raw dataset
  const currentNormalizedItems = useMemo(() => {
    if (activeSystem === 'hotspot') return normalizedHotspotItems;
    if (activeSystem === 'pppoe') return normalizedPppItems;
    return normalizedUsermanItems;
  }, [activeSystem, normalizedHotspotItems, normalizedPppItems, normalizedUsermanItems]);

  // Status Counts for 6 strict categories (All, Connected, Idle, Suspended, Expired, New)
  const statusCounts = useMemo(() => {
    let online = 0,
      idle = 0,
      suspended = 0,
      expired = 0,
      newCards = 0;
    currentNormalizedItems.forEach((item) => {
      if (item.status === 'online') {
        online++;
      } else if (item.status === 'suspended') {
        suspended++;
      } else if (item.status === 'expired') {
        expired++;
      } else if (item.status === 'idle') {
        idle++;
      } else if (item.status === 'new') {
        newCards++;
      }
    });
    return {
      total: currentNormalizedItems.length,
      online,
      idle,
      suspended,
      expired,
      new: newCards
    };
  }, [currentNormalizedItems]);

  // Filtered Items (Search, Profile, Status, Column-specific filter)
  const filteredItems = useMemo(() => {
    return currentNormalizedItems.filter((item) => {
      const q = searchQuery.trim().toLowerCase();

      // Search match
      let matchSearch = true;
      if (q) {
        const nameStr = String(item.name || '').toLowerCase();
        const passStr = String(item.password || '').toLowerCase();
        const profStr = String(item.profile || '').toLowerCase();
        const commStr = String(item.comment || '').toLowerCase();
        const macStr = String(item.macAddress || item.callerId || '').toLowerCase();

        if (searchColumn === 'username') {
          matchSearch = nameStr.includes(q);
        } else if (searchColumn === 'device') {
          const dev = detectDeviceType(item.macAddress, item.callerId, item.comment, item.hostName);
          matchSearch =
            dev.label.toLowerCase().includes(q) ||
            dev.vendor.toLowerCase().includes(q) ||
            macStr.includes(q);
        } else if (searchColumn === 'mac') {
          matchSearch = macStr.includes(q);
        } else if (searchColumn === 'profile') {
          matchSearch = profStr.includes(q);
        } else if (searchColumn === 'notes') {
          matchSearch = commStr.includes(q);
        } else {
          // All columns search
          const dev = detectDeviceType(item.macAddress, item.callerId, item.comment, item.hostName);
          matchSearch =
            nameStr.includes(q) ||
            passStr.includes(q) ||
            profStr.includes(q) ||
            commStr.includes(q) ||
            macStr.includes(q) ||
            dev.label.toLowerCase().includes(q);
        }
      }

      // Profile match
      let matchProfile = selectedProfile === 'all' || item.profile === selectedProfile;
      if (matchProfile && advancedFilters.selectedProfiles.length > 0) {
        matchProfile = advancedFilters.selectedProfiles.includes(item.profile);
      }
      if (!matchProfile) return false;

      // Status match (Standard Status bar)
      let matchStatus = true;
      if (statusFilter !== 'all') {
        if (statusFilter === 'idle') {
          matchStatus = item.status === 'idle';
        } else {
          matchStatus = item.status === statusFilter;
        }
      }
      if (!matchStatus) return false;

      // Advanced Activity / Connection Filter (Active / Inactive / Suspended)
      if (advancedFilters.activity !== 'all') {
        if (advancedFilters.activity === 'active') {
          if (item.status !== 'online') return false;
        } else if (advancedFilters.activity === 'inactive') {
          if (item.status === 'online' || item.status === 'suspended') return false;
        } else if (advancedFilters.activity === 'suspended') {
          if (item.status !== 'suspended' && !item.disabled) return false;
        }
      }

      // Advanced Expiry & Date Range Filter
      if (
        advancedFilters.expiry !== 'all' ||
        advancedFilters.expiryFrom ||
        advancedFilters.expiryTo
      ) {
        const remTime = calculateRemainingTime(
          item.limitUptime,
          item.uptime,
          item.raw?.endTime || item.raw?.['end-time'] || item.raw?.['till-time'],
          item.profile,
          item.raw?._resolvedTimeSec
        );
        const remData = calculateRemainingData(
          item.limitBytesTotal,
          (Number(item.bytesIn) || 0) + (Number(item.bytesOut) || 0),
          item.profile,
          item.raw?._resolvedDataBytes
        );
        const isExpired = item.status === 'expired' || remTime.isExpired || remData.isExpired;

        let expiryMatches = true;
        if (advancedFilters.expiry === 'expired') {
          expiryMatches = isExpired;
        } else if (advancedFilters.expiry === 'expiring_24h') {
          if (isExpired) {
            expiryMatches = false;
          } else {
            const remSec = remTime.remainingSeconds;
            expiryMatches = remSec !== Infinity && remSec > 0 && remSec <= 24 * 3600;
          }
        } else if (advancedFilters.expiry === 'expiring_3d') {
          if (isExpired) {
            expiryMatches = false;
          } else {
            const remSec = remTime.remainingSeconds;
            expiryMatches = remSec !== Infinity && remSec > 0 && remSec <= 3 * 86400;
          }
        } else if (advancedFilters.expiry === 'expiring_7d') {
          if (isExpired) {
            expiryMatches = false;
          } else {
            const remSec = remTime.remainingSeconds;
            expiryMatches = remSec !== Infinity && remSec > 0 && remSec <= 7 * 86400;
          }
        } else if (advancedFilters.expiry === 'active_valid') {
          expiryMatches = !isExpired;
        }

        if (!expiryMatches) return false;

        // Custom date range filter
        if (advancedFilters.expiryFrom || advancedFilters.expiryTo) {
          let itemDate: Date | null = null;
          const endTimeRaw = item.raw?.endTime || item.raw?.['end-time'] || item.raw?.['till-time'];
          if (endTimeRaw) {
            itemDate = parseMikrotikDateTime(endTimeRaw);
          }
          if (!itemDate && remTime.remainingSeconds > 0 && remTime.remainingSeconds !== Infinity) {
            itemDate = new Date(Date.now() + remTime.remainingSeconds * 1000);
          }
          if (!itemDate && item.createdAt) {
            itemDate = parseMikrotikDateTime(item.createdAt);
          }

          if (itemDate) {
            const itemMs = itemDate.getTime();
            if (advancedFilters.expiryFrom) {
              const fromMs = new Date(`${advancedFilters.expiryFrom}T00:00:00`).getTime();
              if (itemMs < fromMs) return false;
            }
            if (advancedFilters.expiryTo) {
              const toMs = new Date(`${advancedFilters.expiryTo}T23:59:59`).getTime();
              if (itemMs > toMs) return false;
            }
          } else {
            return false;
          }
        }
      }

      return matchSearch;
    });
  }, [currentNormalizedItems, searchQuery, searchColumn, selectedProfile, statusFilter, advancedFilters]);

  // Sorted Items (High-performance multi-column sorting)
  const sortedAndFilteredItems = useMemo(() => {
    if (!sortState.key) return filteredItems;

    const sorted = [...filteredItems].sort((a, b) => {
      let comparison = 0;
      const nameA = String(a?.name || '');
      const nameB = String(b?.name || '');
      const profA = String(a?.profile || '');
      const profB = String(b?.profile || '');
      const statA = String(a?.status || '');
      const statB = String(b?.status || '');

      switch (sortState.key) {
        case 'username':
          comparison = nameA.localeCompare(nameB, 'ar', { numeric: true });
          break;

        case 'status':
          comparison = statA.localeCompare(statB);
          break;

        case 'profile':
          comparison = profA.localeCompare(profB);
          break;

        case 'deviceType': {
          const devA = detectDeviceType(a.macAddress, a.callerId, a.comment, a.hostName).label;
          const devB = detectDeviceType(b.macAddress, b.callerId, b.comment, b.hostName).label;
          comparison = devA.localeCompare(devB, 'ar');
          break;
        }

        case 'connectionTime': {
          const secA = parseDurationToSeconds(a.uptime);
          const secB = parseDurationToSeconds(b.uptime);
          comparison = secA - secB;
          break;
        }

        case 'idleTime': {
          const idleA = calculateSubscriberIdleInfo(a).idleSeconds;
          const idleB = calculateSubscriberIdleInfo(b).idleSeconds;
          comparison = idleA - idleB;
          break;
        }

        case 'disconnectTime': {
          const discA = calculateSubscriberDisconnectInfo(a).timestamp;
          const discB = calculateSubscriberDisconnectInfo(b).timestamp;
          comparison = discA - discB;
          break;
        }

        case 'remainingTimeAndData': {
          const remA = calculateRemainingTime(
            a.limitUptime,
            a.uptime,
            a.raw?.endTime || a.raw?.['end-time'] || a.raw?.['till-time'],
            a.profile,
            a.raw?._resolvedTimeSec
          ).remainingSeconds;
          const remB = calculateRemainingTime(
            b.limitUptime,
            b.uptime,
            b.raw?.endTime || b.raw?.['end-time'] || b.raw?.['till-time'],
            b.profile,
            b.raw?._resolvedTimeSec
          ).remainingSeconds;
          comparison = remA - remB;
          break;
        }

        case 'voucherTimeAndData': {
          const timeA = a.raw?._resolvedTimeSec || parseDurationToSeconds(a.limitUptime);
          const timeB = b.raw?._resolvedTimeSec || parseDurationToSeconds(b.limitUptime);
          const bytesA = a.raw?._resolvedDataBytes || a.limitBytesTotal || 0;
          const bytesB = b.raw?._resolvedDataBytes || b.limitBytesTotal || 0;
          const limA = timeA + bytesA;
          const limB = timeB + bytesB;
          comparison = limA - limB;
          break;
        }

        case 'price':
          comparison = (Number(a.price) || 0) - (Number(b.price) || 0);
          break;

        case 'creationDate': {
          const dateA = a.createdAt ? parseMikrotikDateTime(a.createdAt)?.getTime() || 0 : 0;
          const dateB = b.createdAt ? parseMikrotikDateTime(b.createdAt)?.getTime() || 0 : 0;
          comparison = dateA - dateB;
          break;
        }

        case 'notes': {
          const noteA = String(a.comment || '');
          const noteB = String(b.comment || '');
          comparison = noteA.localeCompare(noteB, 'ar');
          break;
        }

        default:
          comparison = nameA.localeCompare(nameB, 'ar', { numeric: true });
          break;
      }

      return sortState.direction === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [filteredItems, sortState]);

  // Current profiles list for dropdown with subscriber counts
  const currentProfilesList = useMemo(() => {
    let rawList: any[] = [];
    if (activeSystem === 'hotspot') rawList = Array.isArray(hotspotProfiles) ? hotspotProfiles : [];
    else if (activeSystem === 'pppoe') rawList = Array.isArray(pppProfiles) ? pppProfiles : [];
    else rawList = Array.isArray(usermanProfiles) ? usermanProfiles : [];

    const countsMap: Record<string, number> = {};
    currentNormalizedItems.forEach((item) => {
      const p = item.profile || 'default';
      countsMap[p] = (countsMap[p] || 0) + 1;
    });

    return rawList.map((p, idx) => ({
      id: String(p?.id || p?.['.id'] || p?.name || idx),
      name: String(p?.name || 'default'),
      subscriberCount: countsMap[String(p?.name || 'default')] || 0
    }));
  }, [activeSystem, hotspotProfiles, pppProfiles, usermanProfiles, currentNormalizedItems]);

  // Switch system handler
  const handleSystemChange = (sys: SubscriberSystem) => {
    setActiveSystem(sys);
    setSelectedIds([]);
    setSelectedSessionIds([]);
    setSelectedProfile('all');
    setStatusFilter('all');
    setSearchQuery('');
    setAdvancedFilters(initialAdvancedFilters);
  };

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const isAllFilteredSelected = useMemo(() => {
    return sortedAndFilteredItems.length > 0 && sortedAndFilteredItems.every((u) => selectedIdSet.has(u.id));
  }, [sortedAndFilteredItems, selectedIdSet]);

  // Selection handlers
  const toggleSelectAll = () => {
    if (isAllFilteredSelected) {
      const filteredSet = new Set(sortedAndFilteredItems.map((u) => u.id));
      setSelectedIds((prev) => prev.filter((id) => !filteredSet.has(id)));
    } else {
      setSelectedIds((prev) => {
        const merged = new Set(prev);
        sortedAndFilteredItems.forEach((u) => merged.add(u.id));
        return Array.from(merged);
      });
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  // Action modal opening
  const handleOpenActionModal = (type: ActionModalType) => {
    if (selectedIds.length === 0) {
      showToast('يرجى تحديد مشترك واحد على الأقل أولاً', 'info');
      return;
    }
    setActiveActionModal(type);
  };

  const handleCloseActionModal = () => {
    setActiveActionModal(null);
  };

  // Quick Action on single row
  const handleQuickEdit = (item: SubscriberRowItem) => {
    setSelectedIds([item.id]);
    setActiveActionModal('edit');
  };

  const handleQuickRenew = async (item: SubscriberRowItem) => {
    const res = await batchSubscriberAction({
      system: activeSystem,
      action: 'renew',
      ids: [item.id],
      payload: { resetUptime: true, resetBytes: true, enableAccount: true }
    });
    if (!res?.success) {
      showToast(res?.message || `تعذر تجديد اشتراك (${item.name}) على المايكروتك`, 'error');
    }
  };

  const handleQuickToggleSuspend = async (item: SubscriberRowItem) => {
    const isCurrentlySuspended = item.disabled || item.status === 'suspended';
    let res: { success: boolean; message?: string } | undefined;
    if (activeSystem === 'hotspot') {
      res = await updateHotspotUser(item.id, { disabled: !isCurrentlySuspended });
    } else if (activeSystem === 'pppoe') {
      res = await updatePPPSecret(item.id, { disabled: !isCurrentlySuspended });
    } else {
      res = await updateUsermanUser(item.id, { disabled: !isCurrentlySuspended });
    }
    if (!res?.success) {
      showToast(res?.message || `فشل تغيير حالة الحساب (${item.name}) على المايكروتك`, 'error');
    }
  };

  const handleQuickDisconnect = async (item: SubscriberRowItem) => {
    let actFound = false;
    let res: { success: boolean; message?: string } | undefined;
    if (activeSystem === 'hotspot') {
      const act = hotspotActive.find((a) => a.user.toLowerCase() === item.name.toLowerCase());
      if (act) {
        actFound = true;
        res = await kickHotspotUser(act.id, act.user);
      }
    } else if (activeSystem === 'pppoe') {
      const act = pppActive.find((a) => a.name.toLowerCase() === item.name.toLowerCase());
      if (act) {
        actFound = true;
        res = await disconnectPPPActive(act.id, act.name);
      }
    } else {
      const act = usermanActiveMap.get(item.name.toLowerCase()) || usermanActive.find((a) => a.user.toLowerCase() === item.name.toLowerCase());
      if (act) {
        actFound = true;
        res = await disconnectUsermanActive(act.id, act.user, false, act.nasIp);
      }
    }

    if (!actFound) {
      showToast(`المشترك (${item.name}) ليس لديه جلسة نشطة حالياً في الراوتر لفصلها`, 'info');
      return;
    }

    if (res?.success) {
      recordDisconnectTime(item.name);
    } else {
      showToast(res?.message || `تعذر فصل جلسة المشترك (${item.name}) من المايكروتك`, 'error');
    }
  };

  const handleQuickDelete = (item: SubscriberRowItem) => {
    setSelectedIds([item.id]);
    setActiveActionModal('delete');
  };

  // Active Sessions selection and bulk disconnect helpers
  const currentActiveSessionsList = useMemo(() => {
    if (activeSystem === 'hotspot') return hotspotActive || [];
    if (activeSystem === 'pppoe') return pppActive || [];
    return activeUsermanSessionsList || [];
  }, [activeSystem, hotspotActive, pppActive, activeUsermanSessionsList]);

  const isAllSessionsSelected = currentActiveSessionsList.length > 0 && selectedSessionIds.length === currentActiveSessionsList.length;

  const toggleSelectAllSessions = () => {
    if (isAllSessionsSelected) {
      setSelectedSessionIds([]);
    } else {
      setSelectedSessionIds(currentActiveSessionsList.map((a: any) => a.id));
    }
  };

  const toggleSelectOneSession = (id: string) => {
    setSelectedSessionIds((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  };

  const handleDisconnectSelectedSessions = async () => {
    if (selectedSessionIds.length === 0) {
      showToast('يرجى تحديد جلسة نشطة واحدة على الأقل لفصلها', 'info');
      return;
    }
    if (!isConnected) {
      showToast('الراوتر غير متصل. يرجى الاتصال بالراوتر أولاً', 'error');
      return;
    }

    try {
      const targets: any[] = [];
      for (const sessId of selectedSessionIds) {
        if (activeSystem === 'hotspot') {
          const act = hotspotActive.find((a) => a.id === sessId || a.user === sessId);
          if (act) targets.push(act);
        } else if (activeSystem === 'pppoe') {
          const act = pppActive.find((a) => a.id === sessId || a.name === sessId);
          if (act) targets.push(act);
        } else {
          const act = activeUsermanSessionsList.find((a) => a.id === sessId || a.user === sessId);
          if (act) targets.push(act);
        }
      }

      if (targets.length === 0) {
        showToast('لم يتم العثور على جلسات نشطة مطابقة للتحديد', 'info');
        setSelectedSessionIds([]);
        return;
      }

      let successCount = 0;
      let failCount = 0;
      const CHUNK_SIZE = 4;

      for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
        const chunk = targets.slice(i, i + CHUNK_SIZE);
        const results = await Promise.allSettled(
          chunk.map((act) => {
            if (activeSystem === 'hotspot') {
              return kickHotspotUser(act.id, act.user, true);
            }
            if (activeSystem === 'pppoe') {
              return disconnectPPPActive(act.id, act.name, true);
            }
            return disconnectUsermanActive(act.id, act.user, true, act.nasIp);
          })
        );

        results.forEach((r, idx) => {
          if (r.status === 'fulfilled' && r.value?.success) {
            successCount++;
            const targetName = targets[i + idx]?.user || targets[i + idx]?.name;
            if (targetName) recordDisconnectTime(targetName);
          } else {
            failCount++;
          }
        });
      }

      if (successCount > 0 && failCount === 0) {
        showToast(`تم طرد وفصل ${successCount} جلسة نشطة بنجاح من الراوتر وتحديث القائمة`, 'success');
      } else if (successCount > 0) {
        showToast(`تم فصل ${successCount} جلسة، وفشل فصل ${failCount} جلسة`, 'info');
      } else {
        showToast('تعذر فصل الجلسات المحددة من المايكروتك', 'error');
      }

      setSelectedSessionIds([]);
      await refreshData(true);
    } catch (err: any) {
      showToast(err?.message || 'حدث خطأ أثناء فصل الجلسات المحددة', 'error');
    }
  };

  // Batch executions triggered from modal with Debounced State Reconciliation
  const handleExecuteEditSingleHotspot = async (id: string, data: Partial<HotspotUser>) => {
    return actionDebouncerRef.current.debounce(`edit_hs_${id}`, async () => {
      const res = await updateHotspotUser(id, data);
      if (res.success) {
        showToast('تم تحديث بيانات المشترك بنجاح وتأكيدها على الراوتر', 'success');
        setSelectedIds([]);
        return res;
      }
      throw new Error(res.message || 'فشل تحديث بيانات المشترك على المايكروتك');
    }, 100);
  };

  const handleExecuteEditSinglePPP = async (id: string, data: Partial<PPPSecret>) => {
    return actionDebouncerRef.current.debounce(`edit_ppp_${id}`, async () => {
      const res = await updatePPPSecret(id, data);
      if (res.success) {
        showToast('تم تحديث بيانات مشترك البرودباند بنجاح وتأكيدها على الراوتر', 'success');
        setSelectedIds([]);
        return res;
      }
      throw new Error(res.message || 'فشل تحديث بيانات مشترك البرودباند على المايكروتك');
    }, 100);
  };

  const handleExecuteEditSingleUserman = async (id: string, data: Partial<UsermanUser>) => {
    return actionDebouncerRef.current.debounce(`edit_um_${id}`, async () => {
      const res = await updateUsermanUser(id, data);
      if (res.success) {
        showToast('تم تحديث بيانات مشترك اليوزر مانجر بنجاح وتأكيدها على الراوتر', 'success');
        setSelectedIds([]);
        return res;
      }
      throw new Error(res.message || 'فشل تحديث بيانات مشترك اليوزر مانجر على المايكروتك');
    }, 100);
  };

  const handleExecuteBatchChangeProfile = async (newProfile: string, resetLimits: boolean) => {
    if (!isConnected) {
      showToast('الراوتر غير متصل. يرجى الاتصال بالراوتر أولاً لتنفيذ الإجراءات الحقيقية', 'error');
      throw new Error('الراوتر غير متصل');
    }
    const validIds = selectedIds.filter(id => Boolean(id && String(id).trim()));
    if (validIds.length === 0) {
      showToast('لم يتم تحديد أي مشترك حقيقي لتنفيذ العملية', 'error');
      throw new Error('قائمة المشتركين فارغة');
    }

    return actionDebouncerRef.current.debounce(`batch_profile_${activeSystem}`, async () => {
      const res = await batchSubscriberAction({
        system: activeSystem,
        action: 'change_profile',
        ids: validIds,
        payload: { profile: newProfile, resetLimits }
      });
      if (res.success) {
        setSelectedIds([]);
        return res;
      }
      throw new Error(res.message || 'فشل نقل باقة المشتركين على المايكروتك');
    }, 100);
  };

  const handleExecuteBatchRenew = async (resetUptime: boolean, resetBytes: boolean, enableAccount: boolean) => {
    if (!isConnected) {
      showToast('الراوتر غير متصل. يرجى الاتصال بالراوتر أولاً لتنفيذ الإجراءات الحقيقية', 'error');
      throw new Error('الراوتر غير متصل');
    }
    const validIds = selectedIds.filter(id => Boolean(id && String(id).trim()));
    if (validIds.length === 0) {
      showToast('لم يتم تحديد أي مشترك حقيقي لتنفيذ العملية', 'error');
      throw new Error('قائمة المشتركين فارغة');
    }

    const res = await batchSubscriberAction({
      system: activeSystem,
      action: 'renew',
      ids: validIds,
      payload: { resetUptime, resetBytes, enableAccount }
    });
    if (res.success) {
      setSelectedIds([]);
      return res;
    }
    throw new Error(res.message || 'فشل تجديد اشتراك المشتركين على المايكروتك');
  };

  const handleExecuteBatchToggleStatus = async (enable: boolean, kickActive: boolean) => {
    if (!isConnected) {
      showToast('الراوتر غير متصل. يرجى الاتصال بالراوتر أولاً لتنفيذ الإجراءات الحقيقية', 'error');
      throw new Error('الراوتر غير متصل');
    }
    const validIds = selectedIds.filter(id => Boolean(id && String(id).trim()));
    if (validIds.length === 0) {
      showToast('لم يتم تحديد أي مشترك حقيقي لتنفيذ العملية', 'error');
      throw new Error('قائمة المشتركين فارغة');
    }

    return actionDebouncerRef.current.debounce(`batch_toggle_${activeSystem}`, async () => {
      const res = await batchSubscriberAction({
        system: activeSystem,
        action: 'toggle_status',
        ids: validIds,
        payload: { enable, kickActive }
      });
      if (res.success) {
        setSelectedIds([]);
        return res;
      }
      throw new Error(res.message || 'فشل تغيير حالة المشتركين على المايكروتك');
    }, 100);
  };

  const handleExecuteBatchDisconnect = async () => {
    if (!isConnected) {
      showToast('الراوتر غير متصل. يرجى الاتصال بالراوتر أولاً لتنفيذ الإجراءات الحقيقية', 'error');
      throw new Error('الراوتر غير متصل');
    }
    const validIds = selectedIds.filter(id => Boolean(id && String(id).trim()));
    if (validIds.length === 0) {
      showToast('لم يتم تحديد أي مشترك حقيقي لتنفيذ العملية', 'error');
      throw new Error('قائمة المشتركين فارغة');
    }
    const res = await batchSubscriberAction({
      system: activeSystem,
      action: 'disconnect',
      ids: validIds
    });
    if (res.success) {
      setSelectedIds([]);
      return res;
    }
    throw new Error(res.message || 'فشل فصل الجلسات على المايكروتك');
  };

  const handleExecuteBatchDelete = async () => {
    if (!isConnected) {
      showToast('الراوتر غير متصل. يرجى الاتصال بالراوتر أولاً لتنفيذ الإجراءات الحقيقية', 'error');
      throw new Error('الراوتر غير متصل');
    }
    const validIds = selectedIds.filter(id => Boolean(id && String(id).trim()));
    if (validIds.length === 0) {
      showToast('لم يتم تحديد أي مشترك حقيقي لتنفيذ العملية', 'error');
      throw new Error('قائمة المشتركين فارغة');
    }
    const res = await batchSubscriberAction({
      system: activeSystem,
      action: 'delete',
      ids: validIds
    });
    if (res.success) {
      setSelectedIds([]);
      return res;
    }
    throw new Error(res.message || 'فشل حذف المشتركين من المايكروتك');
  };

  const handleExecuteBatchEdit = async (data: any) => {
    if (!isConnected) {
      showToast('الراوتر غير متصل. يرجى الاتصال بالراوتر أولاً لتنفيذ الإجراءات الحقيقية', 'error');
      throw new Error('الراوتر غير متصل');
    }
    const validIds = selectedIds.filter(id => Boolean(id && String(id).trim()));
    if (validIds.length === 0) {
      showToast('لم يتم تحديد أي مشترك حقيقي لتنفيذ العملية', 'error');
      throw new Error('قائمة المشتركين فارغة');
    }
    const res = await batchSubscriberAction({
      system: activeSystem,
      action: 'edit',
      ids: validIds,
      payload: data
    });
    if (res.success) {
      setSelectedIds([]);
      return res;
    }
    throw new Error(res.message || 'فشل تعديل المشتركين على المايكروتك');
  };

  const handleExecuteAddSubscriber = async (sys: SubscriberSystem, data: any) => {
    try {
      let res: { success: boolean; message: string } | undefined;
      if (sys === 'hotspot') {
        res = await addUser(data);
      } else if (sys === 'pppoe') {
        res = await addPPPSecret(data);
      } else if (sys === 'userman') {
        res = await addUsermanUser(data);
      }
      if (res && res.success) {
        return res;
      } else {
        throw new Error(res?.message || 'خطأ أثناء إضافة المشترك على المايكروتك');
      }
    } catch (e: any) {
      showToast(e?.message || 'خطأ أثناء إضافة المشترك على المايكروتك', 'error');
      throw e;
    }
  };

  const handleCopySelected = async () => {
    const selectedRows = sortedAndFilteredItems.filter((item) => selectedIdSet.has(item.id));
    if (selectedRows.length === 0) {
      showToast('لم يتم العثور على بيانات لنسخها', 'info');
      return;
    }
    const text = selectedRows
      .map(
        (u) =>
          `User: ${u.name} | Pass: ${u.password || u.name} | Profile: ${u.profile} | Status: ${u.status}`
      )
      .join('\n');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      showToast(`تم نسخ بيانات ${selectedRows.length} مشترك إلى الحافظة`, 'success');
    } catch {
      showToast('تعذر الوصول للحافظة لنسخ البيانات', 'error');
    }
  };

  const handleExportCsv = (usersList: any[]) => {
    exportUsersToCsv(usersList);
    showToast('تم تصدير ملف CSV بنجاح', 'success');
  };

  const activeSystemName =
    activeSystem === 'hotspot'
      ? 'الهوتسبوت Hotspot'
      : activeSystem === 'pppoe'
      ? 'البرودباند PPPoE'
      : 'اليوزر مانجر User Manager';

  return (
    <div className="space-y-6 pb-20">
      {/* 1. Top System Switcher Header Cards (Compact) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3 pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <Users className="w-3.5 h-3.5" />
            </div>
            <h1 className="text-base font-bold text-white">إدارة المشتركين</h1>
            <span className="hidden sm:inline-block text-xs text-slate-400 border-r border-slate-700 pr-2 mr-1">
              {activeSystemName}
            </span>
          </div>
        </div>

        {/* 3 Main System Selector Tabs (Compact) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {/* Hotspot */}
          <button
            type="button"
            onClick={() => handleSystemChange('hotspot')}
            className={`px-3 py-2 rounded-xl border text-right transition-colors cursor-pointer flex items-center justify-between ${
              activeSystem === 'hotspot'
                ? 'bg-slate-850 border-blue-500/80 shadow-xs'
                : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60'
            }`}
          >
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Wifi className="w-3 h-3" />
              </div>
              <span className="font-bold text-xs text-white">هوتسبوت</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums">
              <span className="text-slate-400">{hotspotUsers.length}</span>
              <span className="text-emerald-400 font-semibold">متصل: {hotspotActive.length}</span>
            </div>
          </button>

          {/* PPPoE */}
          <button
            type="button"
            onClick={() => handleSystemChange('pppoe')}
            className={`px-3 py-2 rounded-xl border text-right transition-colors cursor-pointer flex items-center justify-between ${
              activeSystem === 'pppoe'
                ? 'bg-slate-850 border-emerald-500/80 shadow-xs'
                : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60'
            }`}
          >
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Network className="w-3 h-3" />
              </div>
              <span className="font-bold text-xs text-white">برودباند</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums">
              <span className="text-slate-400">{pppSecrets.length}</span>
              <span className="text-emerald-400 font-semibold">متصل: {pppActive.length}</span>
            </div>
          </button>

          {/* User Manager */}
          <button
            type="button"
            onClick={() => handleSystemChange('userman')}
            className={`px-3 py-2 rounded-xl border text-right transition-colors cursor-pointer flex items-center justify-between ${
              activeSystem === 'userman'
                ? 'bg-slate-850 border-purple-500/80 shadow-xs'
                : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60'
            }`}
          >
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <Shield className="w-3 h-3" />
              </div>
              <span className="font-bold text-xs text-white">يوزر مانجر</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums">
              <span className="text-slate-400">{usermanUsers.length}</span>
              <span className="text-purple-400 font-semibold">متصل: {usermanActive.length}</span>
            </div>
          </button>
        </div>
      </div>

      {/* 2. Sub-Tabs: Subscribers List vs Active Sessions */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-1.5 flex items-center justify-between gap-2 shadow-sm">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveSubTab('subscribers')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'subscribers'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>الحسابات</span>
            <span className="bg-slate-950/60 text-white text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded-md">
              {sortedAndFilteredItems.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('sessions')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'sessions'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>الجلسات المتصلة</span>
            <span className="bg-emerald-500/20 text-emerald-300 text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded-md border border-emerald-500/30">
              {activeSystem === 'hotspot'
                ? hotspotActive.length
                : activeSystem === 'pppoe'
                ? pppActive.length
                : usermanActive.length}
            </span>
          </button>
        </div>
      </div>

      {/* 3. Main Content: Subscribers Table View or Active Sessions Monitor */}
      {activeSubTab === 'subscribers' ? (
        <div className="space-y-4">
          {/* Search, Column Filter, Profile Dropdown, and Status Category Tabs */}
          <SubscribersFilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchColumn={searchColumn}
            onSearchColumnChange={setSearchColumn}
            selectedProfile={selectedProfile}
            onProfileChange={setSelectedProfile}
            profilesList={currentProfilesList}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            statusCounts={statusCounts}
            onOpenColumnCustomizer={() => setIsColumnCustomizerOpen(true)}
            onOpenAddSubscriberModal={() => setActiveActionModal('add')}
            onExportPdf={() => setIsPdfModalOpen(true)}
            density={density}
            onChangeDensity={handleDensityChange}
            activeSystemName={activeSystemName}
            isAdvancedOpen={isAdvancedFilterOpen}
            onToggleAdvanced={() => setIsAdvancedFilterOpen((prev) => !prev)}
            advancedActiveCount={advancedActiveCount}
            advancedFilters={advancedFilters}
            onResetAdvancedFilters={handleResetAdvancedFilters}
            onClearAdvancedActivity={handleClearAdvancedActivity}
            onClearAdvancedExpiry={handleClearAdvancedExpiry}
            onClearAdvancedProfiles={handleClearAdvancedProfiles}
            onClearAdvancedDateRange={handleClearAdvancedDateRange}
          />

          {/* Advanced Filter Panel Component */}
          <AdvancedFilterPanel
            isOpen={isAdvancedFilterOpen}
            onClose={() => setIsAdvancedFilterOpen(false)}
            filters={advancedFilters}
            onChangeFilters={setAdvancedFilters}
            onResetFilters={handleResetAdvancedFilters}
            profilesList={currentProfilesList}
            totalMatching={sortedAndFilteredItems.length}
            totalSubscribers={currentNormalizedItems.length}
          />

          {/* Full-Featured Responsive Subscribers Table with Dynamic Columns and Sorting */}
          <SubscribersTable
            system={activeSystem}
            items={sortedAndFilteredItems}
            selectedIds={selectedIds}
            onToggleSelectAll={toggleSelectAll}
            onToggleSelectOne={toggleSelectOne}
            sortState={sortState}
            onSortChange={handleSortChange}
            visibleColumns={visibleColumns}
            columnOrder={columnOrder}
            onChangeColumnOrder={handleChangeOrder}
            density={density}
            showToast={showToast}
            statusFilter={statusFilter}
          />
        </div>
      ) : (
        /* Active Sessions Live Monitor Sub-Tab */
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl space-y-3">
          {/* Active Sessions Control Toolbar */}
          <div className="p-3 bg-slate-950/70 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-200">
                جلسات {activeSystemName} المتصلة حالياً:
              </span>
              <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono font-bold">
                {currentActiveSessionsList.length} متصل
              </span>
              {selectedSessionIds.length > 0 && (
                <span className="px-2 py-0.5 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/40 font-mono font-bold">
                  {selectedSessionIds.length} محدد
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {selectedSessionIds.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={handleDisconnectSelectedSessions}
                    className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer active:scale-95"
                    title="طرد وفصل جميع الجلسات المحددة فورياً من الراوتر"
                  >
                    <UserX className="w-3.5 h-3.5" />
                    <span>طرد الجلسات المحددة ({selectedSessionIds.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedSessionIds([])}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors cursor-pointer"
                  >
                    إلغاء التحديد
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => refreshData()}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                title="تحديث قائمة الجلسات النشطة مباشرة من المايكروتك"
              >
                <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
                <span>تحديث الجلسات</span>
              </button>
            </div>
          </div>

          {activeSystem === 'hotspot' && (
            <div className="overflow-x-auto overflow-y-auto max-h-[420px]">
              <table className="w-full text-right text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-bold select-none sticky top-0 z-10">
                  <tr>
                    <th className="p-3.5 text-center w-10">
                      <button
                        type="button"
                        onClick={toggleSelectAllSessions}
                        className="text-slate-400 hover:text-white cursor-pointer transition-colors p-1"
                        title={isAllSessionsSelected ? 'إلغاء تحديد الكل' : 'تحديد كل الجلسات'}
                      >
                        {isAllSessionsSelected ? (
                          <CheckSquare className="w-4 h-4 text-blue-400" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                    <th className="p-3.5">المستخدم النشط</th>
                    <th className="p-3.5">عنوان IP</th>
                    <th className="p-3.5">الماك أدرس</th>
                    <th className="p-3.5">طريقة الدخول</th>
                    <th className="p-3.5">مدة الاتصال</th>
                    <th className="p-3.5">رفع / تنزيل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {hotspotActive.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500 font-medium">
                        لا يوجد مستخدمين متصلين حالياً على سيرفر الهوتسبوت
                      </td>
                    </tr>
                  ) : (
                    hotspotActive.slice(0, 500).map((a) => {
                      const isSelected = selectedSessionIds.includes(a.id);
                      return (
                        <tr
                          key={a.id}
                          onClick={() => toggleSelectOneSession(a.id)}
                          className={`transition-colors cursor-pointer ${
                            isSelected ? 'bg-blue-950/40 hover:bg-blue-950/50' : 'hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="p-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => toggleSelectOneSession(a.id)}
                              className="text-slate-400 hover:text-white cursor-pointer transition-colors p-1"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-blue-400" />
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                            </button>
                          </td>
                          <td className="p-3.5 font-bold text-white font-mono flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                            <span dir="ltr" className="font-bold text-white font-mono truncate unicode-isolate">{a.user}</span>
                          </td>
                          <td className="p-3.5 font-mono text-cyan-300" dir="ltr">
                            <span className="unicode-isolate">{a.address}</span>
                          </td>
                          <td className="p-3.5 font-mono text-slate-400" dir="ltr">
                            <span className="unicode-isolate">{a.macAddress}</span>
                          </td>
                          <td className="p-3.5 uppercase font-mono text-blue-400 font-semibold">{a.loginBy}</td>
                          <td className="p-3.5 font-mono text-slate-200" dir="ltr">
                            <span className="unicode-isolate">{a.uptime}</span>
                          </td>
                          <td className="p-3.5 font-mono" dir="ltr">
                            <span className="unicode-isolate">
                              <span className="text-emerald-400">↑ {formatBytes(a.bytesIn)}</span>
                              <span className="text-slate-500 mx-1">|</span>
                              <span className="text-blue-400">↓ {formatBytes(a.bytesOut)}</span>
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeSystem === 'pppoe' && (
            <div className="overflow-x-auto overflow-y-auto max-h-[420px]">
              <table className="w-full text-right text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-bold select-none sticky top-0 z-10">
                  <tr>
                    <th className="p-3.5 text-center w-10">
                      <button
                        type="button"
                        onClick={toggleSelectAllSessions}
                        className="text-slate-400 hover:text-white cursor-pointer transition-colors p-1"
                        title={isAllSessionsSelected ? 'إلغاء تحديد الكل' : 'تحديد كل الجلسات'}
                      >
                        {isAllSessionsSelected ? (
                          <CheckSquare className="w-4 h-4 text-blue-400" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                    <th className="p-3.5">مشترك البرودباند المتصل</th>
                    <th className="p-3.5">نوع الخدمة</th>
                    <th className="p-3.5">عنوان IP البعيد</th>
                    <th className="p-3.5">عنوان MAC / Caller-ID</th>
                    <th className="p-3.5">التشفير</th>
                    <th className="p-3.5">مدة الاتصال</th>
                    <th className="p-3.5">رفع / تنزيل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {pppActive.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-500 font-medium">
                        لا يوجد اتصالات برودباند نشطة حالياً
                      </td>
                    </tr>
                  ) : (
                    pppActive.slice(0, 500).map((a) => {
                      const isSelected = selectedSessionIds.includes(a.id);
                      return (
                        <tr
                          key={a.id}
                          onClick={() => toggleSelectOneSession(a.id)}
                          className={`transition-colors cursor-pointer ${
                            isSelected ? 'bg-blue-950/40 hover:bg-blue-950/50' : 'hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="p-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => toggleSelectOneSession(a.id)}
                              className="text-slate-400 hover:text-white cursor-pointer transition-colors p-1"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-blue-400" />
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                            </button>
                          </td>
                          <td className="p-3.5 font-bold text-white font-mono flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                            <span dir="ltr" className="font-bold text-white font-mono truncate unicode-isolate">{a.name}</span>
                          </td>
                          <td className="p-3.5 uppercase font-mono text-emerald-400 font-bold">{a.service}</td>
                          <td className="p-3.5 font-mono text-cyan-300" dir="ltr">
                            <span className="unicode-isolate">{a.address}</span>
                          </td>
                          <td className="p-3.5 font-mono text-slate-400" dir="ltr">
                            <span className="unicode-isolate">{a.callerId || '—'}</span>
                          </td>
                          <td className="p-3.5 font-mono text-purple-300">{a.encoding || 'غير مشفر'}</td>
                          <td className="p-3.5 font-mono text-slate-200" dir="ltr">
                            <span className="unicode-isolate">{a.uptime}</span>
                          </td>
                          <td className="p-3.5 font-mono" dir="ltr">
                            <span className="unicode-isolate">
                              <span className="text-emerald-400">↑ {formatBytes(a.bytesIn || 0)}</span>
                              <span className="text-slate-500 mx-1">|</span>
                              <span className="text-blue-400">↓ {formatBytes(a.bytesOut || 0)}</span>
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeSystem === 'userman' && (
            <div className="overflow-x-auto overflow-y-auto max-h-[420px]">
              <table className="w-full text-right text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-bold select-none sticky top-0 z-10">
                  <tr>
                    <th className="p-3.5 text-center w-10">
                      <button
                        type="button"
                        onClick={toggleSelectAllSessions}
                        className="text-slate-400 hover:text-white cursor-pointer transition-colors p-1"
                        title={isAllSessionsSelected ? 'إلغاء تحديد الكل' : 'تحديد كل الجلسات'}
                      >
                        {isAllSessionsSelected ? (
                          <CheckSquare className="w-4 h-4 text-blue-400" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                    <th className="p-3.5">مشترك اليوزر مانجر النشط</th>
                    <th className="p-3.5">سيرفر NAS IP</th>
                    <th className="p-3.5">عنوان IP المخصص</th>
                    <th className="p-3.5">الماك أدرس / Calling-Station</th>
                    <th className="p-3.5">مدة الجلسة</th>
                    <th className="p-3.5">رفع / تنزيل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {activeUsermanSessionsList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500 font-medium">
                        لا يوجد جلسات اليوزر مانجر نشطة حالياً
                      </td>
                    </tr>
                  ) : (
                    activeUsermanSessionsList.slice(0, 500).map((a) => {
                      const isSelected = selectedSessionIds.includes(a.id);
                      return (
                        <tr
                          key={a.id}
                          onClick={() => toggleSelectOneSession(a.id)}
                          className={`transition-colors cursor-pointer ${
                            isSelected ? 'bg-blue-950/40 hover:bg-blue-950/50' : 'hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="p-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => toggleSelectOneSession(a.id)}
                              className="text-slate-400 hover:text-white cursor-pointer transition-colors p-1"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-blue-400" />
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                            </button>
                          </td>
                          <td className="p-3.5 font-bold text-white font-mono flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></span>
                            <span dir="ltr" className="font-bold text-white font-mono truncate unicode-isolate">{a.user}</span>
                          </td>
                          <td className="p-3.5 font-mono text-slate-400" dir="ltr">
                            <span className="unicode-isolate">{a.nasIp || '127.0.0.1'}</span>
                          </td>
                          <td className="p-3.5 font-mono text-cyan-300" dir="ltr">
                            <span className="unicode-isolate">{a.assignedIp || '—'}</span>
                          </td>
                          <td className="p-3.5 font-mono text-slate-400" dir="ltr">
                            <span className="unicode-isolate">{a.callerId || '—'}</span>
                          </td>
                          <td className="p-3.5 font-mono text-slate-200" dir="ltr">
                            <span className="unicode-isolate">{a.uptime || '0s'}</span>
                          </td>
                          <td className="p-3.5 font-mono" dir="ltr">
                            <span className="unicode-isolate">
                              <span className="text-emerald-400">↑ {formatBytes(a.bytesIn || 0)}</span>
                              <span className="text-slate-500 mx-1">|</span>
                              <span className="text-blue-400">↓ {formatBytes(a.bytesOut || 0)}</span>
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 4. Column Customizer Modal */}
      <ColumnCustomizerModal
        isOpen={isColumnCustomizerOpen}
        onClose={() => setIsColumnCustomizerOpen(false)}
        columnOrder={columnOrder}
        visibleColumns={visibleColumns}
        onChangeOrder={handleChangeOrder}
        onToggleColumn={handleToggleColumn}
        onSetAllVisible={handleSetAllVisible}
        onResetDefaults={handleResetDefaultColumns}
        density={density}
        onChangeDensity={handleDensityChange}
      />

      {/* 5. Floating Action Bar for Selected Subscribers */}
      {selectedIds.length > 0 && activeActionModal === null && (
        <ErrorBoundary fallbackTitle="حدث استثناء في شريط الإجراءات">
          <FloatingSubscribersActionBar
            selectedCount={selectedIds.length}
            totalCount={sortedAndFilteredItems.length}
            allSelected={isAllFilteredSelected}
            onToggleSelectAll={toggleSelectAll}
            onClearSelection={() => setSelectedIds([])}
            onOpenActionModal={handleOpenActionModal}
            onCopySelected={handleCopySelected}
            onOpenColumnCustomizer={() => setIsColumnCustomizerOpen(true)}
            onExportPdf={() => setIsPdfModalOpen(true)}
            isConnected={isConnected}
          />
        </ErrorBoundary>
      )}

      {/* 6. Action Modals */}
      <ErrorBoundary fallbackTitle="حدث استثناء في نافذة العمليات الجماعية">
        <SubscriberActionModals
          modalType={activeActionModal}
          onClose={handleCloseActionModal}
          selectedIds={selectedIds}
          system={activeSystem}
          hotspotUsers={hotspotUsers}
          pppSecrets={pppSecrets}
          usermanUsers={usermanUsers}
          hotspotProfiles={hotspotProfiles}
          pppProfiles={pppProfiles}
          usermanProfiles={usermanProfiles}
          onExecuteAddSubscriber={handleExecuteAddSubscriber}
          onExecuteEditSingleHotspot={handleExecuteEditSingleHotspot}
          onExecuteEditSinglePPP={handleExecuteEditSinglePPP}
          onExecuteEditSingleUserman={handleExecuteEditSingleUserman}
          onExecuteBatchChangeProfile={handleExecuteBatchChangeProfile}
          onExecuteBatchRenew={handleExecuteBatchRenew}
          onExecuteBatchToggleStatus={handleExecuteBatchToggleStatus}
          onExecuteBatchDisconnect={handleExecuteBatchDisconnect}
          onExecuteBatchDelete={handleExecuteBatchDelete}
          onExecuteBatchEdit={handleExecuteBatchEdit}
          onNavigateToPrint={onNavigateToPrint}
          onExportCsv={handleExportCsv}
          onExportPdf={() => setIsPdfModalOpen(true)}
          showToast={showToast}
        />
      </ErrorBoundary>

      {/* 7. Formatted Subscribers PDF Export Modal */}
      <PdfExportModal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
        activeTab="subscribers"
        customData={{ activeSystem }}
        customTitle={`تقرير مشتركي ${activeSystemName}`}
        filteredItems={sortedAndFilteredItems}
        selectedIds={selectedIds}
      />
    </div>
  );
};
