import React, { useState, useEffect, useRef, useCallback } from 'react';
import { safeStorage } from '../utils/safeStorage';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
import {
  X,
  Check,
  Globe,
  Wifi,
  Palette,
  Megaphone,
  DollarSign,
  Phone,
  Shield,
  Zap,
  Sparkles,
  Smartphone,
  Tablet,
  Monitor,
  Download,
  UploadCloud,
  RefreshCw,
  Plus,
  Trash2,
  FileCode,
  Copy,
  Sliders,
  Crown,
  Flame,
  Star,
  MessageCircle,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  ExternalLink,
  ChevronDown,
  Eye,
  EyeOff,
  Camera,
  FolderUp,
  FileArchive,
  Layers,
  Radio,
  Tv,
  Image as ImageIcon
} from 'lucide-react';
import JSZip from 'jszip';
import jsQR from 'jsqr';
import { HotspotPortalCustomization, HotspotServerProfile, PricingPlanItem } from '../types/mikrotik';
import HybridPortalEditor, { PortalFile } from './portal/HybridPortalEditor';
import {
  DEFAULT_PORTAL_CONFIG,
  THEME_PRESETS,
  generateHotspotLoginHtml,
  generateHotspotStatusHtml,
  generateHotspotLogoutHtml,
  generateHotspotAloginHtml,
  exportPortalZip
} from '../utils/portalGenerator';
import { useMikroTik } from '../context/MikroTikContext';

function substituteRouterPreviewVars(html: string): string {
  const vars: Record<string, string> = {
    'link-login-only': '#',
    'link-orig': 'https://google.com',
    'link-orig-esc': 'https://google.com',
    'link-login': '#',
    'link-logout': '#',
    'link-redirect': '#',
    'error': '',
    'username': 'user_vip',
    'mac': '00:1A:2B:3C:4D:5E',
    'mac-esc': '00:1A:2B:3C:4D:5E',
    'ip': '192.168.88.100',
    'uptime': '02:45:10',
    'session-time-left': '05:14:50',
    'trial': 'yes',
    'identity': 'MikroTik-Hotspot',
    'domain': 'login.net',
    'version': '7.16',
    'bytes-in-nice': '150.4 MB',
    'bytes-out-nice': '820.6 MB'
  };

  let result = html;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\$\\(${key}\\)`, 'g'), value);
  }

  let changed = true;
  while (changed) {
    changed = false;
    result = result.replace(/\$\(if\s+([^)]+)\)([\s\S]*?)\$\(endif\)/g, (match, cond, block) => {
      const trimmed = cond.trim();
      if (trimmed === 'trial' && vars['trial'] === 'yes') return block;
      if (trimmed === 'error' && vars['error'] === '') return '';
      const isTrue = vars[trimmed] !== undefined && vars[trimmed] !== '';
      return isTrue ? block : '';
    });
    if (result !== html) changed = true;
    html = result;
  }
  return result;
}

interface PortalStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProfile?: HotspotServerProfile | null;
  serverProfiles: HotspotServerProfile[];
  portalFolders: string[];
}

export const PortalStudioModal: React.FC<PortalStudioModalProps> = ({
  isOpen,
  onClose,
  selectedProfile,
  serverProfiles,
  portalFolders
}) => {
  const {
    isConnected,
    users,
    deployHotspotPortal,
    getHotspotPortalConfig,
    showToast,
    readRouterFile,
    writeRouterFile,
    detectHotspotPath,
    listRouterDirectory,
    deployPortalFiles,
    validatePortalFile,
    deleteRouterFile
  } = useMikroTik();
  const [isPulling, setIsPulling] = useState(false);

  // Load saved config or default
  const [config, setConfig] = useState<HotspotPortalCustomization>(() => {
    const saved = safeStorage.getItem('zctrl_portal_customization');
    if (saved) {
      try {
        return { ...DEFAULT_PORTAL_CONFIG, ...JSON.parse(saved) };
      } catch (e) {
        // fallback
      }
    }
    return {
      ...DEFAULT_PORTAL_CONFIG,
      targetHtmlDir: selectedProfile?.htmlDirectory || 'hotspot',
      targetDnsName: selectedProfile?.dnsName || 'login.net',
      targetProfileName: selectedProfile?.name || 'hsprof1'
    };
  });

  const isMountedRef = useRef(true);
  const timersRef = useRef<number[]>([]);
  const pageReqIdRef = useRef(0);

  const trackTimer = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((t) => t !== id);
      if (isMountedRef.current) fn();
    }, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };
  }, []);

  // Automatically fetch current portal config from router when modal opens or targetHtmlDir changes
  useEffect(() => {
    let cancelled = false;
    if (isOpen && config.targetHtmlDir) {
      getHotspotPortalConfig(config.targetHtmlDir)
        .then((res) => {
          if (!cancelled && isMountedRef.current && res.success && res.config) {
            setConfig((prev) => ({ ...prev, ...res.config }));
          }
        })
        .catch(() => {
          // silent fail
        });
    }
    return () => {
      cancelled = true;
    };
  }, [isOpen, config.targetHtmlDir]);

  const handlePullFromRouter = async () => {
    setIsPulling(true);
    try {
      const res = await getHotspotPortalConfig(config.targetHtmlDir || 'hotspot');
      if (res.success && res.config) {
        setConfig(res.config);
        showToast('تم جلب ومزامنة إعدادات القالب الحالية من المايكروتك بنجاح!', 'success');
      } else {
        showToast(res.message || 'لم يتم العثور على ملف إعدادات محفوظ على الراوتر لهذا المجلد.', 'info');
      }
    } catch (e: any) {
      showToast('تعذر جلب الإعدادات من الراوتر', 'error');
    } finally {
      setIsPulling(false);
    }
  };

  // Keep target directory in sync if selected profile changes
  useEffect(() => {
    if (selectedProfile) {
      setConfig((prev) => ({
        ...prev,
        targetHtmlDir: selectedProfile.htmlDirectory || prev.targetHtmlDir || 'hotspot',
        targetDnsName: selectedProfile.dnsName || prev.targetDnsName || 'login.net',
        targetProfileName: selectedProfile.name || prev.targetProfileName || 'hsprof1'
      }));
    }
  }, [selectedProfile]);

  // Input refs for folder and ZIP uploads and QR scanner
  const folderInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const qrImageInputRef = useRef<HTMLInputElement>(null);
  const qrVideoRef = useRef<HTMLVideoElement>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const qrScanLoopRef = useRef<number | null>(null);

  // Active studio tab
  const [activeTab, setActiveTab] = useState<'brand' | 'theme' | 'visibility' | 'promos' | 'pricing' | 'support' | 'login' | 'deploy' | 'code'>('brand');

  // Custom imported files state
  const [customFiles, setCustomFiles] = useState<Map<string, PortalFile>>(new Map());
  const [uploadedPreviewHtml, setUploadedPreviewHtml] = useState<string>('');

  // Preview options
  const [viewportMode, setViewportMode] = useState<'mobile' | 'tablet' | 'desktop'>('mobile');
  const [previewPage, setPreviewPage] = useState<'login' | 'status' | 'logout'>('login');
  const [previewSource, setPreviewSource] = useState<'draft' | 'router' | 'uploaded'>('draft');
  const [routerPublishedHtml, setRouterPublishedHtml] = useState<string>('');
  const [isLoadingRouterPage, setIsLoadingRouterPage] = useState(false);

  // Interactive Live Simulator state
  const [simCardPin, setSimCardPin] = useState('');
  const [simUsername, setSimUsername] = useState('user123');
  const [simPassword, setSimPassword] = useState('1234');
  const [simLoginMode, setSimLoginMode] = useState<'pin' | 'user'>('pin');
  const [simIsLoggedIn, setSimIsLoggedIn] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  // QR Scanner Modal State
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [isScanningActive, setIsScanningActive] = useState(false);

  // Deploying state
  const [isDeploying, setIsDeploying] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Auto-save local draft
  useEffect(() => {
    safeStorage.setItem('zctrl_portal_customization', JSON.stringify(config));
  }, [config]);

  // Fetch Published Page from Router
  const fetchRouterPublishedPage = async (pageName?: string) => {
    const page = pageName || previewPage;
    const reqId = ++pageReqIdRef.current;
    setIsLoadingRouterPage(true);
    try {
      const fileName = `${config.targetHtmlDir || 'hotspot'}/${page}.html`;
      const res = await readRouterFile(fileName);
      if (!isMountedRef.current || reqId !== pageReqIdRef.current) return;
      if (res.success && res.content) {
        setRouterPublishedHtml(res.content);
      } else {
        setRouterPublishedHtml('');
        showToast(res.message || `تعذر العثور على الملف ${fileName} في الراوتر. يمكنك نشر قالب جديد.`, 'info');
      }
    } catch (err: any) {
      if (isMountedRef.current && reqId === pageReqIdRef.current) {
        showToast('حدث خطأ أثناء جلب الصفحة المنشورة من الراوتر', 'error');
      }
    } finally {
      if (isMountedRef.current && reqId === pageReqIdRef.current) {
        setIsLoadingRouterPage(false);
      }
    }
  };

  // Auto fetch published page when switching to 'router' preview source or changing page/target folder
  useEffect(() => {
    if (previewSource === 'router' && isOpen) {
      fetchRouterPublishedPage(previewPage);
    }
  }, [previewSource, previewPage, config.targetHtmlDir, isOpen]);

  // Real Camera QR Code Detection via jsQR
  useEffect(() => {
    let stream: MediaStream | null = null;
    let isActive = true;

    if (isQrScannerOpen) {
      setIsScanningActive(true);
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices
          .getUserMedia({
            video: {
              facingMode: 'environment',
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
          })
          .then((s) => {
            if (!isActive) {
              s.getTracks().forEach((t) => t.stop());
              return;
            }
            stream = s;
            if (qrVideoRef.current) {
              qrVideoRef.current.srcObject = s;
              qrVideoRef.current.setAttribute('playsinline', 'true');
              qrVideoRef.current.play().catch(() => {});
            }

            // Real-time jsQR detection loop
            const scanFrame = () => {
              if (!isActive) return;
              const video = qrVideoRef.current;
              const canvas = qrCanvasRef.current;
              if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (ctx) {
                  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                  const code = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: 'dontInvert'
                  });
                  if (code && code.data) {
                    const cleanCode = code.data.trim();
                    if (cleanCode) {
                      setSimCardPin(cleanCode);
                      setSimLoginMode('pin');
                      setIsQrScannerOpen(false);
                      showToast(`تم مسح كود الكرت الحقيقي: ${cleanCode} بنجاح!`, 'success');
                      return;
                    }
                  }
                }
              }
              qrScanLoopRef.current = requestAnimationFrame(scanFrame);
            };

            qrScanLoopRef.current = requestAnimationFrame(scanFrame);
          })
          .catch((err) => {
            console.warn('Camera stream error:', err);
            setIsScanningActive(false);
          });
      } else {
        setIsScanningActive(false);
      }
    }

    return () => {
      isActive = false;
      setIsScanningActive(false);
      if (qrScanLoopRef.current) {
        cancelAnimationFrame(qrScanLoopRef.current);
        qrScanLoopRef.current = null;
      }
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [isQrScannerOpen]);

  // Handle Scanning QR from Image File
  const handleScanQrImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => {
      if (isMountedRef.current) showToast('تعذر قراءة ملف الصورة المختار', 'error');
    };
    reader.onload = (event) => {
      const resultUrl = event.target?.result;
      if (typeof resultUrl !== 'string') return;
      const img = new Image();
      img.onerror = () => {
        if (isMountedRef.current) showToast('تنسيق الصورة غير صالح لقراءة رمز QR', 'error');
      };
      img.onload = () => {
        const canvas = document.createElement('canvas');
        try {
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (!isMountedRef.current) return;
            if (code && code.data) {
              const pin = code.data.trim();
              setSimCardPin(pin);
              setSimLoginMode('pin');
              setIsQrScannerOpen(false);
              showToast(`تم قراءة كود الـ QR من الصورة: ${pin} بنجاح!`, 'success');
            } else {
              showToast('لم يتم العثور على رمز QR أو باركود واضح في الصورة المختارة', 'error');
            }
          }
        } finally {
          canvas.width = 1;
          canvas.height = 1;
        }
      };
      img.src = resultUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Handle Folder Upload - 100% Real File Processing
  const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    try {
      showToast(`جاري فحص وقراءة ملفات المجلد (${fileList.length} ملف)...`, 'info');
      const newFiles = new Map<string, PortalFile>();

      for (let idx = 0; idx < fileList.length; idx++) {
        const file = fileList[idx];
        const fullPath = file.webkitRelativePath || file.name;
        if (file.size === 0 && file.type === '') continue;
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        const cleanName = fullPath.includes('/') ? fullPath.substring(fullPath.indexOf('/') + 1) : fullPath;
        if (!cleanName) continue;

        if (['html', 'htm', 'css', 'js', 'json', 'txt', 'xml', 'svg'].includes(ext)) {
          const content = await file.text();
          newFiles.set(cleanName, {
            name: cleanName,
            content,
            originalContent: content,
            isModified: true,
            source: 'local',
            lastModified: Date.now(),
            fileType: ext as any
          });
        } else if (['png', 'jpg', 'jpeg', 'gif', 'ico', 'webp'].includes(ext)) {
          const buffer = await file.arrayBuffer();
          const base64 = arrayBufferToBase64(buffer);
          const content = `data:${file.type || 'image/png'};base64,${base64}`;
          newFiles.set(cleanName, {
            name: cleanName,
            content,
            originalContent: content,
            isModified: true,
            source: 'local',
            lastModified: Date.now(),
            fileType: 'image'
          });
        }
      }

      if (newFiles.size > 0) {
        setCustomFiles(newFiles);
        const loginFile = Array.from(newFiles.values()).find(
          (f) => f.name.endsWith('login.html') || f.name.endsWith('login.htm') || f.name === 'login.html'
        );
        if (loginFile) {
          setUploadedPreviewHtml(loginFile.content);
          setPreviewSource('uploaded');
        }
        setActiveTab('code');
        showToast(
          `تم استيراد ${newFiles.size} ملف من المجلد بنجاح! تم فتح محرر الملفات والأكواد ويمكنك المعاينة والتعديل والنشر مباشرة.`,
          'success'
        );
      } else {
        showToast('لم يتم العثور على ملفات ويب مدعومة داخل المجلد المختار', 'error');
      }
    } catch (err: any) {
      showToast(`فشل في قراءة ملفات المجلد: ${err.message}`, 'error');
    } finally {
      e.target.value = '';
    }
  };

  // Handle ZIP Package Upload - 100% Real File Extraction
  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      showToast('جاري فك ضغط واستيراد حزمة ZIP...', 'info');
      const zip = await JSZip.loadAsync(file);
      const newFiles = new Map<string, PortalFile>();
      const fileNames = Object.keys(zip.files);

      for (const rawName of fileNames) {
        const zipEntry = zip.files[rawName];
        if (zipEntry.dir) continue;

        const cleanName = rawName.includes('/') ? rawName.substring(rawName.indexOf('/') + 1) || rawName : rawName;
        const ext = cleanName.split('.').pop()?.toLowerCase() || '';

        if (['html', 'htm', 'css', 'js', 'json', 'txt', 'xml', 'svg'].includes(ext)) {
          const content = await zipEntry.async('string');
          newFiles.set(cleanName, {
            name: cleanName,
            content,
            originalContent: content,
            isModified: true,
            source: 'local',
            lastModified: Date.now(),
            fileType: ext as any
          });
        } else if (['png', 'jpg', 'jpeg', 'gif', 'ico', 'webp'].includes(ext)) {
          const base64 = await zipEntry.async('base64');
          const mime = ext === 'png' ? 'image/png' : ext === 'svg' ? 'image/svg+xml' : 'image/jpeg';
          const content = `data:${mime};base64,${base64}`;
          newFiles.set(cleanName, {
            name: cleanName,
            content,
            originalContent: content,
            isModified: true,
            source: 'local',
            lastModified: Date.now(),
            fileType: 'image'
          });
        }
      }

      if (newFiles.size > 0) {
        setCustomFiles(newFiles);
        const loginFile = Array.from(newFiles.values()).find(
          (f) => f.name.endsWith('login.html') || f.name.endsWith('login.htm') || f.name === 'login.html'
        );
        if (loginFile) {
          setUploadedPreviewHtml(loginFile.content);
          setPreviewSource('uploaded');
        }
        setActiveTab('code');
        showToast(
          `تم فك واستيراد حزمة ZIP (${newFiles.size} ملف) بنجاح! تم فتح محرر الملفات ويمكنك المعاينة والتعديل والنشر مباشرة.`,
          'success'
        );
      } else {
        showToast('ملف الـ ZIP فارغ أو لا يحتوي على ملفات مدعومة', 'error');
      }
    } catch (err: any) {
      showToast(`تعذر فك ضغط ملف الـ ZIP: ${err.message}`, 'error');
    } finally {
      e.target.value = '';
    }
  };

  // Handle voucher PIN selection
  const handleApplyVoucherPin = (pin: string) => {
    setSimCardPin(pin);
    setIsQrScannerOpen(false);
    setSimLoginMode('pin');
    showToast(`تم اختيار كود الكرت: ${pin}`, 'info');
  };

  if (!isOpen) return null;

  const currentTheme = THEME_PRESETS[config.themePreset] || THEME_PRESETS['cyber-indigo'];

  // Handle Deploying directly to MikroTik Router
  const handleDeployToRouter = async () => {
    setIsDeploying(true);
    try {
      let filesToDeploy: Record<string, string> = {};

      if (customFiles && customFiles.size > 0) {
        for (const [name, file] of customFiles) {
          if (file.fileType !== 'image') {
            filesToDeploy[name] = file.content;
          }
        }
      } else {
        const loginHtml = generateHotspotLoginHtml(config);
        const statusHtml = generateHotspotStatusHtml(config);
        const logoutHtml = generateHotspotLogoutHtml(config);
        const aloginHtml = generateHotspotAloginHtml(config);

        filesToDeploy = {
          'login.html': loginHtml,
          'status.html': statusHtml,
          'logout.html': logoutHtml,
          'alogin.html': aloginHtml,
          'rlogin.html': aloginHtml
        };
      }

      const targetProfile = serverProfiles.find((p) => p.name === config.targetProfileName) || selectedProfile;

      const res = await deployHotspotPortal({
        profileId: targetProfile?.id,
        profileName: config.targetProfileName || targetProfile?.name || 'hsprof1',
        folderName: config.targetHtmlDir || 'hotspot',
        dnsName: config.targetDnsName || 'login.net',
        files: filesToDeploy,
        config
      });

      if (res.success) {
        showToast(
          `تم بنجاح تثبيت ونشر صفحة تسجيل الدخول في راوتر المايكروتك على المجلد [${config.targetHtmlDir}]!`,
          'success'
        );
        if (previewSource === 'router') {
          fetchRouterPublishedPage(previewPage);
        }
      } else {
        showToast(res.message || 'حدث خطأ أثناء التثبيت على المايكروتك', 'error');
      }
    } catch (e: any) {
      showToast('تعذر نشر صفحة الدخول على المايكروتك', 'error');
    } finally {
      setIsDeploying(false);
    }
  };

  // Handle Exporting ZIP
  const handleDownloadZip = async () => {
    if (isExportingZip) return;
    setIsExportingZip(true);
    try {
      const blob = await exportPortalZip(config);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hotspot-${(config.networkName || 'portal').replace(/\s+/g, '_')}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      trackTimer(() => URL.revokeObjectURL(url), 1000);
      showToast('تم تحميل حزمة القالب الكاملة (ZIP) بنجاح!', 'success');
    } catch (e: any) {
      showToast('فشل تصدير ملف الـ ZIP', 'error');
    } finally {
      if (isMountedRef.current) setIsExportingZip(false);
    }
  };

  // Handle Copying HTML
  const handleCopyHtml = async () => {
    const code = generateHotspotLoginHtml(config);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        throw new Error('Clipboard API unavailable');
      }
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = code;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        showToast('تعذر نسخ الكود إلى الحافظة', 'error');
        return;
      }
    }
    if (!isMountedRef.current) return;
    setCopiedCode(true);
    showToast('تم نسخ كود صفحة login.html إلى الحافظة', 'info');
    trackTimer(() => setCopiedCode(false), 2500);
  };

  // Handle Simulator Login Action
  const handleSimulatorSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSimError(null);

    if (simLoginMode === 'pin') {
      if (!simCardPin.trim()) {
        setSimError('يرجى إدخال رقم كرت الإنترنت');
        return;
      }
    } else {
      if (!simUsername.trim() || !simPassword.trim()) {
        setSimError('يرجى إدخال اسم المستخدم وكلمة المرور');
        return;
      }
    }

    // Success simulation
    setSimIsLoggedIn(true);
    setPreviewPage('status');
  };

  // Add new pricing plan
  const handleAddPlan = () => {
    const newPlan: PricingPlanItem = {
      id: 'plan_' + Date.now(),
      name: 'باقة جديدة',
      price: '500 ريال',
      duration: '3 أيام',
      dataLimit: '10 GB',
      speed: '10 Mbps',
      highlight: false
    };
    setConfig({
      ...config,
      pricingPlans: [...config.pricingPlans, newPlan]
    });
  };

  // Remove plan
  const handleRemovePlan = (id: string) => {
    setConfig({
      ...config,
      pricingPlans: config.pricingPlans.filter((p) => p.id !== id)
    });
  };

  // Update plan
  const handleUpdatePlan = (id: string, field: keyof PricingPlanItem, value: any) => {
    setConfig({
      ...config,
      pricingPlans: config.pricingPlans.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    });
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[100] flex items-center justify-center p-2 sm:p-4 overflow-hidden">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-7xl h-[94vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 my-auto mx-auto max-w-[98vw]">
        {/* Hidden inputs for uploading directory or zip file */}
        <input
          type="file"
          ref={folderInputRef}
          {...({ webkitdirectory: '', directory: '' } as any)}
          multiple
          className="hidden"
          onChange={handleFolderUpload}
        />
        <input
          type="file"
          ref={zipInputRef}
          accept=".zip"
          className="hidden"
          onChange={handleZipUpload}
        />

        {/* ========================================================================= */}
        {/* MODAL HEADER */}
        {/* ========================================================================= */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white">
                  استوديو بوابات وصفحات تسجيل الدخول الحية
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-bold">
                  ● معاينة تفاعلية فورية ومباشرة
                </span>
              </div>
              <p className="text-xs text-slate-400">
                تخصيص كامل للشعارات، الألوان، إخفاء وإظهار العناصر، الباقات، ورفع وتعديل المجلدات الحية
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Upload Folder Button */}
            <button
              onClick={() => folderInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 text-xs font-bold transition-all border border-slate-700 active:scale-95"
              title="رفع مجلد كامل يحتوي على ملفات صفحة الهوتسبوت لتعديلها ونشرها"
            >
              <FolderUp className="w-4 h-4 text-sky-400" />
              <span className="hidden sm:inline">رفع مجلد صفحة</span>
            </button>

            {/* Upload ZIP Button */}
            <button
              onClick={() => zipInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold transition-all border border-slate-700 active:scale-95"
              title="رفع ملف مضغوط ZIP لقالب صفحة الهوتسبوت"
            >
              <FileArchive className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">رفع ZIP</span>
            </button>

            <button
              onClick={handleDeployToRouter}
              disabled={isDeploying}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-lg shadow-emerald-600/25 active:scale-95 disabled:opacity-50"
            >
              {isDeploying ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>جاري النشر في المايكروتك...</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4" />
                  <span>تثبيت وحفظ على الراوتر</span>
                </>
              )}
            </button>

            <button
              onClick={handlePullFromRouter}
              disabled={isPulling}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all border border-slate-700 active:scale-95 disabled:opacity-50"
              title="جلب ومزامنة الإعدادات النشطة الحالية من الراوتر"
            >
              <RefreshCw className={`w-4 h-4 text-emerald-400 ${isPulling ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">مزامنة من الراوتر</span>
            </button>

            <button
              onClick={handleDownloadZip}
              disabled={isExportingZip}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all border border-slate-700"
              title="تحميل حزمة القالب كملف ZIP"
            >
              <Download className="w-4 h-4 text-indigo-400" />
              <span className="hidden sm:inline">تصدير ZIP</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* MAIN STUDIO SPLIT VIEW: CONTROLS (LEFT/TABS) & LIVE PREVIEW (RIGHT) */}
        {/* ========================================================================= */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-hidden">
          {/* ========================================================================= */}
          {/* LEFT COLUMN: CUSTOMIZATION CONTROLS & TABS (7 COLS) */}
          {/* ========================================================================= */}
          <div className="lg:col-span-7 flex flex-col border-b lg:border-b-0 lg:border-l border-slate-800 bg-slate-900/60 min-h-0">
            {/* Studio Navigation Tabs */}
            <div className="flex items-center gap-1.5 p-3 border-b border-slate-800 bg-slate-950/40 overflow-x-auto scrollbar-none flex-shrink-0">
              {[
                { id: 'brand', label: 'الهوية والشعار', icon: Sparkles },
                { id: 'theme', label: 'الألوان والتصميم', icon: Palette },
                { id: 'visibility', label: 'التحكم في ظهور العناصر', icon: Eye },
                { id: 'promos', label: 'الإعلانات والرسائل', icon: Megaphone },
                { id: 'pricing', label: 'الباقات والأسعار', icon: DollarSign },
                { id: 'support', label: 'التواصل والدعم', icon: Phone },
                { id: 'login', label: 'خيارات الدخول', icon: Shield },
                { id: 'deploy', label: 'الربط بالمايكروتك', icon: Globe },
                { id: 'code', label: 'محرر الملفات والأكواد', icon: FileCode }
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Tab Body Contents (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6 text-right">
              {/* ------------------------------------------------------------- */}
              {/* TAB 1: BRAND & LOGO IDENTITY */}
              {/* ------------------------------------------------------------- */}
              {activeTab === 'brand' && (
                <div className="space-y-5 animate-in fade-in duration-200">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300 block">اسم الشبكة أو البوابة *</label>
                    <input
                      type="text"
                      value={config.networkName}
                      onChange={(e) => setConfig({ ...config, networkName: e.target.value })}
                      placeholder="مثال: شبكة السرعة اللاسلكية"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-indigo-500 font-bold"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-300 block">عنوان الترحيب الرئيسي</label>
                      <input
                        type="text"
                        value={config.welcomeTitle}
                        onChange={(e) => setConfig({ ...config, welcomeTitle: e.target.value })}
                        placeholder="مثال: أهلاً بك في شبكة الإنترنت فائقة السرعة"
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-300 block">وصف أو تعليمات البوابة</label>
                      <input
                        type="text"
                        value={config.welcomeSubtitle}
                        onChange={(e) => setConfig({ ...config, welcomeSubtitle: e.target.value })}
                        placeholder="مثال: أدخل كود الكرت للاتصال الفوري بالإنترنت"
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Logo Options */}
                  <div className="space-y-3 pt-3 border-t border-slate-800">
                    <label className="text-xs font-bold text-slate-300 block">نوع ومظهر الشعار (Logo):</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'icon', label: 'أيقونة جاهزة', desc: 'أيقونة عصرية متوهجة' },
                        { id: 'image', label: 'رابط صورة مخصصة', desc: 'شعار الشبكة الخاص بك' },
                        { id: 'text', label: 'نصي فقط', desc: 'بدون أيقونة خارجية' }
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setConfig({ ...config, logoType: item.id as any })}
                          className={`p-3 rounded-xl border text-right transition-all ${
                            config.logoType === item.id
                              ? 'bg-indigo-600/20 border-indigo-500 text-white font-bold'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <div className="text-xs font-bold">{item.label}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{item.desc}</div>
                        </button>
                      ))}
                    </div>

                    {config.logoType === 'icon' && (
                      <div className="space-y-2 pt-2">
                        <span className="text-[11px] text-slate-400 block">اختر أيقونة الشعار:</span>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { id: 'Wifi', icon: Wifi, name: 'واي فاي' },
                            { id: 'Zap', icon: Zap, name: 'برق سريع' },
                            { id: 'Crown', icon: Crown, name: 'تاج VIP' },
                            { id: 'Flame', icon: Flame, name: 'شعلة' },
                            { id: 'Star', icon: Star, name: 'نجمة' },
                            { id: 'Shield', icon: Shield, name: 'أمان وحماية' },
                            { id: 'Sparkles', icon: Sparkles, name: 'إشراق' },
                            { id: 'Globe', icon: Globe, name: 'إنترنت عالمي' }
                          ].map((ic) => {
                            const IconC = ic.icon;
                            const isSel = config.logoIcon === ic.id;
                            return (
                              <button
                                key={ic.id}
                                type="button"
                                onClick={() => setConfig({ ...config, logoIcon: ic.id })}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs transition-all ${
                                  isSel
                                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-md font-bold'
                                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                                }`}
                              >
                                <IconC className="w-3.5 h-3.5" />
                                <span>{ic.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {config.logoType === 'image' && (
                      <div className="space-y-1.5 pt-2">
                        <label className="text-xs font-bold text-slate-300 block">
                          رابط صورة الشعار (Logo Image URL)
                        </label>
                        <input
                          type="text"
                          value={config.logoImageUrl}
                          onChange={(e) => setConfig({ ...config, logoImageUrl: e.target.value })}
                          placeholder="مثال: https://mywebsite.com/logo.png أو رابط مباشر"
                          className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                        />
                        <span className="text-[10px] text-slate-400 block">
                          يمكنك وضع رابط مباشر لصورة الشعار وسيتم تضمينها وعرضها فوراً في الصفحة.
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Slogan & Footer */}
                  <div className="space-y-1.5 pt-3 border-t border-slate-800">
                    <label className="text-xs font-bold text-slate-300 block">حقوق أسفل الصفحة والشعار الإعلاني</label>
                    <input
                      type="text"
                      value={config.footerText}
                      onChange={(e) => setConfig({ ...config, footerText: e.target.value })}
                      placeholder="مثال: جميع الحقوق محفوظة © شبكة السرعة اللاسلكية"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* TAB 2: THEME, COLORS & GLASSMORPHISM */}
              {/* ------------------------------------------------------------- */}
              {activeTab === 'theme' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  {/* Theme Presets */}
                  <div className="space-y-2.5">
                    <label className="text-xs font-bold text-slate-300 block">القوالب والألوان الجاهزة الفاخرة:</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {Object.entries(THEME_PRESETS).map(([key, thm]) => {
                        const isSelected = config.themePreset === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() =>
                              setConfig({
                                ...config,
                                themePreset: key as any,
                                primaryColor: thm.primary,
                                accentColor: thm.accent
                              })
                            }
                            className={`p-3 rounded-2xl border text-right transition-all flex items-center justify-between ${
                              isSelected
                                ? 'bg-slate-800 border-indigo-500 shadow-md shadow-indigo-500/20'
                                : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <div
                                className="w-7 h-7 rounded-xl border border-white/20 shadow-sm flex items-center justify-center"
                                style={{ background: thm.buttonGradient }}
                              >
                                {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                              </div>
                              <div>
                                <div className="text-xs font-bold text-white">{thm.name}</div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  {thm.primary} • {thm.accent}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Custom Color Pickers */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-800">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-300 block">اللون الأساسي للأزرار والعناوين</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={config.primaryColor}
                          onChange={(e) => setConfig({ ...config, primaryColor: e.target.value })}
                          className="w-10 h-10 rounded-xl bg-transparent border-0 cursor-pointer p-0"
                        />
                        <input
                          type="text"
                          value={config.primaryColor}
                          onChange={(e) => setConfig({ ...config, primaryColor: e.target.value })}
                          className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-mono"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-300 block">لون التوهج والشارات الثانوية</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={config.accentColor}
                          onChange={(e) => setConfig({ ...config, accentColor: e.target.value })}
                          className="w-10 h-10 rounded-xl bg-transparent border-0 cursor-pointer p-0"
                        />
                        <input
                          type="text"
                          value={config.accentColor}
                          onChange={(e) => setConfig({ ...config, accentColor: e.target.value })}
                          className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Border Radius */}
                  <div className="space-y-2 pt-3 border-t border-slate-800">
                    <label className="text-xs font-bold text-slate-300 block">انحناء حواف البطاقات (Border Radius):</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'rounded-xl', label: 'انحناء ناعم (12px)' },
                        { id: 'rounded-2xl', label: 'عصري فخم (20px)' },
                        { id: 'rounded-3xl', label: 'دائري جذاب (28px)' }
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setConfig({ ...config, borderRadius: item.id as any })}
                          className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${
                            config.borderRadius === item.id
                              ? 'bg-indigo-600 text-white border-indigo-500'
                              : 'bg-slate-950 border-slate-800 text-slate-400'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* TAB: ELEMENT VISIBILITY CONTROLS */}
              {/* ------------------------------------------------------------- */}
              {activeTab === 'visibility' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  <div className="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-white flex items-center gap-2">
                        <Eye className="w-4 h-4 text-indigo-400" />
                        <span>التحكم في ظهور عناصر الصفحة (Element Visibility)</span>
                      </h3>
                      <p className="text-[11px] text-slate-300 mt-1">
                        يمكنك بسهولة إظهار أو إخفاء أي جزء تريده من عناصر صفحة تسجيل الدخول بنقرة واحدة
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setConfig({
                            ...config,
                            showLogo: true,
                            showNetworkTitle: true,
                            showSubtitle: true,
                            showMarqueeNews: true,
                            showAlertNotice: false,
                            showQrLogin: true,
                            showFreeTrial: true,
                            showPromoBanner: true,
                            showPricingPlans: true,
                            showSupportSection: true,
                            showLocation: true,
                            showFooter: true
                          })
                        }
                        className="px-3 py-1.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 text-[11px] font-bold transition-all"
                      >
                        إظهار الكل
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setConfig({
                            ...config,
                            showLogo: true,
                            showNetworkTitle: true,
                            showSubtitle: false,
                            showMarqueeNews: false,
                            showAlertNotice: false,
                            showQrLogin: true,
                            showFreeTrial: false,
                            showPromoBanner: false,
                            showPricingPlans: false,
                            showSupportSection: false,
                            showLocation: false,
                            showFooter: false
                          })
                        }
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold transition-all"
                      >
                        الوضع المبسط (Minimal)
                      </button>
                    </div>
                  </div>

                  {/* Visibility Toggles Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      {
                        key: 'showLogo',
                        title: 'شعار وأيقونة الشبكة',
                        desc: 'أيقونة أو صورة الشعار في أعلى البطاقة',
                        val: config.showLogo !== false,
                        icon: Sparkles
                      },
                      {
                        key: 'showNetworkTitle',
                        title: 'اسم وعنوان الشبكة',
                        desc: 'اسم الشبكة الرئيسي والخط العريض',
                        val: config.showNetworkTitle !== false,
                        icon: Wifi
                      },
                      {
                        key: 'showSubtitle',
                        title: 'العبارة والوصف الترحيبي',
                        desc: 'نص التعليمات والترحيب أسفل الاسم',
                        val: config.showSubtitle !== false,
                        icon: MessageCircle
                      },
                      {
                        key: 'showQrLogin',
                        title: 'زر كاميرا مسح كود QR للكرت',
                        desc: 'زر الكاميرا بجانب حقل إدخال الكود لمسح الباركود',
                        val: config.showQrLogin !== false,
                        icon: Camera
                      },
                      {
                        key: 'showMarqueeNews',
                        title: 'شريط الأخبار والإعلانات المتحرك',
                        desc: 'شريط ترويجي متحرك في أعلى الشاشة',
                        val: !!config.showMarqueeNews,
                        icon: Megaphone
                      },
                      {
                        key: 'showAlertNotice',
                        title: 'صندوق التنبيه والتحذير العاجل',
                        desc: 'تنبيه صيانة أو رسالة حمراء عاجلة',
                        val: !!config.showAlertNotice,
                        icon: AlertTriangle
                      },
                      {
                        key: 'showFreeTrial',
                        title: 'زر التجربة المجانية (Trial)',
                        desc: 'زر دخول تجريبي مجاني بدون كرت',
                        val: !!config.showFreeTrial,
                        icon: Zap
                      },
                      {
                        key: 'showPromoBanner',
                        title: 'بطاقة العروض الترويجية الحصرية',
                        desc: 'بطاقة إعلان الباقات والعروض أسفل تسجيل الدخول',
                        val: !!config.showPromoBanner,
                        icon: Crown
                      },
                      {
                        key: 'showPricingPlans',
                        title: 'جدول الباقات والأسعار',
                        desc: 'عرض قائمة فئات وأسعار الكروت المتاحة',
                        val: !!config.showPricingPlans,
                        icon: DollarSign
                      },
                      {
                        key: 'showSupportSection',
                        title: 'شريط أزرار التواصل والدعم',
                        desc: 'أزرار واتساب وهاتف وتلجرام المباشرة',
                        val: config.showSupportSection !== false,
                        icon: Phone
                      },
                      {
                        key: 'showLocation',
                        title: 'الموقع الجغرافي للشبكة',
                        desc: 'عنوان أو موقع موزع الكروت والشبكة',
                        val: config.showLocation !== false,
                        icon: Globe
                      },
                      {
                        key: 'showFooter',
                        title: 'تذييل الصفحة وحقوق الملكية',
                        desc: 'نص حقوق الطبع والنشر في أسفل الصفحة',
                        val: config.showFooter !== false,
                        icon: Shield
                      }
                    ].map((item) => {
                      const IconC = item.icon;
                      return (
                        <div
                          key={item.key}
                          role="button"
                          tabIndex={0}
                          onClick={() => setConfig({ ...config, [item.key]: !item.val })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setConfig({ ...config, [item.key]: !item.val });
                            }
                          }}
                          className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                            item.val
                              ? 'bg-slate-950/80 border-indigo-500/60 shadow-sm'
                              : 'bg-slate-950/30 border-slate-800 opacity-60'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                                item.val
                                  ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                                  : 'bg-slate-800 text-slate-500'
                              }`}
                            >
                              <IconC className="w-4 h-4" />
                            </div>
                            <div>
                              <div className={`text-xs font-bold ${item.val ? 'text-white' : 'text-slate-400'}`}>
                                {item.title}
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">{item.desc}</div>
                            </div>
                          </div>

                          <div
                            className={`w-10 h-5 rounded-full p-0.5 transition-colors duration-200 ease-in-out ${
                              item.val ? 'bg-indigo-600' : 'bg-slate-800'
                            }`}
                          >
                            <div
                              className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ease-in-out shadow-sm ${
                                item.val ? 'transform translate-x-0' : 'transform -translate-x-5'
                              }`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* TAB 3: PROMOTIONS, ANNOUNCEMENTS & NEWS TICKER */}
              {/* ------------------------------------------------------------- */}
              {activeTab === 'promos' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  {/* 1. Marquee News Ticker */}
                  <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-white flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={config.showMarqueeNews}
                          onChange={(e) => setConfig({ ...config, showMarqueeNews: e.target.checked })}
                          className="rounded text-indigo-600 focus:ring-0 w-4 h-4 bg-slate-900 border-slate-700"
                        />
                        <span>تفعيل شريط الإعلانات المتحرك (Marquee Ticker)</span>
                      </label>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-300 font-mono">
                        متحرك في أعلى الصفحة
                      </span>
                    </div>

                    {config.showMarqueeNews && (
                      <div className="space-y-1.5 pt-1">
                        <label className="text-[11px] font-bold text-slate-300 block">نص الإعلان أو الترويج:</label>
                        <textarea
                          rows={2}
                          value={config.marqueeNewsText}
                          onChange={(e) => setConfig({ ...config, marqueeNewsText: e.target.value })}
                          placeholder="مثال: 🔥 عرض اليوم: اشحن أي باقة واستمتع بضعف السرعة! • للدعم اتصل على 777000000"
                          className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    )}
                  </div>

                  {/* 2. Featured Promo Hero Card */}
                  <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-white flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={config.showPromoBanner}
                          onChange={(e) => setConfig({ ...config, showPromoBanner: e.target.checked })}
                          className="rounded text-indigo-600 focus:ring-0 w-4 h-4 bg-slate-900 border-slate-700"
                        />
                        <span>بطاقة عرض ترويجي مميزة (Promo Hero Card)</span>
                      </label>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-300 font-mono">
                        بطاقة بارزة أسفل تسجيل الدخول
                      </span>
                    </div>

                    {config.showPromoBanner && (
                      <div className="space-y-3 pt-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-300 block">شارة العرض (Badge):</label>
                            <input
                              type="text"
                              value={config.promoBadge}
                              onChange={(e) => setConfig({ ...config, promoBadge: e.target.value })}
                              placeholder="مثال: عرض حصري ⚡"
                              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-300 block">عنوان العرض الترويجي:</label>
                            <input
                              type="text"
                              value={config.promoTitle}
                              onChange={(e) => setConfig({ ...config, promoTitle: e.target.value })}
                              placeholder="مثال: باقة التوفير الشهرية بخصم 30%"
                              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs font-bold"
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-300 block">تفاصيل وشرح العرض:</label>
                          <input
                            type="text"
                            value={config.promoDesc}
                            onChange={(e) => setConfig({ ...config, promoDesc: e.target.value })}
                            placeholder="مثال: سرعة صاروخية بدون تقطيع للألعاب ومقاطع الفيديو بدقة 4K"
                            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-300 block">نص زر الطلب:</label>
                            <input
                              type="text"
                              value={config.promoButtonText}
                              onChange={(e) => setConfig({ ...config, promoButtonText: e.target.value })}
                              placeholder="مثال: اطلب كرتك الآن"
                              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-300 block">رابط الزر (واتساب أو رابط):</label>
                            <input
                              type="text"
                              value={config.promoButtonLink}
                              onChange={(e) => setConfig({ ...config, promoButtonLink: e.target.value })}
                              placeholder="مثال: https://wa.me/967777000000"
                              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 3. Maintenance Notice */}
                  <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-white flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={config.showAlertNotice}
                          onChange={(e) => setConfig({ ...config, showAlertNotice: e.target.checked })}
                          className="rounded text-rose-600 focus:ring-0 w-4 h-4 bg-slate-900 border-slate-700"
                        />
                        <span>تنبيه صيانة أو رسالة تحذيرية عاجلة</span>
                      </label>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-300 font-mono">
                        مربع أحمر تحذيري
                      </span>
                    </div>

                    {config.showAlertNotice && (
                      <div className="space-y-1.5 pt-1">
                        <input
                          type="text"
                          value={config.alertNoticeText}
                          onChange={(e) => setConfig({ ...config, alertNoticeText: e.target.value })}
                          placeholder="مثال: تنبيه: سيتم إجراء صيانة روتينية خفيفة فجر الجمعة لمدة 10 دقائق."
                          className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-rose-200 text-xs"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* TAB 4: PRICING & CARD PACKAGES SHOWCASE */}
              {/* ------------------------------------------------------------- */}
              {activeTab === 'pricing' && (
                <div className="space-y-5 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-white flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.showPricingPlans}
                        onChange={(e) => setConfig({ ...config, showPricingPlans: e.target.checked })}
                        className="rounded text-indigo-600 focus:ring-0 w-4 h-4 bg-slate-900 border-slate-700"
                      />
                      <span>عرض قائمة باقات وأسعار الكروت للمستخدمين</span>
                    </label>

                    {config.showPricingPlans && (
                      <button
                        type="button"
                        onClick={handleAddPlan}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600 hover:text-white border border-indigo-500/30 text-xs font-bold transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>إضافة باقة</span>
                      </button>
                    )}
                  </div>

                  {config.showPricingPlans && (
                    <div className="space-y-3">
                      {config.pricingPlans.map((plan, idx) => (
                        <div
                          key={plan.id}
                          className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5 relative group"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-indigo-300">الباقة #{idx + 1}</span>
                            <div className="flex items-center gap-2">
                              <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={plan.highlight}
                                  onChange={(e) => handleUpdatePlan(plan.id, 'highlight', e.target.checked)}
                                  className="rounded text-amber-500 focus:ring-0 w-3.5 h-3.5 bg-slate-900 border-slate-700"
                                />
                                <span className={plan.highlight ? 'text-amber-400 font-bold' : ''}>تمييز (الأكثر طلباً)</span>
                              </label>
                              <button
                                type="button"
                                onClick={() => handleRemovePlan(plan.id)}
                                className="p-1 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-900"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div>
                              <span className="text-[10px] text-slate-400 block mb-0.5">اسم الكرت:</span>
                              <input
                                type="text"
                                value={plan.name}
                                onChange={(e) => handleUpdatePlan(plan.id, 'name', e.target.value)}
                                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white text-xs font-bold"
                              />
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block mb-0.5">السعر:</span>
                              <input
                                type="text"
                                value={plan.price}
                                onChange={(e) => handleUpdatePlan(plan.id, 'price', e.target.value)}
                                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white text-xs font-bold text-emerald-400"
                              />
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block mb-0.5">الصلاحية:</span>
                              <input
                                type="text"
                                value={plan.duration}
                                onChange={(e) => handleUpdatePlan(plan.id, 'duration', e.target.value)}
                                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white text-xs"
                              />
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block mb-0.5">حجم البيانات / السرعة:</span>
                              <input
                                type="text"
                                value={plan.dataLimit}
                                onChange={(e) => handleUpdatePlan(plan.id, 'dataLimit', e.target.value)}
                                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white text-xs font-mono"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* TAB 5: SUPPORT & CONTACT INFORMATION */}
              {/* ------------------------------------------------------------- */}
              {activeTab === 'support' && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-300 block">رقم الدعم الفني عبر واتساب</label>
                      <input
                        type="text"
                        value={config.supportWhatsapp}
                        onChange={(e) => setConfig({ ...config, supportWhatsapp: e.target.value })}
                        placeholder="مثال: +967777000000"
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-300 block">رقم هاتف الاتصال المباشر</label>
                      <input
                        type="text"
                        value={config.supportPhone}
                        onChange={(e) => setConfig({ ...config, supportPhone: e.target.value })}
                        placeholder="مثال: 777000000"
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-300 block">رابط أو معرف قناة تلجرام</label>
                      <input
                        type="text"
                        value={config.supportTelegram}
                        onChange={(e) => setConfig({ ...config, supportTelegram: e.target.value })}
                        placeholder="مثال: t.me/my_network"
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-300 block">موقع الشبكة ونقاط بيع الكروت</label>
                      <input
                        type="text"
                        value={config.supportLocation}
                        onChange={(e) => setConfig({ ...config, supportLocation: e.target.value })}
                        placeholder="مثال: شارع الجامعة - بقالة الأمل ومحطة السلام"
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* TAB 6: MIKROTIK LOGIN OPTIONS */}
              {/* ------------------------------------------------------------- */}
              {activeTab === 'login' && (
                <div className="space-y-5 animate-in fade-in duration-200">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-300 block">أسلوب وشكل حقول تسجيل الدخول:</label>
                    <div className="grid grid-cols-3 gap-2.5">
                      {[
                        { id: 'dual-mode', label: 'تبويبات ثنائية', desc: 'كود الكرت + اسم مستخدم' },
                        { id: 'card-pin-only', label: 'كود الكرت فقط (PIN)', desc: 'اسم المستخدم = كلمة المرور' },
                        { id: 'user-pass', label: 'مستخدم وكلمة سر', desc: 'حقلين منفصلين تقليديين' }
                      ].map((style) => (
                        <button
                          key={style.id}
                          type="button"
                          onClick={() => setConfig({ ...config, loginStyle: style.id as any })}
                          className={`p-3 rounded-xl border text-right transition-all ${
                            config.loginStyle === style.id
                              ? 'bg-indigo-600/20 border-indigo-500 text-white font-bold'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <div className="text-xs font-bold">{style.label}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{style.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {(config.loginStyle === 'card-pin-only' || config.loginStyle === 'dual-mode') && (
                    <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3 animate-in slide-in-from-top-2 duration-150">
                      <label className="text-xs font-bold text-white block">طريقة تعامل كرت الإنترنت مع كلمة المرور (على المايكروتك):</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setConfig({ ...config, pinPasswordType: 'same' })}
                          className={`p-2.5 rounded-xl border text-center transition-all text-xs ${
                            (config.pinPasswordType || 'same') === 'same'
                              ? 'bg-indigo-600/20 border-indigo-500 text-white font-bold'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          رقم الكرت = كلمة المرور (افتراضي)
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfig({ ...config, pinPasswordType: 'empty' })}
                          className={`p-2.5 rounded-xl border text-center transition-all text-xs ${
                            config.pinPasswordType === 'empty'
                              ? 'bg-indigo-600/20 border-indigo-500 text-white font-bold'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          رقم الكرت فقط (كلمة مرور فارغة)
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-400">
                        اختر "رقم الكرت فقط" إذا كنت قد ولّدت الكروت في المايكروتك بدون تعيين كلمة مرور أو بكلمة مرور فارغة لتجنب مشاكل تسجيل الدخول.
                      </p>
                    </div>
                  )}

                  {/* Free Trial Button */}
                  <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-white flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={config.showFreeTrial}
                          onChange={(e) => setConfig({ ...config, showFreeTrial: e.target.checked })}
                          className="rounded text-indigo-600 focus:ring-0 w-4 h-4 bg-slate-900 border-slate-700"
                        />
                        <span>تضمين زر التجربة المجانية (MikroTik Trial Login)</span>
                      </label>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 font-mono">
                        $(if trial == 'yes')
                      </span>
                    </div>

                    {config.showFreeTrial && (
                      <div className="space-y-1.5 pt-1">
                        <input
                          type="text"
                          value={config.trialButtonText}
                          onChange={(e) => setConfig({ ...config, trialButtonText: e.target.value })}
                          placeholder="مثال: تجربة مجانية لمدة 15 دقيقة 🚀"
                          className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* TAB 7: MIKROTIK ROUTER BINDING & DEPLOY */}
              {/* ------------------------------------------------------------- */}
              {activeTab === 'deploy' && (
                <div className="space-y-5 animate-in fade-in duration-200">
                  <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 space-y-2">
                    <div className="flex items-center gap-2 text-indigo-300 font-bold text-xs">
                      <Shield className="w-4 h-4" />
                      <span>الربط والتثبيت الحقيقي في راوتر المايكروتك (Real Hardware Binding)</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      عند النقر على «تثبيت وحفظ على الراوتر»، سيتم إنشاء وتحديث ملفات القالب (
                      <code className="text-indigo-200 font-mono">login.html</code>,{' '}
                      <code className="text-indigo-200 font-mono">status.html</code>,{' '}
                      <code className="text-indigo-200 font-mono">logout.html</code>) مباشرة في ذاكرة الراوتر، وربط مجلد
                      الصفحة بالبروفايل المختار بأمان تام.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-300 block">
                        بروفايل الهوتسبوت المستهدف (Hotspot Server Profile) *
                      </label>
                      <select
                        value={config.targetProfileName}
                        onChange={(e) => setConfig({ ...config, targetProfileName: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                      >
                        {serverProfiles.map((p) => (
                          <option key={p.id} value={p.name}>
                            {p.name} {p.dnsName ? `(${p.dnsName})` : ''} - مجلد: {p.htmlDirectory}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-300 block">
                          مجلد القالب في المايكروتك (HTML Directory) *
                        </label>
                        <input
                          type="text"
                          value={config.targetHtmlDir}
                          onChange={(e) => setConfig({ ...config, targetHtmlDir: e.target.value })}
                          placeholder="مثال: hotspot أو flash/hotspot"
                          className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-mono"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-300 block">
                          دومين البوابة للعملاء (DNS Name)
                        </label>
                        <input
                          type="text"
                          value={config.targetDnsName}
                          onChange={(e) => setConfig({ ...config, targetDnsName: e.target.value })}
                          placeholder="مثال: login.net أو wifi.hotspot"
                          className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Actions summary */}
                  <div className="flex flex-wrap gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={handleDeployToRouter}
                      disabled={isDeploying}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg transition-all active:scale-95 disabled:opacity-50"
                    >
                      {isDeploying ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>جاري النشر والحفظ في الراوتر...</span>
                        </>
                      ) : (
                        <>
                          <UploadCloud className="w-4 h-4" />
                          <span>نشر وتثبيت القالب في المايكروتك الآن</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleCopyHtml}
                      className="flex items-center gap-1.5 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700"
                    >
                      {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      <span>{copiedCode ? 'تم النسخ!' : 'نسخ كود login.html'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* TAB 8: ADVANCED FILE & CODE EDITOR (HYBRID PORTAL EDITOR) */}
              {/* ------------------------------------------------------------- */}
              {activeTab === 'code' && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="p-3.5 rounded-2xl bg-indigo-950/40 border border-indigo-500/30">
                    <div className="flex items-center gap-2 text-indigo-300 font-bold text-xs">
                      <FileCode className="w-4 h-4" />
                      <span>محرر شجرة الملفات والأكواد المتقدم (FTP & Live Code Editor)</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed mt-1">
                      يمكنك استعراض وتعديل ورفع كافة ملفات وصفحات البوابة بدقة متناهية، والتحقق من سلامة الأكواد وقوالب MikroTik قبل الرفع المباشر إلى الراوتر.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden shadow-2xl min-h-[520px]">
                    <HybridPortalEditor
                      targetFolder={config.targetHtmlDir || 'hotspot'}
                      targetDnsName={config.targetDnsName || ''}
                      targetProfileName={config.targetProfileName || ''}
                      isConnected={isConnected}
                      showToast={showToast}
                      readRouterFile={readRouterFile}
                      writeRouterFile={writeRouterFile}
                      detectHotspotPath={detectHotspotPath}
                      listRouterDirectory={listRouterDirectory}
                      deployPortalFiles={deployPortalFiles}
                      validatePortalFile={validatePortalFile}
                      deleteRouterFile={deleteRouterFile}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ========================================================================= */}
          {/* RIGHT COLUMN: LIVE INTERACTIVE PREVIEW PANEL (5 COLS) */}
          {/* ========================================================================= */}
          <div className="lg:col-span-5 flex flex-col bg-slate-950/90 min-h-0 relative">
            {/* Live Preview Top Controls */}
            <div className="p-3 border-b border-slate-800 bg-slate-950 flex flex-col gap-2.5 flex-shrink-0">
              {/* Row 1: Source Switcher & Viewport Mode */}
              <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
                {/* Source Mode: Router vs Draft vs Uploaded */}
                <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                  <button
                    onClick={() => {
                      setPreviewSource('router');
                      fetchRouterPublishedPage(previewPage);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      previewSource === 'router'
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="عرض الصفحة الحية المنشورة والموجودة فعلياً على الراوتر"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>الصفحة المنشورة على الشبكة</span>
                  </button>

                  <button
                    onClick={() => setPreviewSource('draft')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      previewSource === 'draft'
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="معاينة المسودة والتصميم الحالي من الاستوديو"
                  >
                    <Palette className="w-3.5 h-3.5" />
                    <span>مسودة الاستوديو</span>
                  </button>

                  {uploadedPreviewHtml && (
                    <button
                      onClick={() => setPreviewSource('uploaded')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        previewSource === 'uploaded'
                          ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="معاينة مجلد الصفحة أو حزمة ZIP المرفوعة"
                    >
                      <FolderUp className="w-3.5 h-3.5" />
                      <span>الملفات المرفوعة</span>
                    </button>
                  )}
                </div>

                {/* Viewport Width Switcher */}
                <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                  <button
                    onClick={() => setViewportMode('mobile')}
                    className={`p-1.5 rounded-lg transition-all ${
                      viewportMode === 'mobile' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                    title="هاتف ذكي (375px)"
                  >
                    <Smartphone className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewportMode('tablet')}
                    className={`p-1.5 rounded-lg transition-all ${
                      viewportMode === 'tablet' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                    title="جهاز لوحي (Tablet)"
                  >
                    <Tablet className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewportMode('desktop')}
                    className={`p-1.5 rounded-lg transition-all ${
                      viewportMode === 'desktop' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                    title="شاشة كاملة (Fluid)"
                  >
                    <Monitor className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Row 2: Page Selector and Router Controls */}
              <div className="flex items-center justify-between gap-2">
                {/* Page Selector (Login / Status / Logout) */}
                <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                  {[
                    { id: 'login', label: 'login.html (الدخول)' },
                    { id: 'status', label: 'status.html (الحالة)' },
                    { id: 'logout', label: 'logout.html (الخروج)' }
                  ].map((pg) => (
                    <button
                      key={pg.id}
                      onClick={() => {
                        setPreviewPage(pg.id as any);
                        if (pg.id === 'login') setSimIsLoggedIn(false);
                        if (pg.id === 'status') setSimIsLoggedIn(true);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                        previewPage === pg.id
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {pg.label}
                    </button>
                  ))}
                </div>

                {previewSource === 'router' && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => fetchRouterPublishedPage(previewPage)}
                      disabled={isLoadingRouterPage}
                      className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-bold transition-all"
                      title="إعادة جلب وتحديث الصفحة من الراوتر"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isLoadingRouterPage ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                      onClick={() => setActiveTab('code')}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 text-[11px] font-bold transition-all flex items-center gap-1"
                      title="فتح هذه الصفحة في محرر الأكواد والملفات للتعديل"
                    >
                      <FileCode className="w-3.5 h-3.5" />
                      <span>تعديل الكود</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Live Canvas Viewport Container */}
            <div className="flex-1 overflow-y-auto p-4 flex items-start justify-center bg-slate-950/80 backdrop-blur-sm relative">
              {/* ========================================================================= */}
              {/* IFRAME: REAL ROUTER PUBLISHED PAGE OR UPLOADED FOLDER / ZIP */}
              {/* ========================================================================= */}
              {previewSource === 'router' || previewSource === 'uploaded' ? (
                <div
                  className={`transition-all duration-300 rounded-3xl overflow-hidden shadow-2xl border border-slate-800 flex flex-col bg-slate-900 ${
                    viewportMode === 'mobile'
                      ? 'w-[360px]'
                      : viewportMode === 'tablet'
                      ? 'w-[480px]'
                      : 'w-full max-w-[600px]'
                  }`}
                  style={{ minHeight: '560px' }}
                >
                  {/* Top banner */}
                  <div
                    className={`p-2.5 border-b flex items-center justify-between text-xs ${
                      previewSource === 'uploaded'
                        ? 'bg-amber-950/60 border-amber-500/30'
                        : 'bg-emerald-950/60 border-emerald-500/30'
                    }`}
                  >
                    <div
                      className={`flex items-center gap-1.5 font-bold ${
                        previewSource === 'uploaded' ? 'text-amber-300' : 'text-emerald-300'
                      }`}
                    >
                      {previewSource === 'uploaded' ? (
                        <>
                          <FolderUp className="w-3.5 h-3.5 text-amber-400" />
                          <span>
                            المجلد المرفوع: <code className="font-mono text-white">login.html</code> ({customFiles.size} ملف)
                          </span>
                        </>
                      ) : (
                        <>
                          <Globe className="w-3.5 h-3.5 text-emerald-400" />
                          <span>
                            الراوتر: <code className="font-mono text-white">{config.targetHtmlDir || 'hotspot'}/{previewPage}.html</code>
                          </span>
                        </>
                      )}
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        previewSource === 'uploaded'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      {previewSource === 'uploaded' ? 'ملفات مستوردة' : 'منشور فعلياً'}
                    </span>
                  </div>

                  {previewSource === 'uploaded' ? (
                    uploadedPreviewHtml ? (
                      <iframe
                        title="Uploaded Portal Page"
                        srcDoc={substituteRouterPreviewVars(uploadedPreviewHtml)}
                        className="w-full h-full min-h-[540px] border-0 bg-white"
                        sandbox="allow-scripts allow-forms"
                      />
                    ) : (
                      <div className="flex-1 min-h-[500px] flex flex-col items-center justify-center gap-3 p-6 text-center text-slate-400">
                        <FolderUp className="w-10 h-10 text-amber-400" />
                        <p className="text-xs font-bold text-slate-300">قم برفع مجلد صفحة أو ملف ZIP لمعاينته هنا</p>
                      </div>
                    )
                  ) : isLoadingRouterPage ? (
                    <div className="flex-1 min-h-[500px] flex flex-col items-center justify-center gap-3 p-6 text-center text-slate-400">
                      <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
                      <p className="text-xs font-bold text-slate-300">جاري قراءة الصفحة الحية من ذاكرة الراوتر...</p>
                    </div>
                  ) : routerPublishedHtml ? (
                    <iframe
                      title="Published Router Page"
                      srcDoc={substituteRouterPreviewVars(routerPublishedHtml)}
                      className="w-full h-full min-h-[540px] border-0 bg-white"
                      sandbox="allow-scripts allow-forms"
                    />
                  ) : (
                    <div className="flex-1 min-h-[500px] flex flex-col items-center justify-center gap-3 p-6 text-center">
                      <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center">
                        <AlertTriangle className="w-6 h-6" />
                      </div>
                      <h4 className="text-sm font-bold text-white">لم يتم العثور على الصفحة المنشورة</h4>
                      <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                        الملف <code className="text-amber-300 font-mono">{config.targetHtmlDir || 'hotspot'}/{previewPage}.html</code> غير موجود في الراوتر حالياً.
                      </p>
                      <div className="flex gap-2 pt-2">
                        <button
                          type="button"
                          onClick={handleDeployToRouter}
                          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition-all flex items-center gap-1.5"
                        >
                          <UploadCloud className="w-3.5 h-3.5" />
                          <span>نشر المسودة للراوتر</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab('code')}
                          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all flex items-center gap-1.5 border border-slate-700"
                        >
                          <FileCode className="w-3.5 h-3.5" />
                          <span>فتح محرر الملفات</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* ========================================================================= */
                /* DRAFT SIMULATOR */
                /* ========================================================================= */
                <div
                  className={`transition-all duration-300 rounded-3xl overflow-hidden shadow-2xl border border-slate-800 relative ${
                    viewportMode === 'mobile'
                      ? 'w-[360px]'
                      : viewportMode === 'tablet'
                      ? 'w-[480px]'
                      : 'w-full max-w-[500px]'
                  }`}
                  style={{
                    background: currentTheme.bgGradient,
                    minHeight: '520px',
                    color: currentTheme.textColor
                  }}
                >
                  {/* Hidden Canvas for jsQR frame extraction */}
                  <canvas ref={qrCanvasRef} className="hidden" />

                  {/* Hidden Input for QR Code Image Upload */}
                  <input
                    ref={qrImageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleScanQrImage}
                    className="hidden"
                  />

                  {/* QR SCANNER MODAL OVERLAY IN SIMULATOR */}
                  {isQrScannerOpen && (
                    <div className="absolute inset-0 z-30 bg-black/90 backdrop-blur-md p-4 flex flex-col items-center justify-between text-center animate-in fade-in zoom-in-95 duration-150">
                      <div className="w-full flex items-center justify-between text-xs font-bold text-white border-b border-slate-800 pb-2">
                        <div className="flex items-center gap-2">
                          <Camera className="w-4 h-4 text-indigo-400" />
                          <span>كاميرا مسح كود QR والباركود الحقيقية</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsQrScannerOpen(false)}
                          className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Video / Scan Target */}
                      <div className="w-full relative my-auto rounded-2xl overflow-hidden border-2 border-indigo-500/60 bg-black/80 flex items-center justify-center min-h-[190px]">
                        <video ref={qrVideoRef} playsInline autoPlay muted className="w-full h-44 object-cover" />
                        {/* Laser Scan Beam */}
                        <div className="absolute inset-x-0 top-1/2 h-0.5 bg-rose-500 shadow-[0_0_12px_#f43f5e] animate-pulse pointer-events-none" />
                        <div className="absolute inset-4 border border-dashed border-white/40 rounded-xl pointer-events-none flex items-center justify-center">
                          <span className="text-[10px] text-white/80 bg-black/60 px-2 py-0.5 rounded backdrop-blur-sm">
                            وجه الكاميرا نحو كود QR للكرت
                          </span>
                        </div>
                      </div>

                      <div className="w-full space-y-2">
                        <button
                          type="button"
                          onClick={() => qrImageInputRef.current?.click()}
                          className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 text-xs font-bold border border-slate-700 flex items-center justify-center gap-1.5 transition-all"
                        >
                          <ImageIcon className="w-4 h-4 text-indigo-400" />
                          <span>مسح QR من ملف صورة محفوظة</span>
                        </button>

                        {users && users.length > 0 && (
                          <div className="space-y-1 pt-1">
                            <span className="text-[10px] text-slate-400 font-bold block">
                              أو اختر مستخدم نشط من الراوتر للاختبار:
                            </span>
                            <div className="grid grid-cols-2 gap-1.5 max-h-24 overflow-y-auto">
                              {users.slice(0, 4).map((u) => (
                                <button
                                  key={u.id || u.name}
                                  type="button"
                                  onClick={() => handleApplyVoucherPin(u.name)}
                                  className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-indigo-900/60 text-slate-200 text-[11px] font-mono font-bold transition-all border border-slate-800 truncate"
                                  title={`المستخدم: ${u.name} - البروفايل: ${u.profile}`}
                                >
                                  👤 {u.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ------------------------------------------------------------- */}
                  {/* PORTAL TEMPLATE PAGE 1: LOGIN.HTML */}
                  {/* ------------------------------------------------------------- */}
                  {previewPage === 'login' && (
                    <div className="p-4 sm:p-5 flex flex-col gap-3 text-right text-sm">
                      {/* Marquee Banner */}
                      {config.showMarqueeNews && config.marqueeNewsText && (
                        <div className="bg-black/40 border border-white/10 rounded-xl p-2 flex items-center gap-2 overflow-hidden backdrop-blur-sm">
                          <span
                            className="text-[10px] font-black text-white px-2 py-0.5 rounded-md flex-shrink-0"
                            style={{ background: config.primaryColor }}
                          >
                            إعلان 📢
                          </span>
                          <div className="text-[11px] text-slate-200 whitespace-nowrap overflow-hidden truncate">
                            {config.marqueeNewsText}
                          </div>
                        </div>
                      )}

                      {/* Alert Box */}
                      {config.showAlertNotice && config.alertNoticeText && (
                        <div className="bg-rose-500/15 border border-rose-500/35 rounded-xl p-2.5 text-[11px] text-rose-300 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400" />
                          <span>{config.alertNoticeText}</span>
                        </div>
                      )}

                      {/* Header: Logo, Title, Subtitle */}
                      <div className="text-center flex flex-col items-center py-2 gap-1.5">
                        {config.showLogo !== false && (
                          <div
                            className="w-16 h-16 rounded-2xl flex items-center justify-center border-2 border-white/20 shadow-lg"
                            style={{
                              background: currentTheme.buttonGradient,
                              boxShadow: `0 10px 25px -5px ${config.primaryColor}80`
                            }}
                          >
                            {config.logoType === 'image' && config.logoImageUrl ? (
                              <img
                                src={config.logoImageUrl}
                                alt="Logo"
                                className="w-full h-full object-cover rounded-2xl"
                              />
                            ) : config.logoIcon === 'Wifi' ? (
                              <Wifi className="w-8 h-8 text-white" />
                            ) : config.logoIcon === 'Zap' ? (
                              <Zap className="w-8 h-8 text-white" />
                            ) : config.logoIcon === 'Crown' ? (
                              <Crown className="w-8 h-8 text-white" />
                            ) : config.logoIcon === 'Flame' ? (
                              <Flame className="w-8 h-8 text-white" />
                            ) : config.logoIcon === 'Star' ? (
                              <Star className="w-8 h-8 text-white" />
                            ) : config.logoIcon === 'Shield' ? (
                              <Shield className="w-8 h-8 text-white" />
                            ) : config.logoIcon === 'Globe' ? (
                              <Globe className="w-8 h-8 text-white" />
                            ) : (
                              <Sparkles className="w-8 h-8 text-white" />
                            )}
                          </div>
                        )}
                        {config.showNetworkTitle !== false && (
                          <h1 className="text-lg font-black tracking-tight mt-1">{config.networkName}</h1>
                        )}
                        {config.showSubtitle !== false && (
                          <p className="text-xs opacity-75">{config.welcomeSubtitle}</p>
                        )}
                      </div>

                      {/* Login Card */}
                      <div
                        className={`p-4 sm:p-5 border border-white/10 shadow-xl backdrop-blur-md ${config.borderRadius}`}
                        style={{ background: currentTheme.cardBg }}
                      >
                        {simError && (
                          <div className="mb-3 p-2.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs text-center font-bold">
                            {simError}
                          </div>
                        )}

                        {/* Mode Switcher */}
                        {config.loginStyle === 'dual-mode' && (
                          <div className="flex bg-black/30 p-1 rounded-xl mb-3.5 border border-white/10">
                            <button
                              type="button"
                              onClick={() => setSimLoginMode('pin')}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                simLoginMode === 'pin'
                                  ? 'text-white shadow-md'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                              style={{
                                background: simLoginMode === 'pin' ? config.primaryColor : 'transparent'
                              }}
                            >
                              كود الكرت (PIN)
                            </button>
                            <button
                              type="button"
                              onClick={() => setSimLoginMode('user')}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                simLoginMode === 'user'
                                  ? 'text-white shadow-md'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                              style={{
                                background: simLoginMode === 'user' ? config.primaryColor : 'transparent'
                              }}
                            >
                              مستخدم وكلمة سر
                            </button>
                          </div>
                        )}

                        <form onSubmit={handleSimulatorSubmit} className="space-y-3">
                          {simLoginMode === 'pin' && config.loginStyle !== 'user-pass' ? (
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <label className="text-xs font-bold block opacity-85">رقم / كود كرت الإنترنت</label>
                                {config.showQrLogin !== false && (
                                  <button
                                    type="button"
                                    onClick={() => setIsQrScannerOpen(true)}
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold shadow-md transition-all"
                                    title="مسح كود QR بكاميرا الهاتف"
                                  >
                                    <Camera className="w-3.5 h-3.5" />
                                    <span>مسح الكاميرا</span>
                                  </button>
                                )}
                              </div>
                              <input
                                type="text"
                                value={simCardPin}
                                onChange={(e) => setSimCardPin(e.target.value)}
                                placeholder="أدخل كود الكرت هنا"
                                className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-white text-center font-bold tracking-widest text-sm focus:outline-none focus:border-indigo-400"
                              />
                            </div>
                          ) : (
                            <>
                              <div className="space-y-1">
                                <label className="text-xs font-bold block opacity-85">اسم المستخدم</label>
                                <input
                                  type="text"
                                  value={simUsername}
                                  onChange={(e) => setSimUsername(e.target.value)}
                                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white text-xs"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs font-bold block opacity-85">كلمة المرور</label>
                                <input
                                  type="password"
                                  value={simPassword}
                                  onChange={(e) => setSimPassword(e.target.value)}
                                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white text-xs"
                                />
                              </div>
                            </>
                          )}

                          <button
                            type="submit"
                            className="w-full py-2.5 rounded-xl font-black text-white text-xs shadow-lg transition-all active:scale-98"
                            style={{ background: currentTheme.buttonGradient }}
                          >
                            تسجيل الدخول للإنترنت ⚡
                          </button>
                        </form>

                        {/* Free Trial Simulation */}
                        {config.showFreeTrial && (
                          <button
                            type="button"
                            onClick={() => {
                              setSimIsLoggedIn(true);
                              setPreviewPage('status');
                            }}
                            className="w-full mt-2.5 py-2 rounded-xl border border-dashed text-xs font-bold transition-all text-center"
                            style={{
                              borderColor: config.accentColor,
                              color: config.accentColor,
                              background: `${config.accentColor}15`
                            }}
                          >
                            {config.trialButtonText}
                          </button>
                        )}
                      </div>

                      {/* Promo Hero Banner */}
                      {config.showPromoBanner && config.promoTitle && (
                        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-indigo-500/20 to-sky-500/20 border border-indigo-500/30 space-y-1.5">
                          <span
                            className="text-[10px] font-black px-2 py-0.5 rounded-md inline-block"
                            style={{ background: config.accentColor, color: '#000' }}
                          >
                            {config.promoBadge || 'عرض خاص'}
                          </span>
                          <div className="text-xs font-black text-white">{config.promoTitle}</div>
                          <div className="text-[11px] text-slate-300 leading-snug">{config.promoDesc}</div>
                          {config.promoButtonText && (
                            <div
                              className="inline-block px-3 py-1 rounded-lg text-[10px] font-bold text-white mt-1 cursor-pointer"
                              style={{ background: config.primaryColor }}
                            >
                              {config.promoButtonText}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Pricing Plans List */}
                      {config.showPricingPlans && config.pricingPlans.length > 0 && (
                        <div className="space-y-2">
                          <span className="text-[11px] font-bold opacity-80 block">📦 باقات وأسعار الكروت:</span>
                          <div className="grid grid-cols-2 gap-1.5">
                            {config.pricingPlans.map((p) => (
                              <div
                                key={p.id}
                                className={`p-2 rounded-xl text-center border transition-all ${
                                  p.highlight
                                    ? 'bg-indigo-600/20 border-indigo-500/50'
                                    : 'bg-black/30 border-white/10'
                                }`}
                              >
                                <div className="text-[11px] font-bold">{p.name}</div>
                                <div className="text-xs font-black" style={{ color: config.accentColor }}>
                                  {p.price}
                                </div>
                                <div className="text-[9px] opacity-60">
                                  {p.duration} • {p.dataLimit}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Support Links */}
                      {config.showSupportSection !== false && (
                        <div className="flex items-center justify-center gap-2 pt-2 text-[11px]">
                          {config.supportWhatsapp && (
                            <div className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-emerald-400 font-bold flex items-center gap-1">
                              <MessageCircle className="w-3 h-3" />
                              <span>واتساب</span>
                            </div>
                          )}
                          {config.supportPhone && (
                            <div className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-sky-400 font-bold flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              <span>{config.supportPhone}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Location */}
                      {config.showLocation !== false && config.networkLocation && (
                        <div className="text-center text-[11px] opacity-70 flex items-center justify-center gap-1">
                          <Globe className="w-3 h-3" />
                          <span>{config.networkLocation}</span>
                        </div>
                      )}

                      {/* Footer */}
                      {config.showFooter !== false && (
                        <div className="text-center text-[10px] opacity-50 pt-1">{config.footerText}</div>
                      )}
                    </div>
                  )}

                  {/* ------------------------------------------------------------- */}
                  {/* PORTAL TEMPLATE PAGE 2: STATUS.HTML */}
                  {/* ------------------------------------------------------------- */}
                  {previewPage === 'status' && (
                    <div className="p-5 flex flex-col items-center justify-center min-h-[480px] text-center gap-3">
                      <div className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        <span>متصل بالإنترنت الآن بنجاح</span>
                      </div>

                      <h2 className="text-base font-black">مرحباً بك في {config.networkName}</h2>
                      <p className="text-xs opacity-75">حسابك نشط ويمكنك تصفح جميع المواقع بسرعة فائقة</p>

                      <div
                        className={`w-full p-4 rounded-2xl border border-white/10 shadow-lg space-y-2.5 text-right my-2 ${config.borderRadius}`}
                        style={{ background: currentTheme.cardBg }}
                      >
                        <div className="flex justify-between items-center text-xs">
                          <span className="opacity-70">عنوان IP الجهاز:</span>
                          <span className="font-mono font-bold">192.168.88.245</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="opacity-70">عنوان MAC:</span>
                          <span className="font-mono font-bold">DC:A6:32:8B:11:04</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="opacity-70">مدة الاتصال:</span>
                          <span className="font-mono font-bold text-amber-400">01:24:12</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="opacity-70">الوقت المتبقي:</span>
                          <span className="font-mono font-bold text-emerald-400">04:35:48</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="opacity-70">التحميل (Download):</span>
                          <span className="font-mono font-bold text-sky-400">428.5 MB</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setSimIsLoggedIn(false);
                          setPreviewPage('logout');
                        }}
                        className="w-full py-2.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/40 text-xs font-bold transition-all"
                      >
                        قطع الاتصال (تسجيل الخروج)
                      </button>
                    </div>
                  )}

                  {/* ------------------------------------------------------------- */}
                  {/* PORTAL TEMPLATE PAGE 3: LOGOUT.HTML */}
                  {/* ------------------------------------------------------------- */}
                  {previewPage === 'logout' && (
                    <div className="p-6 flex flex-col items-center justify-center min-h-[480px] text-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>

                      <h2 className="text-lg font-black">تم تسجيل الخروج بنجاح</h2>
                      <p className="text-xs opacity-75 max-w-xs leading-relaxed">
                        شكراً لاستخدامك شبكة {config.networkName}. يمكنك إعادة الاتصال في أي وقت.
                      </p>

                      <button
                        type="button"
                        onClick={() => {
                          setSimIsLoggedIn(false);
                          setPreviewPage('login');
                        }}
                        className="px-6 py-2.5 rounded-xl font-bold text-white text-xs shadow-lg transition-all mt-2"
                        style={{ background: currentTheme.buttonGradient }}
                      >
                        تسجيل الدخول مجدداً
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
