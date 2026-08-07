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
  // 게시글 목록 API가 첫 번째 이미지로 발급한 대표 썸네일 URL
  thumbnailImageUrl: 'https://example.com/board-thumbnail.webp',
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
    // 대표 썸네일과 작성자 프로필은 서로 다른 URL을 각 이미지 영역에서 사용
    expect(
      screen.getByRole('img', { name: '교차로 사고 사례 대표 이미지' }),
    ).toHaveAttribute('src', BOARD.thumbnailImageUrl);
    expect(link.querySelector('.board-card__author-image')).toHaveAttribute(
      'src',
      BOARD.author.profileImage,
    );
  });

  it('프로필과 날짜가 없어도 카드 구조를 유지한다', () => {
    const { container } = renderCard({
      ...BOARD,
      createdAt: 'invalid-date',
      thumbnailImageUrl: null,
      author: { nickname: '작성자', profileImage: null },
    });

    // 첨부 이미지가 없으면 사고 사진 대신 크맵 로고가 들어간 카드 영역 표시
    const emptyThumbnail = screen.getByLabelText('등록된 게시글 이미지 없음');
    expect(emptyThumbnail).toBeInTheDocument();
    expect(emptyThumbnail.querySelector('.board-card__empty-logo')).toHaveAttribute(
      'src',
      '/kmap_logo.svg',
    );
    expect(
      screen.queryByRole('img', { name: /대표 이미지/ }),
    ).not.toBeInTheDocument();
    const defaultAvatar = container.querySelector(
      '.board-card__author-image.default-profile-avatar',
    );
    expect(defaultAvatar).toBeInTheDocument();
    expect(defaultAvatar.querySelector('svg')).toBeInTheDocument();
    expect(container.querySelector('time')).toHaveTextContent('');
  });
});
