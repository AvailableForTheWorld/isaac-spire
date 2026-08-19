import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import UnoCSS from '@unocss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), UnoCSS()],
  resolve: {
    alias: {
      '@isaac-spire/game': fileURLToPath(new URL('../../packages/game/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3001' },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/react') || id.includes('/node_modules/react-dom'))
            return 'react-vendor';
          if (id.includes('/node_modules/i18next') || id.includes('/node_modules/react-i18next'))
            return 'i18n-vendor';
          return undefined;
        },
      },
    },
  },
});
