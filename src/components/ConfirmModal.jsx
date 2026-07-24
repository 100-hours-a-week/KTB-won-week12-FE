import { useEffect } from 'react';
import Portal from './Portal';
import '../styles/components/ConfirmModal.css';

export default function ConfirmModal({
  isOpen,
  title,
  description,
  confirmLabel = '확인',
  isSubmitting = false,
  errorMessage = '',
  children,
  onCancel,
  onConfirm,
}) {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      // 요청 중이 아닐 때 Escape 키로 확인 창을 닫을 수 있도록 처리
      if (event.key === 'Escape' && !isSubmitting) {
        onCancel();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onCancel]);

  if (!isOpen) {
    return null;
  }

  return (
    <Portal>
      <div
        className="confirm-modal-backdrop"
        role="presentation"
        onMouseDown={(event) => {
          // 요청 중이 아닐 때 모달 바깥 영역을 누르면 취소
          if (event.target === event.currentTarget && !isSubmitting) {
            onCancel();
          }
        }}
      >
        <section
          className="confirm-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-modal-title"
          aria-describedby="confirm-modal-description"
        >
          <h3 id="confirm-modal-title">{title}</h3>
          <p id="confirm-modal-description">{description}</p>

          {errorMessage && (
            <p className="confirm-modal__error" role="alert">
              {errorMessage}
            </p>
          )}

          {children}

          <div className="confirm-modal__actions">
            <button type="button" onClick={onCancel} disabled={isSubmitting}>
              취소
            </button>
            <button
              type="button"
              className="is-confirm"
              onClick={onConfirm}
              disabled={isSubmitting}
            >
              {isSubmitting ? '처리 중...' : confirmLabel}
            </button>
          </div>
        </section>
      </div>
    </Portal>
  );
}
