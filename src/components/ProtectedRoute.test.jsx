import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AUTH_STATUS, AuthContext } from '../auth/AuthContext';
import ProtectedRoute from './ProtectedRoute';

function LoginDestination() {
  const location = useLocation();

  return (
    <div>
      로그인 화면
      <span data-testid="redirect-path">{location.state?.from?.pathname}</span>
    </div>
  );
}

function renderProtectedRoute(status) {
  return render(
    <AuthContext.Provider value={{ status }}>
      <MemoryRouter initialEntries={['/boards/new']}>
        <Routes>
          <Route path="/login" element={<LoginDestination />} />
          <Route
            path="/boards/new"
            element={(
              <ProtectedRoute>
                <div>게시글 작성 화면</div>
              </ProtectedRoute>
            )}
          />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('ProtectedRoute', () => {
  it('인증 복구 중에는 보호 화면 대신 로딩 상태를 표시한다', () => {
    renderProtectedRoute(AUTH_STATUS.LOADING);

    expect(screen.getByText('인증 상태를 확인하는 중...')).toBeInTheDocument();
    expect(screen.queryByText('게시글 작성 화면')).not.toBeInTheDocument();
  });

  it('인증된 사용자에게 보호 화면을 표시한다', () => {
    renderProtectedRoute(AUTH_STATUS.AUTHENTICATED);

    expect(screen.getByText('게시글 작성 화면')).toBeInTheDocument();
  });

  it('미인증 사용자를 로그인 화면으로 보내고 원래 경로를 전달한다', () => {
    renderProtectedRoute(AUTH_STATUS.UNAUTHENTICATED);

    expect(screen.getByText('로그인 화면')).toBeInTheDocument();
    expect(screen.getByTestId('redirect-path')).toHaveTextContent(
      '/boards/new',
    );
  });
});
