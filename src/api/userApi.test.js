import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  changeCurrentUserPassword,
  deleteCurrentUser,
  getCurrentUser,
  updateCurrentUser,
} from './userApi';
import { request } from './httpClient';

vi.mock('./httpClient', () => ({ request: vi.fn() }));

describe('userApi', () => {
  beforeEach(() => request.mockReset());

  it('현재 사용자 응답의 이메일과 닉네임을 검증한다', async () => {
    const user = {
      email: 'user@example.com',
      nickname: '테스터',
      profileImage: null,
    };
    request.mockResolvedValueOnce({ data: user });

    await expect(getCurrentUser()).resolves.toBe(user);
    expect(request).toHaveBeenCalledWith('/users/me', { signal: undefined });

    request.mockResolvedValueOnce({ data: { email: 'user@example.com' } });
    await expect(getCurrentUser()).rejects.toThrow(
      '사용자 정보 응답 형식이 올바르지 않습니다.',
    );
  });

  it('닉네임과 프로필 URL로 사용자 정보를 수정한다', async () => {
    const updatedUser = { nickname: '새닉네임', profileImage: null };
    request.mockResolvedValueOnce({ data: updatedUser });

    await expect(
      updateCurrentUser({ nickname: '새닉네임', profileImage: null }),
    ).resolves.toBe(updatedUser);
    expect(request).toHaveBeenCalledWith('/users/me', {
      method: 'PATCH',
      body: { nickname: '새닉네임', profileImage: null },
    });
  });

  it('현재 비밀번호와 새 비밀번호로 변경 요청을 보낸다', async () => {
    request.mockResolvedValueOnce(null);

    await changeCurrentUserPassword({
      originalPassword: 'Original1!',
      changedPassword: 'Changed1!',
    });
    expect(request).toHaveBeenCalledWith('/users/me/password', {
      method: 'PUT',
      body: {
        originalPassword: 'Original1!',
        changedPassword: 'Changed1!',
      },
    });
  });

  it('선택 입력인 탈퇴 사유를 DELETE 본문으로 전송한다', async () => {
    request.mockResolvedValueOnce(null);

    await deleteCurrentUser('서비스 이용 종료');
    expect(request).toHaveBeenCalledWith('/users/me', {
      method: 'DELETE',
      body: { deleteReason: '서비스 이용 종료' },
    });
  });
});
