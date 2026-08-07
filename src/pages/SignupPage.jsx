import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  checkEmailAvailability,
  checkNicknameAvailability,
  signup,
} from '../api/authApi';
import { AUTH_STATUS, useAuth } from '../auth/AuthContext';
import AppHeader from '../components/AppHeader';
import BrandLogo from '../components/BrandLogo';
import Portal from '../components/Portal';
import useAvailabilityCheck from '../hooks/useAvailabilityCheck';
import { getUserFriendlyErrorMessage } from '../utils/errorMessage';
import {
  validateEmail,
  validateNickname,
  validatePassword,
  validatePasswordConfirm,
} from '../utils/validation';
import '../styles/pages/SignupPage.css';

const INITIAL_VALUES = {
  email: '',
  nickname: '',
  password: '',
  passwordConfirm: '',
};

const INITIAL_ERRORS = {
  email: '',
  nickname: '',
  password: '',
  passwordConfirm: '',
};

const REQUEST_TIMEOUT_MS = 8000;
const SPINNER_DELAY_MS = 400;

export default function SignupPage() {
  const navigate = useNavigate();
  const { status } = useAuth();
  const emailAvailability = useAvailabilityCheck(checkEmailAvailability);
  const nicknameAvailability = useAvailabilityCheck(
    checkNicknameAvailability,
  );

  // 회원가입 요청에 사용할 모든 입력값을 하나의 객체로 관리
  const [values, setValues] = useState(INITIAL_VALUES);
  const [fieldErrors, setFieldErrors] = useState(INITIAL_ERRORS);
  const [nicknameCheckRequired, setNicknameCheckRequired] =
    useState(false);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showNetworkSpinner, setShowNetworkSpinner] = useState(false);
  const signupAbortControllerRef = useRef(null);

  // 인증 사용자가 회원가입 화면에 접근하면 게시글 목록으로 이동
  useEffect(() => {
    if (status === AUTH_STATUS.AUTHENTICATED) {
      navigate('/boards', { replace: true });
    }
  }, [navigate, status]);

  useEffect(
    () => () => {
      signupAbortControllerRef.current?.abort();
    },
    [],
  );

  const localErrors = {
    email: validateEmail(values.email),
    nickname: validateNickname(values.nickname),
    password: validatePassword(values.password),
    passwordConfirm: validatePasswordConfirm(
      values.password,
      values.passwordConfirm,
    ),
  };
  const isRestoringSession = status === AUTH_STATUS.LOADING;
  const isEmailChecked =
    emailAvailability.status === 'available' &&
    emailAvailability.checkedValue === values.email;
  const isNicknameChecked =
    nicknameAvailability.status === 'available' &&
    nicknameAvailability.checkedValue === values.nickname;
  const isNetworkPending =
    emailAvailability.status === 'checking' ||
    nicknameAvailability.status === 'checking' ||
    isSubmitting;
  const availabilityErrorReason =
    emailAvailability.errorReason ?? nicknameAvailability.errorReason;
  const canSubmit =
    Object.values(localErrors).every((error) => !error) &&
    isEmailChecked &&
    isNicknameChecked &&
    !isSubmitting &&
    !isRestoringSession;

  useEffect(() => {
    if (!isNetworkPending) {
      setShowNetworkSpinner(false);
      return undefined;
    }

    // 짧은 요청에는 스피너를 표시하지 않아 화면 깜빡임 방지
    const spinnerTimer = window.setTimeout(
      () => setShowNetworkSpinner(true),
      SPINNER_DELAY_MS,
    );

    return () => window.clearTimeout(spinnerTimer);
  }, [isNetworkPending]);

  function validateField(name, nextValues = values) {
    const validators = {
      email: () => validateEmail(nextValues.email),
      nickname: () => validateNickname(nextValues.nickname),
      password: () => validatePassword(nextValues.password),
      passwordConfirm: () =>
        validatePasswordConfirm(
          nextValues.password,
          nextValues.passwordConfirm,
        ),
    };

    return validators[name]();
  }

  function handleChange(event) {
    const { name, value } = event.target;
    const nextValues = { ...values, [name]: value };
    setValues(nextValues);
    setSubmitError('');

    // 중복 확인 이후 입력값이 바뀌면 이전 확인 결과를 즉시 무효화
    if (name === 'email') {
      emailAvailability.reset();
    }
    if (name === 'nickname') {
      nicknameAvailability.reset();
      setNicknameCheckRequired(false);
    }

    if (fieldErrors[name]) {
      setFieldErrors((currentErrors) => ({
        ...currentErrors,
        [name]: validateField(name, nextValues),
      }));
    }

    // 비밀번호가 변경되면 이미 표시 중인 비밀번호 확인 오류도 함께 갱신
    if (name === 'password' && fieldErrors.passwordConfirm) {
      setFieldErrors((currentErrors) => ({
        ...currentErrors,
        passwordConfirm: validatePasswordConfirm(
          value,
          nextValues.passwordConfirm,
        ),
      }));
    }
  }

  async function handleBlur(event) {
    const { name, value } = event.target;
    const localError = validateField(name);

    setFieldErrors((currentErrors) => ({
      ...currentErrors,
      [name]: localError,
    }));

    // 형식 검증을 통과한 경우에만 중복 확인 API 요청
    if (!localError && name === 'email') {
      await emailAvailability.check(value);
    }
  }

  async function handleNicknameAvailabilityCheck() {
    const localError = validateNickname(values.nickname);

    setFieldErrors((currentErrors) => ({
      ...currentErrors,
      nickname: localError,
    }));
    setNicknameCheckRequired(false);

    // 닉네임 형식이 올바른 경우에만 사용자가 누른 버튼으로 중복 확인
    if (!localError) {
      await nicknameAvailability.check(values.nickname);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFieldErrors(localErrors);
    setSubmitError('');

    if (Object.values(localErrors).some(Boolean) || isRestoringSession) {
      return;
    }

    if (!isNicknameChecked) {
      // Enter 키 제출도 명시적인 닉네임 중복 확인을 건너뛰지 않도록 차단
      setNicknameCheckRequired(true);
      return;
    }

    // 이메일은 기존처럼 형식 검증 이후 자동 확인 흐름 유지
    const isEmailAvailable = isEmailChecked
      ? true
      : await emailAvailability.check(values.email);

    if (!isEmailAvailable) {
      return;
    }

    setIsSubmitting(true);
    const abortController = new AbortController();
    signupAbortControllerRef.current = abortController;
    let didTimeout = false;
    const timeoutId = window.setTimeout(() => {
      didTimeout = true;
      abortController.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
      await signup(
        {
          email: values.email,
          nickname: values.nickname,
          password: values.password,
        },
        { signal: abortController.signal },
      );

      navigate('/login', {
        replace: true,
        state: { signupCompleted: true },
      });
    } catch (error) {
      setSubmitError(
        didTimeout
          ? '서버 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.'
          : getUserFriendlyErrorMessage(error, {
              fallback: '회원가입 요청을 처리하지 못했습니다.',
              codeMessages: {
                EMAIL_ALREADY_EXISTS:
                  '이미 가입된 이메일입니다. 로그인하거나 다른 이메일을 사용해주세요.',
                NICKNAME_ALREADY_EXISTS:
                  '이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해주세요.',
              },
            }),
      );
    } finally {
      window.clearTimeout(timeoutId);

      if (signupAbortControllerRef.current === abortController) {
        signupAbortControllerRef.current = null;
      }
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <AppHeader showProfile={false} onBack={() => navigate('/login')} />

      <main className="signup-page">
        <div className="signup-shell">
          <aside className="signup-brand">
            <BrandLogo className="signup-brand__logo" />
            <div className="signup-brand__copy">
              <p>크맵과 함께 시작하세요</p>
              <h2>
                도로 위 경험이
                <br />
                모두의 기준이 됩니다.
              </h2>
              <span>
                사고 사례를 공유하고 다양한 운전자의 판단을 만나보세요.
              </span>
            </div>
          </aside>

          <section className="signup-form-section">
            <p className="signup-form-section__eyebrow">새 계정 만들기</p>
            <h2>회원가입</h2>

            <form className="signup-form" noValidate onSubmit={handleSubmit}>
              <div className="signup-profile">
                <span className="signup-form__label">프로필 이미지</span>
                <div className="signup-profile__preview is-default">
                  <img
                    src="/kmap_icon.svg"
                    alt="기본 프로필 이미지"
                  />
                </div>
                <p
                  id="profileImage-helper"
                  className="signup-form__helper is-guide signup-profile__guide"
                >
                  프로필 사진 변경은 로그인 후 회원 정보 수정에서
                  가능합니다.
                </p>
              </div>

              <div className="signup-form__group">
                <label className="signup-form__label" htmlFor="email">
                  이메일*
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  className="signup-form__input"
                  placeholder="이메일을 입력하세요"
                  autoComplete="email"
                  value={values.email}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  aria-invalid={
                    Boolean(fieldErrors.email) ||
                    emailAvailability.status === 'unavailable'
                  }
                  aria-describedby="signup-email-helper"
                />
                <p
                  id="signup-email-helper"
                  className={`signup-form__helper ${
                    !fieldErrors.email &&
                    emailAvailability.status === 'available'
                      ? 'is-available'
                      : ''
                  }`}
                >
                  {fieldErrors.email ||
                    (emailAvailability.status === 'available'
                      ? '사용 가능한 이메일입니다.'
                      : emailAvailability.status === 'unavailable'
                        ? '이미 사용 중인 이메일입니다.'
                        : '')}
                </p>
              </div>

              <div className="signup-form__group">
                <label className="signup-form__label" htmlFor="nickname">
                  닉네임*
                </label>
                <div className="signup-form__input-row">
                  <input
                    id="nickname"
                    name="nickname"
                    type="text"
                    className="signup-form__input"
                    placeholder="2~10자로 입력하세요"
                    autoComplete="nickname"
                    value={values.nickname}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    aria-invalid={
                      Boolean(fieldErrors.nickname) ||
                      nicknameAvailability.status === 'unavailable'
                    }
                    aria-describedby="signup-nickname-helper"
                  />
                  <button
                    type="button"
                    className="signup-form__check-button"
                    onClick={handleNicknameAvailabilityCheck}
                    disabled={
                      Boolean(localErrors.nickname) ||
                      nicknameAvailability.status === 'checking'
                    }
                  >
                    중복 확인
                  </button>
                </div>
                <p
                  id="signup-nickname-helper"
                  className={`signup-form__helper ${
                    !fieldErrors.nickname &&
                    nicknameAvailability.status === 'available'
                      ? 'is-available'
                      : ''
                  }`}
                >
                  {fieldErrors.nickname ||
                    (nicknameCheckRequired
                      ? '닉네임 중복 확인을 진행해주세요.'
                      : nicknameAvailability.status === 'available'
                        ? '사용 가능한 닉네임입니다.'
                        : nicknameAvailability.status === 'unavailable'
                          ? '이미 사용 중인 닉네임입니다.'
                          : '')}
                </p>
              </div>

              <div className="signup-form__group">
                <label className="signup-form__label" htmlFor="password">
                  비밀번호*
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  className="signup-form__input"
                  placeholder="비밀번호를 입력하세요"
                  autoComplete="new-password"
                  value={values.password}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby="signup-password-helper"
                />
                <p
                  id="signup-password-helper"
                  className={`signup-form__helper ${
                    fieldErrors.password ? '' : 'is-guide'
                  }`}
                >
                  {fieldErrors.password ||
                    '8~20자의 대문자, 소문자, 숫자, 특수문자를 모두 포함해주세요.'}
                </p>
              </div>

              <div className="signup-form__group">
                <label
                  className="signup-form__label"
                  htmlFor="passwordConfirm"
                >
                  비밀번호 확인*
                </label>
                <input
                  id="passwordConfirm"
                  name="passwordConfirm"
                  type="password"
                  className="signup-form__input"
                  placeholder="비밀번호를 한 번 더 입력하세요"
                  autoComplete="new-password"
                  value={values.passwordConfirm}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  aria-invalid={Boolean(fieldErrors.passwordConfirm)}
                  aria-describedby="signup-password-confirm-helper"
                />
                <p
                  id="signup-password-confirm-helper"
                  className="signup-form__helper"
                >
                  {fieldErrors.passwordConfirm}
                </p>
              </div>

              {submitError && (
                <p className="signup-form__submit-error" role="alert">
                  {submitError}
                </p>
              )}

              {availabilityErrorReason && (
                <p className="signup-form__network-error" role="alert">
                  {availabilityErrorReason === 'timeout'
                    ? '중복 확인 요청 시간이 초과되었습니다. 다시 시도해주세요.'
                    : '중복 확인 요청에 실패했습니다. 네트워크 연결을 확인해주세요.'}
                </p>
              )}

              <button
                type="submit"
                className="signup-form__submit"
                disabled={!canSubmit}
              >
                {isSubmitting ? '가입 중...' : '회원가입'}
              </button>
            </form>

            <button
              type="button"
              className="signup-login-link"
              onClick={() => navigate('/login')}
            >
              로그인하러 가기
            </button>
          </section>
        </div>
      </main>

      {showNetworkSpinner && (
        <Portal>
          <div
            className="signup-loading-overlay"
            role="status"
            aria-live="polite"
          >
            <span
              className="signup-loading-overlay__spinner"
              aria-hidden="true"
            />
            <p>서버 응답을 기다리는 중입니다.</p>
          </div>
        </Portal>
      )}
    </>
  );
}
