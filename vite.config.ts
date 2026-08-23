import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    watch: {
      ignored: [
        '**/dist/**',
        '**/generated/**',
        '**/public/common/textures/**/*_0',
      ],
    },
  },
});
