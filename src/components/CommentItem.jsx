import { useState } from 'react';
import '../styles/components/CommentItem.css';

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

export default function CommentItem({ comment, onUpdate, onDelete }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState('');

  const trimmedEditContent = editContent.trim();
  const canUpdate =
    trimmedEditContent.length > 0 &&
    trimmedEditContent !== comment.content &&
    !isUpdating;

  async function handleUpdate() {
    if (!canUpdate) {
      return;
    }

    setIsUpdating(true);
    setUpdateError('');

    try {
      await onUpdate(comment.commentId, trimmedEditContent);
      setIsEditing(false);
    } catch (error) {
      setUpdateError(error.message || '댓글을 수정하지 못했습니다.');
    } finally {
      setIsUpdating(false);
    }
  }

  function cancelEdit() {
    setEditContent(comment.content);
    setUpdateError('');
    setIsEditing(false);
  }

  return (
    <article className="comment-item">
      {/* 프로필 URL이 없으면 댓글 정렬을 유지하기 위한 기본 이미지 표시 */}
      {comment.author.profileImage ? (
        <img
          className="comment-item__image"
          src={comment.author.profileImage}
          alt=""
        />
      ) : (
        <span className="comment-item__image" aria-hidden="true" />
      )}

      <div className="comment-item__body">
        <header className="comment-item__header">
          <strong className="comment-item__author">
            {comment.author.nickname}
          </strong>
          {/* dateTime에는 백엔드 원본 값을 유지해 화면 표시값과 분리 */}
          <time className="comment-item__date" dateTime={comment.createdAt}>
            {formatDateTime(comment.createdAt)}
          </time>
        </header>

        {isEditing ? (
          <div className="comment-item__edit">
            <textarea
              aria-label="댓글 수정 내용"
              value={editContent}
              onChange={(event) => {
                setEditContent(event.target.value);
                setUpdateError('');
              }}
              disabled={isUpdating}
            />
            {updateError && (
              <p className="comment-item__error" role="alert">
                {updateError}
              </p>
            )}
            <div className="comment-item__edit-actions">
              <button type="button" onClick={cancelEdit} disabled={isUpdating}>
                취소
              </button>
              <button
                type="button"
                className="is-primary"
                onClick={handleUpdate}
                disabled={!canUpdate}
              >
                {isUpdating ? '수정 중...' : '수정 완료'}
              </button>
            </div>
          </div>
        ) : (
          <p className="comment-item__content">{comment.content}</p>
        )}
      </div>

      {comment.editableByMe && !isEditing && (
        <div className="comment-item__actions">
          <button
            type="button"
            onClick={() => {
              setEditContent(comment.content);
              setUpdateError('');
              setIsEditing(true);
            }}
          >
            수정
          </button>
          <button
            type="button"
            className="is-delete"
            onClick={() => onDelete(comment)}
          >
            삭제
          </button>
        </div>
      )}
    </article>
  );
}
