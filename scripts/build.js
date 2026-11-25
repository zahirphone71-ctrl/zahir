import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

async function loadBuildDependencies() {
  let viteModule;
  let esbuildModule;

  try {
    viteModule = await import('vite');
  } catch (err) {
    console.warn('\n⚠️ حزمة vite غير موجودة أو لم تكتمل في node_modules. جاري محاولة التثبيت التلقائي...');
    const res = spawnSync('npm', ['install', '--include=dev'], {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: true
    });
    if (res.status === 0) {
      try {
        viteModule = await import('vite');
      } catch {}
    }
  }

  try {
    esbuildModule = await import('esbuild');
  } catch (err) {
    try {
      esbuildModule = await import('esbuild');
    } catch {}
  }

  if (!viteModule || !viteModule.build) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ خطأ: لم يتم العثور على حزمة vite في node_modules!');
    console.error('='.repeat(60));
    console.error('💡 لتثبيت الحزم المطلوبة، نفّذ الأمر التالي في نافذة PowerShell:');
    console.error('   npm install --include=dev');
    console.error('   أو: npm install vite esbuild electron electron-builder');
    console.error('\nثم أعد تشغيل أمر البناء:');
    console.error('   npm run build:win');
    console.error('='.repeat(60) + '\n');
    throw new Error("Cannot find package 'vite'. Run 'npm install --include=dev'");
  }

  if (!esbuildModule || !esbuildModule.build) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ خطأ: لم يتم العثور على حزمة esbuild في node_modules!');
    console.error('='.repeat(60));
    console.error('💡 نفّذ الأمر التالي في نافذة PowerShell:');
    console.error('   npm install --include=dev');
    console.error('='.repeat(60) + '\n');
    throw new Error("Cannot find package 'esbuild'. Run 'npm install --include=dev'");
  }

  return {
    viteBuild: viteModule.build,
    esbuild: esbuildModule
  };
}

export async function buildApp(options = {}) {
  console.log('==================================================');
  console.log('   ZCtrl | بناء الواجهة والخادم (Vite & esbuild)   ');
  console.log('==================================================');

  const { viteBuild, esbuild } = await loadBuildDependencies();

  // Enable Electron relative paths if building for desktop
  if (options.isElectron || process.env.ELECTRON_BUILD === 'true' || process.env.BUILD_TARGET === 'electron') {
    process.env.ELECTRON_BUILD = 'true';
    console.log('⚡ تم تفعيل نمط سطح المكتب (Electron): المسارات النسبية (./)');
  }

  // Ensure dist directory exists
  const distDir = path.resolve(projectRoot, 'dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // 1. Build Frontend with Vite (Node API)
  console.log('🚀 [1/2] جاري بناء واجهة المستخدم عبر Vite...');
  try {
    await viteBuild({
      root: projectRoot,
      configFile: path.resolve(projectRoot, 'vite.config.ts'),
      base: process.env.ELECTRON_BUILD === 'true' ? './' : '/'
    });
    console.log('✅ [1/2] تم بناء واجهة المستخدم بنجاح في مجلد dist/');
  } catch (err) {
    console.error('\n❌ خطأ أثناء بناء واجهة المستخدم عبر Vite:');
    console.error(err);
    throw err;
  }

  // 2. Bundle Server with esbuild (Node API)
  console.log('🚀 [2/2] جاري حزم خادم التطبيق عبر esbuild...');
  try {
    await esbuild.build({
      entryPoints: [path.resolve(projectRoot, 'server.ts')],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      external: ['vite', 'electron', 'node:sqlite', 'sharp', 'fsevents'],
      outfile: path.resolve(projectRoot, 'dist/server.cjs')
    });
    console.log('✅ [2/2] تم حزم الخادم بنجاح: dist/server.cjs');
    console.log('==================================================');
    console.log('🎉 اكتمل بناء نظام ZCtrl بالكامل بنجاح 100%');
    console.log('==================================================');
  } catch (err) {
    console.error('\n❌ خطأ أثناء حزم الخادم عبر esbuild:');
    console.error(err);
    throw err;
  }
}

// If executed directly from command line
if (process.argv[1] === __filename) {
  buildApp().catch((err) => {
    console.error('❌ توقفت عملية البناء:', err?.message || err);
    process.exit(1);
  });
}
