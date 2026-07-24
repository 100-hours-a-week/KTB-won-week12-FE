import ApiError from './ApiError';
import { getAccessToken, refreshAuthSession } from '../auth/authStore';

// 브라우저 요청에 /api를 붙이고 Vite/Nginx에서 제거한 뒤 백엔드로 전달
const API_PREFIX = '/api';

function createApiUrl(path) {
  // 잘못된 API URL 생성을 막기 위해 경로 형식 검증
  if (typeof path !== 'string' || !path.startsWith('/')) {
    throw new TypeError('API 경로는 /로 시작하는 문자열이어야 합니다.');
  }

  return `${API_PREFIX}${path}`;
}

async function parseResponse(response) {
  // 본문이 없는 204 응답은 JSON 파싱 없이 null 반환
  if (response.status === 204) {
    return null;
  }

  // Content-Type이 JSON인 경우 response.json()으로 변환
  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return response.json();
  }

  // JSON이 아닌 응답은 오류 분석을 위해 문자열로 보존
  const text = await response.text();
  return text || null;
}

// hasRetried는 401 이후 같은 요청이 두 번 이상 반복되는 것을 방지
async function executeRequest(
  path,
  {
    method = 'GET',
    body,
    headers,
    accessToken,
    signal,
    auth = true,
    retryOnUnauthorized = auth,
  } = {},
  hasRetried = false,
) {
  // 전달받은 Headers 원본을 수정하지 않도록 새로운 객체로 복사
  const requestHeaders = new Headers(headers);
  let requestBody = body;

  // FormData는 브라우저가 boundary를 포함한 Content-Type을 생성하므로 그대로 사용
  // 그 외 객체는 백엔드 JSON DTO가 받을 수 있도록 문자열로 변환
  if (body != null && !(body instanceof FormData)) {
    if (!requestHeaders.has('Content-Type')) {
      requestHeaders.set('Content-Type', 'application/json');
    }
    if (typeof body !== 'string') {
      requestBody = JSON.stringify(body);
    }
  }

  // 직접 전달한 토큰이 없으면 authStore에 저장된 현재 토큰 사용
  // auth=false인 CSRF, 로그인, Refresh 요청은 Authorization 헤더에서 제외
  const requestAccessToken = accessToken ?? (auth ? getAccessToken() : null);

  if (requestAccessToken) {
    requestHeaders.set('Authorization', `Bearer ${requestAccessToken}`);
  }

  const response = await fetch(createApiUrl(path), {
    method,
    headers: requestHeaders,
    body: requestBody,
    // HttpOnly Refresh Token과 XSRF-TOKEN 쿠키를 요청에 포함
    credentials: 'include',
    signal,
  });
  const responseBody = await parseResponse(response);

  if (!response.ok) {
    // 모든 실패 응답을 같은 구조로 변환해 페이지별 오류 처리 단순화
    const apiError = new ApiError({
      status: response.status,
      code: responseBody?.code,
      message: responseBody?.message,
      data: responseBody?.data,
    });

    // 인증 요청의 첫 번째 401에서만 Refresh 후 원래 요청 재시도
    if (response.status === 401 && retryOnUnauthorized && !hasRetried) {
      try {
        // 여러 요청에서 동시에 호출되어도 AuthProvider에서 하나의 Promise 공유
        await refreshAuthSession();

        // accessToken을 다시 전달하지 않고 갱신된 메모리 토큰 사용
        return executeRequest(
          path,
          {
            method,
            body,
            headers,
            signal,
            auth,
            retryOnUnauthorized,
          },
          true, // 두 번째 401에서 더 이상 반복하지 않도록 재시도 여부 전달
        );
      } catch {
        // Refresh 실패 시 원래 요청의 401을 호출자에게 전달
        throw apiError;
      }
    }

    throw apiError;
  }

  return responseBody;
}

// 외부 API 모듈에서 내부 재시도 흐름을 알 필요 없이 request 함수만 사용
export function request(path, options) {
  return executeRequest(path, options);
}
