import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { login } from '../api/authApi';
import { AUTH_STATUS, useAuth } from '../auth/AuthContext';
import AppHeader from '../components/AppHeader';
import { getUserFriendlyErrorMessage } from '../utils/errorMessage';
import { validateEmail, validatePassword } from '../utils/validation';
import '../styles/pages/LoginPage.css';

const INITIAL_VALUES = {
  email: '',
  password: '',
};

const INITIAL_ERRORS = {
  email: '',
  password: '',
};

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { status, startSession } = useAuth();

  // 사용자가 입력한 이메일과 비밀번호를 하나의 객체로 관리
  const [values, setValues] = useState(INITIAL_VALUES);

  // 각 입력값의 검증 메시지를 필드 이름과 동일한 key로 관리
  const [fieldErrors, setFieldErrors] = useState(INITIAL_ERRORS);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 보호 페이지에서 로그인 화면으로 이동한 경우 원래 주소로 돌아가기 위한 값
  const redirectPath = location.state?.from?.pathname ?? '/boards';

  // 이미 인증된 사용자가 로그인 화면에 접근하면 게시글 목록으로 이동
  useEffect(() => {
    if (status === AUTH_STATUS.AUTHENTICATED) {
      navigate('/boards', { replace: true });
    }
  }, [navigate, status]);

  const emailError = validateEmail(values.email);
  const passwordError = validatePassword(values.password);
  const isRestoringSession = status === AUTH_STATUS.LOADING;
  const canSubmit =
    !emailError && !passwordError && !isSubmitting && !isRestoringSession;

  function handleChange(event) {
    const { name, value } = event.target;

    setValues((currentValues) => ({
      ...currentValues,
      [name]: value,
    }));

    // 오류가 표시된 필드는 입력할 때마다 다시 검증해 메시지를 바로 갱신
    if (fieldErrors[name]) {
      const nextError =
        name === 'email' ? validateEmail(value) : validatePassword(value);

      setFieldErrors((currentErrors) => ({
        ...currentErrors,
        [name]: nextError,
      }));
    }

    setSubmitError('');
  }

  function handleBlur(event) {
    const { name, value } = event.target;
    const error =
      name === 'email' ? validateEmail(value) : validatePassword(value);

    setFieldErrors((currentErrors) => ({
      ...currentErrors,
      [name]: error,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    // 버튼 활성화와 별개로 submit 시점에 모든 입력값을 다시 검증
    const nextErrors = {
      email: validateEmail(values.email),
      password: validatePassword(values.password),
    };
    setFieldErrors(nextErrors);
    setSubmitError('');

    // 앱 시작 인증 복구가 끝나기 전 로그인 요청이 겹치지 않도록 차단
    if (nextErrors.email || nextErrors.password || isRestoringSession) {
      return;
    }

    setIsSubmitting(true);

    try {
      const accessToken = await login(values);

      // 응답 토큰을 메모리에 저장하고 인증 상태를 authenticated로 변경
      startSession(accessToken);
      navigate(redirectPath, { replace: true });
    } catch (error) {
      setSubmitError(
        getUserFriendlyErrorMessage(error, {
          fallback: '로그인 요청을 처리하지 못했습니다.',
          codeMessages: {
            LOGIN_FAILED: '이메일 또는 비밀번호를 확인해주세요.',
            AUTHENTICATION_FAILED:
              '이메일 또는 비밀번호를 확인해주세요.',
          },
          statusMessages: {
            401: '이메일 또는 비밀번호를 확인해주세요.',
          },
        }),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <AppHeader showProfile={false} />

      <main className="login-page">
        <div className="login-shell">
          <section className="login-brand" aria-label="크맵 서비스 소개">
            <div className="login-brand__logo">
              <svg
                className="login-brand__mark"
                viewBox="0 0 64 76"
                aria-hidden="true"
              >
                <path
                  fill="#f97316"
                  d="M32 2C15.4 2 2 15.4 2 32c0 22.5 30 42 30 42s30-19.5 30-42C62 15.4 48.6 2 32 2Z"
                />
                <circle cx="32" cy="31" r="17" fill="#fff7ed" />
                <path
                  d="M27 44 31 18h3l4 26M30 32h6"
                  fill="none"
                  stroke="#f97316"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              </svg>
              <strong>크맵</strong>
            </div>

            <div className="login-brand__copy">
              <p className="login-brand__eyebrow">
                교통사고 과실 투표 커뮤니티
              </p>
              <h2>
                사고의 순간을 공유하고,
                <br />
                함께 판단해 보세요.
              </h2>
              <p className="login-brand__description">
                사진과 사고 상황을 확인하고 과실이 더 크다고 생각하는 차량을
                판단해 보세요. 다양한 운전자의 의견이 더 안전한 도로를
                만듭니다.
              </p>
              <div className="login-brand__features" aria-label="주요 기능">
                <span>📍 사고 사례</span>
                <span>🗳 과실 투표</span>
                <span>🔥 HOT 토론</span>
              </div>
            </div>
          </section>

          <section className="login-form-section">
            <p className="login-form-section__welcome">다시 만나 반가워요!</p>
            <h2 className="login-form-section__title">로그인</h2>

            {location.state?.signupCompleted && (
              <p className="login-form-section__success" role="status">
                회원가입이 완료되었습니다. 로그인해주세요.
              </p>
            )}

            {location.state?.authRequired && (
              <p className="login-form-section__notice" role="status">
                이 페이지를 이용하려면 로그인이 필요합니다.
              </p>
            )}

            <form className="login-form" noValidate onSubmit={handleSubmit}>
              <div className="login-form__group">
                <label className="login-form__label" htmlFor="email">
                  이메일
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  className="login-form__input"
                  placeholder="이메일을 입력하세요"
                  autoComplete="email"
                  value={values.email}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby="email-helper"
                />
                <p id="email-helper" className="login-form__helper">
                  {fieldErrors.email}
                </p>
              </div>

              <div className="login-form__group">
                <label className="login-form__label" htmlFor="password">
                  비밀번호
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  className="login-form__input"
                  placeholder="비밀번호를 입력하세요"
                  autoComplete="current-password"
                  value={values.password}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby="password-helper"
                />
                <p id="password-helper" className="login-form__helper">
                  {fieldErrors.password}
                </p>
              </div>

              {submitError && (
                <p className="login-form__submit-error" role="alert">
                  {submitError}
                </p>
              )}

              <button
                type="submit"
                className="login-form__submit"
                disabled={!canSubmit}
              >
                {isSubmitting
                  ? '로그인 중...'
                  : isRestoringSession
                    ? '인증 확인 중...'
                    : '로그인'}
              </button>
            </form>

            <div className="login-signup">
              <span>아직 계정이 없나요?</span>
              <button
                type="button"
                className="login-signup__button"
                onClick={() => navigate('/signup')}
              >
                회원가입
              </button>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
