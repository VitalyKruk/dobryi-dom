import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // В Docker на Windows/macOS изменения файлов видны только опросом
    watch: process.env.VITE_POLLING ? { usePolling: true, interval: 300 } : undefined,
    // API (server/) — отдельный процесс; браузер ходит на тот же домен, Vite пересылает запросы
    proxy: {
      "/api": process.env.API_URL ?? "http://127.0.0.1:3001",
      "/uploads": process.env.API_URL ?? "http://127.0.0.1:3001",
    },
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
})
