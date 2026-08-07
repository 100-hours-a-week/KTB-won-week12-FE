import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkNicknameAvailability } from '../api/authApi';
import { deleteCurrentUser, updateCurrentUser } from '../api/userApi';
import { uploadProfileImage } from '../api/uploadApi';
import { AuthContext } from '../auth/AuthContext';
import ProfileSettingsPage from './ProfileSettingsPage';

vi.mock('../api/authApi', () => ({
  checkNicknameAvailability: vi.fn(),
}));

vi.mock('../api/userApi', () => ({
  deleteCurrentUser: vi.fn(),
  updateCurrentUser: vi.fn(),
}));

vi.mock('../api/uploadApi', () => ({
  uploadProfileImage: vi.fn(),
}));

vi.mock('../components/AppHeader', () => ({
  default: () => <header>테스트 헤더</header>,
}));

vi.mock('../components/Portal', () => ({
  default: ({ children }) => children,
}));

const CURRENT_USER = {
  email: 'user@example.com',
  nickname: '기존닉네임',
  profileImageObjectKey: 'profiles/1/old-id/original.jpg',
  profileImage: 'https://example.com/profile.jpg',
};

function renderProfileSettings(authOverrides = {}) {
  const authValue = {
    currentUser: CURRENT_USER,
    isCurrentUserLoading: false,
    currentUserError: '',
    reloadCurrentUser: vi.fn(),
    replaceCurrentUser: vi.fn(),
    clearSession: vi.fn(),
    ...authOverrides,
  };

  render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={['/settings/profile']}>
        <Routes>
          <Route path="/settings/profile" element={<ProfileSettingsPage />} />
          <Route path="/settings/password" element={<div>비밀번호 설정 도착</div>} />
          <Route path="/boards" element={<div>게시글 목록 도착</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );

  return authValue;
}

describe('ProfileSettingsPage', () => {
  beforeEach(() => {
    checkNicknameAvailability.mockReset();
    updateCurrentUser.mockReset();
    uploadProfileImage.mockReset();
    deleteCurrentUser.mockReset();
    checkNicknameAvailability.mockResolvedValue(true);
    updateCurrentUser.mockResolvedValue({
      nickname: '새닉네임',
      profileImageObjectKey: CURRENT_USER.profileImageObjectKey,
      profileImage: CURRENT_USER.profileImage,
    });
    uploadProfileImage.mockResolvedValue(
      'profiles/1/new-id/original.png',
    );
    deleteCurrentUser.mockResolvedValue(undefined);

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:new-profile'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
  });

  it('현재 사용자 정보를 표시하고 변경 전 제출을 막는다', async () => {
    renderProfileSettings();

    expect(await screen.findByDisplayValue('기존닉네임')).toBeInTheDocument();
    expect(screen.getByText('user@example.com')).toBeInTheDocument();
    expect(screen.getByAltText('프로필 미리보기')).toHaveAttribute(
      'src',
      CURRENT_USER.profileImage,
    );
    expect(screen.getByRole('button', { name: '중복 확인' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '수정하기' })).toBeDisabled();
  });

  it('새 닉네임의 중복 확인 후 사용자 상태를 교체한다', async () => {
    const user = userEvent.setup();
    const authValue = renderProfileSettings();
    const nicknameInput = await screen.findByLabelText('닉네임');

    await user.clear(nicknameInput);
    await user.type(nicknameInput, '새닉네임');
    await user.click(screen.getByRole('button', { name: '중복 확인' }));
    expect(await screen.findByText('사용 가능한 닉네임입니다.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '수정하기' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      '회원정보가 수정되었습니다.',
    );
    expect(checkNicknameAvailability).toHaveBeenCalledWith('새닉네임', {
      signal: expect.any(AbortSignal),
    });
    expect(updateCurrentUser).toHaveBeenCalledWith({
      nickname: '새닉네임',
      profileImageObjectKey: CURRENT_USER.profileImageObjectKey,
    });
    expect(authValue.replaceCurrentUser).toHaveBeenCalledWith({
      email: CURRENT_USER.email,
      nickname: '새닉네임',
      profileImageObjectKey: CURRENT_USER.profileImageObjectKey,
      profileImage: CURRENT_USER.profileImage,
    });
  });

  it('중복 확인 없이 폼을 제출하면 확인 안내를 표시한다', async () => {
    const user = userEvent.setup();
    renderProfileSettings();
    const nicknameInput = await screen.findByLabelText('닉네임');

    await user.clear(nicknameInput);
    await user.type(nicknameInput, '확인필요');
    fireEvent.submit(nicknameInput.closest('form'));

    expect(
      await screen.findByText('닉네임 중복 확인을 진행해주세요.'),
    ).toBeInTheDocument();
    expect(updateCurrentUser).not.toHaveBeenCalled();
  });

  it('새 프로필 이미지를 미리 표시하고 선택을 취소할 수 있다', async () => {
    const user = userEvent.setup();
    renderProfileSettings();
    const imageFile = new File(['image'], 'new-profile.png', {
      type: 'image/png',
    });

    await user.upload(screen.getByLabelText('프로필 이미지 변경'), imageFile);

    expect(URL.createObjectURL).toHaveBeenCalledWith(imageFile);
    expect(screen.getByAltText('프로필 미리보기')).toHaveAttribute(
      'src',
      'blob:new-profile',
    );
    expect(screen.getByText('new-profile.png')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '선택 취소' }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:new-profile');
    expect(screen.getByAltText('프로필 미리보기')).toHaveAttribute(
      'src',
      CURRENT_USER.profileImage,
    );
  });

  it('새 프로필 이미지를 S3에 올린 뒤 Object Key로 사용자 정보를 수정한다', async () => {
    const user = userEvent.setup();
    const authValue = renderProfileSettings();
    const imageFile = new File(['image'], 'new-profile.png', {
      type: 'image/png',
    });
    updateCurrentUser.mockResolvedValueOnce({
      nickname: CURRENT_USER.nickname,
      profileImageObjectKey: 'profiles/1/new-id/original.png',
      profileImage: 'https://bucket.example/new-profile',
    });

    await user.upload(
      await screen.findByLabelText('프로필 이미지 변경'),
      imageFile,
    );
    await user.click(screen.getByRole('button', { name: '수정하기' }));

    // 파일 바이너리를 먼저 S3에 저장하고 성공한 Key만 PATCH 요청으로 전달한다.
    expect(uploadProfileImage).toHaveBeenCalledWith(imageFile, {
      signal: expect.any(AbortSignal),
    });
    expect(updateCurrentUser).toHaveBeenCalledWith({
      nickname: CURRENT_USER.nickname,
      profileImageObjectKey: 'profiles/1/new-id/original.png',
    });
    expect(authValue.replaceCurrentUser).toHaveBeenCalledWith({
      email: CURRENT_USER.email,
      nickname: CURRENT_USER.nickname,
      profileImageObjectKey: 'profiles/1/new-id/original.png',
      profileImage: 'https://bucket.example/new-profile',
    });
  });

  it('기존 프로필 이미지 삭제를 선택하면 null Object Key를 전송한다', async () => {
    const user = userEvent.setup();
    renderProfileSettings();
    updateCurrentUser.mockResolvedValueOnce({
      nickname: CURRENT_USER.nickname,
      profileImageObjectKey: null,
      profileImage: null,
    });

    await screen.findByDisplayValue(CURRENT_USER.nickname);
    await user.click(
      screen.getByRole('button', { name: '프로필 이미지 삭제' }),
    );
    expect(screen.getByRole('button', { name: '수정하기' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '수정하기' }));

    expect(uploadProfileImage).not.toHaveBeenCalled();
    expect(updateCurrentUser).toHaveBeenCalledWith({
      nickname: CURRENT_USER.nickname,
      profileImageObjectKey: null,
    });
  });

  it('회원 탈퇴 사유를 trim해 전송하고 세션을 제거한다', async () => {
    const user = userEvent.setup();
    const authValue = renderProfileSettings();
    await screen.findByDisplayValue('기존닉네임');

    await user.click(screen.getByRole('button', { name: '회원 탈퇴' }));
    const dialog = screen.getByRole('dialog');
    await user.type(
      within(dialog).getByLabelText('탈퇴 사유 · 선택'),
      '  서비스 이용 종료  ',
    );
    await user.click(within(dialog).getByRole('button', { name: '탈퇴' }));

    expect(await screen.findByText('게시글 목록 도착')).toBeInTheDocument();
    expect(deleteCurrentUser).toHaveBeenCalledWith('서비스 이용 종료');
    expect(authValue.clearSession).toHaveBeenCalledTimes(1);
  });

  it('사용자 조회 오류에서 동일한 조회 흐름으로 재시도한다', async () => {
    const reloadCurrentUser = vi.fn();
    const user = userEvent.setup();
    renderProfileSettings({
      currentUser: null,
      currentUserError: '사용자 조회 실패',
      reloadCurrentUser,
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('사용자 조회 실패');
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(reloadCurrentUser).toHaveBeenCalledTimes(1);
  });
});
