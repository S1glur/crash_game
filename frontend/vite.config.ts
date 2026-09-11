import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Прокси на бэкенд, чтобы фронт везде ходил по относительным путям:
// в dev — через Vite, в проде — с того же origin, что и Spring.
export default defineConfig({
  plugins: [react()],
  // sockjs-client рассчитан на сборку с Node-окружением и обращается к global,
  // которого в браузере нет — без этой подмены страница падает с пустым экраном.
  define: {
    global: 'globalThis',
  },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
      '/ws': { target: 'http://localhost:8080', changeOrigin: true, ws: true },
    },
  },
})
