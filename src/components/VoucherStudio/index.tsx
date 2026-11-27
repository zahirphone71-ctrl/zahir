import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useMikroTik } from "../../context/MikroTikContext";
import { HotspotUser } from "../../types/mikrotik";
import { 
  VoucherDesignState, 
  RouterPrecheckInfo, 
  LAYOUT_OPTIONS, 
  GenerateResponse, 
  PageDataResponse, 
  VoucherItem,
  VoucherProfile 
} from "./types";
import { VoucherStudioHeader } from "./VoucherStudioHeader";
import { DesignTab } from "./DesignTab";
import { LiveVoucherPreview } from "./LiveVoucherPreview";
import { VoucherPrintModal } from "./VoucherPrintModal";
import { BatchesManagerTab } from "./BatchesManagerTab";
import { AllVouchersTab } from "./AllVouchersTab";
import { SystemStatsTab } from "./SystemStatsTab";
import { FinancialReportTab } from "./FinancialReportTab";
import { ThemeGalleryView } from "./ThemeGalleryView";
import { CustomVoucherModal } from "./CustomVoucherModal";
import { generateStandaloneVoucherHtmlAsync } from "./voucherHtmlGenerator";
import { preGenerateQrCodes } from "./qrPreGenerator";
import { exportBatchVouchersToPdf } from "./pdfExporter";
import { THEME_PRESETS } from "./themePresets";
import { autoCalcGrid, type GridResult } from "./gridCalculator";
import { safeStorage } from "../../utils/safeStorage";
import { printHtmlSafely } from "../../lib/printHelper";
import { secureFetch, safeParseJson } from "../../lib/api";
import { ConfirmModal } from "../ConfirmModal";
import { Palette, Printer, Sliders, Layers, Database, ShieldCheck, Sparkles, Coins } from "lucide-react";

const DEFAULT_DESIGN: VoucherDesignState = {
  theme: "modern",
  primaryColor: "#6366f1",
  bgColor: "#0f172a",
  cardTextColor: "#e2e8f0",
  borderColor: "#334155",
  networkName: "شبكة زاهر للإنترنت",
  loginUrl: "10.0.0.1",
  authMode: "user_only",
  sameUserPass: false,
  codeType: "numeric",
  charType: "numbers",
  passwordLength: 6,
  batchComment: "",
  systemType: "hotspot",
  price: 500,
  rowsCount: 7,

  currency: "YER",
  currencySymbol: "ريال",
  showQr: true,
  showBorder: true,
  showCutLines: true,
  showDataLimit: true,
  showProfileName: true,
  showBgImage: false,
  showLogo: false,
  logoSize: 45,
  paperType: "a4",
  columnsCount: 3,
  cardWidthMm: 85,
  cardHeightMm: 52,
  cardMarginTop: 5,
  cardMarginSide: 4,
  cardGap: 4,
  qrMode: "auto_login",
  coords: {
    network: { x: 18, y: 12 },
    profile: { x: 50, y: 12 },
    price: { x: 88, y: 12 },
    user: { x: 32, y: 44 },
    password: { x: 32, y: 68 },
    qr: { x: 84, y: 54 },
    time: { x: 20, y: 88 },
    dataLimit: { x: 68, y: 88 }
  },
  fontFamily: "Tajawal",
  slashedZero: true,
  autoPrefix: false,
  prefixValue: "",
  codeLength: 6,
  quantity: 50,
  elements: {
    network:   { show: true, color: "#ffffff", fontSize: 13, fontFamily: "Tajawal", fontWeight: "bold", rotation: 0, hasShadow: false },
    user:      { show: true, color: "#facc15", fontSize: 15, fontFamily: "JetBrains Mono", fontWeight: "extrabold", rotation: 0, hasShadow: false },
    password:  { show: true, color: "#ffffff", fontSize: 13, fontFamily: "JetBrains Mono", fontWeight: "bold", rotation: 0, hasShadow: false },
    price:     { show: true, color: "#f87171", fontSize: 12, fontFamily: "Tajawal", fontWeight: "bold", rotation: 0, hasShadow: false },
    time:      { show: true, color: "#94a3b8", fontSize: 10, fontFamily: "Tajawal", fontWeight: "normal", rotation: 0, hasShadow: false },
    profile:   { show: true, color: "#a5b4fc", fontSize: 11, fontFamily: "Tajawal", fontWeight: "bold", rotation: 0, hasShadow: false },
    dataLimit: { show: true, color: "#34d399", fontSize: 10, fontFamily: "Tajawal", fontWeight: "bold", rotation: 0, hasShadow: false }
  },
  autoSync: false,
  targetProfile: "default",
  timeLimit: "30 يوم",
  dataLimit: "5 GB"
};

// (dead waitForReady removed)

interface VoucherStudioProps {
  initialUsers?: HotspotUser[];
}

export function VoucherStudio({ initialUsers }: VoucherStudioProps = {}) {
  const { 
    router, 
    isConnected, 
    users, 
    profiles, 
    usermanProfiles,
    pppProfiles,
    wirelessInterfaces,
    hotspotServerProfiles,
    fetchWirelessData,
    fetchHotspotServerProfiles,
    syncNow, 
    showToast, 
    selectedUsersForPrint 
  } = useMikroTik();

  const [activeTab, setActiveTab] = useState<"merged" | "batches" | "all_vouchers" | "stats" | "gallery" | "financial">("merged");
  const [previewPosition, setPreviewPosition] = useState<"left" | "right">(() => {
    try {
      return safeStorage.getItem("zctrl_voucher_preview_position") === "right" ? "right" : "left";
    } catch {
      return "left";
    }
  });

  const togglePreviewPosition = () => {
    const next = previewPosition === "left" ? "right" : "left";
    setPreviewPosition(next);
    safeStorage.setItem("zctrl_voucher_preview_position", next);
  };

  const [design, setDesign] = useState<VoucherDesignState>(() => {
    try {
      const stored = safeStorage.getItem("zahir_current_voucher_design");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === "object") {
          const alreadyMigrated = safeStorage.getItem("zctrl_v2_clean_card_migrated") === "1";
          const nextParsed = { ...parsed };
          if (!alreadyMigrated) {
            if (nextParsed.autoPrefix === true && (!nextParsed.prefixValue || nextParsed.prefixValue === "ZHR")) {
              nextParsed.autoPrefix = false;
              nextParsed.prefixValue = "";
            }
            if (nextParsed.authMode === "user_equals_pass" && nextParsed.sameUserPass === true) {
              nextParsed.authMode = "user_only";
              nextParsed.sameUserPass = false;
            }
            safeStorage.setItem("zctrl_v2_clean_card_migrated", "1");
          }
          return {
            ...DEFAULT_DESIGN,
            ...nextParsed,
            coords: {
              ...DEFAULT_DESIGN.coords,
              ...(nextParsed.coords && typeof nextParsed.coords === "object" ? nextParsed.coords : {})
            },
            elements: {
              ...DEFAULT_DESIGN.elements,
              ...(nextParsed.elements && typeof nextParsed.elements === "object" ? nextParsed.elements : {})
            }
          };
        }
      }
      safeStorage.setItem("zctrl_v2_clean_card_migrated", "1");
      return DEFAULT_DESIGN;
    } catch {
      return DEFAULT_DESIGN;
    }
  });

  const [generating, setGenerating] = useState(false);
  const [lastBatchResult, setLastBatchResult] = useState<GenerateResponse | null>(() => {
    try {
      const saved = safeStorage.getItem('zctrl_last_batch_info');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [generatedBatchVouchers, setGeneratedBatchVouchers] = useState<VoucherItem[]>(() => {
    try {
      const saved = safeStorage.getItem('zctrl_last_batch_vouchers');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.slice(0, 24);
        }
      }
      return [];
    } catch {
      return [];
    }
  });

  // When navigating from Subscribers with selected users, switch immediately to selected vouchers
  useEffect(() => {
    if (initialUsers && initialUsers.length > 0) {
      setGeneratedBatchVouchers([]);
      setLastBatchResult(null);
    }
  }, [initialUsers]);

  // Print modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalPage, setModalPage] = useState(1);
  const [syncing, setSyncing] = useState(false);
  const [isCustomVoucherModalOpen, setIsCustomVoucherModalOpen] = useState(false);

  // Router Precheck from API + lifecycle refs
  const isMountedRef = useRef(true);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const precheckAbortRef = useRef<AbortController | null>(null);
  const [serverPrecheck, setServerPrecheck] = useState<RouterPrecheckInfo | null>(null);
  const [loadingPrecheck, setLoadingPrecheck] = useState(false);

  const trackTimer = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timersRef.current.delete(id);
      fn();
    }, ms);
    timersRef.current.add(id);
    return id;
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      precheckAbortRef.current?.abort();
      timersRef.current.forEach(clearTimeout);
      timersRef.current.clear();
    };
  }, []);

  const fetchServerPrecheck = useCallback(async (): Promise<boolean> => {
    precheckAbortRef.current?.abort();
    const controller = new AbortController();
    precheckAbortRef.current = controller;
    if (isMountedRef.current) setLoadingPrecheck(true);
    try {
      const res = await secureFetch('/api/vouchers/precheck', {
        signal: controller.signal
      });
      if (!res.ok) return false;
      const data = (await safeParseJson(res)) || {};
      if (isMountedRef.current && data.success && data.data) {
        setServerPrecheck(data.data);
        return true;
      }
      return false;
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.warn('Could not fetch server precheck:', e);
      }
      return false;
    } finally {
      if (isMountedRef.current) setLoadingPrecheck(false);
    }
  }, []);

  useEffect(() => {
    fetchServerPrecheck();
    if (isConnected) {
      if ((!wirelessInterfaces || wirelessInterfaces.length === 0) && fetchWirelessData) {
        fetchWirelessData();
      }
      if ((!hotspotServerProfiles || hotspotServerProfiles.length === 0) && fetchHotspotServerProfiles) {
        fetchHotspotServerProfiles();
      }
    }
  }, [isConnected, fetchServerPrecheck]);

  // Fetch Network SSID and Hotspot Login URL from Network Tab / Router settings
  const handleFetchNetworkInfo = async (userRequested = true) => {
    try {
      if (fetchWirelessData) await fetchWirelessData();
      if (fetchHotspotServerProfiles) await fetchHotspotServerProfiles();
    } catch (e) {
      console.warn("Error refreshing network data:", e);
    }

    const activeWifi = (wirelessInterfaces || []).find(w => !w.disabled && w.ssid?.trim());
    const anyWifi = (wirelessInterfaces || []).find(w => w.ssid?.trim());
    const detectedNet = activeWifi?.ssid || anyWifi?.ssid || router?.name || router?.boardName;

    const profileDns = (hotspotServerProfiles || []).find(p => p.dnsName?.trim());
    const profileAddr = (hotspotServerProfiles || []).find(p => p.hotspotAddress?.trim());
    const detectedUrl = profileDns?.dnsName || profileAddr?.hotspotAddress || router?.host;

    const finalNet = detectedNet ? detectedNet.trim() : null;
    const finalUrl = detectedUrl ? detectedUrl.trim() : null;

    setDesign(prev => ({
      ...prev,
      networkName: finalNet || prev.networkName,
      loginUrl: finalUrl || prev.loginUrl,
    }));

    if (userRequested) {
      if (finalNet || finalUrl) {
        showToast(
          `تم الجلب بنجاح:\n• SSID: ${finalNet || design.networkName}\n• الرابط: ${finalUrl || design.loginUrl}`,
          "success"
        );
      } else {
        showToast("تمت المزامنة بنجاح", "info");
      }
    }
  };

  // Auto-fill networkName and loginUrl when wireless or hotspot profiles update
  useEffect(() => {
    const activeWifi = (wirelessInterfaces || []).find(w => !w.disabled && w.ssid && w.ssid.trim() !== '');
    const anyWifi = (wirelessInterfaces || []).find(w => w.ssid && w.ssid.trim() !== '');
    const detectedNet = activeWifi?.ssid || anyWifi?.ssid;

    const profileDns = (hotspotServerProfiles || []).find(p => p.dnsName && p.dnsName.trim() !== '');
    const profileAddr = (hotspotServerProfiles || []).find(p => p.hotspotAddress && p.hotspotAddress.trim() !== '');
    const detectedUrl = profileDns?.dnsName || profileAddr?.hotspotAddress;

    if (detectedNet || detectedUrl) {
      setDesign(prev => {
        const isCustom = prev.networkNameSource === "custom";
        return {
          ...prev,
          networkName: isCustom ? prev.networkName : (detectedNet ? detectedNet.trim() : prev.networkName),
          loginUrl: detectedUrl ? detectedUrl.trim() : prev.loginUrl
        };
      });
    }
  }, [wirelessInterfaces, hotspotServerProfiles]);

  // Load saved design from server on mount if available
  useEffect(() => {
    let isMounted = true;
    try {
      secureFetch('/api/vouchers/design/current')
        .then(res => res.ok ? safeParseJson(res) : null)
        .then(data => {
          if (isMounted && data?.success && data?.design && typeof data.design === 'object') {
            const serverDesign = { ...data.design };
            const serverMigrated = safeStorage.getItem("zctrl_v2_clean_card_server_migrated") === "1";
            if (!serverMigrated) {
              if (serverDesign.autoPrefix === true && (!serverDesign.prefixValue || serverDesign.prefixValue === "ZHR")) {
                serverDesign.autoPrefix = false;
                serverDesign.prefixValue = "";
              }
              if (serverDesign.authMode === "user_equals_pass" && serverDesign.sameUserPass === true) {
                serverDesign.authMode = "user_only";
                serverDesign.sameUserPass = false;
              }
              safeStorage.setItem("zctrl_v2_clean_card_server_migrated", "1");
            }
            setDesign(prev => ({
              ...prev,
              ...serverDesign,
              coords: {
                ...prev.coords,
                ...(serverDesign.coords || {})
              },
              elements: {
                ...prev.elements,
                ...(serverDesign.elements || {})
              }
            }));
          }
        })
        .catch(() => {
          // Gracefully fallback to localStorage design without interrupting the user
        });
    } catch {
      // Ignored
    }
    return () => { isMounted = false; };
  }, []);

  // Save design to safeStorage (debounced 350ms) + Server API (debounced 1500ms)
  useEffect(() => {
    const localTimer = setTimeout(() => {
      try {
        safeStorage.setItem("zahir_current_voucher_design", JSON.stringify(design));
      } catch (e) {
        // continue
      }
    }, 350);

    const serverTimer = setTimeout(() => {
      try {
        secureFetch('/api/vouchers/design/current', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(design)
        }).catch((err) => console.warn('Could not sync voucher design to server:', err));
      } catch (err) {
        console.warn('Could not initiate design sync:', err);
      }
    }, 1500);

    return () => {
      clearTimeout(localTimer);
      clearTimeout(serverTimer);
    };
  }, [design]);

  // Dynamic active system profiles (Hotspot / User Manager / PPPoE)
  const activeSystemProfiles = useMemo(() => {
    const sys = (design.systemType || "hotspot").toLowerCase();
    if (sys === "userman") {
      return (usermanProfiles || []).map(p => ({
        id: p.id,
        name: p.name,
        price: p.price !== undefined ? Number(p.price) : 0,
        validity: p.validity || '',
        validityDays: p.validity ? parseInt(String(p.validity), 10) : undefined,
        rateLimit: p.rateLimit || p.nameForUsers || '',
        dataQuotaMb: p.dataQuotaMb || p.transferLimitMb,
        sharedUsers: p.overrideSharedUsers
      }));
    }
    if (sys === "ppp" || sys === "pppoe") {
      return (pppProfiles || []).map(p => ({
        id: p.id,
        name: p.name,
        price: (p as any).price ?? 0,
        validity: (p as any).validity || '',
        validityDays: (p as any).validityDays,
        dataQuotaMb: (p as any).dataQuotaMb,
        rateLimit: p.rateLimit || '',
        sharedUsers: (p as any).sharedUsers ?? (p.onlyOne === 'yes' || p.onlyOne === true ? 1 : undefined)
      }));
    }
    return profiles || [];
  }, [design.systemType, profiles, usermanProfiles, pppProfiles]);

  // Set default target profile if available or if systemType changes
  useEffect(() => {
    const list = activeSystemProfiles || [];
    if (list.length > 0 && (!design.targetProfile || design.targetProfile === "default" || !list.some(p => p.name === design.targetProfile))) {
      const firstProf = list[0];
      if (firstProf) {
        setDesign(prev => ({
          ...prev,
          targetProfile: firstProf.name,
          price: firstProf.price !== undefined ? firstProf.price : prev.price,
          timeLimit: (firstProf as any).validityDays ? `${(firstProf as any).validityDays} يوم` : ((firstProf as any).validity ? String((firstProf as any).validity) : ''),
          dataLimit: (firstProf as any).dataQuotaMb ? `${(firstProf as any).dataQuotaMb} MB` : ''
        }));
      }
    }
  }, [activeSystemProfiles, design.systemType]);

  // Precheck info derived from server API and context
  const precheck: RouterPrecheckInfo = useMemo(() => {
    if (serverPrecheck) {
      return serverPrecheck;
    }
    const userList = users || [];
    return {
      routerConnected: isConnected,
      message: isConnected
        ? `الراوتر متصل بنجاح (${router?.boardName || 'RouterOS'}) - الإصدار ${router?.version || 'v7'}`
        : "جاهز للتوليد والطباعة وحفظ الكروت محلياً في قاعدة البيانات",
      existingDbCount: userList.length,
      existingRouterCount: userList.filter(u => u && u.isVoucher).length,
      routerInfo: router ? {
        boardName: router.boardName || router.name || "MikroTik Router",
        version: router.version || "",
        cpuLoad: router.cpuLoad ?? 0,
        freeMemory: router.freeMemory ?? 0
      } : {
        boardName: "غير متصل بالراوتر",
        version: "-",
        cpuLoad: 0,
        freeMemory: 0
      }
    };
  }, [serverPrecheck, isConnected, router, users]);

  // Theme application helper
  const applyTemplate = (themeName: VoucherDesignState["theme"]) => {
    const preset = THEME_PRESETS[themeName];
    if (!preset) {
      showToast(`الثيم "${themeName}" غير موجود`, "error");
      return;
    }
    setDesign(prev => ({
      ...prev,
      theme: themeName,
      bgColor: preset.bgColor,
      primaryColor: preset.primaryColor,
      fontFamily: preset.fontFamily,
      cardTextColor: preset.cardTextColor,
      borderColor: preset.borderColor,
      elements: {
        network:   { ...preset.elements.network,   rotation: 0, show: prev.elements?.network?.show !== false },
        user:      { ...preset.elements.user,      rotation: 0, show: prev.elements?.user?.show !== false },
        password:  { ...preset.elements.password,  rotation: 0, show: prev.elements?.password?.show !== false },
        price:     { ...preset.elements.price,     rotation: 0, show: prev.elements?.price?.show !== false },
        time:      { ...preset.elements.time,      rotation: 0, show: prev.elements?.time?.show !== false },
        profile:   { ...preset.elements.profile,   rotation: 0, show: prev.elements?.profile?.show !== false },
        dataLimit: { ...preset.elements.dataLimit, rotation: 0, show: prev.elements?.dataLimit?.show !== false },
      },
      coords: { ...preset.coords },
    }));
    showToast(`تم تطبيق قالب "${preset.name}" بنجاح`, "success");
  };

  const [showResetDesignConfirm, setShowResetDesignConfirm] = useState(false);

  const resetToDefaults = () => {
    setShowResetDesignConfirm(true);
  };

  const handleExecuteResetDesign = () => {
    setDesign(DEFAULT_DESIGN);
    setShowResetDesignConfirm(false);
    showToast("تمت استعادة الإعدادات الافتراضية للتصميم", "info");
  };

  const exportDesign = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(design, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `voucher-design-${design.theme}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast("تم تصدير ملف القالب بنجاح", "success");
  };

  const importDesign = (file: File) => {
    const reader = new FileReader();
    reader.onerror = () => {
      if (isMountedRef.current) {
        showToast("تعذر قراءة ملف القالب", "error");
      }
    };
    reader.onload = (e) => {
      if (!isMountedRef.current) return;
      try {
        const imported = JSON.parse(e.target?.result as string);
        if (!imported || typeof imported !== "object" || Array.isArray(imported)) {
          throw new Error("Invalid design file");
        }
        setDesign({
          ...DEFAULT_DESIGN,
          ...imported,
          coords: {
            ...DEFAULT_DESIGN.coords,
            ...(imported.coords && typeof imported.coords === "object" ? imported.coords : {})
          },
          elements: {
            ...DEFAULT_DESIGN.elements,
            ...(imported.elements && typeof imported.elements === "object" ? imported.elements : {})
          }
        });
        showToast("تم استيراد القالب وتطبيقه بنجاح", "success");
      } catch {
        showToast("ملف القالب غير صالح", "error");
      }
    };
    reader.readAsText(file);
  };

  // Production Cryptographic Generation Handler (Without Auto-Sync)
  const handleGenerate = async () => {
    setGenerating(true);

    const targetProfObj = (activeSystemProfiles || []).find(p => p.name === design.targetProfile) || {
      name: design.targetProfile || "default",
      price: design.price !== undefined ? design.price : 500,
      validityDays: 30,
      dataQuotaMb: 5000
    };

    try {
      const payload = {
        quantity: design.quantity || 50,
        codeType: design.charType === "letters" ? "alpha" : design.charType === "mixed" ? "alphanumeric" : "numeric",
        codeLength: design.codeLength || 6,
        passwordLength: design.passwordLength || design.codeLength || 6,
        prefix: design.autoPrefix ? (design.prefixValue || "").trim() : "",
        profileName: design.targetProfile || "default",
        serviceType: (design.systemType || "HOTSPOT").toUpperCase(),
        authMode: design.authMode === "user_equals_pass" ? "user_equals_pass" : design.authMode === "user_only" ? "user_only" : "user_pass",
        sameUserPass: design.authMode === "user_equals_pass" || design.sameUserPass === true,
        price: targetProfObj.price || design.price || 500,
        timeLimit: design.timeLimit || "30d",
        dataLimit: design.dataLimit || undefined,
        batchComment: design.batchComment || `Voucher Studio Batch [${design.theme}]`,
        autoSync: false
      };

      const res = await secureFetch('/api/vouchers/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = (await safeParseJson(res)) || {};
      if (!isMountedRef.current) return;

      if (res.ok && data.success) {
        const batchInfo: GenerateResponse = {
          success: true,
          totalGenerated: data.totalGenerated || design.quantity,
          batchId: data.batchId,
          durationMs: data.durationMs || 45,
          message: data.message
        };
        setLastBatchResult(batchInfo);
        try {
          safeStorage.setItem('zctrl_last_batch_info', JSON.stringify(batchInfo));
        } catch (err) {
          console.warn('Could not cache last batch info:', err);
        }

        const allGenerated = (Array.isArray(data.vouchers) && data.vouchers.length > 0)
          ? data.vouchers
          : (data.vouchersPreview || []);
        if (allGenerated.length > 0) {
          setGeneratedBatchVouchers(allGenerated);
          try {
            safeStorage.setItem('zctrl_last_batch_vouchers', JSON.stringify(allGenerated.slice(0, 50)));
          } catch (err) {
            console.warn('Could not cache last batch vouchers preview:', err);
          }
        }

        showToast(`تم بنجاح توليد ${data.totalGenerated || design.quantity} كرت محلياً (${data.batchId}). يمكنك الآن مراجعتها أو حقنها بالمايكروتك من النافذة المنبثقة.`, "success");
        window.dispatchEvent(new CustomEvent('zctrl:vouchers-changed'));
        
        // Refresh system precheck
        fetchServerPrecheck();

        // إعادة ضبط الصفحة لرقم 1 وفتح نافذة الطباعة والمعاينة فوراً
        setModalPage(1);
        setIsModalOpen(true);
      } else {
        showToast(data.error || data.message || `فشل التوليد (${res.status})`, "error");
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        showToast(err.message || "خطأ أثناء التوليد", "error");
      }
    } finally {
      if (isMountedRef.current) setGenerating(false);
    }
  };

  const activeProfileObj: VoucherProfile = useMemo(() => {
    const prof = (activeSystemProfiles || []).find(p => p.name === design.targetProfile);
    const rawShared = (prof as any)?.sharedUsers;
    const parsedShared = typeof rawShared === 'number' ? rawShared : (parseInt(String(rawShared), 10) || 1);
    return {
      profileId: prof?.id || "default",
      profileName: prof?.name || design.targetProfile || "default",
      price: prof?.price !== undefined ? prof.price : (design.price || 500),
      validity: (prof as any)?.validityDays ? `${(prof as any).validityDays} يوم` : ((prof as any)?.validity || design.timeLimit),
      rateLimit: prof?.rateLimit,
      sharedUsers: parsedShared
    };
  }, [activeSystemProfiles, design.targetProfile, design.timeLimit, design.price]);

  // Convert created vouchers to modal printable page
  const currentBatchVouchers: VoucherItem[] = useMemo(() => {
    // 1. إذا تم توليد دفعة كروت جديدة، تكون دائماً هي ذات الأولوية القصوى للعرض والطباعة
    if (generatedBatchVouchers.length > 0) {
      return generatedBatchVouchers;
    }

    // 2. إذا تم تمرير مشتركين من شاشة إدارة المشتركين، يتم إعطاؤهم الأولوية قبل العينات
    if (initialUsers && initialUsers.length > 0) {
      const sourceUsers = initialUsers.filter(Boolean);
      return sourceUsers.map((u, idx) => ({
        voucherId: u.id || `v-${idx + 1}`,
        voucherCode: u.name || "",
        voucherPin: u.password || "",
        statusCd: u.disabled ? "disabled" : "active",
        price: u.price || activeProfileObj?.price || 500,
        profileName: u.profile || design.targetProfile || "default",
        timeLimit: u.limitUptime || design.timeLimit || "30 يوم",
        dataLimit: design.dataLimit,
        createdAt: u.createdAt || new Date().toISOString()
      }));
    }

    const sourceUsers = selectedUsersForPrint && selectedUsersForPrint.length > 0
      ? selectedUsersForPrint
      : [];

    const isUserEqualsPass = design.authMode === "user_equals_pass" || design.sameUserPass === true;

    if (sourceUsers.length === 0) {
      // توليد عينات خفيفة بحجم صفحة واحدة للمعاينة (بحد أقصى 21 كرت) لحماية الرام تماماً وسرعة استجابة التصميم الفورية
      const count = Math.min(21, Math.max(12, (design.columnsCount || 3) * (design.rowsCount || 7)));
      const prefix = design.autoPrefix ? (design.prefixValue || "").trim() : "";
      const sampleList: VoucherItem[] = [];
      for (let i = 1; i <= count; i++) {
        const padCode = String(100000 + i).slice(1);
        const codeVal = `${prefix}${padCode}`;
        const pinCode = design.authMode === "user_only" ? "" : isUserEqualsPass ? codeVal : String(1000 + (i % 9000));
        sampleList.push({
          voucherId: `v-${i}`,
          voucherCode: codeVal,
          voucherPin: pinCode,
          statusCd: "active",
          price: activeProfileObj?.price || design.price || 500,
          profileName: design.targetProfile || activeProfileObj?.profileName || "باقة 500 ريال",
          timeLimit: design.timeLimit || activeProfileObj?.validity || "30 يوم",
          dataLimit: design.dataLimit || "غير محدود",
          createdAt: new Date().toISOString()
        });
      }
      return sampleList;
    }

    return sourceUsers.map((u, idx) => ({
      voucherId: u.id || `v-${idx + 1}`,
      voucherCode: u.name || "",
      voucherPin: isUserEqualsPass ? (u.name || "") : (u.password || ""),
      statusCd: u.disabled ? "disabled" : "active",
      price: u.price || activeProfileObj?.price || 500,
      profileName: u.profile || design.targetProfile || "default",
      timeLimit: u.limitUptime || design.timeLimit || "30 يوم",
      dataLimit: design.dataLimit,
      createdAt: u.createdAt || new Date().toISOString()
    }));
  }, [
    generatedBatchVouchers, 
    initialUsers, 
    selectedUsersForPrint, 
    design.quantity,
    design.columnsCount,
    design.rowsCount,
    design.autoPrefix,
    design.prefixValue,
    design.targetProfile, 
    design.timeLimit, 
    design.dataLimit, 
    design.price,
    design.authMode,
    design.sameUserPass,
    activeProfileObj
  ]);

  const handleOpenPrintModal = () => {
    setIsModalOpen(true);
  };

  const handlePrintBatchFromManager = (vouchers: VoucherItem[], batchId: string) => {
    setGeneratedBatchVouchers(vouchers);
    const resultObj: GenerateResponse = {
      success: true,
      batchId,
      totalGenerated: vouchers.length,
      durationMs: 0
    };
    setLastBatchResult(resultObj);
    try {
      safeStorage.setItem('zctrl_last_batch_info', JSON.stringify(resultObj));
      // Store only lightweight preview slice (24 items) to protect browser localStorage & RAM
      safeStorage.setItem('zctrl_last_batch_vouchers', JSON.stringify(vouchers.slice(0, 24)));
    } catch (err) {
      console.warn('Could not persist batch preview to storage:', err);
    }
    setModalPage(1);
    setIsModalOpen(true);
  };

  const gridInfo: GridResult = useMemo(() => {
    return autoCalcGrid({
      cardWidthMm: design.cardWidthMm || 85,
      cardHeightMm: design.cardHeightMm || 52,
      paperType: design.paperType || "a4",
      paperOrientation: design.paperOrientation || "portrait",
      cardGap: design.cardGap ?? 4,
      cardMarginTop: design.cardMarginTop ?? 5,
      cardMarginSide: design.cardMarginSide ?? 4,
      totalCards: currentBatchVouchers.length || design.quantity || 50,
      customCols: design.gridMode === 'custom' ? (design.customCols || design.columnsCount) : undefined,
      customRows: design.gridMode === 'custom' ? (design.customRows || design.rowsCount) : undefined,
    });
  }, [
    design.cardWidthMm,
    design.cardHeightMm,
    design.paperType,
    design.paperOrientation,
    design.cardGap,
    design.cardMarginTop,
    design.cardMarginSide,
    design.gridMode,
    design.customCols,
    design.customRows,
    design.columnsCount,
    design.rowsCount,
    currentBatchVouchers.length,
    design.quantity,
  ]);

  // Auto-update design columns & rows when dimensions change
  useEffect(() => {
    if (gridInfo) {
      setDesign(prev => {
        if (prev.columnsCount === gridInfo.cols && prev.rowsCount === gridInfo.rows) {
          return prev;
        }
        return {
          ...prev,
          columnsCount: gridInfo.cols,
          rowsCount: gridInfo.rows,
        };
      });
    }
  }, [gridInfo.cols, gridInfo.rows]);

  const currentLayout = useMemo(() => {
    const found = LAYOUT_OPTIONS.find(l => l.cols === gridInfo.cols && l.rows === gridInfo.rows && Boolean(l.isPos) === Boolean(gridInfo.isPos));
    if (found) return found;
    return {
      id: gridInfo.isPos ? 'pos80' : `custom_${gridInfo.cols}x${gridInfo.rows}`,
      label: `${gridInfo.cols} أعمدة × ${gridInfo.rows} صفوف (${gridInfo.totalPerPage} كرت/صفحة)`,
      cols: gridInfo.cols,
      rows: gridInfo.rows,
      isPos: gridInfo.isPos,
    };
  }, [gridInfo.cols, gridInfo.rows, gridInfo.totalPerPage, gridInfo.isPos]);

  const pageSize = gridInfo.totalPerPage;
  const totalPages = Math.max(1, Math.ceil(currentBatchVouchers.length / pageSize));

  useEffect(() => {
    if (modalPage > totalPages) {
      setModalPage(totalPages);
    }
  }, [modalPage, totalPages]);

  const modalPageData: PageDataResponse = useMemo(() => {
    const safePage = Math.min(Math.max(1, modalPage), totalPages);
    const start = (safePage - 1) * pageSize;
    const end = start + pageSize;
    return {
      vouchers: currentBatchVouchers.slice(start, end),
      page: safePage,
      totalPages: totalPages,
      totalCount: currentBatchVouchers.length
    };
  }, [currentBatchVouchers, modalPage, pageSize, totalPages]);

  return (
    <div className="space-y-6 print:p-0 print:m-0 font-sans" dir="rtl">
      {/* Header & Router Precheck Bar */}
      <div className="print:hidden">
        <VoucherStudioHeader
          precheck={precheck}
          prechecking={loadingPrecheck || syncing}
          onRefreshPrecheck={async () => {
            try {
              const ok = await fetchServerPrecheck();
              await syncNow();
              if (!isMountedRef.current) return;
              if (ok) {
                showToast("تم تحديث حالة الراوتر ومزامنة بيانات الكروت", "success");
              } else {
                showToast("تعذر فحص حالة الخادم بالكامل، تم تحديث بيانات السياق", "info");
              }
            } catch (err: any) {
              if (isMountedRef.current) {
                showToast(err?.message || "فشل تحديث حالة الراوتر", "error");
              }
            }
          }}
          systemName="سيرفر الهوتسبوت والمشتركين"
          onOpenCustomVoucherModal={() => setIsCustomVoucherModalOpen(true)}
        />
      </div>

      {/* Top Navigation Tabs - Clean Segmented Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-2 rounded-2xl print:hidden shadow-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab("merged")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "merged"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Sliders className="w-4 h-4 text-indigo-300" />
            <span>المصمم التفاعلي والمعاينة</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("batches")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "batches"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Layers className="w-4 h-4 text-emerald-400" />
            <span>إدارة الدفعات والمخزون</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("all_vouchers")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "all_vouchers"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Database className="w-4 h-4 text-cyan-400" />
            <span>سجل وبحث الكروت</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("stats")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "stats"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>صحة السيرفر والأمان</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("gallery")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "gallery"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Palette className="w-4 h-4 text-rose-400" />
            <span>معرض الثيمات والقوالب</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("financial")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "financial"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Coins className="w-4 h-4 text-amber-400" />
            <span>المبيعات والمحاسبة (POS)</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsCustomVoucherModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer active:scale-95"
            title="توليد كرت مخصص (Hotspot / PPPoE / Userman)"
          >
            <Sparkles className="w-3.5 h-3.5 text-slate-950" />
            <span>كرت مخصص</span>
          </button>

          {currentBatchVouchers.length > 0 && (
            <button
              type="button"
              onClick={handleOpenPrintModal}
              className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>معاينة الطباعة ({currentBatchVouchers.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: INTERACTIVE DESIGNER + LIVE STICKY SIDE PREVIEW */}
      {activeTab === "merged" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-in fade-in duration-150">
          {/* If previewPosition === 'right' in RTL (First in DOM = Right side of screen) */}
          {previewPosition === "right" && (
            <div className="lg:col-span-5 xl:col-span-5 lg:sticky lg:top-4 self-start space-y-4 max-h-[calc(100vh-2rem)] overflow-y-auto custom-scrollbar">
              <LiveVoucherPreview
                design={design}
                setDesign={setDesign}
                networkName={design.networkName}
                currencySymbol={design.currencySymbol || "ريال"}
                loginUrl={design.loginUrl}
                showPin={design.authMode === "user_pass" || design.authMode === "user_equals_pass" || design.sameUserPass === true}
                showQr={design.showQr}
                prefix={design.autoPrefix ? (design.prefixValue || "") : ""}
                codeLength={String(design.codeLength)}
                layout={currentLayout}
                activeProfileObj={activeProfileObj}
                lastResult={lastBatchResult}
                onOpenModal={handleOpenPrintModal}
                onGenerate={handleGenerate}
                generating={generating}
                credentialType={design.authMode === "user_only" ? "username_only" : "username_password"}
                cardBgColor={design.bgColor}
                fontFamily={design.fontFamily}
                customTimeLimit={design.timeLimit}
                customDataLimit={design.dataLimit}
                theme={design.theme}
                gridInfo={gridInfo}
                fontScale={gridInfo.fontScale}
                previewPosition={previewPosition}
                onTogglePreviewPosition={togglePreviewPosition}
              />
            </div>
          )}

          {/* Center/Main Column: Interactive Designer Options & Batch Generator */}
          <div className="lg:col-span-7 xl:col-span-7 space-y-6">
            <DesignTab
              design={design}
              setDesign={setDesign}
              profiles={activeSystemProfiles as any}
              exportDesign={exportDesign}
              importDesign={importDesign}
              onFetchNetworkTabInfo={handleFetchNetworkInfo}
              gridInfo={gridInfo}
              fontScale={gridInfo.fontScale}
              onOpenCustomVoucherModal={() => setIsCustomVoucherModalOpen(true)}
            />
          </div>

          {/* If previewPosition === 'left' in RTL (Second in DOM = Left side of screen) */}
          {previewPosition === "left" && (
            <div className="lg:col-span-5 xl:col-span-5 lg:sticky lg:top-4 self-start space-y-4 max-h-[calc(100vh-2rem)] overflow-y-auto custom-scrollbar">
              <LiveVoucherPreview
                design={design}
                setDesign={setDesign}
                networkName={design.networkName}
                currencySymbol={design.currencySymbol || "ريال"}
                loginUrl={design.loginUrl}
                showPin={design.authMode === "user_pass" || design.authMode === "user_equals_pass" || design.sameUserPass === true}
                showQr={design.showQr}
                prefix={design.autoPrefix ? (design.prefixValue || "") : ""}
                codeLength={String(design.codeLength)}
                layout={currentLayout}
                activeProfileObj={activeProfileObj}
                lastResult={lastBatchResult}
                onOpenModal={handleOpenPrintModal}
                onGenerate={handleGenerate}
                generating={generating}
                credentialType={design.authMode === "user_only" ? "username_only" : "username_password"}
                cardBgColor={design.bgColor}
                fontFamily={design.fontFamily}
                customTimeLimit={design.timeLimit}
                customDataLimit={design.dataLimit}
                theme={design.theme}
                gridInfo={gridInfo}
                fontScale={gridInfo.fontScale}
                previewPosition={previewPosition}
                onTogglePreviewPosition={togglePreviewPosition}
              />
            </div>
          )}
        </div>
      )}

      {/* TAB 2: BATCHES MANAGER */}
      {activeTab === "batches" && (
        <BatchesManagerTab
          showToast={showToast}
          networkName={design.networkName}
          currencySymbol={design.currencySymbol || "ريال"}
          loginUrl={design.loginUrl}
          design={design}
          onPrintBatch={handlePrintBatchFromManager}
        />
      )}

      {/* TAB 3: ALL VOUCHERS TABLE */}
      {activeTab === "all_vouchers" && (
        <AllVouchersTab
          showToast={showToast}
          networkName={design.networkName}
          currencySymbol={design.currencySymbol || "ريال"}
          loginUrl={design.loginUrl}
          design={design}
          onPrintBatch={handlePrintBatchFromManager}
        />
      )}

      {/* TAB 4: SYSTEM STATS & 5-LAYER ZERO COLLISION */}
      {activeTab === "stats" && (
        <SystemStatsTab
          precheck={precheck}
          onRefreshPrecheck={fetchServerPrecheck}
          showToast={showToast}
        />
      )}

      {/* TAB 5: UNIFIED GALLERY OF STYLES, THEMES & SAVED TEMPLATES */}
      {activeTab === "gallery" && (
        <ThemeGalleryView
          design={design}
          setDesign={setDesign}
          applyTemplate={applyTemplate}
          resetToDefaults={resetToDefaults}
          exportDesign={exportDesign}
          importDesign={importDesign}
          showToast={showToast}
          onGoToStudio={() => setActiveTab("merged")}
        />
      )}

      {/* TAB 6: POS FINANCIAL SALES ACCOUNTING & REVENUE LEDGER */}
      {activeTab === "financial" && (
        <FinancialReportTab
          currencySymbol={design.currencySymbol || "ريال"}
          showToast={showToast}
        />
      )}

      {/* PRINT & PREVIEW POPUP MODAL (Appears after clicking "توليد الكروت" or "طباعة") */}
      {isModalOpen && (
        <VoucherPrintModal
          isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        loading={false}
        modalData={modalPageData}
        modalPage={modalPage}
        totalPages={totalPages}
        onPageChange={(p) => setModalPage(p)}
        layout={currentLayout}
        onLayoutChange={(newLayout) => {
          setDesign(prev => {
            const wasThermal = Boolean(prev.paperType?.includes('thermal') || prev.paperType?.startsWith('pos'));
            let nextPaperType = prev.paperType;
            if (newLayout.id === 'pos58') nextPaperType = 'thermal_58mm';
            else if (newLayout.id === 'pos80' || newLayout.isPos) nextPaperType = 'thermal_80mm';
            else if (newLayout.id === '10x10') nextPaperType = 'a4_100';
            else if (wasThermal) nextPaperType = 'a4';

            return {
              ...prev,
              paperType: nextPaperType,
              gridMode: "custom",
              customCols: newLayout.cols,
              customRows: newLayout.rows || prev.rowsCount || 7,
              columnsCount: newLayout.cols,
              rowsCount: newLayout.rows || prev.rowsCount || 7,
            };
          });
        }}
        design={design}
        allVouchers={currentBatchVouchers}
        networkName={design.networkName}
        currencySymbol={design.currencySymbol || "ريال"}
        showPin={design.authMode === "user_pass" || design.authMode === "user_equals_pass" || design.sameUserPass === true}
        showQr={design.showQr}
        loginUrl={design.loginUrl}
        selectedProfileObj={activeProfileObj}
        onPrint={async () => {
          showToast('جارٍ تجهيز الكروت للطباعة...', 'info');
          try {
            const qrMap = design.showQr
              ? await preGenerateQrCodes(
                  currentBatchVouchers,
                  design.loginUrl,
                  design.authMode,
                  120,
                  (done, total) => {
                    if (done % 50 === 0) showToast(`توليد QR: ${done}/${total}`, 'info');
                  }
                )
              : new Map<string, string>();

            const htmlContent = await generateStandaloneVoucherHtmlAsync({
              vouchers: currentBatchVouchers,
              design,
              networkName: design.networkName,
              currencySymbol: design.currencySymbol || "ريال",
              loginUrl: design.loginUrl,
              cols: gridInfo.cols,
              rows: gridInfo.rows,
              layout: currentLayout,
              theme: design.theme,
              showPin: design.authMode === "user_pass" || design.authMode === "user_equals_pass" || design.sameUserPass === true,
              showQr: design.showQr,
              isPos: gridInfo.isPos || currentLayout.id.startsWith('pos'),
              qrDataUrlMap: qrMap,
              fontScale: gridInfo.fontScale,
              gapMm: gridInfo.gapMm,
              paddingMm: gridInfo.paddingMm,
            }, (msg) => showToast(msg, 'info'));

            await printHtmlSafely(htmlContent, {
              fileName: `vouchers-batch-${currentLayout.id || 'print'}.html`,
              onFallbackDownload: () => {
                showToast('تم تحميل كروت الهوتسبوت كملف HTML للطباعة', 'info');
              }
            });
          } catch (err: any) {
            showToast(`خطأ في الطباعة: ${err.message}`, 'error');
          }
        }}
        onSaveHTML={async () => {
          showToast('جارٍ إنشاء ملف HTML...', 'info');
          try {
            const qrMap = design.showQr
              ? await preGenerateQrCodes(
                  currentBatchVouchers,
                  design.loginUrl,
                  design.authMode,
                  120,
                  (done, total) => {
                    if (done % 50 === 0) showToast(`توليد QR: ${done}/${total}`, 'info');
                  }
                )
              : new Map<string, string>();

            const htmlContent = await generateStandaloneVoucherHtmlAsync({
              vouchers: currentBatchVouchers,
              design,
              networkName: design.networkName,
              currencySymbol: design.currencySymbol || "ريال",
              loginUrl: design.loginUrl,
              cols: gridInfo.cols,
              rows: gridInfo.rows,
              layout: currentLayout,
              theme: design.theme,
              showPin: design.authMode === "user_pass" || design.authMode === "user_equals_pass" || design.sameUserPass === true,
              showQr: design.showQr,
              isPos: gridInfo.isPos || currentLayout.id.startsWith('pos'),
              qrDataUrlMap: qrMap,
              fontScale: gridInfo.fontScale,
              gapMm: gridInfo.gapMm,
              paddingMm: gridInfo.paddingMm,
            }, (msg) => showToast(msg, 'info'));

            const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `vouchers-${design.networkName.replace(/\s+/g, "_")}-${Date.now()}.html`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            trackTimer(() => URL.revokeObjectURL(url), 5000);

            showToast('تم حفظ ملف HTML بنجاح', 'success');
          } catch (err: any) {
            showToast(`خطأ: ${err.message}`, 'error');
          }
        }}
        onExportPDF={async () => {
          try {
            showToast('جارٍ تصدير ملف PDF عالي الدقة...', 'info');

            await exportBatchVouchersToPdf({
              vouchers: currentBatchVouchers,
              design,
              layout: currentLayout,
              networkName: design.networkName,
              currencySymbol: design.currencySymbol || "ريال",
              loginUrl: design.loginUrl,
              showPin: design.authMode === "user_pass" || design.authMode === "user_equals_pass" || design.sameUserPass === true,
              showQr: design.showQr,
              fontScale: gridInfo.fontScale,
              gapMm: gridInfo.gapMm,
              paddingMm: gridInfo.paddingMm,
              fileName: `vouchers-${(design.networkName || "network").replace(/\s+/g, "_")}-${Date.now()}.pdf`,
              onProgress: (p, msg) => {
                if (p % 25 === 0 || p === 100) {
                  showToast(msg || `جاري إعداد PDF: ${p}%`, 'info');
                }
              }
            });

            showToast('تم تحميل وتصدير ملف PDF بنجاح!', 'success');
          } catch (err: any) {
            console.error("PDF Export error:", err);
            showToast(`خطأ في تصدير PDF: ${err.message || err}`, 'error');
          }
        }}
        onExportCSV={() => {
          const esc = (val: unknown) => `"${String(val ?? "").replace(/"/g, '""')}"`;
          const csvRows = ["Code,Password,Profile,Price,TimeLimit,DataLimit"];
          currentBatchVouchers.forEach(v => {
            csvRows.push([
              esc(v.voucherCode),
              esc(v.voucherPin),
              esc(v.profileName),
              v.price ?? 0,
              esc(v.timeLimit),
              esc(v.dataLimit)
            ].join(","));
          });
          const blob = new Blob(["\uFEFF" + csvRows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `vouchers-${Date.now()}.csv`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          trackTimer(() => URL.revokeObjectURL(url), 5000);
          showToast("تم تصدير ملف CSV بنجاح", "success");
        }}
        onSync={async () => {
          const targetBatchId = lastBatchResult?.batchId || currentBatchVouchers.find(v => v.batchId)?.batchId;
          if (!targetBatchId) {
            showToast("لا توجد دفعة كروت محددة للمزامنة حالياً", "error");
            return;
          }
          setSyncing(true);
          try {
            const res = await secureFetch('/api/vouchers/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                batchId: targetBatchId,
                profileOnRouter: design.targetProfile,
                serviceType: (design.systemType || 'HOTSPOT').toUpperCase()
              })
            });
            const data = (await safeParseJson(res)) || {};
            if (!isMountedRef.current) return;
            if (res.ok && data.success) {
              const syncedCount = data.data?.synced !== undefined ? data.data.synced : currentBatchVouchers.length;
              showToast(`تم بنجاح حقن ومزامنة ${syncedCount} كرت في راوتر المايكروتك!`, "success");
              setGeneratedBatchVouchers(prev => {
                const updated = prev.map(v => ({ ...v, isSynced: true }));
                try {
                  safeStorage.setItem('zctrl_last_batch_vouchers', JSON.stringify(updated.slice(0, 50)));
                } catch (err) {
                  console.warn('Could not update cached batch vouchers sync state:', err);
                }
                return updated;
              });
              window.dispatchEvent(new CustomEvent('zctrl:vouchers-changed'));
              await fetchServerPrecheck();
              await syncNow();
            } else {
              showToast(data.error || `فشلت المزامنة (${res.status})`, "error");
            }
          } catch (e: any) {
            if (isMountedRef.current) {
              showToast(e.message || "فشلت عملية المزامنة وحقن الكروت", "error");
            }
          } finally {
            if (isMountedRef.current) setSyncing(false);
          }
        }}
        syncing={syncing}
        syncProgress={{ done: currentBatchVouchers.length, total: currentBatchVouchers.length }}
      />
      )}

      {/* CUSTOM VOUCHER MODAL */}
      {isCustomVoucherModalOpen && (
        <CustomVoucherModal
          isOpen={isCustomVoucherModalOpen}
          onClose={() => setIsCustomVoucherModalOpen(false)}
          profiles={activeSystemProfiles as any}
          hotspotProfiles={profiles as any}
          usermanProfiles={usermanProfiles as any}
          pppProfiles={pppProfiles as any}
          isConnected={isConnected}
          currencySymbol={design.currencySymbol || "ريال"}
          showToast={showToast}
          onVoucherGenerated={(newVoucher) => {
            setGeneratedBatchVouchers(prev => [newVoucher, ...prev]);
            window.dispatchEvent(new CustomEvent('zctrl:vouchers-changed'));
            fetchServerPrecheck();
            syncNow();
          }}
        />
      )}

      {/* Reset Design Confirmation Modal */}
      {showResetDesignConfirm && (
        <ConfirmModal
          isOpen={showResetDesignConfirm}
          title="تأكيد استعادة التصميم الافتراضي"
          message="هل تريد بالتأكيد إعادة تعيين تصميم واستوديو الكروت إلى القالب الافتراضي الأصلي؟"
          confirmText="نعم، إعادة التعيين"
          cancelText="إلغاء"
          type="warning"
          onConfirm={handleExecuteResetDesign}
          onClose={() => setShowResetDesignConfirm(false)}
        />
      )}
    </div>
  );
}

export default VoucherStudio;
