import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ConfirmModal from './ConfirmModal';

function renderModal(overrides = {}) {
  const props = {
    isOpen: true,
    title: '삭제하시겠습니까?',
    description: '삭제 후 복구할 수 없습니다.',
    confirmLabel: '삭제',
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
    ...overrides,
  };

  render(<ConfirmModal {...props} />);
  return props;
}

describe('ConfirmModal', () => {
  it('닫힌 상태에서는 dialog를 렌더링하지 않는다', () => {
    renderModal({ isOpen: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('취소와 확인 동작을 각각 전달한다', async () => {
    const user = userEvent.setup();
    const props = renderModal();
    const dialog = screen.getByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: '취소' }));
    await user.click(within(dialog).getByRole('button', { name: '삭제' }));

    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('Escape와 바깥 영역으로 모달을 취소한다', () => {
    const props = renderModal();

    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.mouseDown(screen.getByRole('presentation'));

    expect(props.onCancel).toHaveBeenCalledTimes(2);
  });

  it('처리 중에는 버튼과 Escape·바깥 취소를 모두 막는다', () => {
    const props = renderModal({ isSubmitting: true });
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByRole('button', { name: '취소' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: '처리 중...' })).toBeDisabled();
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.mouseDown(screen.getByRole('presentation'));
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it('오류 메시지와 추가 입력 내용을 dialog 안에 표시한다', () => {
    render(
      <ConfirmModal
        isOpen
        title="확인"
        description="설명"
        errorMessage="요청 실패"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      >
        <label htmlFor="reason">사유</label>
        <input id="reason" />
      </ConfirmModal>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('요청 실패');
    expect(screen.getByLabelText('사유')).toBeInTheDocument();
  });
});
