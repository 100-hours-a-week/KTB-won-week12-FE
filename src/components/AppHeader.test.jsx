import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AUTH_STATUS, AuthContext } from '../auth/AuthContext';
import AppHeader from './AppHeader';

const CURRENT_USER = {
  email: 'user@example.com',
  nickname: '테스터',
  profileImage: 'https://example.com/profile.jpg',
};

function renderHeader({ authOverrides = {}, headerProps = {} } = {}) {
  const authValue = {
    status: AUTH_STATUS.UNAUTHENTICATED,
    currentUser: null,
    isCurrentUserLoading: false,
    currentUserError: '',
    logoutSession: vi.fn().mockResolvedValue(undefined),
    ...authOverrides,
  };

  render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={['/boards']}>
        <Routes>
          <Route path="/boards" element={<AppHeader {...headerProps} />} />
          <Route path="/login" element={<div>로그인 화면 도착</div>} />
          <Route path="/signup" element={<div>회원가입 화면 도착</div>} />
          <Route path="/settings/profile" element={<div>프로필 설정 도착</div>} />
          <Route path="/settings/password" element={<div>비밀번호 설정 도착</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );

  return authValue;
}

describe('AppHeader', () => {
  it('인증 확인 중에는 프로필 skeleton만 표시한다', () => {
    renderHeader({ authOverrides: { status: AUTH_STATUS.LOADING } });

    expect(screen.getByLabelText('인증 상태 확인 중')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '로그인' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '프로필 메뉴' })).not.toBeInTheDocument();
  });

  it('미인증 사용자에게 로그인과 회원가입 링크를 제공한다', async () => {
    const user = userEvent.setup();
    renderHeader();

    await user.click(screen.getByRole('link', { name: '로그인' }));
    expect(await screen.findByText('로그인 화면 도착')).toBeInTheDocument();
  });

  it('프로필 메뉴에서 사용자 정보와 설정 화면 이동을 제공한다', async () => {
    const user = userEvent.setup();
    renderHeader({
      authOverrides: {
        status: AUTH_STATUS.AUTHENTICATED,
        currentUser: CURRENT_USER,
      },
    });

    await user.click(screen.getByRole('button', { name: '프로필 메뉴' }));
    expect(screen.getByText('테스터')).toBeInTheDocument();
    expect(screen.getByText('user@example.com')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '회원정보 수정' }));
    expect(await screen.findByText('프로필 설정 도착')).toBeInTheDocument();
  });

  it('프로필 사진이 없는 인증 사용자에게 기본 사람 아바타를 표시한다', () => {
    const { container } = render(
      <AuthContext.Provider
        value={{
          status: AUTH_STATUS.AUTHENTICATED,
          currentUser: { ...CURRENT_USER, profileImage: null },
          isCurrentUserLoading: false,
          currentUserError: '',
          logoutSession: vi.fn(),
        }}
      >
        <MemoryRouter>
          <AppHeader />
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    const defaultAvatar = container.querySelector(
      '.app-header__profile-image.default-profile-avatar',
    );
    expect(defaultAvatar).toBeInTheDocument();
    expect(defaultAvatar.querySelector('svg')).toBeInTheDocument();
  });

  it('로그아웃 성공 후 게시글 목록 주소로 이동한다', async () => {
    const user = userEvent.setup();
    const authValue = renderHeader({
      authOverrides: {
        status: AUTH_STATUS.AUTHENTICATED,
        currentUser: CURRENT_USER,
      },
    });

    await user.click(screen.getByRole('button', { name: '프로필 메뉴' }));
    await user.click(screen.getByRole('button', { name: '로그아웃' }));

    expect(authValue.logoutSession).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('테스터')).not.toBeInTheDocument();
  });

  it('로그아웃 403을 보안 확인 실패 문구로 표시한다', async () => {
    const user = userEvent.setup();
    renderHeader({
      authOverrides: {
        status: AUTH_STATUS.AUTHENTICATED,
        currentUser: CURRENT_USER,
        logoutSession: vi.fn().mockRejectedValue({ status: 403 }),
      },
    });

    await user.click(screen.getByRole('button', { name: '프로필 메뉴' }));
    await user.click(screen.getByRole('button', { name: '로그아웃' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '로그아웃 보안 확인에 실패했습니다. 다시 시도해주세요.',
    );
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeEnabled();
  });

  it('뒤로가기 버튼은 전달받은 동작을 실행한다', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    renderHeader({ headerProps: { onBack, showProfile: false } });

    await user.click(screen.getByRole('button', { name: '뒤로가기' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('navigation', { name: '인증 메뉴' })).not.toBeInTheDocument();
  });
});
