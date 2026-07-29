import { NavLink, useNavigate } from 'react-router-dom';
import AppHeader from './AppHeader';
import BrandLogo from './BrandLogo';
import '../styles/components/AccountSettingsLayout.css';

export default function AccountSettingsLayout({
  eyebrow,
  title,
  description,
  children,
}) {
  const navigate = useNavigate();

  return (
    <>
      <AppHeader onBack={() => navigate('/boards')} />

      <main className="account-settings-page">
        <div className="account-settings-shell">
          <aside className="account-settings-brand">
            <BrandLogo className="account-settings-brand__logo" />

            <div className="account-settings-brand__copy">
              <p>MY KMAP</p>
              <h2>
                나의 정보를
                <br />
                안전하게 관리하세요.
              </h2>
              <span>
                프로필과 계정 보안 설정을 한곳에서 확인할 수 있습니다.
              </span>
            </div>

            <nav
              className="account-settings-nav"
              aria-label="계정 설정 메뉴"
            >
              <NavLink to="/settings/profile">회원정보 수정</NavLink>
              <NavLink to="/settings/password">비밀번호 수정</NavLink>
            </nav>
          </aside>

          <section className="account-settings-panel">
            <p className="account-settings-panel__eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
            <p className="account-settings-panel__description">
              {description}
            </p>
            {children}
          </section>
        </div>
      </main>
    </>
  );
}
