import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBoard,
  deleteBoard,
  getBoard,
  getBoards,
  likeBoard,
  unlikeBoard,
  updateBoard,
} from './boardApi';
import { request } from './httpClient';

vi.mock('./httpClient', () => ({ request: vi.fn() }));

const BOARD = {
  boardId: 1,
  title: '사고 사례',
  content: '사고 내용',
  images: [],
  author: { nickname: '작성자' },
};

describe('boardApi', () => {
  beforeEach(() => request.mockReset());

  it('size와 keyset cursor로 게시글 목록을 조회한다', async () => {
    const page = { content: [BOARD], nextCursor: 1, hasNext: true };
    request.mockResolvedValueOnce({ data: page });
    const signal = new AbortController().signal;

    await expect(getBoards({ cursor: 10, size: 5, signal })).resolves.toBe(page);
    expect(request).toHaveBeenCalledWith('/boards?size=5&cursor=10', { signal });
  });

  it('cursor 응답 계약이 잘못되면 오류를 반환한다', async () => {
    request.mockResolvedValueOnce({
      data: { content: [], hasNext: true, nextCursor: null },
    });

    await expect(getBoards()).rejects.toThrow(
      '게시글 목록 응답 형식이 올바르지 않습니다.',
    );
  });

  it('게시글 ID와 상세 응답을 검증한다', async () => {
    await expect(getBoard(0)).rejects.toThrow('올바른 게시글 ID가 필요합니다.');
    expect(request).not.toHaveBeenCalled();

    request.mockResolvedValueOnce({ data: BOARD });
    await expect(getBoard(1)).resolves.toBe(BOARD);
    expect(request).toHaveBeenCalledWith('/boards/1', { signal: undefined });
  });

  it('좋아요와 취소 요청에서 서버가 확정한 상태를 반환한다', async () => {
    request
      .mockResolvedValueOnce({ data: { liked: true, likeCount: 3 } })
      .mockResolvedValueOnce({ data: { liked: false, likeCount: 2 } });

    await expect(likeBoard(1)).resolves.toEqual({ liked: true, likeCount: 3 });
    await expect(unlikeBoard(1)).resolves.toEqual({ liked: false, likeCount: 2 });
    expect(request).toHaveBeenNthCalledWith(1, '/boards/1/like', { method: 'PUT' });
    expect(request).toHaveBeenNthCalledWith(2, '/boards/1/like', {
      method: 'DELETE',
    });
  });

  it('게시글 생성과 수정 요청의 본문 및 응답 ID를 검증한다', async () => {
    // 이미지 URL 대신 백엔드가 검증·저장할 원본/썸네일 Object Key 쌍 전송
    const body = {
      title: '제목',
      content: '내용',
      images: [
        {
          originalObjectKey: 'boards/7/group/original.png',
          thumbnailObjectKey: 'boards/7/group/thumbnail.webp',
        },
      ],
    };
    request
      .mockResolvedValueOnce({ data: { boardId: 2 } })
      .mockResolvedValueOnce({ data: { boardId: 2 } });

    await expect(createBoard(body)).resolves.toEqual({ boardId: 2 });
    await expect(updateBoard(2, body)).resolves.toEqual({ boardId: 2 });
    expect(request).toHaveBeenNthCalledWith(1, '/boards', {
      method: 'POST',
      body,
    });
    expect(request).toHaveBeenNthCalledWith(2, '/boards/2', {
      method: 'PATCH',
      body,
    });
  });

  it('게시글 삭제는 양의 정수 ID로 DELETE 요청을 보낸다', async () => {
    request.mockResolvedValueOnce(null);

    await deleteBoard(1);
    expect(request).toHaveBeenCalledWith('/boards/1', { method: 'DELETE' });
  });
});
