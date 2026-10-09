import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// A self-contained bundle lets the existing static host adopt Vue one screen at a time.
export default defineConfig({
  plugins: [vue()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'assets/ui',
    emptyOutDir: true,
    lib: { entry: 'frontend/main.js', name: 'NickStatsUIBundle', formats: ['iife'], fileName: () => 'nickstats-ui.js' }
  }
});
