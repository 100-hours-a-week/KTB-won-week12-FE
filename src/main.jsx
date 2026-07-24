import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';
import App from './App';
import AuthProvider from './auth/AuthProvider';
import ToastProvider from './components/ToastProvider';

// index.html의 #root를 React 애플리케이션의 렌더링 시작점으로 사용
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  // 개발 환경에서 effect 정리 누락과 같은 부작용 확인을 위해 StrictMode 사용
  <React.StrictMode>
    {/* 화면 이동 후에도 성공·세션 만료 알림을 유지하도록 최상위에 배치 */}
    <ToastProvider>
      {/* 모든 화면에서 동일한 인증 상태와 세션 함수를 사용하도록 설정 */}
      <AuthProvider>
        <App />
      </AuthProvider>
    </ToastProvider>
  </React.StrictMode>
);
