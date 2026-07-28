import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCsrfToken,
  logout as requestLogout,
  refreshAccessToken,
} from '../api/authApi';
import { getCurrentUser } from '../api/userApi';
import { useToast } from '../components/ToastProvider';
import { AUTH_STATUS, useAuth } from './AuthContext';
import AuthProvider from './AuthProvider';
import { clearAccessToken, getAccessToken } from './authStore';

vi.mock('../api/authApi', () => ({
  getCsrfToken: vi.fn(),
  logout: vi.fn(),
  refreshAccessToken: vi.fn(),
}));

vi.mock('../api/userApi', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('../components/ToastProvider', () => ({
  useToast: vi.fn(),
}));

const CSRF_TOKEN = {
  token: 'csrf-token',
  headerName: 'X-XSRF-TOKEN',
};

const CURRENT_USER = {
  id: 1,
  email: 'user@example.com',
  nickname: '테스터',
};

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function AuthProbe() {
  const {
    status,
    accessToken,
    currentUser,
    refreshSession,
    logoutSession,
  } = useAuth();

  const refreshWithoutUnhandledRejection = () => {
    void refreshSession().catch(() => undefined);
  };

  const refreshTwice = () => {
    // 두 호출이 같은 진행 중 Promise를 공유하는지 사용자 동작을 통해 검증
    void Promise.allSettled([refreshSession(), refreshSession()]);
  };

  const logoutWithoutUnhandledRejection = () => {
    void logoutSession().catch(() => undefined);
  };

  return (
    <div>
      <span data-testid="auth-status">{status}</span>
      <span data-testid="access-token">{accessToken ?? ''}</span>
      <span data-testid="current-user">{currentUser?.nickname ?? ''}</span>
      <button type="button" onClick={refreshWithoutUnhandledRejection}>
        세션 갱신
      </button>
      <button type="button" onClick={refreshTwice}>
        세션 동시에 갱신
      </button>
      <button type="button" onClick={logoutWithoutUnhandledRejection}>
        로그아웃
      </button>
    </div>
  );
}

function renderAuthProvider() {
  return render(
    <AuthProvider>
      <AuthProbe />
    </AuthProvider>,
  );
}

async function waitForAuthenticatedSession() {
  await waitFor(() => {
    expect(screen.getByTestId('auth-status')).toHaveTextContent(
      AUTH_STATUS.AUTHENTICATED,
    );
  });
  await waitFor(() => {
    expect(screen.getByTestId('current-user')).toHaveTextContent('테스터');
  });
}

describe('AuthProvider', () => {
  const showToast = vi.fn();

  beforeEach(() => {
    clearAccessToken();
    useToast.mockReturnValue({ showToast });
    getCsrfToken.mockResolvedValue(CSRF_TOKEN);
    refreshAccessToken.mockResolvedValue('restored-access-token');
    getCurrentUser.mockResolvedValue(CURRENT_USER);
    requestLogout.mockResolvedValue(undefined);
  });

  afterEach(() => {
    clearAccessToken();
  });

  it('앱 시작 시 Refresh Token으로 세션과 사용자 정보를 복구한다', async () => {
    renderAuthProvider();

    expect(screen.getByTestId('auth-status')).toHaveTextContent(
      AUTH_STATUS.LOADING,
    );

    await waitForAuthenticatedSession();

    expect(getCsrfToken).toHaveBeenCalledTimes(1);
    expect(refreshAccessToken).toHaveBeenCalledWith(CSRF_TOKEN);
    expect(getCurrentUser).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('access-token')).toHaveTextContent(
      'restored-access-token',
    );
    expect(getAccessToken()).toBe('restored-access-token');
  });

  it('첫 방문에서 Refresh Token이 없으면 정상적인 미인증 상태가 된다', async () => {
    refreshAccessToken.mockRejectedValueOnce({ status: 401 });

    renderAuthProvider();

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent(
        AUTH_STATUS.UNAUTHENTICATED,
      );
    });

    expect(getCurrentUser).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
    expect(getAccessToken()).toBeNull();
  });

  it('동시에 발생한 Refresh 요청은 하나의 진행 중 요청을 공유한다', async () => {
    const user = userEvent.setup();
    renderAuthProvider();
    await waitForAuthenticatedSession();

    getCsrfToken.mockClear();
    refreshAccessToken.mockClear();
    const deferredRefresh = createDeferred();
    refreshAccessToken.mockReturnValueOnce(deferredRefresh.promise);

    await user.click(screen.getByRole('button', { name: '세션 동시에 갱신' }));

    await waitFor(() => {
      expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    });
    expect(getCsrfToken).toHaveBeenCalledTimes(1);

    deferredRefresh.resolve('shared-access-token');

    await waitFor(() => {
      expect(screen.getByTestId('access-token')).toHaveTextContent(
        'shared-access-token',
      );
    });
  });

  it('기존 세션의 Refresh가 401이면 세션을 제거하고 만료 안내를 표시한다', async () => {
    const user = userEvent.setup();
    renderAuthProvider();
    await waitForAuthenticatedSession();

    showToast.mockClear();
    refreshAccessToken.mockRejectedValueOnce({ status: 401 });

    await user.click(screen.getByRole('button', { name: '세션 갱신' }));

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent(
        AUTH_STATUS.UNAUTHENTICATED,
      );
    });

    expect(getAccessToken()).toBeNull();
    expect(showToast).toHaveBeenCalledWith(
      '로그인 세션이 만료되었습니다. 다시 로그인해주세요.',
      {
        type: 'info',
        duration: 3500,
      },
    );
  });

  it('로그아웃이 CSRF 403이면 새 토큰을 발급해 한 번 재시도한다', async () => {
    const user = userEvent.setup();
    renderAuthProvider();
    await waitForAuthenticatedSession();

    getCsrfToken.mockReset();
    getCsrfToken
      .mockResolvedValueOnce({
        token: 'first-csrf-token',
        headerName: 'X-XSRF-TOKEN',
      })
      .mockResolvedValueOnce({
        token: 'second-csrf-token',
        headerName: 'X-XSRF-TOKEN',
      });
    requestLogout.mockReset();
    requestLogout
      .mockRejectedValueOnce({ status: 403 })
      .mockResolvedValueOnce(undefined);
    showToast.mockClear();

    await user.click(screen.getByRole('button', { name: '로그아웃' }));

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent(
        AUTH_STATUS.UNAUTHENTICATED,
      );
    });

    expect(getCsrfToken).toHaveBeenCalledTimes(2);
    expect(requestLogout).toHaveBeenNthCalledWith(1, {
      token: 'first-csrf-token',
      headerName: 'X-XSRF-TOKEN',
    });
    expect(requestLogout).toHaveBeenNthCalledWith(2, {
      token: 'second-csrf-token',
      headerName: 'X-XSRF-TOKEN',
    });
    expect(showToast).toHaveBeenCalledWith('로그아웃되었습니다.');
    expect(getAccessToken()).toBeNull();
  });
});
