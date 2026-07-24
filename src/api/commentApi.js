import { request } from './httpClient';

// 첫 댓글 조회와 추가 조회에서 동일하게 사용할 페이지 크기
export const COMMENT_PAGE_SIZE = 10;

export async function getComments(
  boardId,
  { cursor, size = COMMENT_PAGE_SIZE, signal } = {},
) {
  // 숫자가 아닌 게시글 ID로 잘못된 API 주소를 만들지 않도록 요청 전 검증
  if (!Number.isSafeInteger(boardId) || boardId <= 0) {
    throw new TypeError('올바른 게시글 ID가 필요합니다.');
  }

  const searchParams = new URLSearchParams({ size: String(size) });

  // 첫 조회는 cursor 없이 요청하고 다음 조회부터 마지막 commentId 전달
  if (cursor != null) {
    searchParams.set('cursor', String(cursor));
  }

  const response = await request(
    `/boards/${boardId}/comments?${searchParams.toString()}`,
    { signal },
  );
  const page = response?.data;

  // hasNext가 true인 경우 다음 요청에 사용할 nextCursor가 반드시 필요
  if (
    !page ||
    !Array.isArray(page.content) ||
    typeof page.hasNext !== 'boolean' ||
    (page.hasNext && page.nextCursor == null)
  ) {
    throw new TypeError('댓글 목록 응답 형식이 올바르지 않습니다.');
  }

  return page;
}

function validateCommentId(commentId) {
  if (!Number.isSafeInteger(commentId) || commentId <= 0) {
    throw new TypeError('올바른 댓글 ID가 필요합니다.');
  }
}

export async function createComment(boardId, content) {
  if (!Number.isSafeInteger(boardId) || boardId <= 0) {
    throw new TypeError('올바른 게시글 ID가 필요합니다.');
  }

  const response = await request(`/boards/${boardId}/comments`, {
    method: 'POST',
    body: { content },
  });

  if (response?.data?.commentId == null) {
    throw new TypeError('댓글 생성 응답 형식이 올바르지 않습니다.');
  }

  return response.data;
}

export async function updateComment(commentId, content) {
  validateCommentId(commentId);

  const response = await request(`/comments/${commentId}`, {
    method: 'PATCH',
    body: { content },
  });

  if (response?.data?.commentId == null) {
    throw new TypeError('댓글 수정 응답 형식이 올바르지 않습니다.');
  }

  return response.data;
}

export async function deleteComment(commentId) {
  validateCommentId(commentId);
  await request(`/comments/${commentId}`, { method: 'DELETE' });
}
