import { createContext, useContext } from 'react';

// 문자열 반복을 피하기 위해 앱에서 사용하는 인증 상태를 한곳에 정의
export const AUTH_STATUS = {
  // 앱 시작 후 Refresh Token을 통한 로그인 복구 확인 중
  LOADING: 'loading',

  // 사용 가능한 Access Token이 메모리에 존재
  AUTHENTICATED: 'authenticated',

  // Refresh Token이 없거나 만료되어 로그인되지 않은 상태
  UNAUTHENTICATED: 'unauthenticated',
};

// Provider 외부에서 잘못 사용한 경우를 구분하기 위해 기본값을 null로 설정
export const AuthContext = createContext(null);

// 각 컴포넌트에서 useContext(AuthContext)를 반복하지 않도록 전용 Hook 제공
export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth는 AuthProvider 내부에서 사용해야 합니다.');
  }

  return context;
}
