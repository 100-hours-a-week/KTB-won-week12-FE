import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AUTH_STATUS, useAuth } from '../auth/AuthContext';
import { getUserFriendlyErrorMessage } from '../utils/errorMessage';
import BrandLogo from './BrandLogo';
import DefaultProfileAvatar from './DefaultProfileAvatar';
import '../styles/components/AppHeader.css';

export default function AppHeader({ showProfile = true, onBack }) {
  const navigate = useNavigate();
  const {
    status,
    currentUser,
    isCurrentUserLoading,
    currentUserError,
    logoutSession,
  } = useAuth();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  async function handleLogout() {
    setIsLoggingOut(true);
    setLogoutError('');

    try {
      await logoutSession();
      setIsProfileMenuOpen(false);
      navigate('/boards', { replace: true });
    } catch (error) {
      setLogoutError(
        getUserFriendlyErrorMessage(error, {
          fallback: '로그아웃하지 못했습니다. 잠시 후 다시 시도해주세요.',
          statusMessages: {
            403: '로그아웃 보안 확인에 실패했습니다. 다시 시도해주세요.',
          },
        }),
      );
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <header className="app-header">
      {onBack && (
        <button
          type="button"
          className="app-header__back-button"
          aria-label="뒤로가기"
          onClick={onBack}
        >
          ‹
        </button>
      )}

      <h1 className="app-header__title">
        <BrandLogo />
      </h1>

      {showProfile && status === AUTH_STATUS.LOADING && (
        <span
          className="app-header__profile-skeleton"
          aria-label="인증 상태 확인 중"
        />
      )}

      {showProfile && status === AUTH_STATUS.UNAUTHENTICATED && (
        <nav className="app-header__auth-links" aria-label="인증 메뉴">
          <Link to="/login">로그인</Link>
          <Link className="is-primary" to="/signup">
            회원가입
          </Link>
        </nav>
      )}

      {showProfile && status === AUTH_STATUS.AUTHENTICATED && (
        <div
          className="app-header__profile"
          onBlur={(event) => {
            // 포커스가 프로필 영역 밖으로 이동한 경우 메뉴 닫기
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setIsProfileMenuOpen(false);
            }
          }}
        >
          <button
            type="button"
            className="app-header__profile-button"
            aria-label="프로필 메뉴"
            aria-expanded={isProfileMenuOpen}
            onClick={() => setIsProfileMenuOpen((isOpen) => !isOpen)}
          >
            {currentUser?.profileImage ? (
              <img src={currentUser.profileImage} alt="" />
            ) : (
              <DefaultProfileAvatar className="app-header__profile-image" />
            )}
          </button>

          {isProfileMenuOpen && (
            <div className="app-header__profile-menu">
              <div className="app-header__profile-summary">
                <strong>
                  {isCurrentUserLoading
                    ? '사용자 정보 확인 중'
                    : currentUser?.nickname || '사용자'}
                </strong>
                <span>{currentUser?.email}</span>
              </div>

              {currentUserError && (
                <p className="app-header__profile-error" role="alert">
                  {currentUserError}
                </p>
              )}

              <button
                type="button"
                className="app-header__profile-menu-item"
                onClick={() => {
                  setIsProfileMenuOpen(false);
                  navigate('/settings/profile');
                }}
              >
                회원정보 수정
              </button>
              <button
                type="button"
                className="app-header__profile-menu-item"
                onClick={() => {
                  setIsProfileMenuOpen(false);
                  navigate('/settings/password');
                }}
              >
                비밀번호 수정
              </button>
              <button
                type="button"
                className="app-header__profile-menu-item is-logout"
                onClick={handleLogout}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? '로그아웃 중...' : '로그아웃'}
              </button>

              {logoutError && (
                <p className="app-header__profile-error" role="alert">
                  {logoutError}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
