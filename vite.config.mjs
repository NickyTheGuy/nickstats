import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// A self-contained bundle lets the existing static host adopt React one screen at a time.
export default defineConfig({
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'assets/ui',
    emptyOutDir: true,
    lib: { entry: 'frontend/main.jsx', name: 'NickStatsUIBundle', formats: ['iife'], fileName: () => 'nickstats-ui.js' }
  }
});
