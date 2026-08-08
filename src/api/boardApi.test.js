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
  // 목록에서는 이미지가 없는 게시글을 null 대표 썸네일로 표현
  thumbnailImageUrl: null,
  images: [],
  author: { nickname: '작성자' },
  vote: null,
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

  it('목록 대표 썸네일 필드가 누락되거나 잘못된 형식이면 오류를 반환한다', async () => {
    // undefined는 새 백엔드 계약의 필드 누락, 숫자는 잘못된 URL 타입을 의미
    request
      .mockResolvedValueOnce({
        data: {
          content: [{ ...BOARD, thumbnailImageUrl: undefined }],
          hasNext: false,
          nextCursor: null,
        },
      })
      .mockResolvedValueOnce({
        data: {
          content: [{ ...BOARD, thumbnailImageUrl: 123 }],
          hasNext: false,
          nextCursor: null,
        },
      });

    await expect(getBoards()).rejects.toThrow(
      '게시글 목록 응답 형식이 올바르지 않습니다.',
    );
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

  it('게시글 상세의 nullable 투표 계약을 검증한다', async () => {
    const boardWithVote = {
      ...BOARD,
      vote: {
        voteId: 10,
        leftLabel: 'A 차량',
        rightLabel: 'B 차량',
        status: 'OPEN',
        startedAt: '2026-08-08T12:00:00',
        endsAt: '2026-08-09T12:00:00',
        totalVoteCount: 1,
        result: { leftScore: 6, rightScore: 4 },
        myVote: { leftScore: 3, rightScore: 7 },
      },
    };
    request.mockResolvedValueOnce({ data: boardWithVote });

    await expect(getBoard(1)).resolves.toBe(boardWithVote);

    request.mockResolvedValueOnce({
      data: { ...BOARD, vote: undefined },
    });
    await expect(getBoard(1)).rejects.toThrow(
      '게시글 상세 응답 형식이 올바르지 않습니다.',
    );
  });

  it('상세 이미지의 Object Key 또는 Presigned GET URL이 누락되면 오류를 반환한다', async () => {
    request.mockResolvedValueOnce({
      data: {
        ...BOARD,
        images: [
          {
            imageId: 10,
            originalObjectKey: 'boards/7/group/original.png',
            thumbnailObjectKey: 'boards/7/group/thumbnail.webp',
            originalImageUrl: '',
            thumbnailImageUrl: 'https://bucket.example/thumbnail',
          },
        ],
      },
    });

    // 빈 원본 URL을 정상 이미지로 렌더링하지 않고 API 계약 오류로 구분
    await expect(getBoard(1)).rejects.toThrow(
      '게시글 상세 응답 형식이 올바르지 않습니다.',
    );
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
    const mutationBody = {
      title: '제목',
      content: '내용',
      images: [
        {
          originalObjectKey: 'boards/7/group/original.png',
          thumbnailObjectKey: 'boards/7/group/thumbnail.webp',
        },
      ],
    };
    const createBody = {
      ...mutationBody,
      vote: {
        leftLabel: 'A 차량',
        rightLabel: 'B 차량',
        durationHours: 24,
      },
    };
    request
      .mockResolvedValueOnce({ data: { boardId: 2 } })
      .mockResolvedValueOnce({ data: { boardId: 2 } });

    await expect(createBoard(createBody)).resolves.toEqual({ boardId: 2 });
    await expect(updateBoard(2, mutationBody)).resolves.toEqual({ boardId: 2 });
    expect(request).toHaveBeenNthCalledWith(1, '/boards', {
      method: 'POST',
      body: createBody,
    });
    expect(request).toHaveBeenNthCalledWith(2, '/boards/2', {
      method: 'PATCH',
      body: mutationBody,
    });
  });

  it('게시글 삭제는 양의 정수 ID로 DELETE 요청을 보낸다', async () => {
    request.mockResolvedValueOnce(null);

    await deleteBoard(1);
    expect(request).toHaveBeenCalledWith('/boards/1', { method: 'DELETE' });
  });
});
