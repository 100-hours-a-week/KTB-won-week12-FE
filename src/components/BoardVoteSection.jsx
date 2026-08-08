import { useEffect, useRef, useState } from 'react';
import { getBoardVoteResult, submitBoardVote } from '../api/voteApi';
import { getUserFriendlyErrorMessage } from '../utils/errorMessage';
import '../styles/components/BoardVoteSection.css';

function formatEndsAt(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function BoardVoteSection({
  boardId,
  vote,
  isAuthenticated = false,
  isAuthLoading = false,
  onLoginRequired,
}) {
  const [result, setResult] = useState(vote?.result ?? null);
  const [myVote, setMyVote] = useState(vote?.myVote ?? null);
  const [totalVoteCount, setTotalVoteCount] = useState(
    vote?.totalVoteCount ?? 0,
  );
  const [pendingLeftScore, setPendingLeftScore] = useState(
    vote?.myVote?.leftScore ?? 5,
  );
  const [hasAdjustedScore, setHasAdjustedScore] = useState(
    Boolean(vote?.myVote),
  );
  // 상세 API가 myVote와 result를 함께 반환한 참여자는 처음부터 결과를 볼 수 있다.
  const [isResultVisible, setIsResultVisible] = useState(
    Boolean(vote?.myVote && vote?.result),
  );
  const [isLoadingResult, setIsLoadingResult] = useState(false);
  const [resultError, setResultError] = useState('');
  const [isSubmittingVote, setIsSubmittingVote] = useState(false);
  const [voteSubmitError, setVoteSubmitError] = useState('');
  const resultAbortControllerRef = useRef(null);
  const submitAbortControllerRef = useRef(null);

  useEffect(() => {
    // 인증 상태 재조회 등으로 새 vote가 전달되면 이전 조회·저장 요청을 폐기한다.
    resultAbortControllerRef.current?.abort();
    resultAbortControllerRef.current = null;
    submitAbortControllerRef.current?.abort();
    submitAbortControllerRef.current = null;
    setResult(vote?.result ?? null);
    setMyVote(vote?.myVote ?? null);
    setTotalVoteCount(vote?.totalVoteCount ?? 0);
    setPendingLeftScore(vote?.myVote?.leftScore ?? 5);
    setHasAdjustedScore(Boolean(vote?.myVote));
    setIsResultVisible(Boolean(vote?.myVote && vote?.result));
    setIsLoadingResult(false);
    setIsSubmittingVote(false);
    setResultError('');
    setVoteSubmitError('');
  }, [vote]);

  useEffect(
    () => () => {
      // 상세 페이지를 벗어나면 진행 중인 공개 결과 요청의 상태 반영을 차단한다.
      resultAbortControllerRef.current?.abort();
      submitAbortControllerRef.current?.abort();
    },
    [],
  );

  if (!vote) {
    return null;
  }

  const isClosed = vote.status === 'CLOSED';
  const hasResponses = totalVoteCount > 0;
  const visibleResult = isResultVisible ? result : null;
  const leftPercent = visibleResult ? visibleResult.leftScore * 10 : 50;
  const pendingRightScore = 10 - pendingLeftScore;
  const isUnchangedVote = myVote?.leftScore === pendingLeftScore;
  const canSubmitVote =
    isAuthenticated &&
    !isClosed &&
    !isAuthLoading &&
    !isSubmittingVote &&
    !isLoadingResult &&
    !isUnchangedVote;

  async function handleResultLookup() {
    if (isLoadingResult || isSubmittingVote || !hasResponses) {
      return;
    }

    const abortController = new AbortController();
    resultAbortControllerRef.current?.abort();
    resultAbortControllerRef.current = abortController;
    setIsLoadingResult(true);
    setResultError('');

    try {
      const nextResult = await getBoardVoteResult(boardId, {
        signal: abortController.signal,
      });

      setResult(nextResult.result);
      setTotalVoteCount(nextResult.totalVoteCount);
      setIsResultVisible(nextResult.result != null);
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }
      setResultError(
        getUserFriendlyErrorMessage(error, {
          fallback: '투표 결과를 불러오지 못했습니다.',
        }),
      );
    } finally {
      if (resultAbortControllerRef.current === abortController) {
        resultAbortControllerRef.current = null;
        // 언마운트나 새 vote 반영으로 취소된 요청은 React 상태를 다시 변경하지 않는다.
        if (!abortController.signal.aborted) {
          setIsLoadingResult(false);
        }
      }
    }
  }

  async function handleVoteSubmit() {
    if (!isAuthenticated) {
      onLoginRequired?.();
      return;
    }
    if (!canSubmitVote) {
      return;
    }

    const abortController = new AbortController();
    submitAbortControllerRef.current?.abort();
    submitAbortControllerRef.current = abortController;
    setIsSubmittingVote(true);
    setVoteSubmitError('');

    try {
      const updatedVote = await submitBoardVote(boardId, pendingLeftScore, {
        signal: abortController.signal,
      });

      // 서버가 확정한 내 응답과 집계를 함께 교체해 첫 투표와 재투표를 동일하게 처리한다.
      setMyVote(updatedVote.myVote);
      setPendingLeftScore(updatedVote.myVote.leftScore);
      setHasAdjustedScore(true);
      setResult(updatedVote.result);
      setTotalVoteCount(updatedVote.totalVoteCount);
      setIsResultVisible(true);
      setResultError('');
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }
      setVoteSubmitError(
        getUserFriendlyErrorMessage(error, {
          fallback: '투표를 저장하지 못했습니다.',
        }),
      );
    } finally {
      if (submitAbortControllerRef.current === abortController) {
        submitAbortControllerRef.current = null;
        if (!abortController.signal.aborted) {
          setIsSubmittingVote(false);
        }
      }
    }
  }

  return (
    <section
      className="board-vote-section"
      aria-labelledby={`board-vote-title-${vote.voteId}`}
    >
      <div className="board-vote-section__heading">
        <div>
          <span className="board-vote-section__eyebrow">과실 투표</span>
          <h3 id={`board-vote-title-${vote.voteId}`}>
            두 차량의 과실 비율에 대한 의견
          </h3>
        </div>
        <span
          className={`board-vote-section__status ${isClosed ? 'is-closed' : ''}`}
        >
          {isClosed ? '종료' : '진행 중'}
        </span>
      </div>

      <div className="board-vote-section__labels">
        <strong>{vote.leftLabel}</strong>
        <strong>{vote.rightLabel}</strong>
      </div>

      <div
        className={`board-vote-result-track ${visibleResult ? 'has-result' : 'is-neutral'}`}
        style={{ '--left-percent': `${leftPercent}%` }}
        role="img"
        aria-label={
          visibleResult
            ? `${vote.leftLabel} ${visibleResult.leftScore}, ${vote.rightLabel} ${visibleResult.rightScore}`
            : '아직 공개되지 않은 투표 결과'
        }
      >
        {visibleResult && (
          <div className="board-vote-result-track__scores">
            <strong>{visibleResult.leftScore}</strong>
            <strong>{visibleResult.rightScore}</strong>
          </div>
        )}
      </div>

      {totalVoteCount === 0 ? (
        <div className="board-vote-section__empty">
          <strong>투표를 시작해보세요.</strong>
          <span>아직 등록된 의견이 없습니다.</span>
        </div>
      ) : (
        <div className="board-vote-section__result-summary">
          <span>총 {totalVoteCount}명 참여</span>
          {!isResultVisible && (
            <button
              type="button"
              onClick={handleResultLookup}
              disabled={isLoadingResult || isSubmittingVote}
            >
              {isLoadingResult ? '결과 불러오는 중...' : '투표 결과 보기'}
            </button>
          )}
        </div>
      )}

      {myVote && (
        <p className="board-vote-section__my-vote">
          내 의견 {myVote.leftScore}:{myVote.rightScore}
        </p>
      )}

      <div className="board-vote-input">
        <div className="board-vote-input__scores" aria-live="polite">
          <strong>{pendingLeftScore}</strong>
          <span>:</span>
          <strong>{pendingRightScore}</strong>
        </div>
        <input
          type="range"
          min="0"
          max="10"
          step="1"
          value={pendingLeftScore}
          disabled={
            !isAuthenticated || isClosed || isAuthLoading || isSubmittingVote
          }
          onChange={(event) => {
            setPendingLeftScore(Number(event.target.value));
            setHasAdjustedScore(true);
            setVoteSubmitError('');
          }}
          className={hasAdjustedScore ? 'has-preview' : 'is-neutral'}
          style={{ '--left-percent': `${pendingLeftScore * 10}%` }}
          aria-label="과실 비율 선택"
          aria-valuemin="0"
          aria-valuemax="10"
          aria-valuenow={pendingLeftScore}
          aria-valuetext={`${vote.leftLabel} ${pendingLeftScore}, ${vote.rightLabel} ${pendingRightScore}`}
        />

        <button
          type="button"
          className="board-vote-input__submit"
          onClick={handleVoteSubmit}
          disabled={
            isAuthenticated
              ? !canSubmitVote
              : isAuthLoading || isClosed || isSubmittingVote
          }
        >
          {isSubmittingVote
            ? '투표 저장 중...'
            : isClosed
              ? '투표 종료'
              : !isAuthenticated
                ? '로그인 후 투표하기'
                : myVote
                  ? '투표 변경하기'
                  : '투표하기'}
        </button>
      </div>

      <p className="board-vote-section__period">
        {formatEndsAt(vote.endsAt)} {isClosed ? '종료됨' : '마감'}
      </p>

      {resultError && (
        <p className="board-vote-section__error" role="alert">
          {resultError}
        </p>
      )}

      {voteSubmitError && (
        <p className="board-vote-section__error" role="alert">
          {voteSubmitError}
        </p>
      )}
    </section>
  );
}
