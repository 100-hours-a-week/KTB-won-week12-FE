import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ToastProvider, { useToast } from './ToastProvider';

function ToastControls() {
  const { showToast } = useToast();

  return (
    <div>
      <button type="button" onClick={() => showToast('저장되었습니다.')}>
        성공 알림
      </button>
      <button
        type="button"
        onClick={() => showToast('저장 실패', { type: 'error', duration: 1000 })}
      >
        오류 알림
      </button>
    </div>
  );
}

function renderToastProvider() {
  return render(
    <ToastProvider>
      <ToastControls />
    </ToastProvider>,
  );
}

describe('ToastProvider', () => {
  afterEach(() => vi.useRealTimers());

  it('기본 성공 알림을 status로 표시하고 닫을 수 있다', async () => {
    const user = userEvent.setup();
    renderToastProvider();

    await user.click(screen.getByRole('button', { name: '성공 알림' }));
    expect(screen.getByRole('status')).toHaveTextContent('저장되었습니다.');
    await user.click(screen.getByRole('button', { name: '알림 닫기' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('오류 알림을 alert로 표시하고 지정 시간 후 제거한다', () => {
    vi.useFakeTimers();
    renderToastProvider();

    fireEvent.click(screen.getByRole('button', { name: '오류 알림' }));
    expect(screen.getByRole('alert')).toHaveTextContent('저장 실패');

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
