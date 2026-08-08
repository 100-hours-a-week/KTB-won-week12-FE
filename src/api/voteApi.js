import { request } from './httpClient';

const VOTE_STATUSES = new Set(['OPEN', 'CLOSED']);

function validateBoardId(boardId) {
  if (!Number.isSafeInteger(boardId) || boardId <= 0) {
    throw new TypeError('올바른 게시글 ID가 필요합니다.');
  }
}

function isValidScorePair(score) {
  return (
    score != null &&
    Number.isInteger(score.leftScore) &&
    Number.isInteger(score.rightScore) &&
    score.leftScore >= 0 &&
    score.leftScore <= 10 &&
    score.rightScore >= 0 &&
    score.rightScore <= 10 &&
    score.leftScore + score.rightScore === 10
  );
}

function hasValidVoteIdentity(vote) {
  return (
    vote != null &&
    Number.isSafeInteger(vote.voteId) &&
    vote.voteId > 0 &&
    Number.isInteger(vote.totalVoteCount) &&
    vote.totalVoteCount >= 0
  );
}

export function hasValidBoardVoteDetail(vote) {
  if (vote === null) {
    return true;
  }
  if (vote === undefined) {
    return false;
  }

  const hasValidResult =
    vote.result === null || isValidScorePair(vote.result);
  const hasValidMyVote =
    vote.myVote === null || isValidScorePair(vote.myVote);

  return (
    hasValidVoteIdentity(vote) &&
    typeof vote.leftLabel === 'string' &&
    vote.leftLabel.trim().length > 0 &&
    typeof vote.rightLabel === 'string' &&
    vote.rightLabel.trim().length > 0 &&
    VOTE_STATUSES.has(vote.status) &&
    typeof vote.startedAt === 'string' &&
    typeof vote.endsAt === 'string' &&
    hasValidResult &&
    hasValidMyVote &&
    // 상세 API는 참여자의 myVote가 있으면 집계 결과도 함께 반환한다.
    (vote.myVote === null || vote.result !== null) &&
    // 응답이 0건인 상태에는 개인 응답과 집계 결과가 존재할 수 없다.
    (vote.totalVoteCount !== 0 ||
      (vote.result === null && vote.myVote === null))
  );
}

function validateVoteUpdateResponse(vote) {
  if (
    !hasValidVoteIdentity(vote) ||
    !VOTE_STATUSES.has(vote.status) ||
    typeof vote.endsAt !== 'string' ||
    vote.totalVoteCount < 1 ||
    !isValidScorePair(vote.result) ||
    !isValidScorePair(vote.myVote)
  ) {
    throw new TypeError('투표 저장 응답 형식이 올바르지 않습니다.');
  }

  return vote;
}

function validateVoteResultResponse(vote) {
  if (
    !hasValidVoteIdentity(vote) ||
    (vote.totalVoteCount === 0 && vote.result !== null) ||
    (vote.totalVoteCount > 0 && !isValidScorePair(vote.result))
  ) {
    throw new TypeError('투표 결과 응답 형식이 올바르지 않습니다.');
  }

  return vote;
}

export async function submitBoardVote(boardId, leftScore, { signal } = {}) {
  validateBoardId(boardId);
  if (!Number.isInteger(leftScore) || leftScore < 0 || leftScore > 10) {
    throw new TypeError('과실 점수는 0 이상 10 이하여야 합니다.');
  }

  const response = await request(`/boards/${boardId}/vote`, {
    method: 'PUT',
    body: { leftScore },
    signal,
  });

  return validateVoteUpdateResponse(response?.data);
}

export async function getBoardVoteResult(boardId, { signal } = {}) {
  validateBoardId(boardId);
  const response = await request(`/boards/${boardId}/vote/result`, { signal });

  return validateVoteResultResponse(response?.data);
}
