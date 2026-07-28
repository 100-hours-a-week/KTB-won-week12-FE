import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { login } from '../api/authApi';
import { AUTH_STATUS, AuthContext } from '../auth/AuthContext';
import LoginPage from './LoginPage';

vi.mock('../api/authApi', () => ({
  login: vi.fn(),
}));

vi.mock('../components/AppHeader', () => ({
  default: () => <header>테스트 헤더</header>,
}));

function createDeferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function renderLoginPage({
  status = AUTH_STATUS.UNAUTHENTICATED,
  initialEntry = '/login',
  startSession = vi.fn(),
} = {}) {
  render(
    <AuthContext.Provider value={{ status, startSession }}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/boards" element={<div>게시글 목록 도착</div>} />
          <Route
            path="/boards/new"
            element={<div>게시글 작성 도착</div>}
          />
          <Route path="/signup" element={<div>회원가입 도착</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );

  return { startSession };
}

async function enterValidCredentials(user) {
  await user.type(screen.getByLabelText('이메일'), 'user@example.com');
  await user.type(screen.getByLabelText('비밀번호'), 'Password1!');
}

describe('LoginPage', () => {
  beforeEach(() => {
    login.mockReset();
  });

  it('세션 복구 중에는 로그인 제출을 막는다', () => {
    renderLoginPage({ status: AUTH_STATUS.LOADING });

    expect(
      screen.getByRole('button', { name: '인증 확인 중...' }),
    ).toBeDisabled();
    expect(login).not.toHaveBeenCalled();
  });

  it('이메일과 비밀번호 입력 형식을 검증한다', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText('이메일'), 'invalid-email');
    await user.tab();
    await user.type(screen.getByLabelText('비밀번호'), 'short');
    await user.tab();

    expect(
      screen.getByText('올바른 이메일 형식을 입력해주세요.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '8~20자의 대문자, 소문자, 숫자, 특수문자를 모두 포함해주세요.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '로그인' })).toBeDisabled();
    expect(login).not.toHaveBeenCalled();
  });

  it('로그인 성공 시 세션을 시작하고 원래 접근한 보호 경로로 이동한다', async () => {
    const user = userEvent.setup();
    const startSession = vi.fn();
    login.mockResolvedValueOnce('access-token');
    renderLoginPage({
      startSession,
      initialEntry: {
        pathname: '/login',
        state: {
          from: { pathname: '/boards/new' },
          authRequired: true,
        },
      },
    });

    expect(
      screen.getByText('이 페이지를 이용하려면 로그인이 필요합니다.'),
    ).toBeInTheDocument();

    await enterValidCredentials(user);
    await user.click(screen.getByRole('button', { name: '로그인' }));

    expect(await screen.findByText('게시글 작성 도착')).toBeInTheDocument();
    expect(login).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'Password1!',
    });
    expect(startSession).toHaveBeenCalledWith('access-token');
  });

  it('인증 실패를 사용자가 이해할 수 있는 문구로 표시한다', async () => {
    const user = userEvent.setup();
    login.mockRejectedValueOnce({
      status: 401,
      code: 'AUTHENTICATION_FAILED',
      message: 'Authentication failed',
    });
    renderLoginPage();

    await enterValidCredentials(user);
    await user.click(screen.getByRole('button', { name: '로그인' }));

    expect(
      await screen.findByRole('alert'),
    ).toHaveTextContent('이메일 또는 비밀번호를 확인해주세요.');
    expect(screen.getByRole('button', { name: '로그인' })).toBeEnabled();
  });

  it('로그인 요청 중에는 버튼을 비활성화해 중복 요청을 막는다', async () => {
    const user = userEvent.setup();
    const deferredLogin = createDeferred();
    login.mockReturnValueOnce(deferredLogin.promise);
    renderLoginPage();

    await enterValidCredentials(user);
    await user.click(screen.getByRole('button', { name: '로그인' }));

    const submittingButton = screen.getByRole('button', {
      name: '로그인 중...',
    });
    expect(submittingButton).toBeDisabled();

    await user.click(submittingButton);
    expect(login).toHaveBeenCalledTimes(1);

    deferredLogin.resolve('access-token');
    await waitFor(() => {
      expect(screen.getByText('게시글 목록 도착')).toBeInTheDocument();
    });
  });

  it('이미 인증된 사용자는 로그인 화면에서 게시글 목록으로 이동한다', async () => {
    renderLoginPage({ status: AUTH_STATUS.AUTHENTICATED });

    expect(await screen.findByText('게시글 목록 도착')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });
});
