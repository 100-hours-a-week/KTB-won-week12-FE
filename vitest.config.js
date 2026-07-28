import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // React 컴포넌트가 브라우저 DOM을 사용하는 것처럼 테스트할 수 있도록 설정
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    globals: true,
    clearMocks: true,
    restoreMocks: true,
  },
});
