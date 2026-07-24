// HTTP 오류를 일반 Error와 구분하고 백엔드 상태 코드와 응답 데이터 보존
export default class ApiError extends Error {
  constructor({ status, code, message, data }) {
    // 백엔드의 표시 문구는 Error.message에 보존하되 화면에서는 별도 매퍼 사용
    super(message || `HTTP 요청에 실패했습니다. (${status})`);
    this.name = 'ApiError';

    // 화면에서 401, 403, 404 등을 구분할 때 사용하는 HTTP 상태 코드
    this.status = status;

    // 화면별 분기에서 사용하는 안정적인 영문 오류 코드
    this.code = code || null;

    // 필드별 검증 오류와 같은 백엔드 추가 정보의 원본 유지
    this.data = data ?? null;
  }
}
