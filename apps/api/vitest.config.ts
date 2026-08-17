import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@isaac-spire/game': fileURLToPath(new URL('../../packages/game/src/index.ts', import.meta.url)) },
  },
});
