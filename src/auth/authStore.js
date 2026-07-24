// 브라우저 저장소가 아닌 현재 JavaScript 실행 메모리에만 Access Token 보관
let accessToken = null;

// httpClient가 React 컴포넌트를 알지 않고 Refresh를 요청하기 위한 함수 참조
let refreshHandler = null;

// 모든 인증 API 요청에서 동일한 최신 Access Token 조회
export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token) {
  accessToken = token;
}

export function clearAccessToken() {
  accessToken = null;
}

export function registerRefreshHandler(handler) {
  // 실제 Refresh 로직은 상태를 관리하는 AuthProvider에서 전달
  refreshHandler = handler;

  // 이전 Provider의 cleanup이 새 Handler를 제거하지 않도록 같은 함수인 경우에만 해제
  return () => {
    if (refreshHandler === handler) {
      refreshHandler = null;
    }
  };
}

export function refreshAuthSession() {
  // Provider 연결 전에 보호 API가 호출된 경우 무한 대기하지 않고 오류 반환
  if (!refreshHandler) {
    throw new Error('인증 갱신 기능이 아직 준비되지 않았습니다.');
  }

  return refreshHandler();
}
