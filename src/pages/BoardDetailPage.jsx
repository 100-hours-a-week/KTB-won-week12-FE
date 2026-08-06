import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  deleteBoard as requestBoardDelete,
  getBoard,
  likeBoard,
  unlikeBoard,
} from '../api/boardApi';
import {
  COMMENT_PAGE_SIZE,
  createComment,
  deleteComment,
  getComments,
  updateComment,
} from '../api/commentApi';
import { AUTH_STATUS, useAuth } from '../auth/AuthContext';
import AppHeader from '../components/AppHeader';
import CommentItem from '../components/CommentItem';
import ConfirmModal from '../components/ConfirmModal';
import LoginRequiredModal from '../components/LoginRequiredModal';
import '../styles/pages/BoardDetailPage.css';

function formatDateTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function BoardDetailPage() {
  const navigate = useNavigate();
  const { boardId: boardIdParam } = useParams();
  const { status } = useAuth();

  // URL 문자열을 백엔드가 사용하는 양의 정수 ID로 변환
  const boardId = Number(boardIdParam);
  const isValidBoardId =
    Number.isSafeInteger(boardId) && boardId > 0 && String(boardId) === boardIdParam;

  const [board, setBoard] = useState(null);
  const [boardRequestState, setBoardRequestState] = useState('loading');
  const [boardErrorMessage, setBoardErrorMessage] = useState('');
  const [boardRequestVersion, setBoardRequestVersion] = useState(0);

  // 지금까지 누적한 댓글과 다음 keyset cursor 정보를 함께 관리
  const [commentPage, setCommentPage] = useState({
    content: [],
    nextCursor: null,
    hasNext: false,
  });
  const [commentRequestState, setCommentRequestState] = useState('loading');
  const [commentErrorMessage, setCommentErrorMessage] = useState('');
  const [commentRequestVersion, setCommentRequestVersion] = useState(0);
  const [isLoadingMoreComments, setIsLoadingMoreComments] = useState(false);
  const [loadMoreCommentError, setLoadMoreCommentError] = useState('');

  const [isChangingLike, setIsChangingLike] = useState(false);
  const [likeErrorMessage, setLikeErrorMessage] = useState('');

  const [commentContent, setCommentContent] = useState('');
  const [isCreatingComment, setIsCreatingComment] = useState(false);
  const [commentCreateError, setCommentCreateError] = useState('');

  const [isBoardDeleteModalOpen, setIsBoardDeleteModalOpen] = useState(false);
  const [isDeletingBoard, setIsDeletingBoard] = useState(false);
  const [boardDeleteError, setBoardDeleteError] = useState('');

  const [commentToDelete, setCommentToDelete] = useState(null);
  const [isDeletingComment, setIsDeletingComment] = useState(false);
  const [commentDeleteError, setCommentDeleteError] = useState('');
  const [loginPromptDescription, setLoginPromptDescription] = useState('');

  // 조건부 sentinel이 실제 DOM에 연결된 시점을 effect 의존값으로 사용
  const [commentLoadTrigger, setCommentLoadTrigger] = useState(null);
  const isLoadingMoreCommentsRef = useRef(false);
  const loadMoreCommentAbortControllerRef = useRef(null);
  const commentRequestGenerationRef = useRef(0);

  const isAuthenticated = status === AUTH_STATUS.AUTHENTICATED;
  const isAuthLoading = status === AUTH_STATUS.LOADING;

  const moveToLogin = useCallback(() => {
    // 로그인 성공 후 현재 상세 주소로 돌아올 수 있도록 출발 경로 전달
    navigate('/login', {
      state: {
        from: { pathname: `/boards/${boardId}` },
        authRequired: true,
      },
    });
  }, [boardId, navigate]);

  const requestLogin = useCallback((description) => {
    setLoginPromptDescription(description);
  }, []);

  function confirmLoginRequest() {
    setLoginPromptDescription('');
    moveToLogin();
  }

  const cancelLoadMoreComments = useCallback(() => {
    // 댓글 변경 전 진행 중이던 다음 cursor 요청이 새 목록에 섞이지 않도록 취소
    loadMoreCommentAbortControllerRef.current?.abort();
    loadMoreCommentAbortControllerRef.current = null;
    isLoadingMoreCommentsRef.current = false;
    setIsLoadingMoreComments(false);
    setLoadMoreCommentError('');
  }, []);

  const reloadComments = useCallback(() => {
    cancelLoadMoreComments();
    setCommentRequestVersion((version) => version + 1);
  }, [cancelLoadMoreComments]);

  useEffect(() => {
    if (!isValidBoardId) {
      setBoard(null);
      setBoardErrorMessage('올바르지 않은 게시글 주소입니다.');
      setBoardRequestState('error');
      return undefined;
    }

    const abortController = new AbortController();

    async function loadBoard() {
      setBoardRequestState('loading');
      setBoardErrorMessage('');

      try {
        const nextBoard = await getBoard(boardId, {
          signal: abortController.signal,
        });

        setBoard(nextBoard);
        setBoardRequestState('success');
      } catch (error) {
        // 페이지 이동으로 취소한 요청은 실제 장애가 아니므로 오류를 표시하지 않음
        if (error.name === 'AbortError') {
          return;
        }

        setBoard(null);
        setBoardErrorMessage(
          error.status === 404
            ? '게시글을 찾을 수 없습니다.'
            : error.message || '게시글을 불러오지 못했습니다.',
        );
        setBoardRequestState('error');
      }
    }

    loadBoard();
    // 게시글 ID 변경이나 페이지 이동 시 이전 상세 응답 반영 차단
    return () => abortController.abort();
  }, [boardId, boardRequestVersion, isValidBoardId, status]);

  useEffect(() => {
    if (!isValidBoardId) {
      commentRequestGenerationRef.current += 1;
      cancelLoadMoreComments();
      setCommentPage({ content: [], nextCursor: null, hasNext: false });
      setCommentRequestState('error');
      setCommentErrorMessage('댓글을 조회할 수 없는 게시글 주소입니다.');
      return undefined;
    }

    // 게시글·인증 상태·재조회 버전이 바뀌면 이전 cursor 요청과 목록 폐기
    const requestGeneration = commentRequestGenerationRef.current + 1;
    commentRequestGenerationRef.current = requestGeneration;
    cancelLoadMoreComments();
    setCommentPage({ content: [], nextCursor: null, hasNext: false });

    const abortController = new AbortController();

    async function loadInitialComments() {
      setCommentRequestState('loading');
      setCommentErrorMessage('');
      setLoadMoreCommentError('');

      try {
        const page = await getComments(boardId, {
          size: COMMENT_PAGE_SIZE,
          signal: abortController.signal,
        });

        // 요청 도중 조회 대상이 바뀌었다면 오래된 첫 페이지 응답 무시
        if (commentRequestGenerationRef.current !== requestGeneration) {
          return;
        }

        // 첫 조회는 기존 누적 댓글에 붙이지 않고 페이지 전체를 교체
        setCommentPage(page);
        setCommentRequestState('success');
      } catch (error) {
        if (error.name === 'AbortError') {
          return;
        }

        if (commentRequestGenerationRef.current !== requestGeneration) {
          return;
        }

        setCommentPage({ content: [], nextCursor: null, hasNext: false });
        setCommentErrorMessage(
          error.message || '댓글을 불러오지 못했습니다.',
        );
        setCommentRequestState('error');
      }
    }

    loadInitialComments();
    return () => {
      // 의존값 변경 시 첫 페이지와 추가 페이지 요청을 함께 무효화
      abortController.abort();

      if (commentRequestGenerationRef.current === requestGeneration) {
        commentRequestGenerationRef.current += 1;
        loadMoreCommentAbortControllerRef.current?.abort();
        loadMoreCommentAbortControllerRef.current = null;
        isLoadingMoreCommentsRef.current = false;
      }
    };
  }, [
    boardId,
    cancelLoadMoreComments,
    commentRequestVersion,
    isValidBoardId,
    status,
  ]);

  const loadMoreComments = useCallback(async () => {
    // 요청 중이거나 다음 페이지가 없으면 서버에 요청하지 않음
    if (
      isLoadingMoreCommentsRef.current ||
      !commentPage.hasNext ||
      commentPage.nextCursor == null
    ) {
      return;
    }

    // React state보다 ref를 먼저 잠가 같은 렌더 사이클의 중복 호출 차단
    isLoadingMoreCommentsRef.current = true;
    setIsLoadingMoreComments(true);
    setLoadMoreCommentError('');

    const requestGeneration = commentRequestGenerationRef.current;
    const requestCursor = commentPage.nextCursor;
    const abortController = new AbortController();
    loadMoreCommentAbortControllerRef.current = abortController;

    try {
      const nextPage = await getComments(boardId, {
        // 백엔드가 직전 응답에 준 마지막 commentId를 keyset cursor로 사용
        cursor: requestCursor,
        size: COMMENT_PAGE_SIZE,
        signal: abortController.signal,
      });

      // 게시글이나 최초 목록이 바뀐 뒤 도착한 cursor 응답은 반영하지 않음
      if (commentRequestGenerationRef.current !== requestGeneration) {
        return;
      }

      setCommentPage((currentPage) => {
        // 같은 cursor가 이미 처리됐거나 목록이 교체된 경우 중복 응답 무시
        if (currentPage.nextCursor !== requestCursor) {
          return currentPage;
        }

        // 요청 사이의 변경에도 같은 댓글이 두 번 표시되지 않도록 ID로 중복 제거
        const loadedCommentIds = new Set(
          currentPage.content.map((comment) => comment.commentId),
        );
        const newComments = nextPage.content.filter(
          (comment) => !loadedCommentIds.has(comment.commentId),
        );

        return {
          content: [...currentPage.content, ...newComments],
          nextCursor: nextPage.nextCursor,
          hasNext: nextPage.hasNext,
        };
      });
    } catch (error) {
      if (error.name !== 'AbortError') {
        setLoadMoreCommentError(
          error.message || '댓글을 추가로 불러오지 못했습니다.',
        );
      }
    } finally {
      // 현재 진행 중인 요청일 때만 추가 조회 잠금을 해제
      if (loadMoreCommentAbortControllerRef.current === abortController) {
        loadMoreCommentAbortControllerRef.current = null;
        isLoadingMoreCommentsRef.current = false;
        setIsLoadingMoreComments(false);
      }
    }
  }, [boardId, commentPage.hasNext, commentPage.nextCursor]);

  useEffect(() => {
    if (
      commentRequestState !== 'success' ||
      !commentPage.hasNext ||
      !commentLoadTrigger
    ) {
      return undefined;
    }

    function loadNextPageIfNearViewport() {
      if (!commentLoadTrigger.isConnected) {
        return;
      }

      // 재진입 시 observer가 교차 변화를 놓쳐도 현재 위치로 추가 조회 판단
      const triggerTop = commentLoadTrigger.getBoundingClientRect().top;
      if (triggerTop <= window.innerHeight + 240) {
        loadMoreComments();
      }
    }

    // 댓글 목록 끝에 가까워지면 다음 cursor 페이지 요청
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          loadMoreComments();
        }
      },
      { rootMargin: '240px 0px' },
    );

    observer.observe(commentLoadTrigger);
    window.addEventListener('scroll', loadNextPageIfNearViewport, {
      passive: true,
    });
    window.addEventListener('resize', loadNextPageIfNearViewport);

    // observer 등록 전에 이미 감시 지점이 화면 근처인 재진입 상황도 확인
    const positionCheckFrame = window.requestAnimationFrame(
      loadNextPageIfNearViewport,
    );

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(positionCheckFrame);
      window.removeEventListener('scroll', loadNextPageIfNearViewport);
      window.removeEventListener('resize', loadNextPageIfNearViewport);
    };
  }, [
    commentLoadTrigger,
    commentPage.hasNext,
    commentRequestState,
    loadMoreComments,
  ]);

  useEffect(
    () => () => {
      // 페이지가 사라질 때 진행 중인 추가 댓글 요청의 응답 반영 차단
      loadMoreCommentAbortControllerRef.current?.abort();
    },
    [],
  );

  async function handleLikeChange() {
    if (!isAuthenticated) {
      requestLogin(
        '게시글에 반응하려면 로그인이 필요합니다. 로그인하시겠습니까?',
      );
      return;
    }

    setIsChangingLike(true);
    setLikeErrorMessage('');

    try {
      // 현재 선택 상태에 따라 멱등적인 좋아요 또는 취소 API 호출
      const like = board.likedByMe
        ? await unlikeBoard(boardId)
        : await likeBoard(boardId);

      // 추측으로 증감하지 않고 백엔드가 확정한 상태와 개수 사용
      setBoard((currentBoard) => ({
        ...currentBoard,
        likedByMe: like.liked,
        likeCount: like.likeCount,
      }));
    } catch (error) {
      if (error.status === 401) {
        moveToLogin();
        return;
      }

      setLikeErrorMessage(error.message || '좋아요를 변경하지 못했습니다.');
    } finally {
      setIsChangingLike(false);
    }
  }

  async function handleCommentCreate(event) {
    event.preventDefault();

    if (!isAuthenticated) {
      requestLogin(
        '댓글을 작성하려면 로그인이 필요합니다. 로그인하시겠습니까?',
      );
      return;
    }

    const content = commentContent.trim();
    if (!content || isCreatingComment) {
      return;
    }

    setIsCreatingComment(true);
    setCommentCreateError('');

    try {
      await createComment(boardId, content);
      setCommentContent('');

      // 댓글 생성 성공 후 상세 통계와 서버 기반 댓글 목록을 함께 갱신
      setBoard((currentBoard) => ({
        ...currentBoard,
        commentCount: currentBoard.commentCount + 1,
      }));
      reloadComments();
    } catch (error) {
      if (error.status === 401) {
        moveToLogin();
        return;
      }

      setCommentCreateError(
        error.message || '댓글을 등록하지 못했습니다.',
      );
    } finally {
      setIsCreatingComment(false);
    }
  }

  async function handleCommentUpdate(commentId, content) {
    try {
      await updateComment(commentId, content);
      // 수정 응답에는 내용과 수정 시간이 없으므로 목록을 다시 조회
      reloadComments();
    } catch (error) {
      if (error.status === 401) {
        moveToLogin();
      }
      throw error;
    }
  }

  function openCommentDeleteModal(comment) {
    setCommentDeleteError('');
    setCommentToDelete(comment);
  }

  function closeCommentDeleteModal() {
    if (!isDeletingComment) {
      setCommentToDelete(null);
      setCommentDeleteError('');
    }
  }

  async function confirmCommentDelete() {
    if (!commentToDelete || isDeletingComment) {
      return;
    }

    setIsDeletingComment(true);
    setCommentDeleteError('');

    try {
      await deleteComment(commentToDelete.commentId);
      setBoard((currentBoard) => ({
        ...currentBoard,
        commentCount: Math.max(0, currentBoard.commentCount - 1),
      }));
      setCommentToDelete(null);
      reloadComments();
    } catch (error) {
      if (error.status === 401) {
        setCommentToDelete(null);
        moveToLogin();
        return;
      }

      setCommentDeleteError(
        error.message || '댓글을 삭제하지 못했습니다.',
      );
    } finally {
      setIsDeletingComment(false);
    }
  }

  function openBoardDeleteModal() {
    setBoardDeleteError('');
    setIsBoardDeleteModalOpen(true);
  }

  function closeBoardDeleteModal() {
    if (!isDeletingBoard) {
      setIsBoardDeleteModalOpen(false);
      setBoardDeleteError('');
    }
  }

  async function confirmBoardDelete() {
    if (isDeletingBoard) {
      return;
    }

    setIsDeletingBoard(true);
    setBoardDeleteError('');

    try {
      await requestBoardDelete(boardId);
      navigate('/boards', { replace: true });
    } catch (error) {
      if (error.status === 401) {
        setIsBoardDeleteModalOpen(false);
        moveToLogin();
        return;
      }

      setBoardDeleteError(
        error.message || '게시글을 삭제하지 못했습니다.',
      );
    } finally {
      setIsDeletingBoard(false);
    }
  }

  return (
    <>
      <AppHeader onBack={() => navigate('/boards')} />

      <main className="board-detail-page">
        {boardRequestState === 'loading' && (
          <p className="board-detail-status">게시글을 불러오는 중...</p>
        )}

        {boardRequestState === 'error' && (
          <div className="board-detail-status is-error" role="alert">
            <p>{boardErrorMessage}</p>
            <div className="board-detail-status__actions">
              {isValidBoardId && (
                <button
                  type="button"
                  onClick={() => setBoardRequestVersion((version) => version + 1)}
                >
                  다시 시도
                </button>
              )}
              <button type="button" onClick={() => navigate('/boards')}>
                목록으로
              </button>
            </div>
          </div>
        )}

        {boardRequestState === 'success' && board && (
          <article className="board-detail">
            <section className="board-detail__header">
              <h2 className="board-detail__title">{board.title}</h2>

              <div className="board-detail__meta-row">
                <div className="board-detail__author">
                  {board.author.profileImage ? (
                    <img src={board.author.profileImage} alt="" />
                  ) : (
                    <span aria-hidden="true" />
                  )}
                  <strong>{board.author.nickname}</strong>
                </div>

                <time
                  className="board-detail__date"
                  dateTime={board.createdAt}
                >
                  {formatDateTime(board.createdAt)}
                </time>

                {board.editableByMe && (
                  <div className="board-detail__actions">
                    {/* 수정 경로도 보호 라우트로 감싸 인증 상태를 다시 확인 */}
                    <button
                      type="button"
                      onClick={() => navigate(`/boards/${boardId}/edit`)}
                    >
                      수정
                    </button>
                    <button type="button" onClick={openBoardDeleteModal}>
                      삭제
                    </button>
                  </div>
                )}
              </div>
            </section>

            <section className="board-detail__content">
              {board.images.length > 0 ? (
                <div className="board-detail__images">
                  {/* Presigned URL은 재조회마다 달라질 수 있어 DB 식별자를 Key로 사용하고 원본 URL로 표시 */}
                  {board.images.map((image, index) => (
                    <img
                      key={image.imageId ?? image.originalObjectKey}
                      src={image.originalImageUrl}
                      alt={`게시글 이미지 ${index + 1}`}
                      loading="lazy"
                      decoding="async"
                    />
                  ))}
                </div>
              ) : (
                // 등록 이미지가 없어도 크맵 상세 화면의 이미지 영역 유지
                <div
                  className="board-detail__image-placeholder"
                  aria-label="등록된 게시글 이미지 없음"
                >
                  등록된 사고 이미지가 없습니다.
                </div>
              )}

              <p className="board-detail__text">{board.content}</p>
            </section>

            {/* 백엔드 투표 API가 준비되기 전까지 표시만 하는 비활성 UI */}
            <section
              className="vote-section"
              aria-labelledby="vote-section-title"
            >
              <div className="vote-section__heading">
                <div>
                  <span className="vote-section__eyebrow">과실 투표</span>
                  <h3 id="vote-section-title">
                    어느 차량의 과실이 더 크다고 생각하나요?
                  </h3>
                </div>
                <span className="vote-section__notice">준비 중</span>
              </div>

              <div className="vote-options">
                <button type="button" className="vote-option" disabled>
                  <span>A 차량</span>
                  <strong>투표 준비 중</strong>
                </button>
                <span className="vote-versus">VS</span>
                <button type="button" className="vote-option" disabled>
                  <span>B 차량</span>
                  <strong>투표 준비 중</strong>
                </button>
              </div>
              <p className="vote-section__guide">
                투표 기능은 백엔드 API 구현 후 제공됩니다.
              </p>
            </section>

            <section className="board-stats" aria-label="게시글 통계">
              <button
                type="button"
                className={`board-stat ${board.likedByMe ? 'is-liked' : ''}`}
                aria-pressed={board.likedByMe}
                onClick={handleLikeChange}
                disabled={isAuthLoading || isChangingLike}
              >
                <strong>{board.likeCount}</strong>
                <span>
                  {isChangingLike
                    ? '처리 중...'
                    : board.likedByMe
                      ? '도움됐어요'
                      : '도움돼요'}
                </span>
              </button>
              <div className="board-stat">
                <strong>{board.viewCount}</strong>
                <span>조회수</span>
              </div>
              <div className="board-stat">
                <strong>{board.commentCount}</strong>
                <span>댓글</span>
              </div>
            </section>

            {likeErrorMessage && (
              <p className="board-mutation-error" role="alert">
                {likeErrorMessage}
              </p>
            )}

            <form className="comment-write" onSubmit={handleCommentCreate}>
              <textarea
                className="comment-write__textarea"
                placeholder={
                  isAuthenticated
                    ? '댓글을 남겨주세요!'
                    : '로그인 후 댓글을 작성할 수 있습니다.'
                }
                aria-label="댓글 내용"
                value={commentContent}
                onChange={(event) => {
                  setCommentContent(event.target.value);
                  setCommentCreateError('');
                }}
                disabled={!isAuthenticated || isCreatingComment}
              />

              {commentCreateError && (
                <p className="comment-write__error" role="alert">
                  {commentCreateError}
                </p>
              )}

              <div className="comment-write__submit-row">
                <button
                  type={isAuthenticated ? 'submit' : 'button'}
                  className={
                    !isAuthLoading &&
                    (!isAuthenticated || commentContent.trim())
                      ? 'is-active'
                      : ''
                  }
                  onClick={
                    isAuthenticated
                      ? undefined
                      : () =>
                          requestLogin(
                            '댓글을 작성하려면 로그인이 필요합니다. 로그인하시겠습니까?',
                          )
                  }
                  disabled={
                    isAuthLoading ||
                    (isAuthenticated &&
                      (!commentContent.trim() || isCreatingComment))
                  }
                >
                  {isCreatingComment
                    ? '등록 중...'
                    : isAuthenticated
                      ? '댓글 등록'
                      : '로그인 후 댓글 작성'}
                </button>
              </div>
            </form>

            <section className="comment-list" aria-label="댓글 목록">
              <h3 className="comment-list__title">댓글</h3>

              {commentRequestState === 'loading' && (
                <p className="comment-list__status">
                  댓글을 불러오는 중...
                </p>
              )}

              {commentRequestState === 'error' && (
                <div className="comment-list__status is-error" role="alert">
                  {commentErrorMessage}
                  <button
                    type="button"
                    onClick={() =>
                      setCommentRequestVersion((version) => version + 1)
                    }
                  >
                    다시 시도
                  </button>
                </div>
              )}

              {commentRequestState === 'success' &&
                commentPage.content.length === 0 && (
                  <p className="comment-list__status">
                    등록된 댓글이 없습니다.
                  </p>
                )}

              {commentRequestState === 'success' &&
                commentPage.content.map((comment) => (
                  <CommentItem
                    key={comment.commentId}
                    comment={comment}
                    onUpdate={handleCommentUpdate}
                    onDelete={openCommentDeleteModal}
                  />
                ))}

              {commentRequestState === 'success' &&
                commentPage.content.length > 0 && (
                  <div
                    ref={setCommentLoadTrigger}
                    className="comment-list__status comment-list__status--more"
                  >
                    {isLoadingMoreComments && '댓글을 더 불러오는 중...'}

                    {!isLoadingMoreComments && loadMoreCommentError && (
                      <div className="is-error" role="alert">
                        {loadMoreCommentError}
                        <button type="button" onClick={loadMoreComments}>
                          다시 시도
                        </button>
                      </div>
                    )}

                    {!isLoadingMoreComments &&
                      !loadMoreCommentError &&
                      !commentPage.hasNext &&
                      '모든 댓글을 확인했습니다.'}
                  </div>
                )}
            </section>
          </article>
        )}
      </main>

      <ConfirmModal
        isOpen={isBoardDeleteModalOpen}
        title="게시글을 삭제하시겠습니까?"
        description="삭제한 게시글은 복구할 수 없습니다."
        confirmLabel="삭제"
        isSubmitting={isDeletingBoard}
        errorMessage={boardDeleteError}
        onCancel={closeBoardDeleteModal}
        onConfirm={confirmBoardDelete}
      />

      <ConfirmModal
        isOpen={commentToDelete != null}
        title="댓글을 삭제하시겠습니까?"
        description="삭제한 댓글은 복구할 수 없습니다."
        confirmLabel="삭제"
        isSubmitting={isDeletingComment}
        errorMessage={commentDeleteError}
        onCancel={closeCommentDeleteModal}
        onConfirm={confirmCommentDelete}
      />

      <LoginRequiredModal
        isOpen={Boolean(loginPromptDescription)}
        description={loginPromptDescription}
        onCancel={() => setLoginPromptDescription('')}
        onConfirm={confirmLoginRequest}
      />
    </>
  );
}
