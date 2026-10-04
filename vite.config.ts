import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 本地联调：vite dev 时把 /api 转发到 wrangler pages dev（Functions）
      '/api': 'http://127.0.0.1:8788',
    },
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
});
