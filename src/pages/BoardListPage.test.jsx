import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBoards } from '../api/boardApi';
import { AUTH_STATUS, AuthContext } from '../auth/AuthContext';
import BoardListPage from './BoardListPage';

vi.mock('../api/boardApi', () => ({
  BOARD_PAGE_SIZE: 8,
  getBoards: vi.fn(),
}));

vi.mock('../components/AppHeader', () => ({
  default: () => <header>테스트 헤더</header>,
}));

const BOARD_ONE = {
  boardId: 1,
  title: '첫 번째 사고',
  likeCount: 1,
  commentCount: 2,
  viewCount: 3,
  createdAt: '2026-07-28T10:00:00',
  thumbnailImageUrl: 'https://example.com/board-one-thumbnail.webp',
  author: { nickname: '작성자', profileImage: null },
};

const BOARD_TWO = {
  ...BOARD_ONE,
  boardId: 2,
  title: '두 번째 사고',
};

function LoginDestination() {
  const location = useLocation();
  return (
    <div>
      로그인 화면 도착
      <span data-testid="login-from">{location.state?.from?.pathname}</span>
    </div>
  );
}

function renderBoardList(status = AUTH_STATUS.UNAUTHENTICATED) {
  return render(
    <AuthContext.Provider value={{ status }}>
      <MemoryRouter initialEntries={['/boards']}>
        <Routes>
          <Route path="/boards" element={<BoardListPage />} />
          <Route path="/boards/new" element={<div>게시글 작성 도착</div>} />
          <Route path="/login" element={<LoginDestination />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('BoardListPage', () => {
  let observers;

  beforeEach(() => {
    getBoards.mockReset();
    observers = [];

    class MockIntersectionObserver {
      constructor(callback, options) {
        this.callback = callback;
        this.options = options;
        this.observe = vi.fn();
        this.disconnect = vi.fn();
        observers.push(this);
      }
    }

    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('첫 cursor 페이지와 현재 게시글 수를 표시한다', async () => {
    getBoards.mockResolvedValueOnce({
      content: [BOARD_ONE],
      nextCursor: null,
      hasNext: false,
    });
    renderBoardList();

    expect(await screen.findByText('첫 번째 사고')).toBeInTheDocument();
    expect(screen.getByText('현재 1개의 사례')).toBeInTheDocument();
    expect(screen.getByText('모든 게시글을 확인했습니다.')).toBeInTheDocument();
    expect(getBoards).toHaveBeenCalledWith({
      size: 8,
      signal: expect.any(AbortSignal),
    });
  });

  it('첫 조회 실패 후 동일한 초기 조회 흐름으로 재시도한다', async () => {
    const user = userEvent.setup();
    getBoards
      .mockRejectedValueOnce(new Error('목록 조회 실패'))
      .mockResolvedValueOnce({
        content: [BOARD_ONE],
        nextCursor: null,
        hasNext: false,
      });
    renderBoardList();

    expect(await screen.findByRole('alert')).toHaveTextContent('목록 조회 실패');
    await user.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(await screen.findByText('첫 번째 사고')).toBeInTheDocument();
    expect(getBoards).toHaveBeenCalledTimes(2);
  });

  it('목록 끝이 보이면 다음 cursor 페이지를 중복 없이 추가한다', async () => {
    getBoards
      .mockResolvedValueOnce({
        content: [BOARD_ONE],
        nextCursor: 1,
        hasNext: true,
      })
      .mockResolvedValueOnce({
        content: [BOARD_ONE, BOARD_TWO],
        nextCursor: null,
        hasNext: false,
      });
    renderBoardList();
    await screen.findByText('첫 번째 사고');
    await waitFor(() => expect(observers).toHaveLength(1));

    act(() => {
      observers[0].callback([{ isIntersecting: true }]);
    });

    expect(await screen.findByText('두 번째 사고')).toBeInTheDocument();
    expect(screen.getAllByText('첫 번째 사고')).toHaveLength(1);
    expect(screen.getByText('현재 2개의 사례')).toBeInTheDocument();
    expect(getBoards).toHaveBeenNthCalledWith(2, {
      cursor: 1,
      size: 8,
      signal: expect.any(AbortSignal),
    });
  });

  it('미인증 사용자의 작성 요청은 확인 후 로그인 경로로 이동한다', async () => {
    const user = userEvent.setup();
    getBoards.mockResolvedValueOnce({
      content: [],
      nextCursor: null,
      hasNext: false,
    });
    renderBoardList();
    await screen.findByText('등록된 게시글이 없습니다.');

    await user.click(screen.getByRole('button', { name: '+ 사고 사례 등록' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('로그인이 필요합니다');
    await user.click(screen.getByRole('button', { name: '로그인' }));

    expect(await screen.findByText('로그인 화면 도착')).toBeInTheDocument();
    expect(screen.getByTestId('login-from')).toHaveTextContent('/boards/new');
  });

  it('인증 사용자의 작성 요청은 바로 게시글 작성 경로로 이동한다', async () => {
    const user = userEvent.setup();
    getBoards.mockResolvedValueOnce({
      content: [],
      nextCursor: null,
      hasNext: false,
    });
    renderBoardList(AUTH_STATUS.AUTHENTICATED);
    await screen.findByText('등록된 게시글이 없습니다.');

    await user.click(screen.getByRole('button', { name: '+ 사고 사례 등록' }));

    expect(await screen.findByText('게시글 작성 도착')).toBeInTheDocument();
  });
});
