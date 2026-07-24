import { request } from './httpClient';

// 초기 조회와 추가 조회에서 동일하게 사용할 페이지 크기
export const BOARD_PAGE_SIZE = 8;

// signal은 페이지 이동 시 진행 중인 fetch 요청 취소를 위해 사용
export async function getBoards({
  cursor,
  size = BOARD_PAGE_SIZE,
  signal,
} = {}) {
  // cursor와 size를 URLSearchParams를 통해 쿼리 문자열로 변환
  const searchParams = new URLSearchParams({ size: String(size) });

  // 첫 조회는 cursor 없이 요청하고 다음 조회부터 마지막 boardId 전달
  if (cursor != null) {
    searchParams.set('cursor', String(cursor));
  }

  const response = await request(`/boards?${searchParams.toString()}`, {
    signal,
  });
  // 공통 ApiResponse의 data에서 게시글 cursor 응답 추출
  const page = response?.data;

  // hasNext가 true인 경우 다음 요청에 사용할 nextCursor가 반드시 필요
  // 응답 계약이 달라진 경우 빈 목록으로 처리하지 않고 오류 반환
  if (
    !page ||
    !Array.isArray(page.content) ||
    typeof page.hasNext !== 'boolean' ||
    (page.hasNext && page.nextCursor == null)
  ) {
    throw new TypeError('게시글 목록 응답 형식이 올바르지 않습니다.');
  }

  return page;
}

export async function getBoard(boardId, { signal } = {}) {
  // 숫자가 아닌 게시글 ID로 잘못된 API 주소를 만들지 않도록 요청 전 검증
  if (!Number.isSafeInteger(boardId) || boardId <= 0) {
    throw new TypeError('올바른 게시글 ID가 필요합니다.');
  }

  const response = await request(`/boards/${boardId}`, { signal });
  const board = response?.data;

  // 상세 화면에서 반드시 사용하는 필드가 없으면 계약 오류로 처리
  if (
    !board ||
    board.boardId == null ||
    typeof board.title !== 'string' ||
    typeof board.content !== 'string' ||
    !Array.isArray(board.images) ||
    !board.author
  ) {
    throw new TypeError('게시글 상세 응답 형식이 올바르지 않습니다.');
  }

  return board;
}

function validateBoardId(boardId) {
  if (!Number.isSafeInteger(boardId) || boardId <= 0) {
    throw new TypeError('올바른 게시글 ID가 필요합니다.');
  }
}

async function changeBoardLike(boardId, method) {
  validateBoardId(boardId);

  const response = await request(`/boards/${boardId}/like`, { method });
  const like = response?.data;

  // 화면의 선택 상태와 개수를 서버 응답으로 교체하기 위한 필드 검증
  if (
    !like ||
    typeof like.liked !== 'boolean' ||
    !Number.isInteger(like.likeCount)
  ) {
    throw new TypeError('게시글 좋아요 응답 형식이 올바르지 않습니다.');
  }

  return like;
}

export function likeBoard(boardId) {
  return changeBoardLike(boardId, 'PUT');
}

export function unlikeBoard(boardId) {
  return changeBoardLike(boardId, 'DELETE');
}

export async function deleteBoard(boardId) {
  validateBoardId(boardId);
  await request(`/boards/${boardId}`, { method: 'DELETE' });
}

function validateBoardMutationResponse(response, operationName) {
  const boardId = response?.data?.boardId;

  if (!Number.isSafeInteger(boardId) || boardId <= 0) {
    throw new TypeError(
      `게시글 ${operationName} 응답 형식이 올바르지 않습니다.`,
    );
  }

  return response.data;
}

export async function createBoard({ title, content, imageUrls }) {
  const response = await request('/boards', {
    method: 'POST',
    body: { title, content, imageUrls },
  });

  return validateBoardMutationResponse(response, '생성');
}

export async function updateBoard(boardId, { title, content, imageUrls }) {
  validateBoardId(boardId);

  const response = await request(`/boards/${boardId}`, {
    method: 'PATCH',
    body: { title, content, imageUrls },
  });

  return validateBoardMutationResponse(response, '수정');
}
