import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteBoard,
  getBoard,
  likeBoard,
  unlikeBoard,
} from '../api/boardApi';
import {
  createComment,
  deleteComment,
  getComments,
  updateComment,
} from '../api/commentApi';
import { AUTH_STATUS, AuthContext } from '../auth/AuthContext';
import BoardDetailPage from './BoardDetailPage';

vi.mock('../api/boardApi', () => ({
  deleteBoard: vi.fn(),
  getBoard: vi.fn(),
  likeBoard: vi.fn(),
  unlikeBoard: vi.fn(),
}));

vi.mock('../api/commentApi', () => ({
  COMMENT_PAGE_SIZE: 10,
  createComment: vi.fn(),
  deleteComment: vi.fn(),
  getComments: vi.fn(),
  updateComment: vi.fn(),
}));

vi.mock('../components/AppHeader', () => ({
  default: () => <header>테스트 헤더</header>,
}));

vi.mock('../components/Portal', () => ({
  default: ({ children }) => children,
}));

const BOARD = {
  boardId: 1,
  title: '교차로 사고',
  content: '교차로에서 발생한 사고입니다.',
  images: [],
  author: { nickname: '작성자', profileImage: null },
  createdAt: '2026-07-28T10:00:00',
  likedByMe: false,
  likeCount: 1,
  viewCount: 5,
  commentCount: 1,
  editableByMe: true,
};

// 상세 API는 각 이미지의 저장 Key와 원본·썸네일 GET URL을 함께 반환
const BOARD_WITH_IMAGES = {
  ...BOARD,
  images: [
    {
      imageId: 100,
      originalObjectKey: 'boards/7/group-1/original.png',
      thumbnailObjectKey: 'boards/7/group-1/thumbnail.webp',
      originalImageUrl: 'https://example.com/original-1.png',
      thumbnailImageUrl: 'https://example.com/thumbnail-1.webp',
    },
    {
      imageId: 101,
      originalObjectKey: 'boards/7/group-2/original.jpg',
      thumbnailObjectKey: 'boards/7/group-2/thumbnail.webp',
      originalImageUrl: 'https://example.com/original-2.jpg',
      thumbnailImageUrl: 'https://example.com/thumbnail-2.webp',
    },
  ],
};

const COMMENT_ONE = {
  commentId: 10,
  content: '기존 댓글',
  createdAt: '2026-07-28T11:00:00',
  editableByMe: true,
  author: { nickname: '댓글 작성자', profileImage: null },
};

const COMMENT_TWO = {
  ...COMMENT_ONE,
  commentId: 9,
  content: '추가 댓글',
  editableByMe: false,
};

function renderBoardDetail({
  status = AUTH_STATUS.AUTHENTICATED,
  path = '/boards/1',
} = {}) {
  return render(
    <AuthContext.Provider value={{ status }}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/boards/:boardId" element={<BoardDetailPage />} />
          <Route path="/boards" element={<div>게시글 목록 도착</div>} />
          <Route path="/boards/:boardId/edit" element={<div>수정 화면 도착</div>} />
          <Route path="/login" element={<div>로그인 화면 도착</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('BoardDetailPage', () => {
  let observers;

  beforeEach(() => {
    observers = [];
    class MockIntersectionObserver {
      constructor(callback) {
        this.callback = callback;
        this.observe = vi.fn();
        this.disconnect = vi.fn();
        observers.push(this);
      }
    }
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    getBoard.mockReset();
    getComments.mockReset();
    likeBoard.mockReset();
    unlikeBoard.mockReset();
    deleteBoard.mockReset();
    createComment.mockReset();
    updateComment.mockReset();
    deleteComment.mockReset();

    getBoard.mockResolvedValue(BOARD);
    getComments.mockResolvedValue({
      content: [COMMENT_ONE],
      nextCursor: null,
      hasNext: false,
    });
    likeBoard.mockResolvedValue({ liked: true, likeCount: 2 });
    unlikeBoard.mockResolvedValue({ liked: false, likeCount: 1 });
    deleteBoard.mockResolvedValue(undefined);
    createComment.mockResolvedValue({ commentId: 11 });
    updateComment.mockResolvedValue({ commentId: 10 });
    deleteComment.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('게시글 상세와 첫 댓글 페이지를 함께 표시한다', async () => {
    renderBoardDetail();

    expect(await screen.findByText('교차로 사고')).toBeInTheDocument();
    expect(screen.getByText('교차로에서 발생한 사고입니다.')).toBeInTheDocument();
    expect(screen.getByText('기존 댓글')).toBeInTheDocument();
    // 이미지가 없는 상세 화면은 placeholder 없이 게시글 내용을 바로 표시
    expect(
      screen.queryByLabelText('등록된 게시글 이미지 없음'),
    ).not.toBeInTheDocument();
    expect(getBoard).toHaveBeenCalledWith(1, {
      signal: expect.any(AbortSignal),
    });
    expect(getComments).toHaveBeenCalledWith(1, {
      size: 10,
      signal: expect.any(AbortSignal),
    });
  });

  it('상세 이미지마다 썸네일이 아닌 원본 Presigned GET URL을 표시한다', async () => {
    // 이번 테스트에서만 이미지 두 장이 포함된 상세 응답 사용
    getBoard.mockResolvedValueOnce(BOARD_WITH_IMAGES);
    renderBoardDetail();

    const firstImage = await screen.findByRole('img', {
      name: '게시글 이미지 1',
    });
    const secondImage = screen.getByRole('img', {
      name: '게시글 이미지 2',
    });

    // 상세 화면은 화질이 낮은 thumbnailImageUrl 대신 originalImageUrl 사용
    expect(firstImage).toHaveAttribute(
      'src',
      BOARD_WITH_IMAGES.images[0].originalImageUrl,
    );
    expect(firstImage).not.toHaveAttribute(
      'src',
      BOARD_WITH_IMAGES.images[0].thumbnailImageUrl,
    );
    expect(secondImage).toHaveAttribute(
      'src',
      BOARD_WITH_IMAGES.images[1].originalImageUrl,
    );
    expect(
      screen.queryByLabelText('등록된 게시글 이미지 없음'),
    ).not.toBeInTheDocument();
  });

  it('올바르지 않은 게시글 주소에서는 API를 호출하지 않는다', async () => {
    renderBoardDetail({ path: '/boards/not-a-number' });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '올바르지 않은 게시글 주소입니다.',
    );
    expect(getBoard).not.toHaveBeenCalled();
    expect(getComments).not.toHaveBeenCalled();
  });

  it('미인증 사용자가 좋아요를 누르면 로그인 확인 후 이동한다', async () => {
    const user = userEvent.setup();
    renderBoardDetail({ status: AUTH_STATUS.UNAUTHENTICATED });
    await screen.findByText('교차로 사고');

    await user.click(screen.getByRole('button', { name: /도움돼요/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent(
      '게시글에 반응하려면 로그인이 필요합니다.',
    );
    await user.click(screen.getByRole('button', { name: '로그인' }));

    expect(await screen.findByText('로그인 화면 도착')).toBeInTheDocument();
    expect(likeBoard).not.toHaveBeenCalled();
  });

  it('인증 사용자의 좋아요 결과를 서버 응답 값으로 교체한다', async () => {
    const user = userEvent.setup();
    renderBoardDetail();
    await screen.findByText('교차로 사고');

    const likeButton = screen.getByRole('button', { name: /도움돼요/ });
    await user.click(likeButton);

    await waitFor(() => expect(likeButton).toHaveAttribute('aria-pressed', 'true'));
    expect(likeButton).toHaveTextContent('2');
    expect(likeBoard).toHaveBeenCalledWith(1);
  });

  it('댓글을 trim해서 등록하고 서버 목록을 다시 조회한다', async () => {
    const user = userEvent.setup();
    renderBoardDetail();
    await screen.findByText('기존 댓글');

    await user.type(screen.getByLabelText('댓글 내용'), '  새 댓글  ');
    await user.click(screen.getByRole('button', { name: '댓글 등록' }));

    await waitFor(() => expect(getComments).toHaveBeenCalledTimes(2));
    expect(createComment).toHaveBeenCalledWith(1, '새 댓글');
    expect(screen.getByLabelText('댓글 내용')).toHaveValue('');
    expect(within(screen.getByLabelText('게시글 통계')).getByText('2')).toBeInTheDocument();
  });

  it('작성자가 댓글을 수정하면 서버 목록을 다시 조회한다', async () => {
    const user = userEvent.setup();
    renderBoardDetail();
    await screen.findByText('기존 댓글');
    const comment = screen.getByText('기존 댓글').closest('article');

    await user.click(within(comment).getByRole('button', { name: '수정' }));
    const editInput = within(comment).getByLabelText('댓글 수정 내용');
    await user.clear(editInput);
    await user.type(editInput, '수정된 댓글');
    await user.click(within(comment).getByRole('button', { name: '수정 완료' }));

    await waitFor(() => expect(getComments).toHaveBeenCalledTimes(2));
    expect(updateComment).toHaveBeenCalledWith(10, '수정된 댓글');
  });

  it('댓글 삭제 확인 후 삭제하고 목록을 다시 조회한다', async () => {
    const user = userEvent.setup();
    renderBoardDetail();
    await screen.findByText('기존 댓글');
    const comment = screen.getByText('기존 댓글').closest('article');

    await user.click(within(comment).getByRole('button', { name: '삭제' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('댓글을 삭제하시겠습니까?');
    await user.click(within(dialog).getByRole('button', { name: '삭제' }));

    await waitFor(() => expect(getComments).toHaveBeenCalledTimes(2));
    expect(deleteComment).toHaveBeenCalledWith(10);
  });

  it('게시글 삭제 확인 후 목록 화면으로 이동한다', async () => {
    const user = userEvent.setup();
    renderBoardDetail();
    const title = await screen.findByRole('heading', { name: '교차로 사고' });
    const header = title.closest('section');

    await user.click(within(header).getByRole('button', { name: '삭제' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('게시글을 삭제하시겠습니까?');
    await user.click(within(dialog).getByRole('button', { name: '삭제' }));

    expect(await screen.findByText('게시글 목록 도착')).toBeInTheDocument();
    expect(deleteBoard).toHaveBeenCalledWith(1);
  });

  it('댓글 목록 끝이 보이면 다음 cursor 페이지를 추가한다', async () => {
    getComments
      .mockResolvedValueOnce({
        content: [COMMENT_ONE],
        nextCursor: 10,
        hasNext: true,
      })
      .mockResolvedValueOnce({
        content: [COMMENT_TWO],
        nextCursor: null,
        hasNext: false,
      });
    renderBoardDetail();
    await screen.findByText('기존 댓글');
    await waitFor(() => expect(observers).toHaveLength(1));

    act(() => {
      observers[0].callback([{ isIntersecting: true }]);
    });

    expect(await screen.findByText('추가 댓글')).toBeInTheDocument();
    expect(getComments).toHaveBeenNthCalledWith(2, 1, {
      cursor: 10,
      size: 10,
      signal: expect.any(AbortSignal),
    });
  });
});
