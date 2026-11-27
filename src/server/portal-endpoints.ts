// ============================================================
//  نقاط نهاية خاصة ببوابات الهوتسبوت (FTP، نشر، تحقق)
//  تُستدعى في server.ts عبر registerPortalEndpoints
// ============================================================

import type { Request, Response } from 'express';
import { ftpService, type FtpConnectionConfig } from './ftp-service.ts';
import { sanitizeHotspotHtml, quickSecurityCheck, validateHotspotFile } from './html-sanitizer.ts';
import { sanitizeSafePath, validateSafeFileName, resolveRequestToken, securityConfig } from './security-shield.ts';

interface RouterSession {
  client: any;
  lastSeen: number;
}

function getFtpConfigFromRequest(
  req: Request,
  routerClients: Map<string, RouterSession>,
  MikrotikAPI_Original: any
): FtpConnectionConfig | null {
  // 1. من middleware المرتبط بالجلسة الموثقة حصراً
  if (req.routerClient && req.routerClient.isConnected?.()) {
    const cfg = req.routerClient.getConfig?.();
    if (cfg) {
      return {
        host: cfg.host,
        port: 21,
        username: cfg.username || 'admin',
        password: cfg.password || '',
        timeoutMs: 15000,
      };
    }
  }

  // 2. من رمز الجلسة في الترويسة فقط (X-Router-Token / Authorization)
  const token = resolveRequestToken(req);
  if (token) {
    const session = routerClients.get(token);
    if (session?.client && session.client.isConnected?.()) {
      const cfg = session.client.getConfig?.();
      if (cfg) {
        return {
          host: cfg.host,
          port: 21,
          username: cfg.username || 'admin',
          password: cfg.password || '',
          timeoutMs: 15000,
        };
      }
    }
  }

  // 3. الاتصال العام مسموح فقط عند تعطيل العزل الصارم وعدم وجود جلسات متعددة
  if (!securityConfig.strictTenantIsolation && MikrotikAPI_Original && MikrotikAPI_Original.isConnected?.()) {
    const cfg = MikrotikAPI_Original.getConfig?.();
    if (cfg) {
      return {
        host: cfg.host,
        port: 21,
        username: cfg.username || 'admin',
        password: cfg.password || '',
        timeoutMs: 15000,
      };
    }
  }

  return null;
}

export function createPortalEndpoints(
  routerClients: Map<string, RouterSession>,
  MikrotikAPI_Original: any
) {
  // ======================================================================
  //  GET /api/mikrotik/files/read
  // ======================================================================
  const readFile = async (req: Request, res: Response): Promise<void> => {
    const ftpConfig = getFtpConfigFromRequest(req, routerClients, MikrotikAPI_Original);
    if (!ftpConfig) {
      res.status(503).json({ success: false, reconnecting: true, message: 'جاري إعادة الاتصال بالراوتر' });
      return;
    }
    const { path: rawPath } = req.query;
    if (!rawPath || typeof rawPath !== 'string' || !rawPath.trim()) {
      res.status(400).json({ success: false, message: 'معامل path مطلوب' });
      return;
    }

    const { safePath, isSafe, error } = sanitizeSafePath(rawPath, '');
    if (!isSafe) {
      res.status(403).json({ success: false, message: error || 'مسار غير مسموح' });
      return;
    }

    const result = await ftpService.readFile(ftpConfig, safePath);
    if (result.success) {
      res.json({ success: true, content: result.data, message: result.message });
    } else {
      res.status(500).json({ success: false, message: result.message, errorType: result.errorType });
    }
  };

  // ======================================================================
  //  POST /api/mikrotik/files/write
  // ======================================================================
  const writeFile = async (req: Request, res: Response): Promise<void> => {
    const ftpConfig = getFtpConfigFromRequest(req, routerClients, MikrotikAPI_Original);
    if (!ftpConfig) {
      res.status(503).json({ success: false, reconnecting: true, message: 'جاري إعادة الاتصال بالراوتر' });
      return;
    }
    const { path: rawPath, content } = req.body;
    if (!rawPath || typeof rawPath !== 'string' || !rawPath.trim()) {
      res.status(400).json({ success: false, message: 'معامل path مطلوب' });
      return;
    }
    if (content === undefined || content === null) {
      res.status(400).json({ success: false, message: 'معامل content مطلوب' });
      return;
    }

    const { safePath, isSafe, error } = sanitizeSafePath(rawPath, '');
    if (!isSafe) {
      res.status(403).json({ success: false, message: error || 'مسار غير مسموح' });
      return;
    }

    const { sanitized, warnings } = sanitizeHotspotHtml(content);
    const security = quickSecurityCheck(sanitized);
    if (!security.isSafe) {
      res.status(400).json({
        success: false,
        message: 'المحتوى غير آمن: ' + security.issues.join('، '),
        issues: security.issues,
      });
      return;
    }

    const result = await ftpService.writeFile(ftpConfig, safePath, sanitized);
    if (result.success) {
      res.json({ success: true, message: result.message, warnings: warnings.length > 0 ? warnings : undefined });
    } else {
      res.status(500).json({ success: false, message: result.message, errorType: result.errorType });
    }
  };

  // ======================================================================
  //  GET /api/mikrotik/files/list
  // ======================================================================
  const listDirectory = async (req: Request, res: Response): Promise<void> => {
    const ftpConfig = getFtpConfigFromRequest(req, routerClients, MikrotikAPI_Original);
    if (!ftpConfig) {
      res.status(503).json({ success: false, reconnecting: true, message: 'جاري إعادة الاتصال بالراوتر' });
      return;
    }
    const { path: rawPath } = req.query;
    if (!rawPath || typeof rawPath !== 'string' || !rawPath.trim()) {
      res.status(400).json({ success: false, message: 'معامل path مطلوب' });
      return;
    }

    const { safePath, isSafe, error } = sanitizeSafePath(rawPath, '');
    if (!isSafe) {
      res.status(403).json({ success: false, message: error || 'مسار غير مسموح' });
      return;
    }

    const result = await ftpService.listDirectory(ftpConfig, safePath);
    if (result.success) {
      res.json({ success: true, files: result.files, message: result.message });
    } else {
      res.status(500).json({ success: false, message: result.message, errorType: result.errorType });
    }
  };

  // ======================================================================
  //  GET /api/mikrotik/files/detect-hotspot-path
  // ======================================================================
  const detectHotspotPath = async (req: Request, res: Response): Promise<void> => {
    const ftpConfig = getFtpConfigFromRequest(req, routerClients, MikrotikAPI_Original);
    if (!ftpConfig) {
      res.status(503).json({ success: false, reconnecting: true, message: 'جاري إعادة الاتصال بالراوتر' });
      return;
    }
    const result = await ftpService.detectHotspotPath(ftpConfig);
    if (result.success) {
      res.json({ success: true, path: result.path, version: result.data, message: result.message });
    } else {
      res.status(500).json({ success: false, message: result.message, errorType: result.errorType });
    }
  };

  // ======================================================================
  //  POST /api/mikrotik/files/deploy-portal
  // ======================================================================
  const deployPortal = async (req: Request, res: Response): Promise<void> => {
    const ftpConfig = getFtpConfigFromRequest(req, routerClients, MikrotikAPI_Original);
    if (!ftpConfig) {
      res.status(503).json({ success: false, reconnecting: true, message: 'جاري إعادة الاتصال بالراوتر' });
      return;
    }

    const { targetFolder, files, mode, modifiedFiles, updateProfile, profileName, dnsName } = req.body;
    if (!targetFolder || typeof targetFolder !== 'string') {
      res.status(400).json({ success: false, message: 'معامل targetFolder مطلوب' });
      return;
    }
    if (!files || typeof files !== 'object') {
      res.status(400).json({ success: false, message: 'معامل files مطلوب (كائن اسم_ملف: محتوى)' });
      return;
    }

    const { safePath: safeFolder, isSafe, error } = sanitizeSafePath(targetFolder, 'hotspot');
    if (!isSafe) {
      res.status(403).json({ success: false, message: error || 'مجلد غير مسموح' });
      return;
    }

    const warnings: string[] = [];
    let uploadedCount = 0;

    try {
      // إذا كان النشر كاملاً، حذف المجلد
      if (mode === 'full') {
        const delResult = await ftpService.deleteDirectory(ftpConfig, safeFolder);
        if (!delResult.success && delResult.errorType !== 'not_found') {
          warnings.push(`لم نتمكن من حذف المجلد: ${delResult.message}`);
        }
      }

      // رفع الملفات (فقط المعدلة في التزايدي، أو كلها في الكامل)
      const fileEntries = Object.entries(files);
      for (const [fileName, content] of fileEntries) {
        // فحص أمان اسم الملف
        if (!validateSafeFileName(fileName)) {
          warnings.push(`تم تخطي الملف ذو الاسم غير الصالح أمنياً: ${fileName}`);
          continue;
        }

        // إذا كان تزايدياً وليس في قائمة المعدلة وليس الكامل، نتجاوز
        if (mode === 'incremental' && modifiedFiles && !modifiedFiles.includes(fileName)) {
          continue;
        }
        // تجاهل الصور (يمكن رفعها عبر منفذ آخر)
        if ((fileName as string).match(/\.(png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/i)) {
          continue;
        }
        const remotePath = `${safeFolder}/${fileName}`;
        const { sanitized, warnings: sw } = sanitizeHotspotHtml(content as string);
        warnings.push(...sw);
        const security = quickSecurityCheck(sanitized);
        if (!security.isSafe) {
          warnings.push(`الملف ${fileName} غير آمن: ${security.issues.join('، ')}`);
          continue;
        }
        const result = await ftpService.writeFile(ftpConfig, remotePath, sanitized);
        if (result.success) {
          uploadedCount++;
        } else {
          warnings.push(`فشل رفع ${fileName}: ${result.message}`);
        }
      }

      // تحديث البروفايل
      if (updateProfile && profileName && req.routerClient) {
        try {
          const profileList = await req.routerClient.query('/ip/hotspot/profile/print', [`?name=${profileName}`]);
          if (profileList && profileList.length > 0) {
            const pid = profileList[0].id;
            await req.routerClient.query('/ip/hotspot/profile/set', [
              `=.id=${pid}`,
              `=html-directory=${safeFolder}`,
              dnsName ? `=dns-name=${dnsName}` : '',
            ]);
          } else {
            warnings.push(`لم يتم العثور على بروفايل باسم "${profileName}"`);
          }
        } catch (err: any) {
          warnings.push(`فشل تحديث البروفايل: ${err.message}`);
        }
      }

      // كتابة ملف تعريف
      await ftpService.writeFile(
        ftpConfig,
        `${safeFolder}/_portal-deploy-meta.json`,
        JSON.stringify({
          deployedAt: new Date().toISOString(),
          folder: safeFolder,
          profile: profileName || '',
          dns: dnsName || '',
          files: Object.keys(files),
          mode,
        })
      );

      res.json({
        success: true,
        message: `تم نشر ${uploadedCount} ملف${warnings.length ? ' مع تحذيرات' : ''}`,
        uploadedCount,
        warnings: warnings.length > 0 ? warnings : undefined,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  };

  // ======================================================================
  //  GET /api/mikrotik/files/read-all-portal
  // ======================================================================
  const readAllPortalFiles = async (req: Request, res: Response): Promise<void> => {
    const ftpConfig = getFtpConfigFromRequest(req, routerClients, MikrotikAPI_Original);
    if (!ftpConfig) {
      res.status(503).json({ success: false, reconnecting: true, message: 'جاري إعادة الاتصال بالراوتر' });
      return;
    }
    const rawFolder = (req.query.folder as string) || 'hotspot';
    const { safePath: folder, isSafe, error } = sanitizeSafePath(rawFolder, 'hotspot');
    if (!isSafe) {
      res.status(403).json({ success: false, message: error || 'مجلد غير مسموح' });
      return;
    }

    const result = await ftpService.readAllPortalFiles(ftpConfig, folder);
    if (result.success && result.fileContents) {
      const files: Record<string, string> = {};
      result.fileContents.forEach((content, name) => { files[name] = content; });
      res.json({ success: true, files, message: result.message, folder: result.remotePath });
    } else {
      res.status(500).json({ success: false, message: result.message });
    }
  };

  // ======================================================================
  //  POST /api/mikrotik/files/validate
  // ======================================================================
  const validateFile = async (req: Request, res: Response): Promise<void> => {
    const { content, fileName } = req.body;
    if (!content || typeof content !== 'string') {
      res.status(400).json({ success: false, message: 'معامل content مطلوب' });
      return;
    }
    if (!fileName || typeof fileName !== 'string' || !validateSafeFileName(fileName)) {
      res.status(400).json({ success: false, message: 'معامل fileName غير صالح أو يحتوي على محارف غير مسموحة' });
      return;
    }

    const validation = validateHotspotFile(content, fileName);
    const security = quickSecurityCheck(content);
    res.json({
      success: true,
      validation,
      security,
    });
  };

  // ======================================================================
  //  POST /api/mikrotik/files/delete
  // ======================================================================
  const deleteFile = async (req: Request, res: Response): Promise<void> => {
    const ftpConfig = getFtpConfigFromRequest(req, routerClients, MikrotikAPI_Original);
    if (!ftpConfig) {
      res.status(503).json({ success: false, reconnecting: true, message: 'جاري إعادة الاتصال بالراوتر' });
      return;
    }
    const { path: rawPath } = req.body;
    if (!rawPath || typeof rawPath !== 'string' || !rawPath.trim()) {
      res.status(400).json({ success: false, message: 'معامل path مطلوب' });
      return;
    }
    const { safePath, isSafe, error } = sanitizeSafePath(rawPath, '');
    if (!isSafe) {
      res.status(403).json({ success: false, message: error || 'مسار غير مسموح' });
      return;
    }
    const result = await ftpService.deleteFile(ftpConfig, safePath);
    if (result.success) {
      res.json({ success: true, message: result.message });
    } else {
      res.status(500).json({ success: false, message: result.message, errorType: result.errorType });
    }
  };

  return {
    readFile,
    writeFile,
    listDirectory,
    detectHotspotPath,
    deployPortal,
    readAllPortalFiles,
    validateFile,
    deleteFile,
  };
}

// ============================================================
//  دالة التسجيل
// ============================================================
export function registerPortalEndpoints(
  app: any,
  routerClients: Map<string, RouterSession>,
  MikrotikAPI_Original: any
): void {
  const endpoints = createPortalEndpoints(routerClients, MikrotikAPI_Original);

  app.get('/api/mikrotik/files/read', endpoints.readFile);
  app.post('/api/mikrotik/files/write', endpoints.writeFile);
  app.get('/api/mikrotik/files/list', endpoints.listDirectory);
  app.get('/api/mikrotik/files/detect-hotspot-path', endpoints.detectHotspotPath);
  app.post('/api/mikrotik/files/deploy-portal', endpoints.deployPortal);
  app.get('/api/mikrotik/files/read-all-portal', endpoints.readAllPortalFiles);
  app.post('/api/mikrotik/files/validate', endpoints.validateFile);
  app.post('/api/mikrotik/files/delete', endpoints.deleteFile);

  console.log('[Portal] تم تسجيل 8 نقاط نهاية لملفات البوابة');
}
