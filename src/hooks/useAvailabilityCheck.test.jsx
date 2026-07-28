import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import useAvailabilityCheck from './useAvailabilityCheck';

describe('useAvailabilityCheck', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('사용 가능한 값의 확인 결과를 저장한다', async () => {
    const checkRequest = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() =>
      useAvailabilityCheck(checkRequest),
    );

    let available;
    await act(async () => {
      available = await result.current.check('확인값');
    });

    expect(available).toBe(true);
    expect(result.current).toMatchObject({
      status: 'available',
      checkedValue: '확인값',
      errorReason: null,
    });
    expect(checkRequest).toHaveBeenCalledWith('확인값', {
      signal: expect.any(AbortSignal),
    });
  });

  it('이미 사용 중인 값은 unavailable 상태로 저장한다', async () => {
    const checkRequest = vi.fn().mockResolvedValue(false);
    const { result } = renderHook(() =>
      useAvailabilityCheck(checkRequest),
    );

    await act(async () => {
      await result.current.check('중복값');
    });

    expect(result.current).toMatchObject({
      status: 'unavailable',
      checkedValue: '중복값',
      errorReason: null,
    });
  });

  it('네트워크 요청 실패를 별도 오류 상태로 구분한다', async () => {
    const checkRequest = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const { result } = renderHook(() =>
      useAvailabilityCheck(checkRequest),
    );

    let available;
    await act(async () => {
      available = await result.current.check('확인값');
    });

    expect(available).toBe(false);
    expect(result.current).toMatchObject({
      status: 'error',
      checkedValue: '확인값',
      errorReason: 'network',
    });
  });

  it('제한 시간을 넘긴 요청을 중단하고 timeout으로 구분한다', async () => {
    vi.useFakeTimers();
    const checkRequest = vi.fn(
      (value, { signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(new DOMException('요청 중단', 'AbortError'));
          });
        }),
    );
    const { result } = renderHook(() =>
      useAvailabilityCheck(checkRequest, { timeoutMs: 1000 }),
    );

    let checkPromise;
    act(() => {
      checkPromise = result.current.check('확인값');
    });

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await checkPromise;
    });

    expect(result.current).toMatchObject({
      status: 'error',
      checkedValue: '확인값',
      errorReason: 'timeout',
    });
  });

  it('입력 변경으로 reset하면 진행 중 요청을 중단하고 결과를 무효화한다', async () => {
    const checkRequest = vi.fn(
      (value, { signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(new DOMException('요청 중단', 'AbortError'));
          });
        }),
    );
    const { result } = renderHook(() =>
      useAvailabilityCheck(checkRequest),
    );

    let checkPromise;
    act(() => {
      checkPromise = result.current.check('이전값');
    });
    expect(result.current.status).toBe('checking');

    act(() => {
      result.current.reset();
    });
    await act(async () => {
      await checkPromise;
    });

    expect(result.current).toMatchObject({
      status: 'idle',
      checkedValue: '',
      errorReason: null,
    });
  });
});
