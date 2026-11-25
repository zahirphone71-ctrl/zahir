import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  const isElectron = process.env.ELECTRON_BUILD === 'true' || process.env.BUILD_TARGET === 'electron';

  return {
    base: isElectron ? './' : '/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: [
        // 1. Precise path resolution for @/src/... to ./src/...
        { find: /^@\/src\/(.*)/, replacement: path.resolve(__dirname, 'src/$1') },
        // 2. Standard @/... to ./src/...
        { find: /^@\/(.*)/, replacement: path.resolve(__dirname, 'src/$1') },
        // 3. Current folder structure domain aliases
        { find: '@components', replacement: path.resolve(__dirname, 'src/components') },
        { find: '@context', replacement: path.resolve(__dirname, 'src/context') },
        { find: '@services', replacement: path.resolve(__dirname, 'src/services') },
        { find: '@types', replacement: path.resolve(__dirname, 'src/types') },
        { find: '@utils', replacement: path.resolve(__dirname, 'src/utils') },
        { find: '@lib', replacement: path.resolve(__dirname, 'src/lib') },
        { find: '@assets', replacement: path.resolve(__dirname, 'src/assets') },
        { find: '@shared', replacement: path.resolve(__dirname, 'src/shared') },
        { find: '@client', replacement: path.resolve(__dirname, 'src/client') },
        { find: '@server', replacement: path.resolve(__dirname, 'src/server') },
        { find: '@src', replacement: path.resolve(__dirname, 'src') },
        // 4. Fallback @ to ./src
        { find: '@', replacement: path.resolve(__dirname, 'src') },
      ],
    },
    optimizeDeps: {
      // Pre-bundle heavy frontend packages for instant load & responsive rendering
      include: [
        'react',
        'react-dom',
        'lucide-react',
        'fast-deep-equal',
        'canvas-confetti',
        'qrcode.react',
        'recharts',
        'motion',
      ],
      // Exclude backend-only RouterOS API and Node native drivers from Vite client optimization
      // to eliminate build slowdowns and browser bundling overhead
      exclude: [
        'node-routeros',
        'routeros-client',
        'basic-ftp',
        'express',
      ],
      esbuildOptions: {
        target: 'es2022',
      },
    },
    esbuild: {
      drop: ['debugger'],
    },
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 3500,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('preload-helper') || id.includes('commonjsHelpers')) {
              return 'vendor';
            }
            if (id.includes('node_modules')) {
              if (id.includes('html2canvas') || id.includes('jspdf') || id.includes('jszip')) {
                return 'vendor-pdf';
              }
              if (id.includes('recharts') || id.includes('d3')) {
                return 'vendor-charts';
              }
              if (id.includes('lucide-react')) {
                return 'vendor-icons';
              }
              return 'vendor';
            }
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
