import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// 테스트마다 렌더링한 DOM을 제거해 다음 테스트와 상태가 섞이지 않도록 정리
afterEach(() => {
  cleanup();
});
