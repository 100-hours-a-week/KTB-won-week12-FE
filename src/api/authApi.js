import { request } from './httpClient';

export async function login({ email, password }) {
  // 로그인 요청은 아직 Access Token이 없으며 401 자동 Refresh 대상에서 제외
  const response = await request('/auth/login', {
    method: 'POST',
    body: { email, password },
    auth: false,
    retryOnUnauthorized: false,
  });
  const accessToken = response?.data?.accessToken;

  // 로그인 성공 응답에 Access Token이 없으면 세션을 시작할 수 없으므로 오류 반환
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new TypeError('로그인 응답 형식이 올바르지 않습니다.');
  }

  return accessToken;
}

async function checkAvailability(   //사용자 입력값(닉네임, 이메일) 중복 체크
  path,
  queryName,
  value,
  { signal } = {},
) {
  const searchParams = new URLSearchParams({ [queryName]: value });
  const response = await request(`${path}?${searchParams.toString()}`, {
    auth: false,
    retryOnUnauthorized: false,
    signal,
  });
  const available = response?.data?.available;

  // 중복 확인 응답은 반드시 true 또는 false 값이어야 함
  if (typeof available !== 'boolean') {
    throw new TypeError('중복 확인 응답 형식이 올바르지 않습니다.');
  }

  return available;
}

export function checkEmailAvailability(email, options) {
  return checkAvailability(
    '/users/email-availability',
    'email',
    email,
    options,
  );
}

export function checkNicknameAvailability(nickname, options) {
  return checkAvailability(
    '/users/nickname-availability',
    'nickname',
    nickname,
    options,
  );
}

export async function signup(
  { email, nickname, password },
  { signal } = {},
) {
  // 회원가입은 Access Token이 없는 공개 요청이며 자동 Refresh 대상에서 제외
  const response = await request('/auth/signup', {
    method: 'POST',
    body: {
      email,
      nickname,
      password,
    },
    auth: false,
    retryOnUnauthorized: false,
    signal,
  });
  const user = response?.data;

  // 가입 완료 후 사용할 최소 사용자 식별 정보가 있는지 확인
  if (user?.id == null || typeof user.email !== 'string') {
    throw new TypeError('회원가입 응답 형식이 올바르지 않습니다.');
  }

  return user;
}

export async function getCsrfToken() {
  // CSRF 발급은 Access Token이 필요 없으며 401 자동 Refresh 대상에서 제외
  const response = await request('/auth/csrf', {
    auth: false,
    retryOnUnauthorized: false,
  });

  // Spring Security의 CsrfToken 응답에서 실제 헤더 이름과 토큰 확인
  if (
    typeof response?.token !== 'string' ||
    typeof response?.headerName !== 'string'
  ) {
    throw new TypeError('CSRF Token 응답 형식이 올바르지 않습니다.');
  }

  return {
    token: response.token,
    headerName: response.headerName,
  };
}

export async function refreshAccessToken({ token, headerName }) {
  // Spring이 반환한 headerName을 사용해 XSRF-TOKEN 쿠키와 검증
  const response = await request('/auth/refresh', {
    method: 'POST',
    headers: {
      [headerName]: token,
    },
    // Refresh 요청에서 다시 Refresh를 시도하는 무한 재귀 방지
    auth: false,
    retryOnUnauthorized: false,
  });
  const accessToken = response?.data?.accessToken;

  // 200 응답이어도 토큰이 없으면 잘못된 응답으로 처리
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new TypeError('Access Token 갱신 응답 형식이 올바르지 않습니다.');
  }

  return accessToken;
}

export async function logout({ token, headerName }) {
  // Logout도 Refresh와 동일하게 CSRF 쿠키와 헤더 검증 필요
  await request('/auth/logout', {
    method: 'POST',
    headers: {
      [headerName]: token,
    },
    auth: false,
    retryOnUnauthorized: false,
  });
}
