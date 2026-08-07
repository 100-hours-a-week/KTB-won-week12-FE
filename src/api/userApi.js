import { request } from './httpClient';

function hasNullableStringProperty(object, key) {
  return (
    object != null &&
    Object.prototype.hasOwnProperty.call(object, key) &&
    (object[key] == null || typeof object[key] === 'string')
  );
}

export async function getCurrentUser({ signal } = {}) {
  const response = await request('/users/me', { signal });
  const user = response?.data;

  // 헤더와 사용자 화면에서 필요한 최소 사용자 정보 확인
  if (
    typeof user?.email !== 'string' ||
    typeof user?.nickname !== 'string' ||
    !hasNullableStringProperty(user, 'profileImageObjectKey') ||
    !hasNullableStringProperty(user, 'profileImage')
  ) {
    throw new TypeError('사용자 정보 응답 형식이 올바르지 않습니다.');
  }

  return user;
}

export async function updateCurrentUser({
  nickname,
  profileImageObjectKey,
}) {
  const response = await request('/users/me', {
    method: 'PATCH',
    // 만료되는 조회 URL이 아니라 DB에 저장할 S3 Object Key를 전송
    body: { nickname, profileImageObjectKey },
  });
  const user = response?.data;

  if (
    typeof user?.nickname !== 'string' ||
    !hasNullableStringProperty(user, 'profileImageObjectKey') ||
    !hasNullableStringProperty(user, 'profileImage')
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
