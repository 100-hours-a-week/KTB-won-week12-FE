import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkEmailAvailability,
  getCsrfToken,
  login,
  refreshAccessToken,
  signup,
} from './authApi';
import { request } from './httpClient';

vi.mock('./httpClient', () => ({
  request: vi.fn(),
}));

describe('authApi', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it('로그인 응답에서 Access Token을 반환한다', async () => {
    request.mockResolvedValueOnce({
      data: { accessToken: 'access-token' },
    });

    await expect(
      login({ email: 'user@example.com', password: 'Password1!' }),
    ).resolves.toBe('access-token');

    expect(request).toHaveBeenCalledWith('/auth/login', {
      method: 'POST',
      body: {
        email: 'user@example.com',
        password: 'Password1!',
      },
      auth: false,
      retryOnUnauthorized: false,
    });
  });

  it('로그인 성공 응답에 Access Token이 없으면 거부한다', async () => {
    request.mockResolvedValueOnce({ data: {} });

    await expect(
      login({ email: 'user@example.com', password: 'Password1!' }),
    ).rejects.toThrow('로그인 응답 형식이 올바르지 않습니다.');
  });

  it('이메일 중복 확인 값과 쿼리 문자열을 검증한다', async () => {
    request.mockResolvedValueOnce({ data: { available: true } });

    await expect(
      checkEmailAvailability('user+test@example.com'),
    ).resolves.toBe(true);

    expect(request).toHaveBeenCalledWith(
      '/users/email-availability?email=user%2Btest%40example.com',
      {
        auth: false,
        retryOnUnauthorized: false,
        signal: undefined,
      },
    );
  });

  it('중복 확인 응답이 boolean이 아니면 거부한다', async () => {
    request.mockResolvedValueOnce({ data: { available: 'true' } });

    await expect(
      checkEmailAvailability('user@example.com'),
    ).rejects.toThrow('중복 확인 응답 형식이 올바르지 않습니다.');
  });

  it('회원가입에는 프로필 이미지 없이 필수 계정 정보만 전송한다', async () => {
    const joinedUser = { id: 1, email: 'user@example.com' };
    const signal = new AbortController().signal;
    request.mockResolvedValueOnce({ data: joinedUser });

    await expect(
      signup(
        {
          email: 'user@example.com',
          nickname: '테스터',
          password: 'Password1!',
        },
        { signal },
      ),
    ).resolves.toBe(joinedUser);

    // 프로필 이미지는 로그인 후 회원정보 수정에서만 등록한다.
    expect(request).toHaveBeenCalledWith('/auth/signup', {
      method: 'POST',
      body: {
        email: 'user@example.com',
        nickname: '테스터',
        password: 'Password1!',
      },
      auth: false,
      retryOnUnauthorized: false,
      signal,
    });
  });

  it('CSRF Token과 헤더 이름을 반환한다', async () => {
    request.mockResolvedValueOnce({
      token: 'csrf-token',
      headerName: 'X-XSRF-TOKEN',
    });

    await expect(getCsrfToken()).resolves.toEqual({
      token: 'csrf-token',
      headerName: 'X-XSRF-TOKEN',
    });
  });

  it('CSRF 헤더를 사용해 Access Token을 갱신한다', async () => {
    request.mockResolvedValueOnce({
      data: { accessToken: 'refreshed-token' },
    });

    await expect(
      refreshAccessToken({
        token: 'csrf-token',
        headerName: 'X-XSRF-TOKEN',
      }),
    ).resolves.toBe('refreshed-token');

    expect(request).toHaveBeenCalledWith('/auth/refresh', {
      method: 'POST',
      headers: {
        'X-XSRF-TOKEN': 'csrf-token',
      },
      auth: false,
      retryOnUnauthorized: false,
    });
  });

  it('Refresh 응답에 Access Token이 없으면 거부한다', async () => {
    request.mockResolvedValueOnce({ data: {} });

    await expect(
      refreshAccessToken({
        token: 'csrf-token',
        headerName: 'X-XSRF-TOKEN',
      }),
    ).rejects.toThrow('Access Token 갱신 응답 형식이 올바르지 않습니다.');
  });
});
