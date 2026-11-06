import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { strictPort: true },
  build: { chunkSizeWarningLimit: 750 },
});
