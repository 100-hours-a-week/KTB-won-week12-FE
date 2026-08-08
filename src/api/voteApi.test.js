import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getBoardVoteResult,
  hasValidBoardVoteDetail,
  submitBoardVote,
} from './voteApi';
import { request } from './httpClient';

vi.mock('./httpClient', () => ({ request: vi.fn() }));

const SCORE_RESULT = { leftScore: 6, rightScore: 4 };
const MY_VOTE = { leftScore: 3, rightScore: 7 };

const VOTE_DETAIL = {
  voteId: 10,
  leftLabel: 'A 차량',
  rightLabel: 'B 차량',
  status: 'OPEN',
  startedAt: '2026-08-08T12:00:00',
  endsAt: '2026-08-09T12:00:00',
  totalVoteCount: 3,
  result: SCORE_RESULT,
  myVote: MY_VOTE,
};

describe('voteApi', () => {
  beforeEach(() => request.mockReset());

  it('투표가 없는 null과 정상 상세 투표 응답을 허용한다', () => {
    expect(hasValidBoardVoteDetail(null)).toBe(true);
    expect(hasValidBoardVoteDetail(VOTE_DETAIL)).toBe(true);
    expect(
      hasValidBoardVoteDetail({
        ...VOTE_DETAIL,
        totalVoteCount: 0,
        result: null,
        myVote: null,
      }),
    ).toBe(true);
  });

  it('점수 합계와 결과 공개 조건이 잘못된 상세 응답을 거부한다', () => {
    expect(
      hasValidBoardVoteDetail({
        ...VOTE_DETAIL,
        result: { leftScore: 6, rightScore: 5 },
      }),
    ).toBe(false);
    expect(
      hasValidBoardVoteDetail({
        ...VOTE_DETAIL,
        result: null,
        myVote: MY_VOTE,
      }),
    ).toBe(false);
    expect(
      hasValidBoardVoteDetail({
        ...VOTE_DETAIL,
        totalVoteCount: 0,
      }),
    ).toBe(false);
  });

  it('왼쪽 점수만 PUT 요청하고 저장된 내 응답과 집계를 반환한다', async () => {
    const signal = new AbortController().signal;
    const responseData = {
      voteId: 10,
      status: 'OPEN',
      endsAt: '2026-08-09T12:00:00',
      totalVoteCount: 3,
      result: SCORE_RESULT,
      myVote: MY_VOTE,
    };
    request.mockResolvedValueOnce({ data: responseData });

    await expect(submitBoardVote(1, 3, { signal })).resolves.toBe(responseData);
    expect(request).toHaveBeenCalledWith('/boards/1/vote', {
      method: 'PUT',
      body: { leftScore: 3 },
      signal,
    });
  });

  it('게시글 ID와 제출 점수 및 저장 응답 계약을 검증한다', async () => {
    await expect(submitBoardVote(0, 5)).rejects.toThrow(
      '올바른 게시글 ID가 필요합니다.',
    );
    await expect(submitBoardVote(1, 11)).rejects.toThrow(
      '과실 점수는 0 이상 10 이하여야 합니다.',
    );
    expect(request).not.toHaveBeenCalled();

    request.mockResolvedValueOnce({
      data: {
        voteId: 10,
        status: 'OPEN',
        endsAt: '2026-08-09T12:00:00',
        totalVoteCount: 1,
        result: { leftScore: 3, rightScore: 8 },
        myVote: MY_VOTE,
      },
    });
    await expect(submitBoardVote(1, 3)).rejects.toThrow(
      '투표 저장 응답 형식이 올바르지 않습니다.',
    );
  });

  it('공개 결과를 GET 요청하고 0건과 집계 결과를 구분한다', async () => {
    const emptyResult = {
      voteId: 10,
      totalVoteCount: 0,
      result: null,
    };
    const aggregateResult = {
      voteId: 10,
      totalVoteCount: 2,
      result: { leftScore: 5, rightScore: 5 },
    };
    request
      .mockResolvedValueOnce({ data: emptyResult })
      .mockResolvedValueOnce({ data: aggregateResult });

    await expect(getBoardVoteResult(1)).resolves.toBe(emptyResult);
    await expect(getBoardVoteResult(1)).resolves.toBe(aggregateResult);
    expect(request).toHaveBeenNthCalledWith(1, '/boards/1/vote/result', {
      signal: undefined,
    });
  });

  it('참여 수와 결과가 모순되는 공개 결과 응답을 거부한다', async () => {
    request
      .mockResolvedValueOnce({
        data: { voteId: 10, totalVoteCount: 0, result: SCORE_RESULT },
      })
      .mockResolvedValueOnce({
        data: { voteId: 10, totalVoteCount: 1, result: null },
      });

    await expect(getBoardVoteResult(1)).rejects.toThrow(
      '투표 결과 응답 형식이 올바르지 않습니다.',
    );
    await expect(getBoardVoteResult(1)).rejects.toThrow(
      '투표 결과 응답 형식이 올바르지 않습니다.',
    );
  });
});
