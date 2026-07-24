import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getCsrfToken,
  logout as requestLogout,
  refreshAccessToken as requestAccessTokenRefresh,
} from '../api/authApi';
import { getCurrentUser } from '../api/userApi';
import {
  clearAccessToken,
  getAccessToken,
  registerRefreshHandler,
  setAccessToken,
} from './authStore';
import { AUTH_STATUS, AuthContext } from './AuthContext';
import { useToast } from '../components/ToastProvider';
import { getUserFriendlyErrorMessage } from '../utils/errorMessage';

export default function AuthProvider({ children }) {
  const { showToast } = useToast();

  // React 화면에서 로딩/인증/미인증 UI를 결정하기 위한 상태
  const [status, setStatus] = useState(AUTH_STATUS.LOADING);

  // Context를 사용하는 컴포넌트가 토큰 변경을 감지하도록 React 상태에도 보관
  const [currentAccessToken, setCurrentAccessToken] = useState(null);

  // 인증 헤더와 사용자 페이지에서 사용할 현재 사용자 정보
  const [currentUser, setCurrentUser] = useState(null);
  const [isCurrentUserLoading, setIsCurrentUserLoading] = useState(false);
  const [currentUserError, setCurrentUserError] = useState('');
  const [currentUserRequestVersion, setCurrentUserRequestVersion] =
    useState(0);

  // 동시에 여러 Refresh가 발생하지 않도록 진행 중인 Promise 저장
  const refreshPromiseRef = useRef(null);

  // 로그인 또는 Refresh 성공 시 메모리 저장소와 React 상태를 함께 변경
  const startSession = useCallback((token) => {
    if (typeof token !== 'string' || token.length === 0) {
      throw new TypeError('Access Token이 올바르지 않습니다.');
    }

    setAccessToken(token);
    setCurrentAccessToken(token);
    setStatus(AUTH_STATUS.AUTHENTICATED);
  }, []);

  // 로그아웃 또는 Refresh 실패 시 모든 Access Token 상태 제거
  const clearSession = useCallback(() => {
    clearAccessToken();
    setCurrentAccessToken(null);
    setCurrentUser(null);
    setIsCurrentUserLoading(false);
    setCurrentUserError('');
    setStatus(AUTH_STATUS.UNAUTHENTICATED);
  }, []);

  const issueCsrfToken = useCallback(
    // 다른 탭이 XSRF-TOKEN 쿠키를 갱신할 수 있으므로 요청 직전에 새 토큰 발급
    () => getCsrfToken(),
    [],
  );

  const refreshSession = useCallback(() => {
    // 여러 API가 동시에 401을 받아도 Refresh 요청은 하나만 실행
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    refreshPromiseRef.current = (async () => {
      const hadAccessToken = getAccessToken() != null;

      try {
        // Refresh와 Logout은 Spring Security의 CSRF 검사 대상
        const csrfToken = await issueCsrfToken();

        // HttpOnly Refresh Token은 JS로 읽지 않고 브라우저가 쿠키로 자동 전송
        const accessToken = await requestAccessTokenRefresh(csrfToken);
        startSession(accessToken);
        return accessToken;
      } catch (error) {
        // 실패한 토큰을 이후 API가 사용하지 않도록 즉시 제거
        clearSession();

        if (hadAccessToken && error.status === 401) {
          showToast('로그인 세션이 만료되었습니다. 다시 로그인해주세요.', {
            type: 'info',
            duration: 3500,
          });
        }

        throw error;
      } finally {
        // 성공/실패와 관계없이 다음 Refresh 요청을 위해 Promise 제거
        refreshPromiseRef.current = null;
      }
    })();

    return refreshPromiseRef.current;
  }, [clearSession, issueCsrfToken, showToast, startSession]);

  const logoutSession = useCallback(async () => {
    let csrfToken = await issueCsrfToken();

    try {
      await requestLogout(csrfToken);
    } catch (error) {
      if (error.status !== 403) {
        throw error;
      }

      // 쿠키가 요청 사이에 교체된 경우 새 CSRF 쌍으로 한 번만 재시도
      csrfToken = await issueCsrfToken();
      await requestLogout(csrfToken);
    }

    clearSession();
    showToast('로그아웃되었습니다.');
  }, [clearSession, issueCsrfToken, showToast]);

  const reloadCurrentUser = useCallback(() => {
    // 사용자 조회 effect의 의존 값을 변경해 동일한 재조회 흐름 사용
    setCurrentUserRequestVersion((version) => version + 1);
  }, []);

  const replaceCurrentUser = useCallback((user) => {
    // 프로필 수정 응답을 헤더와 설정 화면이 공유하는 사용자 상태에 반영
    setCurrentUser(user);
    setCurrentUserError('');
  }, []);

  // httpClient가 401을 받았을 때 Provider의 Refresh를 호출하도록 연결
  // effect cleanup 시 Handler 등록 해제
  useEffect(() => registerRefreshHandler(refreshSession), [refreshSession]);

  useEffect(() => {
    // 비동기 복구 전에 Provider가 정리된 경우 후속 상태 변경을 막기 위한 상태
    let isActive = true;

    async function restoreSession() {
      try {
        // 새로고침으로 Access Token이 사라져도 Refresh 쿠키가 있으면 세션 복구
        await refreshSession();
      } catch {
        // Refresh Token이 없는 첫 방문은 정상적인 미인증 상태로 처리
        if (isActive) {
          clearSession();
        }
      }
    }

    restoreSession();
    // StrictMode의 effect 재실행 또는 언마운트 시 기존 실행 비활성화
    return () => {
      isActive = false;
    };
  }, [clearSession, refreshSession]);

  useEffect(() => {
    if (
      status !== AUTH_STATUS.AUTHENTICATED ||
      currentAccessToken == null
    ) {
      return undefined;
    }

    const abortController = new AbortController();
    let isActive = true;

    async function loadCurrentUser() {
      setIsCurrentUserLoading(true);
      setCurrentUserError('');

      try {
        const user = await getCurrentUser({
          signal: abortController.signal,
        });

        if (isActive) {
          setCurrentUser(user);
        }
      } catch (error) {
        if (error.name === 'AbortError') {
          return;
        }

        if (isActive) {
          setCurrentUserError(
            getUserFriendlyErrorMessage(error, {
              fallback: '사용자 정보를 불러오지 못했습니다.',
            }),
          );
        }

        // Refresh 재시도 후에도 401이면 더 이상 유효한 로그인 상태가 아님
        if (error.status === 401) {
          clearSession();
        }
      } finally {
        if (isActive) {
          setIsCurrentUserLoading(false);
        }
      }
    }

    loadCurrentUser();

    // 토큰 변경 또는 Provider 정리 시 이전 사용자 정보 요청 취소
    return () => {
      isActive = false;
      abortController.abort();
    };
  }, [
    clearSession,
    currentAccessToken,
    currentUserRequestVersion,
    status,
  ]);

  // Provider 재렌더링 시 값 객체가 불필요하게 생성되지 않도록 메모이제이션
  const contextValue = useMemo(
    () => ({
      status,
      accessToken: currentAccessToken,
      currentUser,
      isCurrentUserLoading,
      currentUserError,
      isAuthenticated: status === AUTH_STATUS.AUTHENTICATED,
      startSession,
      clearSession,
      refreshSession,
      logoutSession,
      reloadCurrentUser,
      replaceCurrentUser,
    }),
    [
      clearSession,
      currentAccessToken,
      currentUser,
      currentUserError,
      isCurrentUserLoading,
      logoutSession,
      reloadCurrentUser,
      replaceCurrentUser,
      refreshSession,
      startSession,
      status,
    ],
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}
