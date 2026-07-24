import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        // 브라우저 Origin(localhost:5173)과 Host를 일치시켜 Spring CORS 오판 방지
        changeOrigin: false,
        rewrite: (path) => path.replace(/^\/api/, ''),    //백엔드와 출돌 피하기 위해 붙인 /api 제거
        cookiePathRewrite: {
          '/auth': '/api/auth',
        },
      },
    },
  },
});
