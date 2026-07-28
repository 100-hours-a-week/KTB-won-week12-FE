import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('./pages/BoardListPage', () => ({
  default: () => <div>게시글 목록 페이지</div>,
}));
vi.mock('./pages/BoardDetailPage', () => ({
  default: () => <div>게시글 상세 페이지</div>,
}));
vi.mock('./pages/BoardFormPage', () => ({
  default: ({ mode }) => <div>게시글 폼 {mode}</div>,
}));
vi.mock('./pages/LoginPage', () => ({
  default: () => <div>로그인 페이지</div>,
}));
vi.mock('./pages/SignupPage', () => ({
  default: () => <div>회원가입 페이지</div>,
}));
vi.mock('./pages/ProfileSettingsPage', () => ({
  default: () => <div>프로필 설정 페이지</div>,
}));
vi.mock('./pages/PasswordSettingsPage', () => ({
  default: () => <div>비밀번호 설정 페이지</div>,
}));
vi.mock('./components/ProtectedRoute', async () => {
  const { Outlet } = await vi.importActual('react-router-dom');

  return {
    default: () => (
      <div data-testid="protected-route">
        <Outlet />
      </div>
    ),
  };
});

describe('App routing', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('기본 주소를 게시글 목록으로 대체 이동한다', async () => {
    render(<App />);

    expect(await screen.findByText('게시글 목록 페이지')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/boards');
  });

  it.each([
    ['/boards', '게시글 목록 페이지', false],
    ['/boards/1', '게시글 상세 페이지', false],
    ['/boards/new', '게시글 폼 create', true],
    ['/boards/1/edit', '게시글 폼 edit', true],
    ['/settings/profile', '프로필 설정 페이지', true],
    ['/settings/password', '비밀번호 설정 페이지', true],
    ['/login', '로그인 페이지', false],
    ['/signup', '회원가입 페이지', false],
  ])('%s 주소를 올바른 페이지에 연결한다', async (path, pageText, isProtected) => {
    window.history.replaceState({}, '', path);
    render(<App />);

    expect(await screen.findByText(pageText)).toBeInTheDocument();
    if (isProtected) {
      expect(screen.getByTestId('protected-route')).toBeInTheDocument();
    } else {
      expect(screen.queryByTestId('protected-route')).not.toBeInTheDocument();
    }
  });
});
