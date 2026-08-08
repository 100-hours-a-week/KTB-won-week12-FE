const NETWORK_ERROR_MESSAGE =
  '서버에 연결할 수 없습니다. 네트워크 상태를 확인해주세요.';

const COMMON_CODE_MESSAGES = {
  INVALID_INPUT: '입력한 내용을 다시 확인해주세요.',
  INVALID_REQUEST_BODY:
    '입력한 내용을 처리할 수 없습니다. 다시 확인해주세요.',
  INTERNAL_SERVER_ERROR:
    '서버에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
  AUTHENTICATION_FAILED:
    '로그인 정보가 유효하지 않습니다. 다시 로그인해주세요.',
  USER_UNAUTHENTICATED:
    '로그인이 필요한 요청입니다. 다시 로그인해주세요.',
  ACCESS_DENIED: '이 작업을 수행할 권한이 없습니다.',
  USER_DELETED: '탈퇴한 계정은 이용할 수 없습니다.',
  USER_NOT_FOUND: '사용자 정보를 찾을 수 없습니다.',
  VOTE_SCORE_OUT_OF_RANGE: '과실 비율을 다시 선택해주세요.',
  VOTE_LABEL_REQUIRED: '양쪽 투표 대상을 모두 입력해주세요.',
  VOTE_LABEL_LENGTH_LIMIT: '투표 대상은 2자 이상 20자 이하로 입력해주세요.',
  VOTE_LABEL_DUPLICATED: '양쪽 투표 대상은 서로 다르게 입력해주세요.',
  VOTE_DURATION_OUT_OF_RANGE: '투표 기간은 1시간 이상 168시간 이하로 입력해주세요.',
  BOARD_VOTE_NOT_FOUND: '이 게시글에는 투표가 없습니다.',
  BOARD_VOTE_CLOSED: '이미 종료된 투표입니다.',
};

const COMMON_STATUS_MESSAGES = {
  401: '로그인 정보가 만료되었습니다. 다시 로그인해주세요.',
  403: '이 작업을 수행할 권한이 없습니다.',
  404: '요청한 정보를 찾을 수 없습니다.',
  409: '이미 처리되었거나 다른 정보와 충돌했습니다.',
  500: '서버에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
};

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isNetworkError(error) {
  return (
    error instanceof TypeError &&
    /failed to fetch|fetch failed|load failed|networkerror/i.test(
      error.message,
    )
  );
}

export function getUserFriendlyErrorMessage(
  error,
  {
    fallback = '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.',
    codeMessages = {},
    statusMessages = {},
  } = {},
) {
  // fetch 자체가 실패한 경우 브라우저의 영문 TypeError 문구를 노출하지 않음
  if (isNetworkError(error)) {
    return NETWORK_ERROR_MESSAGE;
  }

  if (error?.code && hasOwn(codeMessages, error.code)) {
    return codeMessages[error.code];
  }

  if (error?.code && hasOwn(COMMON_CODE_MESSAGES, error.code)) {
    return COMMON_CODE_MESSAGES[error.code];
  }

  if (error?.status != null && hasOwn(statusMessages, error.status)) {
    return statusMessages[error.status];
  }

  // 매핑하지 않은 업무 오류는 백엔드가 제공한 기본 한국어 메시지 사용
  if (
    typeof error?.message === 'string' &&
    error.message &&
    !error.message.startsWith('HTTP 요청에 실패했습니다.')
  ) {
    return error.message;
  }

  if (
    error?.status != null &&
    hasOwn(COMMON_STATUS_MESSAGES, error.status)
  ) {
    return COMMON_STATUS_MESSAGES[error.status];
  }

  return fallback;
}
