import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import BoardCard from '../components/BoardCard';
import LoginRequiredModal from '../components/LoginRequiredModal';
import { BOARD_PAGE_SIZE, getBoards } from '../api/boardApi';
import { AUTH_STATUS, useAuth } from '../auth/AuthContext';
import '../styles/pages/BoardListPage.css';

export default function BoardListPage() {
  const navigate = useNavigate();
  const { status } = useAuth();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  // 지금까지 누적한 게시글과 다음 keyset cursor 정보를 함께 관리
  const [boardPage, setBoardPage] = useState({
    content: [],
    nextCursor: null,
    hasNext: false,
  });

  // 최초 목록 요청의 로딩/성공/실패 상태이며 인증 상태와는 별개
  const [requestState, setRequestState] = useState('loading');
  const [errorMessage, setErrorMessage] = useState('');

  // 값이 증가하면 최초 조회 effect가 다시 실행되어 재시도
  const [requestVersion, setRequestVersion] = useState(0);

  // 아래 상태는 최초 조회가 아닌 무한 스크롤의 추가 요청에만 사용
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState('');

  // IntersectionObserver가 감시할 목록 끝 DOM을 참조
  const loadMoreTriggerRef = useRef(null);
  
  const isLoadingMoreRef = useRef(false);

  // 페이지가 사라질 때 진행 중인 추가 요청을 취소 위함, 사용 시 abortController 연결.
  const loadMoreAbortControllerRef = useRef(null);

  const retryLoad = useCallback(() => {
    // 직접 API를 호출하지 않고 effect의 의존 값을 변경해 동일한 초기화 흐름을 재사용
    setRequestVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    // 이 effect가 정리되면 해당 요청만 취소할 수 있는 Controller
    const abortController = new AbortController();

    async function loadInitialBoards() {
      // 재시도할 때 이전 오류 문구가 남지 않도록 요청 전에 초기화
      setRequestState('loading');
      setErrorMessage('');
      setLoadMoreError('');

      try {
        const page = await getBoards({
          // cursor를 넘기지 않으므로 가장 최신 게시글부터 첫 페이지를 조회
          size: BOARD_PAGE_SIZE,
          signal: abortController.signal,
        });

        // 초기 조회는 기존 누적 목록에 붙이지 않고 페이지 전체를 교체
        setBoardPage(page);
        setRequestState('success');
      } catch (error) {
        // 화면이 사라져 요청을 취소한 경우에는 사용자에게 오류를 표시하지 않음
        if (error.name === 'AbortError') {
          return;
        }

        setErrorMessage(error.message || '게시글 목록을 불러오지 못했습니다.');
        setRequestState('error');
      }
    }

    loadInitialBoards();

    // StrictMode 재실행이나 페이지 이동 시 이전 요청의 응답 반영 막기 위함
    return () => abortController.abort();
  }, [requestVersion]);

  const loadMoreBoards = useCallback(async () => {
    // 요청 중이거나 다음 페이지가 없으면 서버에 요청하지 않음
    if (
      isLoadingMoreRef.current ||
      !boardPage.hasNext ||
      boardPage.nextCursor == null
    ) {
      return;
    }

    // React state보다 ref를 먼저 잠가 같은 렌더 사이클의 중복 호출 차단
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    setLoadMoreError('');

    const abortController = new AbortController();
    loadMoreAbortControllerRef.current = abortController;

    try {
      const nextPage = await getBoards({
        // 백엔드가 직전 응답에 준 마지막 boardId를 keyset cursor로 사용
        cursor: boardPage.nextCursor,
        size: BOARD_PAGE_SIZE,
        signal: abortController.signal,
      });

      setBoardPage((currentPage) => {
        // 요청 사이에 같은 게시글이 들어와도 React key 중복과 중복 표시가 생기지 않게 함
        const loadedBoardIds = new Set(
          currentPage.content.map((board) => board.boardId),
        );
        const newBoards = nextPage.content.filter(
          (board) => !loadedBoardIds.has(board.boardId),
        );

        return {
          // 중복을 제거한 새 게시글만 기존 목록 뒤에 추가
          content: [...currentPage.content, ...newBoards],
          // 다음 요청은 방금 받은 cursor와 hasNext를 기준으로 판단
          nextCursor: nextPage.nextCursor,
          hasNext: nextPage.hasNext,
        };
      });
    } catch (error) {
      // 페이지 이동으로 취소한 요청은 실제 장애가 아니므로 오류 문구를 표시하지 않음
      if (error.name !== 'AbortError') {
        setLoadMoreError(
          error.message || '게시글을 추가로 불러오지 못했습니다.',
        );
      }
    } finally {
      // 현재 진행 중인 요청일 때만 로딩 잠금을 해제
      if (loadMoreAbortControllerRef.current === abortController) {
        loadMoreAbortControllerRef.current = null;
        isLoadingMoreRef.current = false;
        setIsLoadingMore(false);
      }
    }
  }, [boardPage.hasNext, boardPage.nextCursor]);

  useEffect(() => {
    const trigger = loadMoreTriggerRef.current;

    if (requestState !== 'success' || !boardPage.hasNext || !trigger) {
      return undefined;
    }

    // 화면 아래 감지 지점에 가까워지면 다음 cursor 페이지 요청
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          loadMoreBoards();
        }
      },
      { rootMargin: '300px 0px' },
    );

    observer.observe(trigger);
    // 의존 값 변경이나 페이지 이동 시 이전 observer가 남아 중복 호출하지 않게 함
    return () => observer.disconnect();
  }, [boardPage.hasNext, loadMoreBoards, requestState]);

  useEffect(
    () => () => {
      // 컴포넌트가 사라질 때 추가 페이지 응답이 뒤늦게 상태를 변경하지 않도록 취소
      loadMoreAbortControllerRef.current?.abort();
    },
    [],
  );

  const boards = boardPage.content;

  function handleBoardCreateRequest() {
    if (status === AUTH_STATUS.AUTHENTICATED) {
      navigate('/boards/new');
      return;
    }

    if (status === AUTH_STATUS.UNAUTHENTICATED) {
      setIsLoginModalOpen(true);
    }
  }

  function confirmBoardCreateLogin() {
    setIsLoginModalOpen(false);
    navigate('/login', {
      state: {
        from: { pathname: '/boards/new' },
        authRequired: true,
      },
    });
  }

  return (
    <>
      <AppHeader />

      <main className="boards-page">
        <section className="boards">
          <div className="boards__hero">
            <div className="boards__intro">
              <p className="boards__eyebrow">교통사고 과실 투표 커뮤니티</p>
              <h2>
                사고 상황을 공유하고
                <br />
                함께 판단해 보세요.
              </h2>
              <p>
                사진과 설명을 확인하고 더 과실이 크다고 생각하는 차량을
                판단해 보세요.
              </p>
            </div>

            <button
              type="button"
              className="boards__write-button"
              onClick={handleBoardCreateRequest}
              disabled={status === AUTH_STATUS.LOADING}
            >
              + 사고 사례 등록
            </button>
          </div>

          <div className="board-toolbar">
            <div className="board-tabs" role="tablist" aria-label="게시글 필터">
              <button
                type="button"
                className="board-tab is-active"
                role="tab"
                aria-selected="true"
              >
                전체 게시글
              </button>
              <button
                type="button"
                className="board-tab board-tab--coming-soon"
                role="tab"
                aria-selected="false"
                title="Redis 기반 HOT 게시글 기능으로 추후 제공됩니다."
                disabled
              >
                🔥 HOT 게시글
                <span className="board-tab__notice">준비 중</span>
              </button>
            </div>

            <span className="board-count">
              현재 {boards.length}개의 사례
            </span>
          </div>

          <section className="board-list" aria-label="게시글 목록">
            {/* 최초 요청과 추가 요청은 서로 다른 상태 UI를 사용한다. */}
            {requestState === 'loading' && (
              <p className="board-list-status">게시글을 불러오는 중...</p>
            )}

            {requestState === 'error' && (
              <div
                className="board-list-status board-list-status--error"
                role="alert"
              >
                {errorMessage}
                <button
                  type="button"
                  className="board-list-status__retry"
                  onClick={retryLoad}
                >
                  다시 시도
                </button>
              </div>
            )}

            {requestState === 'success' && boards.length === 0 && (
              <p className="board-list-status">등록된 게시글이 없습니다.</p>
            )}

            {requestState === 'success' &&
              boards.map((board) => (
                <BoardCard key={board.boardId} board={board} />
              ))}

            {/* 게시글이 있을 때만 목록 끝 감지 지점과 추가 조회 상태를 렌더링한다. */}
            {requestState === 'success' && boards.length > 0 && (
              <div
                ref={loadMoreTriggerRef}
                className="board-list-status board-list-status--more"
              >
                {isLoadingMore && '게시글을 더 불러오는 중...'}

                {!isLoadingMore && loadMoreError && (
                  <div className="board-list-status--error" role="alert">
                    {loadMoreError}
                    <button
                      type="button"
                      className="board-list-status__retry"
                      onClick={loadMoreBoards}
                    >
                      다시 시도
                    </button>
                  </div>
                )}

                {!isLoadingMore &&
                  !loadMoreError &&
                  !boardPage.hasNext &&
                  '모든 게시글을 확인했습니다.'}
              </div>
            )}
          </section>
        </section>
      </main>

      <LoginRequiredModal
        isOpen={isLoginModalOpen}
        description="사고 사례를 등록하려면 로그인이 필요합니다. 로그인하시겠습니까?"
        onCancel={() => setIsLoginModalOpen(false)}
        onConfirm={confirmBoardCreateLogin}
      />
    </>
  );
}
