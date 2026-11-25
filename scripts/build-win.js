// Disable ASAR interception at Node runtime level to prevent WriteStream / Invalid package bugs
process.noAsar = true;
delete process.env.ELECTRON_RUN_AS_NODE;
process.env.ELECTRON_BUILD = 'true';
process.env.BUILD_TARGET = 'electron';
// Prevent electron-builder from failing on missing code-signing certificates on dev machines
process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';

// Global error traps to prevent silent exits on Windows PowerShell
process.on('unhandledRejection', (reason) => {
  console.error('\n❌ خطأ غير متوقع أثناء المعالجة (Unhandled Rejection):');
  console.error(reason);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('\n❌ استثناء غير متوقع (Uncaught Exception):');
  console.error(err);
  process.exit(1);
});

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { buildApp } from './build.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

async function buildWindows() {
  console.log('==================================================');
  console.log('   ZCtrl | بناء وتجميع حزمة ويندوز (EXE & Portable)  ');
  console.log('==================================================');

  // Check if project path has non-ASCII characters (e.g. Arabic characters like العمل)
  const hasNonAscii = /[^\u0000-\u007f]/.test(projectRoot);
  if (hasNonAscii) {
    console.warn('\n⚠️ تنبيه هام لمسار المجلد:');
    console.warn(`المسار الحالي: "${projectRoot}" يحتوي على حروف غير إنجليزية (مثل العربية).`);
    console.warn('أدوات التحزيم على نظام ويندوز (electron-builder) قد تفشل في تشغيل app-builder.exe إذا كان المسار يحتوي على حروف عربية.');
    console.warn('إذا ظهر خطأ ERR_ELECTRON_BUILDER_CANNOT_EXECUTE، انقل المجلد لمسار إنجليزي خالص مثل: D:\\projects\\zctrl أو C:\\zctrl\n');
  }

  try {
    // 1. Build frontend & backend directly using buildApp
    console.log('📦 [1/3] جاري بناء وتجهيز ملفات الواجهة والخادم...');
    await buildApp({ isElectron: true });

    const distIndex = path.resolve(projectRoot, 'dist/index.html');
    const distServer = path.resolve(projectRoot, 'dist/server.cjs');
    const electronMain = path.resolve(projectRoot, 'electron-main.cjs');
    const electronPreload = path.resolve(projectRoot, 'electron-preload.cjs');
    if (!fs.existsSync(distIndex) || !fs.existsSync(distServer) || !fs.existsSync(electronMain) || !fs.existsSync(electronPreload)) {
      console.error('❌ تعذر العثور على مخرجات البناء الأساسية (dist/index.html, dist/server.cjs, electron-main.cjs, electron-preload.cjs). يرجى التحقق من الأخطاء أعلاه.');
      process.exit(1);
    }

    // 2. Ensure build directory & icons exist and match the in-app logo
    const buildDir = path.resolve(projectRoot, 'build');
    if (!fs.existsSync(buildDir)) {
      fs.mkdirSync(buildDir, { recursive: true });
    }

    const rootIco = path.resolve(projectRoot, 'icon.ico');
    const buildIco = path.resolve(buildDir, 'icon.ico');
    const buildHeaderIco = path.resolve(buildDir, 'installerHeaderIcon.ico');

    if (!fs.existsSync(buildIco) || !fs.existsSync(rootIco) || !fs.existsSync(buildHeaderIco)) {
      try {
        console.log('🎨 توليد أيقونات التطبيق المتطابقة مع الشعار...');
        const { spawnSync } = await import('child_process');
        spawnSync('node', ['scripts/generate-icons.js'], { cwd: projectRoot, stdio: 'inherit' });
      } catch (iconErr) {
        console.warn('⚠️ تعذر تشغيل سكريبت توليد الأيقونات تلقائياً:', iconErr);
      }
    }

    if (fs.existsSync(rootIco)) {
      if (!fs.existsSync(buildIco)) fs.copyFileSync(rootIco, buildIco);
      if (!fs.existsSync(buildHeaderIco)) fs.copyFileSync(rootIco, buildHeaderIco);
    } else if (fs.existsSync(buildIco)) {
      if (!fs.existsSync(rootIco)) fs.copyFileSync(buildIco, rootIco);
    }

    // 3. Clean previous unpacked build if needed to avoid file-locks
    const outDir = path.resolve(projectRoot, 'dist-electron');
    try {
      const unpackedDir = path.join(outDir, 'win-unpacked');
      if (fs.existsSync(unpackedDir)) {
        console.log('🧹 جاري تنظيف مجلد البناء السابق win-unpacked...');
        fs.rmSync(unpackedDir, { recursive: true, force: true });
      }
    } catch {
      console.warn('⚠️ ملاحظة: لم نتمكن من حذف مجلد البناء السابق بالكامل. إذا فشل البناء، تأكد من إغلاق ZCtrl.exe من مدير المهام (Task Manager).');
    }

    // 4. Package Windows Executable (NSIS & Portable)
    console.log('📦 [3/3] جاري تحزيم ملف التثبيت والنسخة المحمولة (EXE & Portable)...');
    let builder;
    try {
      const builderMod = await import('electron-builder');
      builder = builderMod.default || builderMod;
    } catch (err) {
      console.warn('\n⚠️ حزمة electron-builder غير موجودة في node_modules. جاري محاولة التثبيت...');
      const { spawnSync } = await import('child_process');
      spawnSync('npm', ['install', '--include=dev'], { cwd: projectRoot, stdio: 'inherit', shell: true });
      try {
        const builderMod = await import('electron-builder');
        builder = builderMod.default || builderMod;
      } catch (retryErr) {
        console.error('\n' + '='.repeat(60));
        console.error('❌ خطأ: تعذر استيراد حزمة electron-builder!');
        console.error('💡 نفّذ الأمر التالي في نافذة PowerShell:');
        console.error('   npm install --include=dev');
        console.error('='.repeat(60) + '\n');
        process.exit(1);
      }
    }

    const result = await builder.build({
      targets: builder.Platform.WINDOWS.createTarget(['nsis', 'portable'], builder.Arch.x64),
      config: {
        appId: 'com.zctrl.mikrotik',
        productName: 'ZCtrl',
        asar: true,
        directories: {
          output: 'dist-electron',
          buildResources: 'build'
        },
        files: [
          'dist/**/*',
          'electron-main.cjs',
          'electron-preload.cjs',
          'package.json',
          'build/**/*',
          'public/**/*',
          'icon.ico',
          'icon.png'
        ],
        win: {
          icon: 'build/icon.ico',
          verifyUpdateCodeSignature: false,
          target: [
            { target: 'nsis', arch: ['x64'] },
            { target: 'portable', arch: ['x64'] }
          ]
        },
        nsis: {
          oneClick: false,
          allowToChangeInstallationDirectory: true,
          createDesktopShortcut: true,
          createStartMenuShortcut: true,
          shortcutName: 'ZCtrl',
          installerIcon: 'build/icon.ico',
          uninstallerIcon: 'build/icon.ico',
          installerHeaderIcon: 'build/installerHeaderIcon.ico'
        }
      }
    });

    console.log('\n==================================================');
    console.log('✅ اكتمل بناء ملفات التطبيق بنجاح في مجلد: dist-electron/');
    if (Array.isArray(result)) {
      result.forEach(file => console.log('   📦 ' + file));
    }
    console.log('==================================================');
  } catch (error) {
    console.error('\n❌ فشل أثناء مرحلة البناء:', error);
    console.error('\n💡 نصائح وحلول سريعة للمشكلة على نظام ويندوز:');
    if (error.message && (error.message.includes('EBUSY') || error.message.includes('EPERM') || error.message.includes('file lock'))) {
      console.error('1. تأكد من إغلاق تطبيق ZCtrl أو أي نافذة سابقة من مدير المهام (Task Manager -> End Task).');
    } else {
      console.error('1. تأكد من تشغيل موجه الأوامر (PowerShell / CMD) بصلاحيات كافية.');
      console.error('2. قم بتنفيذ: npm rebuild esbuild electron لتحديث الثنائيات الأصلية.');
    }
    process.exit(1);
  }
}

buildWindows().catch((err) => {
  console.error('❌ توقفت العملية:', err);
  process.exit(1);
});
