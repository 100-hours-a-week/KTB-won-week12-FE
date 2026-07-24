import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { AUTH_STATUS, useAuth } from '../auth/AuthContext';
import '../styles/components/ProtectedRoute.css';

export default function ProtectedRoute({ children }) {
  const location = useLocation();
  const { status } = useAuth();

  // 앱 시작 인증 복구 중에는 보호 화면을 먼저 렌더링하지 않음
  if (status === AUTH_STATUS.LOADING) {
    return (
      <main className="protected-route-status">
        인증 상태를 확인하는 중...
      </main>
    );
  }

  // 로그인 후 원래 접근한 주소로 돌아가기 위해 현재 location 전달
  if (status === AUTH_STATUS.UNAUTHENTICATED) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: location,
          authRequired: true,
        }}
      />
    );
  }

  // children이 없으면 중첩 Route의 Outlet을 렌더링
  return children ?? <Outlet />;
}
