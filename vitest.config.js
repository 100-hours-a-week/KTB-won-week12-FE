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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/main.jsx', 'src/**/*.{test,spec}.{js,jsx}'],
      // 현재 커버리지보다 여유 있는 최소 기준을 두어 큰 폭의 하락만 차단
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      },
    },
  },
});
