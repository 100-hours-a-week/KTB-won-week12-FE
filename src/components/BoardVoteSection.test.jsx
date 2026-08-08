import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBoardVoteResult, submitBoardVote } from '../api/voteApi';
import BoardVoteSection from './BoardVoteSection';

vi.mock('../api/voteApi', () => ({
  getBoardVoteResult: vi.fn(),
  submitBoardVote: vi.fn(),
}));

const BASE_VOTE = {
  voteId: 10,
  leftLabel: 'A 차량',
  rightLabel: 'B 차량',
  status: 'OPEN',
  startedAt: '2026-08-08T12:00:00',
  endsAt: '2026-08-09T12:00:00',
  totalVoteCount: 0,
  result: null,
  myVote: null,
};

describe('BoardVoteSection', () => {
  beforeEach(() => {
    getBoardVoteResult.mockReset();
    submitBoardVote.mockReset();
  });

  it('투표가 없는 게시글에는 아무 영역도 렌더링하지 않는다', () => {
    const { container } = render(
      <BoardVoteSection boardId={1} vote={null} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('응답 0건은 회색 트랙과 시작 안내를 표시하고 결과 버튼을 숨긴다', () => {
    const { container } = render(
      <BoardVoteSection boardId={1} vote={BASE_VOTE} />,
    );

    expect(screen.getByText('투표를 시작해보세요.')).toBeInTheDocument();
    expect(screen.getByText('아직 등록된 의견이 없습니다.')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '투표 결과 보기' }),
    ).not.toBeInTheDocument();
    expect(container.querySelector('.board-vote-result-track')).toHaveClass(
      'is-neutral',
    );
  });

  it('비참여자는 명시적으로 요청하기 전까지 결과를 숨긴다', async () => {
    const user = userEvent.setup();
    getBoardVoteResult.mockResolvedValueOnce({
      voteId: 10,
      totalVoteCount: 3,
      result: { leftScore: 6, rightScore: 4 },
    });
    const { container } = render(
      <BoardVoteSection
        boardId={1}
        vote={{ ...BASE_VOTE, totalVoteCount: 3 }}
      />,
    );

    expect(screen.queryByText('6')).not.toBeInTheDocument();
    expect(container.querySelector('.board-vote-result-track')).toHaveClass(
      'is-neutral',
    );

    await user.click(screen.getByRole('button', { name: '투표 결과 보기' }));

    await waitFor(() =>
      expect(getBoardVoteResult).toHaveBeenCalledWith(1, {
        signal: expect.any(AbortSignal),
      }),
    );
    expect(screen.getByRole('img')).toHaveAccessibleName('A 차량 6, B 차량 4');
    expect(container.querySelector('.board-vote-result-track')).toHaveClass(
      'has-result',
    );
  });

  it('이미 참여한 사용자는 내 의견과 집계 결과를 즉시 확인한다', () => {
    render(
      <BoardVoteSection
        boardId={1}
        vote={{
          ...BASE_VOTE,
          totalVoteCount: 4,
          result: { leftScore: 7, rightScore: 3 },
          myVote: { leftScore: 2, rightScore: 8 },
        }}
      />,
    );

    expect(screen.getByText('내 의견 2:8')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAccessibleName('A 차량 7, B 차량 3');
    expect(getBoardVoteResult).not.toHaveBeenCalled();
  });

  it('종료 상태와 공개 결과 조회 오류를 표시한다', async () => {
    const user = userEvent.setup();
    getBoardVoteResult.mockRejectedValueOnce({
      code: 'BOARD_VOTE_NOT_FOUND',
      message: 'server message',
    });
    render(
      <BoardVoteSection
        boardId={1}
        vote={{ ...BASE_VOTE, status: 'CLOSED', totalVoteCount: 2 }}
      />,
    );

    expect(screen.getByText('종료')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '투표 결과 보기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '이 게시글에는 투표가 없습니다.',
    );
    expect(screen.getByLabelText('과실 비율 선택')).toBeDisabled();
    expect(screen.getByRole('button', { name: '투표 종료' })).toBeDisabled();
  });

  it('로그인 사용자가 선택한 비율로 첫 투표하고 서버 집계로 화면을 갱신한다', async () => {
    const user = userEvent.setup();
    submitBoardVote.mockResolvedValueOnce({
      voteId: 10,
      status: 'OPEN',
      endsAt: BASE_VOTE.endsAt,
      totalVoteCount: 1,
      result: { leftScore: 8, rightScore: 2 },
      myVote: { leftScore: 8, rightScore: 2 },
    });
    const { container } = render(
      <BoardVoteSection
        boardId={1}
        vote={BASE_VOTE}
        isAuthenticated
      />,
    );

    // range 입력은 브라우저가 숫자 문자열을 전달하므로 컴포넌트에서 Number로 변환한다.
    fireEvent.change(screen.getByLabelText('과실 비율 선택'), {
      target: { value: '8' },
    });
    expect(screen.getByLabelText('과실 비율 선택')).toHaveAttribute(
      'aria-valuetext',
      'A 차량 8, B 차량 2',
    );
    expect(
      container.querySelector('.board-vote-input input'),
    ).toHaveClass('has-preview');

    await user.click(screen.getByRole('button', { name: '투표하기' }));

    await waitFor(() =>
      expect(submitBoardVote).toHaveBeenCalledWith(1, 8, {
        signal: expect.any(AbortSignal),
      }),
    );
    expect(await screen.findByText('내 의견 8:2')).toBeInTheDocument();
    expect(screen.getByText('총 1명 참여')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAccessibleName('A 차량 8, B 차량 2');
    // 저장 직후에는 서버에 저장된 값과 같으므로 불필요한 동일 재투표를 차단한다.
    expect(
      screen.getByRole('button', { name: '투표 변경하기' }),
    ).toBeDisabled();
  });

  it('기존 투표와 다른 비율을 선택한 경우에만 재투표할 수 있다', async () => {
    const user = userEvent.setup();
    submitBoardVote.mockResolvedValueOnce({
      voteId: 10,
      status: 'OPEN',
      endsAt: BASE_VOTE.endsAt,
      totalVoteCount: 4,
      result: { leftScore: 5, rightScore: 5 },
      myVote: { leftScore: 6, rightScore: 4 },
    });
    render(
      <BoardVoteSection
        boardId={1}
        vote={{
          ...BASE_VOTE,
          totalVoteCount: 4,
          result: { leftScore: 7, rightScore: 3 },
          myVote: { leftScore: 2, rightScore: 8 },
        }}
        isAuthenticated
      />,
    );

    const submitButton = screen.getByRole('button', {
      name: '투표 변경하기',
    });
    expect(submitButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('과실 비율 선택'), {
      target: { value: '6' },
    });
    expect(submitButton).toBeEnabled();
    await user.click(submitButton);

    expect(await screen.findByText('내 의견 6:4')).toBeInTheDocument();
    expect(submitBoardVote).toHaveBeenCalledTimes(1);
    expect(submitButton).toBeDisabled();
  });

  it('저장 요청 중에는 입력과 버튼을 잠가 중복 투표 요청을 막는다', async () => {
    const user = userEvent.setup();
    let resolveVote;
    submitBoardVote.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveVote = resolve;
      }),
    );
    render(
      <BoardVoteSection
        boardId={1}
        vote={BASE_VOTE}
        isAuthenticated
      />,
    );

    await user.click(screen.getByRole('button', { name: '투표하기' }));

    const pendingButton = screen.getByRole('button', {
      name: '투표 저장 중...',
    });
    expect(pendingButton).toBeDisabled();
    expect(screen.getByLabelText('과실 비율 선택')).toBeDisabled();
    await user.click(pendingButton);
    expect(submitBoardVote).toHaveBeenCalledTimes(1);

    resolveVote({
      voteId: 10,
      status: 'OPEN',
      endsAt: BASE_VOTE.endsAt,
      totalVoteCount: 1,
      result: { leftScore: 5, rightScore: 5 },
      myVote: { leftScore: 5, rightScore: 5 },
    });
    expect(await screen.findByText('내 의견 5:5')).toBeInTheDocument();
  });

  it('미인증 사용자는 API 대신 상세 페이지의 로그인 안내를 요청한다', async () => {
    const user = userEvent.setup();
    const onLoginRequired = vi.fn();
    render(
      <BoardVoteSection
        boardId={1}
        vote={BASE_VOTE}
        onLoginRequired={onLoginRequired}
      />,
    );

    expect(screen.getByLabelText('과실 비율 선택')).toBeDisabled();
    await user.click(
      screen.getByRole('button', { name: '로그인 후 투표하기' }),
    );

    expect(onLoginRequired).toHaveBeenCalledTimes(1);
    expect(submitBoardVote).not.toHaveBeenCalled();
  });

  it('투표 저장 오류는 사용자용 메시지로 표시하고 다시 제출할 수 있다', async () => {
    const user = userEvent.setup();
    submitBoardVote.mockRejectedValueOnce({ code: 'BOARD_VOTE_CLOSED' });
    render(
      <BoardVoteSection
        boardId={1}
        vote={BASE_VOTE}
        isAuthenticated
      />,
    );

    await user.click(screen.getByRole('button', { name: '투표하기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '이미 종료된 투표입니다.',
    );
    expect(screen.getByRole('button', { name: '투표하기' })).toBeEnabled();
  });
});
