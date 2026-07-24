import { request } from './httpClient';

export async function getCurrentUser({ signal } = {}) {
  const response = await request('/users/me', { signal });
  const user = response?.data;

  // 헤더와 사용자 화면에서 필요한 최소 사용자 정보 확인
  if (
    typeof user?.email !== 'string' ||
    typeof user?.nickname !== 'string'
  ) {
    throw new TypeError('사용자 정보 응답 형식이 올바르지 않습니다.');
  }

  return user;
}

export async function updateCurrentUser({ nickname, profileImage }) {
  const response = await request('/users/me', {
    method: 'PATCH',
    body: { nickname, profileImage },
  });
  const user = response?.data;

  if (
    typeof user?.nickname !== 'string' ||
    !('profileImage' in user)
  ) {
    throw new TypeError('사용자 정보 수정 응답 형식이 올바르지 않습니다.');
  }

  return user;
}

export async function changeCurrentUserPassword({
  originalPassword,
  changedPassword,
}) {
  await request('/users/me/password', {
    method: 'PUT',
    body: { originalPassword, changedPassword },
  });
}

export async function deleteCurrentUser(deleteReason) {
  await request('/users/me', {
    method: 'DELETE',
    body: { deleteReason },
  });
}
