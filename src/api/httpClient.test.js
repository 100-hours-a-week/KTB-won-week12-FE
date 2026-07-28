import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ApiError from './ApiError';
import { request } from './httpClient';
import {
  clearAccessToken,
  registerRefreshHandler,
  setAccessToken,
} from '../auth/authStore';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

describe('httpClient', () => {
  let unregisterRefreshHandler;

  beforeEach(() => {
    clearAccessToken();
    unregisterRefreshHandler = undefined;
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    unregisterRefreshHandler?.();
    clearAccessToken();
    vi.unstubAllGlobals();
  });

  it('API 경로와 쿠키 포함 설정으로 공개 GET 요청을 전송한다', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ data: [] }));

    await request('/boards', {
      auth: false,
      retryOnUnauthorized: false,
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      '/api/boards',
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
      }),
    );
  });

  it('객체 본문을 JSON으로 변환하고 Access Token을 헤더에 넣는다', async () => {
    setAccessToken('access-token');
    fetch.mockResolvedValueOnce(jsonResponse({ data: { id: 1 } }));

    await request('/boards', {
      method: 'POST',
      body: { title: '제목', content: '내용' },
    });

    const [, options] = fetch.mock.calls[0];

    expect(options.body).toBe(
      JSON.stringify({ title: '제목', content: '내용' }),
    );
    expect(options.headers.get('Content-Type')).toBe('application/json');
    expect(options.headers.get('Authorization')).toBe(
      'Bearer access-token',
    );
  });

  it('첫 401 응답에서 세션을 갱신하고 새 Access Token으로 한 번 재시도한다', async () => {
    setAccessToken('expired-token');
    const refreshHandler = vi.fn(async () => {
      setAccessToken('refreshed-token');
      return 'refreshed-token';
    });
    unregisterRefreshHandler = registerRefreshHandler(refreshHandler);

    fetch
      .mockResolvedValueOnce(
        jsonResponse({ code: 'USER_UNAUTHENTICATED' }, 401),
      )
      .mockResolvedValueOnce(jsonResponse({ data: { id: 1 } }));

    await request('/users/me');

    expect(refreshHandler).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);

    const [, firstOptions] = fetch.mock.calls[0];
    const [, retryOptions] = fetch.mock.calls[1];

    expect(firstOptions.headers.get('Authorization')).toBe(
      'Bearer expired-token',
    );
    expect(retryOptions.headers.get('Authorization')).toBe(
      'Bearer refreshed-token',
    );
  });

  it('재시도한 요청도 401이면 더 이상 Refresh를 반복하지 않는다', async () => {
    setAccessToken('expired-token');
    const refreshHandler = vi.fn(async () => {
      setAccessToken('still-invalid-token');
      return 'still-invalid-token';
    });
    unregisterRefreshHandler = registerRefreshHandler(refreshHandler);

    fetch
      .mockResolvedValueOnce(
        jsonResponse({ code: 'USER_UNAUTHENTICATED' }, 401),
      )
      .mockResolvedValueOnce(
        jsonResponse({ code: 'USER_UNAUTHENTICATED' }, 401),
      );

    await expect(request('/users/me')).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
    });

    expect(refreshHandler).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('실패 응답의 상태와 오류 정보를 ApiError로 보존한다', async () => {
    fetch.mockResolvedValueOnce(
      jsonResponse(
        {
          code: 'INVALID_INPUT',
          message: '입력값이 올바르지 않습니다.',
          data: { title: '제목은 필수입니다.' },
        },
        400,
      ),
    );

    const error = await request('/boards', {
      auth: false,
      retryOnUnauthorized: false,
    }).catch((caughtError) => caughtError);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: 'INVALID_INPUT',
      message: '입력값이 올바르지 않습니다.',
      data: { title: '제목은 필수입니다.' },
    });
  });
});
