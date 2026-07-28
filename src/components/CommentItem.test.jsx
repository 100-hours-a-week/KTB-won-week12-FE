import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CommentItem from './CommentItem';

const COMMENT = {
  commentId: 10,
  content: '기존 댓글',
  createdAt: '2026-07-28T10:00:00',
  editableByMe: true,
  author: { nickname: '댓글 작성자', profileImage: null },
};

function renderComment(overrides = {}, handlers = {}) {
  const onUpdate = handlers.onUpdate ?? vi.fn().mockResolvedValue(undefined);
  const onDelete = handlers.onDelete ?? vi.fn();
  render(
    <CommentItem
      comment={{ ...COMMENT, ...overrides }}
      onUpdate={onUpdate}
      onDelete={onDelete}
    />,
  );
  return { onUpdate, onDelete };
}

describe('CommentItem', () => {
  it('수정 권한이 없는 댓글에는 관리 버튼을 표시하지 않는다', () => {
    renderComment({ editableByMe: false });

    expect(screen.getByText('기존 댓글')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '수정' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument();
  });

  it('수정 내용을 trim해서 전달하고 편집 상태를 종료한다', async () => {
    const user = userEvent.setup();
    const handlers = renderComment();

    await user.click(screen.getByRole('button', { name: '수정' }));
    const textarea = screen.getByLabelText('댓글 수정 내용');
    await user.clear(textarea);
    await user.type(textarea, '  수정된 댓글  ');
    await user.click(screen.getByRole('button', { name: '수정 완료' }));

    expect(handlers.onUpdate).toHaveBeenCalledWith(10, '수정된 댓글');
    expect(await screen.findByText('기존 댓글')).toBeInTheDocument();
  });

  it('변경하지 않은 내용은 제출하지 않고 취소하면 원래 내용으로 돌아간다', async () => {
    const user = userEvent.setup();
    const handlers = renderComment();

    await user.click(screen.getByRole('button', { name: '수정' }));
    expect(screen.getByRole('button', { name: '수정 완료' })).toBeDisabled();
    await user.type(screen.getByLabelText('댓글 수정 내용'), ' 임시');
    await user.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.getByText('기존 댓글')).toBeInTheDocument();
    expect(handlers.onUpdate).not.toHaveBeenCalled();
  });

  it('수정 실패 메시지를 표시하고 편집을 유지한다', async () => {
    const user = userEvent.setup();
    renderComment({}, {
      onUpdate: vi.fn().mockRejectedValue(new Error('댓글 수정 실패')),
    });

    await user.click(screen.getByRole('button', { name: '수정' }));
    const textarea = screen.getByLabelText('댓글 수정 내용');
    await user.clear(textarea);
    await user.type(textarea, '수정 시도');
    await user.click(screen.getByRole('button', { name: '수정 완료' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('댓글 수정 실패');
    expect(screen.getByLabelText('댓글 수정 내용')).toBeInTheDocument();
  });

  it('삭제 버튼은 선택한 댓글 전체를 전달한다', async () => {
    const user = userEvent.setup();
    const handlers = renderComment();

    await user.click(screen.getByRole('button', { name: '삭제' }));
    expect(handlers.onDelete).toHaveBeenCalledWith(COMMENT);
  });
});
