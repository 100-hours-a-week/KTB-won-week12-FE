import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import Portal from './Portal';
import '../styles/components/Toast.css';

const ToastContext = createContext(null);

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast는 ToastProvider 내부에서 사용해야 합니다.');
  }

  return context;
}

export default function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);

  const showToast = useCallback(
    (message, { type = 'success', duration = 2500 } = {}) => {
      setToast({
        id: `${Date.now()}-${Math.random()}`,
        message,
        type,
        duration,
      });
    },
    [],
  );

  const hideToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timerId = window.setTimeout(hideToast, toast.duration);
    return () => window.clearTimeout(timerId);
  }, [hideToast, toast]);

  const contextValue = useMemo(
    () => ({ showToast, hideToast }),
    [hideToast, showToast],
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}

      {toast && (
        <Portal>
          <div
            className={`app-toast is-${toast.type}`}
            role={toast.type === 'error' ? 'alert' : 'status'}
            aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
          >
            <span>{toast.message}</span>
            <button type="button" onClick={hideToast} aria-label="알림 닫기">
              ×
            </button>
          </div>
        </Portal>
      )}
    </ToastContext.Provider>
  );
}
