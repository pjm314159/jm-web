import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // 后端 API 与媒体文件代理到 Django（plan.md 6.1）
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/media': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    // jsdom 提供浏览器 DOM / localStorage；globals 开启后 RTL 自动清理
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
