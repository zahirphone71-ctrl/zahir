// ============================================================
//  HybridPortalEditor.tsx — محرر بوابات متكامل
//  يدعم: رفع مجلد، تعديل كود/بصري، معاينة دقيقة، نشر تزايدي/كامل
// ============================================================

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import * as JSZip from 'jszip';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// ============================================================
//  الأنواع
// ============================================================

type FileSource = 'local' | 'router' | 'generated';
type EditorMode = 'code' | 'visual';
type PreviewDevice = 'desktop' | 'tablet' | 'mobile';
type DeployMode = 'incremental' | 'full';

export interface PortalFile {
  name: string;
  content: string;
  originalContent: string;
  isModified: boolean;
  source: FileSource;
  lastModified: number;
  fileType: 'html' | 'css' | 'js' | 'json' | 'txt' | 'xml' | 'svg' | 'image' | 'other';
}

interface ValidationIssue {
  code: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  fixSuggestion?: string;
}

interface TreeNode {
  name: string;
  path: string;
  isFile: boolean;
  children?: TreeNode[];
}

// ============================================================
//  دوال مساعدة
// ============================================================

function buildFileTree(fileNames: string[]): TreeNode[] {
  const root: TreeNode = { name: 'root', path: '', isFile: false, children: [] };
  for (const full of fileNames) {
    const parts = full.split('/');
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      let child = current.children?.find(c => c.name === part);
      if (!child) {
        child = { name: part, path: parts.slice(0, i + 1).join('/'), isFile: isLast, children: [] };
        if (!current.children) current.children = [];
        current.children.push(child);
      }
      current = child;
    }
  }
  return root.children || [];
}


// ============================================================
//  محاكاة متغيرات المايكروتك للمعاينة
// ============================================================

function substituteMikrotikVars(html: string): string {
  const vars: Record<string, string> = {
    'link-login-only': '#',
    'link-orig': 'https://example.com',
    'link-login': '#',
    'link-logout': '#',
    'link-redirect': '#',
    'error': '',
    'username': 'testuser',
    'mac': 'AA:BB:CC:DD:EE:FF',
    'ip': '192.168.88.100',
    'uptime': '00:05:30',
    'session-time-left': '01:30:00',
    'trial': 'yes',
    'identity': 'MyRouter',
    'domain': 'hotspot.local',
    'version': '7.15',
  };

  let result = html;

  // استبدال المتغيرات البسيطة
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\$\\(${key}\\)`, 'g'), value);
  }

  // معالجة الكتل الشرطية (من الداخل للخارج)
  let changed = true;
  while (changed) {
    changed = false;
    result = result.replace(/\$\(if\s+([^)]+)\)([\s\S]*?)\$\(endif\)/g, (match, cond, block) => {
      const isTrue = cond.trim() !== '' && vars[cond.trim()] !== undefined && vars[cond.trim()] !== '';
      if (cond.trim() === 'trial' && vars['trial'] === 'yes') return block;
      if (cond.trim() === 'error' && vars['error'] === '') return '';
      return isTrue ? block : '';
    });
    if (result !== html) changed = true;
    html = result;
  }

  // إضافة بانر المعاينة
  const banner = `<div style="background:#fffbeb;color:#92400e;padding:8px 16px;font-size:13px;text-align:center;border-bottom:2px solid #f59e0b;font-family:sans-serif;">⚠️ هذه معاينة تقريبية — المتغيرات الحقيقية تظهر فقط على الراوتر</div>`;
  if (result.match(/<body[^>]*>/i)) {
    result = result.replace(/<body[^>]*>/i, match => match + banner);
  } else {
    result = banner + result;
  }

  return result;
}

// ============================================================
//  المكون الرئيسي
// ============================================================

interface HybridPortalEditorProps {
  initialFiles?: Map<string, PortalFile>;
  targetFolder?: string;
  targetDnsName?: string;
  targetProfileName?: string;
  onDeploy?: (result: any) => void;
  fetchWithToken?: <T>(url: string, options?: RequestInit) => Promise<T>;
  showToast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  readRouterFile?: (path: string) => Promise<any>;
  writeRouterFile?: (path: string, content: string) => Promise<any>;
  detectHotspotPath?: () => Promise<any>;
  listRouterDirectory?: (path: string) => Promise<any>;
  deployPortalFiles?: (params: any) => Promise<any>;
  validatePortalFile?: (content: string, fileName: string) => Promise<any>;
  deleteRouterFile?: (path: string) => Promise<any>;
  isConnected?: boolean;
}

const HybridPortalEditor: React.FC<HybridPortalEditorProps> = ({
  initialFiles,
  targetFolder: initialTargetFolder = 'hotspot',
  targetDnsName: initialDnsName = '',
  targetProfileName: initialProfileName = '',
  onDeploy,
  fetchWithToken,
  showToast,
  readRouterFile,
  writeRouterFile,
  detectHotspotPath,
  listRouterDirectory,
  deployPortalFiles,
  validatePortalFile,
  deleteRouterFile,
  isConnected = false,
}) => {
  // ======================================================================
  //  الحالة
  // ======================================================================
  const [files, setFiles] = useState<Map<string, PortalFile>>(initialFiles || new Map());
  const [activeFileName, setActiveFileName] = useState<string>('');
  const [editorMode, setEditorMode] = useState<EditorMode>('code');
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('desktop');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployMode, setDeployMode] = useState<DeployMode>('incremental');
  const [deployTargetFolder, setDeployTargetFolder] = useState(initialTargetFolder);
  const [deployDnsName, setDeployDnsName] = useState(initialDnsName);
  const [deployProfileName, setDeployProfileName] = useState(initialProfileName);
  const [deployUpdateProfile, setDeployUpdateProfile] = useState(true);
  const [isLoadingFromRouter, setIsLoadingFromRouter] = useState(false);
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const [showPreviewBanner, setShowPreviewBanner] = useState(true);
  const [isLoadingFolder, setIsLoadingFolder] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const codeTextareaRef = useRef<HTMLTextAreaElement>(null);
  const codePreRef = useRef<HTMLPreElement>(null);
  const isMountedRef = useRef(true);
  const timersRef = useRef<number[]>([]);

  const trackTimer = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter(t => t !== id);
      fn();
    }, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      timersRef.current.forEach(id => window.clearTimeout(id));
      timersRef.current = [];
    };
  }, []);

  // ======================================================================
  //  الملف النشط والإحصائيات
  // ======================================================================
  const activeFile = activeFileName ? files.get(activeFileName) : undefined;

  const stats = useMemo(() => {
    let total = 0, modified = 0, size = 0;
    files.forEach(f => {
      total++;
      if (f.isModified) modified++;
      size += new Blob([f.content]).size;
    });
    return { total, modified, size };
  }, [files]);

  // ======================================================================
  //  شجرة الملفات
  // ======================================================================
  const fileTree = useMemo(() => {
    const names = Array.from(files.keys()).filter(name =>
      !searchQuery || name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return buildFileTree(names);
  }, [files, searchQuery]);

  // ======================================================================
  //  تحميل مجلد من الكمبيوتر
  // ======================================================================
  const handleOpenFolder = useCallback(() => {
    folderInputRef.current?.click();
  }, []);

  const handleFolderSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    if (!input.files || input.files.length === 0) return;
    setIsLoadingFolder(true);
    const newFiles = new Map<string, PortalFile>();

    try {
      for (let idx = 0; idx < input.files.length; idx++) {
        const file = input.files[idx];
        const fullPath = file.webkitRelativePath || file.name;
        if (file.size === 0 && file.type === '') continue;
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        if (['html', 'htm', 'css', 'js', 'json', 'txt', 'xml', 'svg'].includes(ext)) {
          const content = await file.text();
          const fileName = fullPath.substring(fullPath.indexOf('/') + 1) || file.name;
          newFiles.set(fileName, {
            name: fileName,
            content,
            originalContent: content,
            isModified: false,
            source: 'local',
            lastModified: Date.now(),
            fileType: ext as PortalFile['fileType'],
          });
        } else if (['png', 'jpg', 'jpeg', 'gif', 'ico', 'webp'].includes(ext)) {
          const buffer = await file.arrayBuffer();
          const base64 = arrayBufferToBase64(buffer);
          const content = `data:${file.type || 'image/png'};base64,${base64}`;
          const fileName = fullPath.substring(fullPath.indexOf('/') + 1) || file.name;
          newFiles.set(fileName, {
            name: fileName,
            content,
            originalContent: content,
            isModified: false,
            source: 'local',
            lastModified: Date.now(),
            fileType: 'image',
          });
        }
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        showToast?.(`خطأ في قراءة المجلد: ${err.message}`, 'error');
        setIsLoadingFolder(false);
      }
      input.value = '';
      return;
    }

    if (newFiles.size > 0) {
      setFiles(newFiles);
      const first = newFiles.keys().next().value;
      if (first) setActiveFileName(first);
      showToast?.(`تم تحميل ${newFiles.size} ملف`, 'success');
    } else {
      showToast?.('لم يتم العثور على ملفات مدعومة', 'info');
    }
    setIsLoadingFolder(false);
    input.value = '';
  }, [showToast]);

  // ======================================================================
  //  تحميل من الراوتر
  // ======================================================================
  const handleLoadFromRouter = useCallback(async () => {
    if (!isConnected) {
      showToast?.('الرجاء الاتصال بالراوتر أولاً', 'error');
      return;
    }
    if (!detectHotspotPath || !listRouterDirectory || !readRouterFile) {
      showToast?.('الوظائف المطلوبة غير متوفرة', 'error');
      return;
    }

    setIsLoadingFromRouter(true);
    try {
      const pathResult = await detectHotspotPath();
      const folder = pathResult.success && pathResult.path ? pathResult.path : deployTargetFolder;

      const listResult = await listRouterDirectory(folder);
      if (!listResult.success || !listResult.files || listResult.files.length === 0) {
        showToast?.(`المجلد [${folder}] فارغ أو غير موجود`, 'info');
        setIsLoadingFromRouter(false);
        return;
      }

      const newFiles = new Map<string, PortalFile>();
      let loaded = 0;
      for (const entry of listResult.files) {
        if (entry.isDirectory) continue;
        const ext = entry.name.split('.').pop()?.toLowerCase() || '';
        if (!['html', 'htm', 'css', 'js', 'json', 'txt', 'xml', 'svg'].includes(ext)) continue;
        const readResult = await readRouterFile(`${folder}/${entry.name}`);
        if (readResult.success && readResult.content !== undefined) {
          newFiles.set(entry.name, {
            name: entry.name,
            content: readResult.content,
            originalContent: readResult.content,
            isModified: false,
            source: 'router',
            lastModified: Date.now(),
            fileType: ext as PortalFile['fileType'],
          });
          loaded++;
        }
      }

      if (loaded > 0) {
        setFiles(newFiles);
        const first = newFiles.keys().next().value;
        if (first) setActiveFileName(first);
        if (pathResult.success && pathResult.path && pathResult.path !== deployTargetFolder) {
          setDeployTargetFolder(pathResult.path);
        }
        showToast?.(`تم تحميل ${loaded} ملف من [${folder}]`, 'success');
      } else {
        showToast?.('لم يتم تحميل أي ملف (تأكد من وجود ملفات HTML)', 'info');
      }
    } catch (err: any) {
      showToast?.(`فشل التحميل: ${err.message}`, 'error');
    } finally {
      setIsLoadingFromRouter(false);
    }
  }, [isConnected, detectHotspotPath, listRouterDirectory, readRouterFile, deployTargetFolder, showToast]);

  // ======================================================================
  //  تغيير المحتوى
  // ======================================================================
  const handleContentChange = useCallback((newContent: string) => {
    if (!activeFileName || !activeFile) return;
    setFiles(prev => {
      const next = new Map(prev);
      const file = next.get(activeFileName);
      if (!file) return prev;
      next.set(activeFileName, {
        ...file,
        content: newContent,
        isModified: newContent !== file.originalContent,
        lastModified: Date.now(),
      });
      return next;
    });
  }, [activeFileName, activeFile]);

  // ======================================================================
  //  تصدير ZIP
  // ======================================================================
  const handleExportZip = useCallback(async () => {
    if (isExportingZip) return;
    if (files.size === 0) {
      showToast?.('لا توجد ملفات للتصدير', 'error');
      return;
    }
    setIsExportingZip(true);
    try {
      const zip = new JSZip();
      for (const [name, file] of files) {
        zip.file(name, file.content);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'portal-files.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      trackTimer(() => URL.revokeObjectURL(url), 1000);
      showToast?.('تم تصدير الملفات كـ ZIP', 'success');
    } catch (err: any) {
      showToast?.(`فشل تصدير ZIP: ${err?.message || 'خطأ غير معروف'}`, 'error');
    } finally {
      if (isMountedRef.current) setIsExportingZip(false);
    }
  }, [files, isExportingZip, showToast, trackTimer]);

  // ======================================================================
  //  النشر
  // ======================================================================
  const handleDeploy = useCallback(async () => {
    if (!isConnected) {
      showToast?.('الرجاء الاتصال بالراوتر أولاً', 'error');
      return;
    }
    if (files.size === 0) {
      showToast?.('لا توجد ملفات للنشر', 'error');
      return;
    }
    if (!deployPortalFiles) {
      showToast?.('وظيفة النشر غير متوفرة', 'error');
      return;
    }

    const filesObj: Record<string, string> = {};
    const modifiedNames: string[] = [];
    for (const [name, file] of files) {
      if (file.fileType !== 'image') {
        filesObj[name] = file.content;
        if (file.isModified) modifiedNames.push(name);
      }
    }

    if (deployMode === 'incremental' && modifiedNames.length === 0) {
      showToast?.('لا توجد تغييرات للنشر التزايدي', 'info');
      return;
    }

    setIsDeploying(true);
    try {
      const res = await deployPortalFiles({
        targetFolder: deployTargetFolder,
        files: filesObj,
        mode: deployMode,
        modifiedFiles: deployMode === 'incremental' ? modifiedNames : undefined,
        updateProfile: deployUpdateProfile,
        profileName: deployProfileName,
        dnsName: deployDnsName,
      });

      if (res.success) {
        showToast?.(`✅ ${res.message}`, 'success');
        setFiles(prev => {
          const next = new Map(prev);
          for (const [name, file] of next) {
            next.set(name, { ...file, originalContent: file.content, isModified: false });
          }
          return next;
        });
        onDeploy?.(res);
      } else {
        showToast?.(`❌ فشل النشر: ${res.message}`, 'error');
      }
    } catch (err: any) {
      showToast?.(`❌ خطأ: ${err.message}`, 'error');
    } finally {
      setIsDeploying(false);
    }
  }, [isConnected, files, deployMode, deployTargetFolder, deployUpdateProfile, deployProfileName, deployDnsName, deployPortalFiles, showToast, onDeploy]);

  // ======================================================================
  //  فحص الملف النشط
  // ======================================================================
  const handleValidate = useCallback(async () => {
    if (!activeFile || !validatePortalFile || isValidating) return;
    setIsValidating(true);
    try {
      const result = await validatePortalFile(activeFile.content, activeFile.name);
      if (!isMountedRef.current) return;
      if (result.success) {
        const allIssues: ValidationIssue[] = [
          ...(result.validation?.errors || []),
          ...(result.validation?.warnings || []),
          ...(result.validation?.info || []),
        ];
        setValidationIssues(allIssues);
        if (allIssues.length === 0) {
          showToast?.('✅ الملف سليم ولا توجد مشاكل', 'success');
        } else {
          const errors = allIssues.filter(i => i.severity === 'error').length;
          const warnings = allIssues.filter(i => i.severity === 'warning').length;
          showToast?.(`⚠️ تم العثور على ${errors} خطأ و ${warnings} تحذير`, 'warning');
        }
      } else {
        showToast?.('فشل الفحص', 'error');
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        showToast?.(`فشل الفحص: ${err?.message || 'خطأ غير معروف'}`, 'error');
      }
    } finally {
      if (isMountedRef.current) setIsValidating(false);
    }
  }, [activeFile, validatePortalFile, isValidating, showToast]);

  // اختصارات لوحة المفاتيح Ctrl+F للبحث و Ctrl+S للتحقق/الحفظ
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (activeFile) {
          if (validatePortalFile) {
            void handleValidate();
          } else {
            showToast?.('تم حفظ التعديلات مؤقتاً في المحرر — اضغط "نشر" للرفع للراوتر', 'info');
          }
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeFile, validatePortalFile, handleValidate, showToast]);

  // ======================================================================
  //  عرض المكون
  // ======================================================================
  return (
    <div className="flex flex-col h-full bg-slate-950 text-white" dir="rtl">
      {/* شريط الأدوات */}
      <div className="flex items-center gap-2 p-2 bg-slate-900 border-b border-slate-800 flex-wrap">
        <button onClick={handleOpenFolder} disabled={isLoadingFolder} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium disabled:opacity-50">
          {isLoadingFolder ? '⏳ جاري القراءة...' : '📂 فتح مجلد'}
        </button>
        <input ref={folderInputRef} type="file" multiple className="hidden" onChange={handleFolderSelected} {...({ webkitdirectory: "", directory: "" } as any)} />

        <button onClick={handleLoadFromRouter} disabled={!isConnected || isLoadingFromRouter} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-medium disabled:opacity-50">
          ⬇️ تحميل من الراوتر
        </button>

        <button onClick={handleExportZip} disabled={files.size === 0 || isExportingZip} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs font-medium disabled:opacity-50">
          {isExportingZip ? '⏳ جاري الضغط...' : '📦 ZIP'}
        </button>

        <button onClick={handleValidate} disabled={!activeFile || isValidating} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-xs font-medium disabled:opacity-50">
          {isValidating ? '⏳ جاري الفحص...' : '🔍 فحص'}
        </button>

        <button onClick={handleDeploy} disabled={!isConnected || isDeploying || files.size === 0} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-medium disabled:opacity-50">
          {isDeploying ? '⏳ جاري النشر...' : '🚀 نشر'}
        </button>

        <div className="flex-1" />

        <span className="text-xs text-slate-400">{stats.total} ملف</span>
        <span className="text-xs text-slate-400">|</span>

        <select value={deployTargetFolder} onChange={e => setDeployTargetFolder(e.target.value)} className="bg-slate-800 rounded px-2 py-1 text-xs border border-slate-700">
          <option value="hotspot">hotspot (v7)</option>
          <option value="flash/hotspot">flash/hotspot (v6)</option>
        </select>

        <input type="text" placeholder="بروفايل" value={deployProfileName} onChange={e => setDeployProfileName(e.target.value)} className="bg-slate-800 rounded px-2 py-1 text-xs w-24 border border-slate-700" />

        <input type="text" placeholder="DNS Name" value={deployDnsName} onChange={e => setDeployDnsName(e.target.value)} className="bg-slate-800 rounded px-2 py-1 text-xs w-24 border border-slate-700" />

        <select value={deployMode} onChange={e => setDeployMode(e.target.value as DeployMode)} className="bg-slate-800 rounded px-2 py-1 text-xs border border-slate-700">
          <option value="incremental">تزايدي</option>
          <option value="full">كامل</option>
        </select>

        <label className="flex items-center gap-1 text-xs text-slate-300">
          <input type="checkbox" checked={deployUpdateProfile} onChange={e => setDeployUpdateProfile(e.target.checked)} />
          تحديث بروفايل
        </label>
      </div>

      {/* شريط البحث */}
      <div className="flex items-center gap-2 px-2 py-1 bg-slate-900/50 border-b border-slate-800">
        <input ref={searchInputRef} type="text" placeholder="بحث في الملفات..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="flex-1 bg-slate-800 rounded px-2 py-1 text-xs border border-slate-700" />
      </div>

      {/* الجسم الرئيسي */}
      <div className="flex flex-1 overflow-hidden">
        {/* شجرة الملفات */}
        <div className="w-64 bg-slate-900 border-l border-slate-800 overflow-y-auto p-2 shrink-0">
          <div className="text-xs font-bold text-slate-400 mb-2">📁 الملفات</div>
          {fileTree.map(node => (
            <FileTreeNode
              key={node.path}
              node={node}
              depth={0}
              expandedFolders={expandedFolders}
              setExpandedFolders={setExpandedFolders}
              activeFileName={activeFileName}
              setActiveFileName={setActiveFileName}
              files={files}
            />
          ))}
        </div>

        {/* محرر الكود + معاينة */}
        <div className="flex-1 flex min-w-0">
          {/* محرر النص */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="relative flex-1 overflow-hidden">
              <pre
                ref={codePreRef}
                className="absolute inset-0 m-0 p-4 font-mono text-xs leading-6 bg-transparent text-transparent overflow-auto whitespace-pre-wrap break-words pointer-events-none"
                style={{ tabSize: 2, direction: 'ltr' }}
              >
                {activeFile ? activeFile.content : ''}
              </pre>
              <textarea
                ref={codeTextareaRef}
                value={activeFile ? activeFile.content : ''}
                onChange={e => handleContentChange(e.target.value)}
                onScroll={e => {
                  if (codePreRef.current) {
                    codePreRef.current.scrollTop = e.currentTarget.scrollTop;
                    codePreRef.current.scrollLeft = e.currentTarget.scrollLeft;
                  }
                }}
                className="absolute inset-0 w-full h-full p-4 font-mono text-xs leading-6 bg-slate-950 text-white caret-white resize-none focus:outline-none"
                style={{ tabSize: 2, direction: 'ltr', backgroundColor: 'transparent', color: 'white' }}
                spellCheck={false}
              />
            </div>
          </div>

          {/* معاينة iframe */}
          <div className="w-1/2 bg-white border-r border-slate-800 overflow-hidden shrink-0">
            <iframe
              srcDoc={activeFile && activeFile.fileType === 'html' ? substituteMikrotikVars(activeFile.content) : ''}
              className="w-full h-full"
              sandbox="allow-scripts allow-forms"
            />
          </div>
        </div>
      </div>

      {/* شريط الحالة + نتائج الفحص */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-slate-900 border-t border-slate-800 text-xs text-slate-400 flex-wrap">
        <span>{activeFileName || 'لا ملف نشط'}</span>
        <span>{activeFile ? `${activeFile.content.split('\n').length} سطر` : ''}</span>
        <span>{activeFile?.isModified ? '🔵 معدّل' : ''}</span>
        {validationIssues.length > 0 && (
          <span className="text-yellow-400">⚠️ {validationIssues.filter(i => i.severity === 'error').length} خطأ، {validationIssues.filter(i => i.severity === 'warning').length} تحذير</span>
        )}
        <span className="text-slate-600">Ctrl+S حفظ | Ctrl+F بحث</span>
      </div>
    </div>
  );
};

// ============================================================
//  مكون عقدة الشجرة
// ============================================================

interface FileTreeNodeProps {
  node: TreeNode;
  depth: number;
  expandedFolders: Set<string>;
  setExpandedFolders: React.Dispatch<React.SetStateAction<Set<string>>>;
  activeFileName: string;
  setActiveFileName: (name: string) => void;
  files: Map<string, PortalFile>;
}

const FileTreeNode: React.FC<FileTreeNodeProps> = React.memo(({
  node,
  depth,
  expandedFolders,
  setExpandedFolders,
  activeFileName,
  setActiveFileName,
  files,
}) => {
  const isExpanded = expandedFolders.has(node.path);
  const isActive = activeFileName === node.path && node.isFile;
  const file = files.get(node.path);

  const toggleFolder = useCallback(() => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (isExpanded) next.delete(node.path);
      else next.add(node.path);
      return next;
    });
  }, [node.path, isExpanded, setExpandedFolders]);

  const handleClick = useCallback(() => {
    if (node.isFile) {
      setActiveFileName(node.path);
    } else {
      toggleFolder();
    }
  }, [node.isFile, node.path, toggleFolder, setActiveFileName]);

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
          }
        }}
        className={`px-2 py-1 rounded text-xs cursor-pointer transition flex items-center gap-1 ${isActive ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 text-slate-300'}`}
        style={{ paddingRight: depth * 12 + 8 }}
      >
        {node.isFile ? '📄' : (isExpanded ? '📂' : '📁')}
        <span className="truncate">{node.name}</span>
        {node.isFile && file?.isModified && <span className="text-amber-400">●</span>}
      </div>
      {!node.isFile && isExpanded && node.children && (
        <div>
          {node.children.map(child => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              expandedFolders={expandedFolders}
              setExpandedFolders={setExpandedFolders}
              activeFileName={activeFileName}
              setActiveFileName={setActiveFileName}
              files={files}
            />
          ))}
        </div>
      )}
    </div>
  );
});

export default HybridPortalEditor;
