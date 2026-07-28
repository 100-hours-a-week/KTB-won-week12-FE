import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import BoardCard from './BoardCard';

const BOARD = {
  boardId: 7,
  title: '교차로 사고 사례',
  likeCount: 3,
  commentCount: 4,
  viewCount: 10,
  createdAt: '2026-07-28T10:00:00',
  author: {
    nickname: '작성자',
    profileImage: 'https://example.com/profile.jpg',
  },
};

function renderCard(board = BOARD) {
  return render(
    <MemoryRouter>
      <BoardCard board={board} />
    </MemoryRouter>,
  );
}

describe('BoardCard', () => {
  it('카드 전체를 게시글 상세 주소로 연결하고 통계를 표시한다', () => {
    renderCard();

    const link = screen.getByRole('link', { name: /교차로 사고 사례/ });
    expect(link).toHaveAttribute('href', '/boards/7');
    const stats = screen.getByLabelText('게시글 통계');
    expect(within(stats).getByText('좋아요 3')).toBeInTheDocument();
    expect(within(stats).getByText('댓글 4')).toBeInTheDocument();
    expect(within(stats).getByText('조회 10')).toBeInTheDocument();
    expect(screen.getByText('작성자')).toBeInTheDocument();
    expect(link.querySelector('img')).toHaveAttribute(
      'src',
      BOARD.author.profileImage,
    );
  });

  it('프로필과 날짜가 없어도 카드 구조를 유지한다', () => {
    const { container } = renderCard({
      ...BOARD,
      createdAt: 'invalid-date',
      author: { nickname: '작성자', profileImage: null },
    });

    expect(container.querySelector('.board-card__author-image')).toBeInTheDocument();
    expect(container.querySelector('time')).toHaveTextContent('');
  });
});
