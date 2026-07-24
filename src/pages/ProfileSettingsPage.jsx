import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { checkNicknameAvailability } from '../api/authApi';
import {
  deleteCurrentUser,
  updateCurrentUser,
} from '../api/userApi';
import { useAuth } from '../auth/AuthContext';
import AccountSettingsLayout from '../components/AccountSettingsLayout';
import ConfirmModal from '../components/ConfirmModal';
import useAvailabilityCheck from '../hooks/useAvailabilityCheck';
import { getUserFriendlyErrorMessage } from '../utils/errorMessage';
import { validateNickname } from '../utils/validation';
import '../styles/pages/AccountSettingsForms.css';

export default function ProfileSettingsPage() {
  const navigate = useNavigate();
  const nicknameAvailability = useAvailabilityCheck(
    checkNicknameAvailability,
  );
  const {
    currentUser,
    isCurrentUserLoading,
    currentUserError,
    reloadCurrentUser,
    replaceCurrentUser,
    clearSession,
  } = useAuth();

  const [nickname, setNickname] = useState('');
  const [initialValues, setInitialValues] = useState(null);
  const [isTouched, setIsTouched] = useState(false);
  const [nicknameCheckRequired, setNicknameCheckRequired] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // S3 업로드 도입 전까지 선택 파일과 브라우저 임시 미리보기만 관리
  const [selectedProfileImage, setSelectedProfileImage] = useState(null);
  const [profilePreviewUrl, setProfilePreviewUrl] = useState('');
  const [profileImageError, setProfileImageError] = useState('');
  const profilePreviewUrlRef = useRef('');
  const profileImageInputRef = useRef(null);

  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState('');

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    const nextValues = {
      nickname: currentUser.nickname,
      profileImage: currentUser.profileImage ?? null,
    };

    setNickname(nextValues.nickname);
    setInitialValues(nextValues);
  }, [currentUser]);

  useEffect(
    () => () => {
      // 페이지 이동 시 브라우저가 만든 blob 미리보기 URL 해제
      if (profilePreviewUrlRef.current) {
        URL.revokeObjectURL(profilePreviewUrlRef.current);
      }
    },
    [],
  );

  const nicknameError = validateNickname(nickname);
  const isNicknameUnchanged =
    initialValues != null && nickname === initialValues.nickname;
  const isNicknameChecked =
    isNicknameUnchanged ||
    (nicknameAvailability.status === 'available' &&
      nicknameAvailability.checkedValue === nickname);
  const isDirty =
    initialValues != null && nickname !== initialValues.nickname;
  const canSubmit =
    !nicknameError &&
    isNicknameChecked &&
    isDirty &&
    !isSubmitting &&
    currentUser != null;
  const previewUrl =
    profilePreviewUrl || currentUser?.profileImage || '';

  function handleNicknameChange(event) {
    setNickname(event.target.value);
    nicknameAvailability.reset();
    setNicknameCheckRequired(false);
    setSubmitError('');
    setSuccessMessage('');
  }

  function clearProfilePreview() {
    if (profilePreviewUrlRef.current) {
      URL.revokeObjectURL(profilePreviewUrlRef.current);
      profilePreviewUrlRef.current = '';
    }

    setSelectedProfileImage(null);
    setProfilePreviewUrl('');

    if (profileImageInputRef.current) {
      // 같은 파일을 다시 골라도 change 이벤트가 발생하도록 input 초기화
      profileImageInputRef.current.value = '';
    }
  }

  function handleProfileImageChange(event) {
    const [file] = event.target.files;
    setProfileImageError('');
    setSubmitError('');
    setSuccessMessage('');

    if (!file) {
      clearProfilePreview();
      return;
    }

    if (!file.type.startsWith('image/')) {
      clearProfilePreview();
      setProfileImageError('이미지 파일만 선택할 수 있습니다.');
      return;
    }

    // 이전 파일의 임시 URL을 먼저 해제한 후 새 미리보기 생성
    clearProfilePreview();
    const nextPreviewUrl = URL.createObjectURL(file);
    profilePreviewUrlRef.current = nextPreviewUrl;
    setSelectedProfileImage(file);
    setProfilePreviewUrl(nextPreviewUrl);
  }

  function removeProfileImage() {
    clearProfilePreview();
    setProfileImageError('');
    setSubmitError('');
    setSuccessMessage('');
  }

  async function handleNicknameAvailabilityCheck() {
    const localError = validateNickname(nickname);
    setIsTouched(true);
    setNicknameCheckRequired(false);
    setSubmitError('');
    setSuccessMessage('');

    if (localError || isNicknameUnchanged) {
      return;
    }

    // 현재 닉네임이 아닌 새 닉네임만 공개 중복 확인 API로 검사
    await nicknameAvailability.check(nickname);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setIsTouched(true);
    setSubmitError('');
    setSuccessMessage('');

    if (!nicknameError && !isNicknameChecked) {
      // Enter 키 제출도 명시적인 닉네임 중복 확인을 건너뛰지 않도록 차단
      setNicknameCheckRequired(true);
      return;
    }

    if (!canSubmit) {
      return;
    }

    setIsSubmitting(true);

    try {
      const updatedUser = await updateCurrentUser({
        nickname: nickname.trim(),
        // 업로드 API 도입 전에는 선택한 로컬 파일 대신 기존 서버 URL 유지
        profileImage: initialValues.profileImage,
      });
      const nextCurrentUser = {
        email: currentUser.email,
        nickname: updatedUser.nickname,
        profileImage: updatedUser.profileImage,
      };

      // 헤더 프로필도 즉시 변경되도록 AuthProvider의 사용자 상태 교체
      replaceCurrentUser(nextCurrentUser);
      setInitialValues({
        nickname: nextCurrentUser.nickname,
        profileImage: nextCurrentUser.profileImage ?? null,
      });
      nicknameAvailability.reset();
      clearProfilePreview();
      setSuccessMessage('회원정보가 수정되었습니다.');
    } catch (error) {
      setSubmitError(
        getUserFriendlyErrorMessage(error, {
          fallback: '회원정보를 수정하지 못했습니다.',
          codeMessages: {
            NICKNAME_ALREADY_EXISTS:
              '이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해주세요.',
          },
        }),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function openWithdrawModal() {
    setWithdrawError('');
    setIsWithdrawModalOpen(true);
  }

  function closeWithdrawModal() {
    if (!isWithdrawing) {
      setIsWithdrawModalOpen(false);
      setWithdrawError('');
    }
  }

  async function confirmWithdrawal() {
    if (isWithdrawing) {
      return;
    }

    setIsWithdrawing(true);
    setWithdrawError('');

    try {
      await deleteCurrentUser(deleteReason.trim());

      // 백엔드가 Refresh 쿠키를 만료하므로 프론트 메모리 토큰도 즉시 제거
      clearSession();
      navigate('/boards', { replace: true });
    } catch (error) {
      setWithdrawError(
        getUserFriendlyErrorMessage(error, {
          fallback: '회원 탈퇴 요청을 처리하지 못했습니다.',
        }),
      );
    } finally {
      setIsWithdrawing(false);
    }
  }

  return (
    <AccountSettingsLayout
      eyebrow="계정 관리"
      title="회원정보 수정"
      description="닉네임과 프로필 이미지는 게시글과 댓글에 함께 표시됩니다."
    >
      {isCurrentUserLoading && !currentUser && (
        <p className="account-form-status">사용자 정보를 불러오는 중...</p>
      )}

      {currentUserError && !currentUser && (
        <div className="account-form-status is-error" role="alert">
          {currentUserError}
          <button type="button" onClick={reloadCurrentUser}>
            다시 시도
          </button>
        </div>
      )}

      {currentUser && (
        <>
          <form className="account-form" noValidate onSubmit={handleSubmit}>
            <div className="account-profile">
              <span className="account-form__label">프로필 이미지</span>
              <label
                className="account-profile-preview"
                htmlFor="settings-profile-image"
                aria-label={
                  previewUrl
                    ? '프로필 이미지 변경'
                    : '프로필 이미지 추가'
                }
              >
                {previewUrl ? (
                  <img src={previewUrl} alt="프로필 미리보기" />
                ) : (
                  <span aria-hidden="true">+</span>
                )}
                {previewUrl && (
                  <span className="account-profile-preview__overlay">
                    변경
                  </span>
                )}
              </label>
              <input
                ref={profileImageInputRef}
                id="settings-profile-image"
                type="file"
                className="account-profile__input"
                accept="image/*"
                onChange={handleProfileImageChange}
                aria-invalid={Boolean(profileImageError)}
                aria-describedby="settings-profile-image-helper"
              />

              {selectedProfileImage && (
                <div className="account-profile__selection">
                  <span>{selectedProfileImage.name}</span>
                  <button type="button" onClick={removeProfileImage}>
                    제거
                  </button>
                </div>
              )}

              <p
                id="settings-profile-image-helper"
                className={`account-form__helper ${
                  profileImageError ? '' : 'is-guide'
                }`}
              >
                {profileImageError ||
                  '현재는 미리보기만 제공되며 저장되지 않습니다.'}
              </p>
            </div>

            <div className="account-form__group">
              <label>이메일</label>
              <p className="account-form__readonly">{currentUser.email}</p>
            </div>

            <div className="account-form__group">
              <label htmlFor="settings-nickname">닉네임</label>
              <div className="account-form__input-row">
                <input
                  id="settings-nickname"
                  type="text"
                  maxLength="10"
                  value={nickname}
                  onChange={handleNicknameChange}
                  onBlur={() => setIsTouched(true)}
                  aria-invalid={
                    (isTouched && Boolean(nicknameError)) ||
                    nicknameAvailability.status === 'unavailable'
                  }
                  aria-describedby="settings-nickname-helper"
                />
                <button
                  type="button"
                  className="account-form__check-button"
                  onClick={handleNicknameAvailabilityCheck}
                  disabled={
                    Boolean(nicknameError) ||
                    isNicknameUnchanged ||
                    nicknameAvailability.status === 'checking'
                  }
                >
                  중복 확인
                </button>
              </div>
              <p
                id="settings-nickname-helper"
                className={`account-form__helper ${
                  nicknameAvailability.status === 'available'
                    ? 'is-available'
                    : ''
                }`}
              >
                {(isTouched && nicknameError) ||
                  (nicknameCheckRequired
                    ? '닉네임 중복 확인을 진행해주세요.'
                    : nicknameAvailability.status === 'available'
                      ? '사용 가능한 닉네임입니다.'
                      : nicknameAvailability.status === 'unavailable'
                        ? '이미 사용 중인 닉네임입니다.'
                        : nicknameAvailability.errorReason === 'timeout'
                          ? '중복 확인 요청 시간이 초과되었습니다. 다시 시도해주세요.'
                          : nicknameAvailability.errorReason === 'network'
                            ? '중복 확인 요청에 실패했습니다. 네트워크 연결을 확인해주세요.'
                            : '')}
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
              {isSubmitting ? '수정 중...' : '수정하기'}
            </button>
          </form>

          <button
            type="button"
            className="account-withdraw-button"
            onClick={openWithdrawModal}
          >
            회원 탈퇴
          </button>
        </>
      )}

      <ConfirmModal
        isOpen={isWithdrawModalOpen}
        title="회원 탈퇴하시겠습니까?"
        description="계정 이용이 중지되며 탈퇴한 계정은 복구할 수 없습니다."
        confirmLabel="탈퇴"
        isSubmitting={isWithdrawing}
        errorMessage={withdrawError}
        onCancel={closeWithdrawModal}
        onConfirm={confirmWithdrawal}
      >
        <div className="confirm-modal__content">
          <label htmlFor="withdraw-reason">탈퇴 사유 · 선택</label>
          <textarea
            id="withdraw-reason"
            placeholder="서비스 개선을 위해 탈퇴 사유를 알려주세요."
            value={deleteReason}
            onChange={(event) => setDeleteReason(event.target.value)}
            disabled={isWithdrawing}
          />
          <p className="account-withdraw-notice">
            작성한 게시글과 댓글은 자동으로 삭제되지 않습니다.
          </p>
        </div>
      </ConfirmModal>
    </AccountSettingsLayout>
  );
}
