import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => {
  // vite build --mode static — версия без сервера (npm run build:static): API работает в браузере,
  // всё собирается в один файл, чтобы страницу можно было выложить где угодно
  const isStatic = mode === 'static'
  return {
    plugins: [react(), tailwindcss()],
    base: isStatic ? './' : '/',
    define: isStatic ? { 'import.meta.env.VITE_STATIC': JSON.stringify('1') } : undefined,
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
      alias: [
        ...(isStatic ? [{ find: /^@\/lib\/api$/, replacement: path.resolve(import.meta.dirname, './src/lib/api-static.ts') }] : []),
        { find: '@', replacement: path.resolve(import.meta.dirname, './src') },
      ],
    },
    build: isStatic
      ? {
          outDir: 'dist-static',
          // Шрифты и прочие ассеты — внутрь CSS/JS, код — одним файлом без догружаемых чанков
          assetsInlineLimit: 100_000_000,
          cssCodeSplit: false,
          // Один файл на всё приложение — предупреждение о размере чанка тут ожидаемо
          chunkSizeWarningLimit: 2000,
          rollupOptions: { output: { inlineDynamicImports: true } },
        }
      : undefined,
  }
})
