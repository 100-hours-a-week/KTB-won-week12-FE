import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createComment,
  deleteComment,
  getComments,
  updateComment,
} from './commentApi';
import { request } from './httpClient';

vi.mock('./httpClient', () => ({ request: vi.fn() }));

describe('commentApi', () => {
  beforeEach(() => request.mockReset());

  it('게시글 ID와 cursor로 댓글 페이지를 조회한다', async () => {
    const page = { content: [], nextCursor: null, hasNext: false };
    request.mockResolvedValueOnce({ data: page });
    const signal = new AbortController().signal;

    await expect(
      getComments(1, { cursor: 20, size: 5, signal }),
    ).resolves.toBe(page);
    expect(request).toHaveBeenCalledWith(
      '/boards/1/comments?size=5&cursor=20',
      { signal },
    );
  });

  it('게시글 ID와 댓글 페이지 응답 계약을 검증한다', async () => {
    await expect(getComments(-1)).rejects.toThrow(
      '올바른 게시글 ID가 필요합니다.',
    );

    request.mockResolvedValueOnce({
      data: { content: [], hasNext: true, nextCursor: null },
    });
    await expect(getComments(1)).rejects.toThrow(
      '댓글 목록 응답 형식이 올바르지 않습니다.',
    );
  });

  it('댓글을 생성하고 생성된 댓글 ID를 반환한다', async () => {
    request.mockResolvedValueOnce({ data: { commentId: 3 } });

    await expect(createComment(1, '댓글 내용')).resolves.toEqual({ commentId: 3 });
    expect(request).toHaveBeenCalledWith('/boards/1/comments', {
      method: 'POST',
      body: { content: '댓글 내용' },
    });
  });

  it('댓글 수정 요청과 응답 ID를 검증한다', async () => {
    request.mockResolvedValueOnce({ data: { commentId: 3 } });

    await expect(updateComment(3, '수정 내용')).resolves.toEqual({ commentId: 3 });
    expect(request).toHaveBeenCalledWith('/comments/3', {
      method: 'PATCH',
      body: { content: '수정 내용' },
    });
  });

  it('댓글 삭제는 양의 정수 ID로 DELETE 요청을 보낸다', async () => {
    request.mockResolvedValueOnce(null);

    await deleteComment(3);
    expect(request).toHaveBeenCalledWith('/comments/3', { method: 'DELETE' });
  });
});
