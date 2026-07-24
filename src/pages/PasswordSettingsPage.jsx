import { useState } from 'react';
import AccountSettingsLayout from '../components/AccountSettingsLayout';
import { changeCurrentUserPassword } from '../api/userApi';
import { getUserFriendlyErrorMessage } from '../utils/errorMessage';
import {
  validatePassword,
  validatePasswordConfirm,
} from '../utils/validation';
import '../styles/pages/AccountSettingsForms.css';

const INITIAL_VALUES = {
  originalPassword: '',
  changedPassword: '',
  changedPasswordConfirm: '',
};

export default function PasswordSettingsPage() {
  const [values, setValues] = useState(INITIAL_VALUES);
  const [touchedFields, setTouchedFields] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const errors = {
    originalPassword: values.originalPassword
      ? ''
      : '현재 비밀번호를 입력해주세요.',
    changedPassword: validatePassword(values.changedPassword),
    changedPasswordConfirm: validatePasswordConfirm(
      values.changedPassword,
      values.changedPasswordConfirm,
    ),
  };

  if (
    !errors.changedPassword &&
    values.originalPassword === values.changedPassword
  ) {
    errors.changedPassword =
      '새 비밀번호는 현재 비밀번호와 다르게 입력해주세요.';
  }

  const canSubmit =
    Object.values(errors).every((error) => !error) && !isSubmitting;

  function handleChange(event) {
    const { name, value } = event.target;
    setValues((currentValues) => ({
      ...currentValues,
      [name]: value,
    }));
    setSubmitError('');
    setSuccessMessage('');
  }

  function handleBlur(event) {
    setTouchedFields((currentFields) => ({
      ...currentFields,
      [event.target.name]: true,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setTouchedFields({
      originalPassword: true,
      changedPassword: true,
      changedPasswordConfirm: true,
    });
    setSubmitError('');
    setSuccessMessage('');

    if (!canSubmit) {
      return;
    }

    setIsSubmitting(true);

    try {
      await changeCurrentUserPassword({
        originalPassword: values.originalPassword,
        changedPassword: values.changedPassword,
      });
      setValues(INITIAL_VALUES);
      setTouchedFields({});
      setSuccessMessage('비밀번호가 수정되었습니다.');
    } catch (error) {
      setSubmitError(
        getUserFriendlyErrorMessage(error, {
          fallback: '비밀번호를 수정하지 못했습니다.',
          codeMessages: {
            PASSWORD_INCORRECT:
              '현재 비밀번호가 올바르지 않습니다.',
            PASSWORD_ALREADY_USED:
              '기존 비밀번호와 다른 비밀번호를 입력해주세요.',
          },
        }),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AccountSettingsLayout
      eyebrow="계정 보안"
      title="비밀번호 수정"
      description="다른 서비스에서 사용하지 않는 새로운 비밀번호를 권장합니다."
    >
      <form className="account-form" noValidate onSubmit={handleSubmit}>
        <div className="account-form__group">
          <label htmlFor="original-password">현재 비밀번호</label>
          <input
            id="original-password"
            name="originalPassword"
            type="password"
            autoComplete="current-password"
            placeholder="현재 비밀번호를 입력하세요"
            value={values.originalPassword}
            onChange={handleChange}
            onBlur={handleBlur}
            aria-invalid={
              touchedFields.originalPassword &&
              Boolean(errors.originalPassword)
            }
          />
          <p className="account-form__helper">
            {touchedFields.originalPassword && errors.originalPassword}
          </p>
        </div>

        <div className="account-form__group">
          <label htmlFor="changed-password">새 비밀번호</label>
          <input
            id="changed-password"
            name="changedPassword"
            type="password"
            autoComplete="new-password"
            placeholder="새 비밀번호를 입력하세요"
            value={values.changedPassword}
            onChange={handleChange}
            onBlur={handleBlur}
            aria-invalid={
              touchedFields.changedPassword &&
              Boolean(errors.changedPassword)
            }
          />
          <p className="account-form__helper">
            {touchedFields.changedPassword && errors.changedPassword}
          </p>
        </div>

        <div className="account-form__group">
          <label htmlFor="changed-password-confirm">
            새 비밀번호 확인
          </label>
          <input
            id="changed-password-confirm"
            name="changedPasswordConfirm"
            type="password"
            autoComplete="new-password"
            placeholder="새 비밀번호를 한 번 더 입력하세요"
            value={values.changedPasswordConfirm}
            onChange={handleChange}
            onBlur={handleBlur}
            aria-invalid={
              touchedFields.changedPasswordConfirm &&
              Boolean(errors.changedPasswordConfirm)
            }
          />
          <p className="account-form__helper">
            {touchedFields.changedPasswordConfirm &&
              errors.changedPasswordConfirm}
          </p>
        </div>

        {submitError && (
          <p className="account-form__message is-error" role="alert">
            {submitError}
          </p>
        )}
        {successMessage && (
          <p className="account-form__message is-success" role="status">
            {successMessage}
          </p>
        )}

        <button
          type="submit"
          className="account-form__submit"
          disabled={!canSubmit}
        >
          {isSubmitting ? '수정 중...' : '비밀번호 수정'}
        </button>
      </form>
    </AccountSettingsLayout>
  );
}
