import { describe, expect, it } from 'vitest';
import { getUserFriendlyErrorMessage } from './errorMessage';

describe('getUserFriendlyErrorMessage', () => {
  it('fetch 네트워크 오류를 한국어 문구로 변환한다', () => {
    expect(getUserFriendlyErrorMessage(new TypeError('Failed to fetch'))).toBe(
      '서버에 연결할 수 없습니다. 네트워크 상태를 확인해주세요.',
    );
  });

  it('화면별 오류 코드 매핑을 공통 매핑보다 우선한다', () => {
    expect(
      getUserFriendlyErrorMessage(
        { code: 'AUTHENTICATION_FAILED', message: 'server message' },
        { codeMessages: { AUTHENTICATION_FAILED: '로그인 실패' } },
      ),
    ).toBe('로그인 실패');
  });

  it('공통 오류 코드와 화면별 HTTP 상태 매핑을 지원한다', () => {
    expect(getUserFriendlyErrorMessage({ code: 'ACCESS_DENIED' })).toBe(
      '이 작업을 수행할 권한이 없습니다.',
    );
    expect(
      getUserFriendlyErrorMessage(
        { status: 401 },
        { statusMessages: { 401: '다시 로그인하세요.' } },
      ),
    ).toBe('다시 로그인하세요.');
  });

  it('투표 업무 오류 코드를 사용자 안내 문구로 변환한다', () => {
    expect(getUserFriendlyErrorMessage({ code: 'BOARD_VOTE_CLOSED' })).toBe(
      '이미 종료된 투표입니다.',
    );
    expect(getUserFriendlyErrorMessage({ code: 'BOARD_VOTE_NOT_FOUND' })).toBe(
      '이 게시글에는 투표가 없습니다.',
    );
    expect(getUserFriendlyErrorMessage({ code: 'VOTE_SCORE_OUT_OF_RANGE' })).toBe(
      '과실 비율을 다시 선택해주세요.',
    );
  });

  it('매핑되지 않은 백엔드 업무 메시지는 원문을 유지한다', () => {
    expect(
      getUserFriendlyErrorMessage({ status: 409, message: '이미 투표했습니다.' }),
    ).toBe('이미 투표했습니다.');
  });

  it('일반 HTTP 오류 문구는 공통 상태 메시지로 교체한다', () => {
    expect(
      getUserFriendlyErrorMessage({
        status: 404,
        message: 'HTTP 요청에 실패했습니다. (404)',
      }),
    ).toBe('요청한 정보를 찾을 수 없습니다.');
  });

  it('사용 가능한 정보가 없으면 지정한 fallback을 반환한다', () => {
    expect(
      getUserFriendlyErrorMessage(null, { fallback: '다시 시도해주세요.' }),
    ).toBe('다시 시도해주세요.');
  });
});
