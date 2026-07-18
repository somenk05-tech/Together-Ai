import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Web build. For Capacitor, `base` stays './' so assets resolve from the app bundle.
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173, host: true },
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Split vendors so route-level code-splitting stays lean.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          data: ['@tanstack/react-query', 'zustand', 'axios'],
          realtime: ['socket.io-client'],
        },
      },
    },
  },
});
