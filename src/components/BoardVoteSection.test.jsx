import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBoardVoteResult } from '../api/voteApi';
import BoardVoteSection from './BoardVoteSection';

vi.mock('../api/voteApi', () => ({
  getBoardVoteResult: vi.fn(),
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
  beforeEach(() => getBoardVoteResult.mockReset());

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
  });
});
