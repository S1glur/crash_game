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
    // По умолчанию Vite слушает только IPv6 (::1). Если на машине проверяющего
    // localhost резолвится в 127.0.0.1, страница не открывается вообще —
    // явная привязка убирает этот класс «у меня работает».
    host: '127.0.0.1',
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
      '/ws': { target: 'http://localhost:8080', changeOrigin: true, ws: true },
    },
  },
})
