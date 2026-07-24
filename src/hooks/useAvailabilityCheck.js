import { useCallback, useEffect, useRef, useState } from 'react';

const INITIAL_AVAILABILITY = {
  status: 'idle',
  checkedValue: '',
  errorReason: null,
};

export default function useAvailabilityCheck(
  checkRequest,
  { timeoutMs = 8000 } = {},
) {
  const [availability, setAvailability] = useState(INITIAL_AVAILABILITY);

  // 이전 입력값의 요청 결과를 무시하기 위한 요청 순번
  const requestVersionRef = useRef(0);
  const abortControllerRef = useRef(null);

  const reset = useCallback(() => {
    requestVersionRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setAvailability(INITIAL_AVAILABILITY);
  }, []);

  const check = useCallback(
    async (value) => {
      const requestVersion = requestVersionRef.current + 1;
      requestVersionRef.current = requestVersion;
      abortControllerRef.current?.abort();

      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      let didTimeout = false;
      const timeoutId = window.setTimeout(() => {
        didTimeout = true;
        abortController.abort();
      }, timeoutMs);

      setAvailability({
        status: 'checking',
        checkedValue: value,
        errorReason: null,
      });

      try {
        const available = await checkRequest(value, {
          signal: abortController.signal,
        });

        // 요청 중 입력값이 변경된 경우 이전 요청 결과를 상태에 반영하지 않음
        if (requestVersionRef.current !== requestVersion) {
          return false;
        }

        setAvailability({
          status: available ? 'available' : 'unavailable',
          checkedValue: value,
          errorReason: null,
        });
        return available;
      } catch {
        if (requestVersionRef.current === requestVersion) {
          setAvailability({
            status: 'error',
            checkedValue: value,
            errorReason: didTimeout ? 'timeout' : 'network',
          });
        }
        return false;
      } finally {
        window.clearTimeout(timeoutId);

        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
      }
    },
    [checkRequest, timeoutMs],
  );

  useEffect(
    () => () => {
      // 컴포넌트가 사라진 뒤 도착한 요청 결과를 무효화
      requestVersionRef.current += 1;
      abortControllerRef.current?.abort();
    },
    [],
  );

  return {
    ...availability,
    check,
    reset,
  };
}
