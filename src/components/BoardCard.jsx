import { Link } from 'react-router-dom';
import DefaultProfileAvatar from './DefaultProfileAvatar';
import '../styles/components/BoardCard.css';

export default function BoardCard({ board }) {
  // 백엔드 LocalDateTime 문자열을 Date로 변환해 한국어 형식으로 표시
  const createdAt = new Date(board.createdAt);
  const formattedCreatedAt = Number.isNaN(createdAt.getTime())
    ? ''
    : new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(createdAt);

  return (
    // 카드 전체를 상세 주소로 연결해 마우스와 키보드 모두 접근 가능
    <Link className="board-card-link" to={`/boards/${board.boardId}`}>
      <article className="board-card">
        {/* 목록에서는 원본 대신 백엔드가 발급한 저용량 썸네일 Presigned GET URL 사용 */}
        {board.thumbnailImageUrl ? (
          <img
            className="board-card__thumbnail"
            src={board.thumbnailImageUrl}
            alt={`${board.title} 대표 이미지`}
            loading="lazy"
            decoding="async"
          />
        ) : (
          // 첨부 이미지가 없으면 카드 높이는 유지하면서 크맵 브랜드 로고 표시
          <div
            className="board-card__thumbnail board-card__thumbnail--empty"
            aria-label="등록된 게시글 이미지 없음"
          >
            <img
              className="board-card__empty-logo"
              src="/kmap_logo.svg"
              alt=""
              aria-hidden="true"
            />
          </div>
        )}

        <div className="board-card__body">
          <h3 className="board-card__title">{board.title}</h3>

          <div className="board-card__meta" aria-label="게시글 통계">
            <span>좋아요 {board.likeCount}</span>
            <span>댓글 {board.commentCount}</span>
            <span>조회 {board.viewCount}</span>
          </div>
        </div>

        <footer className="board-card__footer">
          {/* 프로필 URL이 없으면 카드 레이아웃을 유지하기 위한 기본 이미지 표시 */}
          {board.author.profileImage ? (
            <img
              className="board-card__author-image"
              src={board.author.profileImage}
              alt=""
            />
          ) : (
            <DefaultProfileAvatar className="board-card__author-image" />
          )}
          <span className="board-card__author-name">
            {board.author.nickname}
          </span>
          {/* dateTime에는 원본 값을 유지해 화면 표시값과 기계 판독값 분리 */}
          <time className="board-card__date" dateTime={board.createdAt}>
            {formattedCreatedAt}
          </time>
        </footer>
      </article>
    </Link>
  );
}
