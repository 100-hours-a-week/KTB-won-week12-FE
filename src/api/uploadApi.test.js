import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { request } from './httpClient';
import {
  BoardImageUploadError,
  requestBoardImageUploadUrls,
  uploadBoardImages,
} from './uploadApi';
import { BOARD_IMAGE_MAX_THUMBNAIL_SIZE } from '../utils/imageProcessing';

// 백엔드 호출은 httpClient 자체 테스트의 범위이므로 여기서는 mock으로 격리한다.
// uploadApi가 어떤 경로와 body를 전달하는지만 검증한다.
vi.mock('./httpClient', () => ({
  request: vi.fn(),
}));

// imageProcessing이 완료한 뒤 uploadApi가 받게 되는 원본·썸네일 쌍 생성
function preparedImage(name = 'accident.png', type = 'image/png') {
  return {
    originalFile: new File(['original-image'], name, { type }),
    thumbnailFile: new File(['thumbnail-image'], 'thumbnail.webp', {
      type: 'image/webp',
    }),
  };
}

// 백엔드가 발급했다고 가정할 Presigned URL과 Object Key 응답 생성
function uploadTarget(index = 1, originalType = 'image/png') {
  return {
    originalObjectKey: `boards/7/group-${index}/original.png`,
    originalUploadUrl: `https://bucket.example/original-${index}`,
    originalContentType: originalType,
    thumbnailObjectKey: `boards/7/group-${index}/thumbnail.webp`,
    thumbnailUploadUrl: `https://bucket.example/thumbnail-${index}`,
    thumbnailContentType: 'image/webp',
    expiresAt: '2026-08-06T00:00:00Z',
  };
}

describe('uploadApi', () => {
  beforeEach(() => {
    // 전역 fetch는 S3 PUT 요청으로 사용되므로 실제 네트워크 대신 mock으로 교체
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    // timeout 테스트의 가상 시간과 전역 fetch가 다른 테스트로 이어지지 않도록 복원
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('원본과 썸네일 메타데이터로 Presigned URL을 요청한다', async () => {
    const image = preparedImage();
    const target = uploadTarget();
    const signal = new AbortController().signal;
    // 백엔드가 이미지 한 장에 대응하는 업로드 정보 한 건을 반환한다고 가정
    request.mockResolvedValueOnce({ data: { images: [target] } });

    const result = await requestBoardImageUploadUrls([image], { signal });

    // 파일 바이너리가 아니라 파일명, MIME 타입, 크기만 백엔드에 전달하는지 확인
    expect(request).toHaveBeenCalledWith(
      '/uploads/board-images/presigned-urls',
      {
        method: 'POST',
        body: {
          images: [
            {
              originalFileName: 'accident.png',
              originalContentType: 'image/png',
              originalSize: image.originalFile.size,
              thumbnailContentType: 'image/webp',
              thumbnailSize: image.thumbnailFile.size,
            },
          ],
        },
        signal,
      },
    );
    // 검증을 통과한 응답은 이후 S3 PUT 단계에서 그대로 사용할 수 있어야 함
    expect(result).toEqual([target]);
  });

  it('Presigned 응답의 개수나 Content-Type이 요청과 다르면 거부한다', async () => {
    const image = preparedImage();

    // 요청은 한 장인데 응답 배열이 비어 있으면 원본과 URL을 연결할 수 없음
    request.mockResolvedValueOnce({ data: { images: [] } });

    await expect(requestBoardImageUploadUrls([image])).rejects.toThrow(
      '이미지 업로드 URL 응답 형식이 올바르지 않습니다.',
    );

    // 원본은 PNG인데 백엔드가 JPEG로 서명했다면 실제 PUT이 실패하므로 사전에 거부
    request.mockResolvedValueOnce({
      data: {
        images: [uploadTarget(1, 'image/jpeg')],
      },
    });

    await expect(requestBoardImageUploadUrls([image])).rejects.toThrow(
      '이미지 업로드 URL 응답 형식이 올바르지 않습니다.',
    );
  });

  it('WebP가 아니거나 1MB를 초과한 썸네일은 API 요청 전에 거부한다', async () => {
    // 첫 번째 데이터는 잘못된 MIME 타입, 두 번째 데이터는 최대 크기 초과 상황
    const wrongTypeImage = preparedImage();
    wrongTypeImage.thumbnailFile = new File(['thumbnail'], 'thumbnail.png', {
      type: 'image/png',
    });
    const oversizedImage = preparedImage();
    oversizedImage.thumbnailFile = new File(
      [new Uint8Array(BOARD_IMAGE_MAX_THUMBNAIL_SIZE + 1)],
      'thumbnail.webp',
      { type: 'image/webp' },
    );

    await expect(
      requestBoardImageUploadUrls([wrongTypeImage]),
    ).rejects.toMatchObject({
      code: 'BOARD_IMAGE_THUMBNAIL_INVALID',
    });
    await expect(
      requestBoardImageUploadUrls([oversizedImage]),
    ).rejects.toMatchObject({
      code: 'BOARD_IMAGE_THUMBNAIL_INVALID',
    });
    // 클라이언트 검증 실패이므로 Presigned URL API 자체가 호출되면 안 됨
    expect(request).not.toHaveBeenCalled();
  });

  it('원본과 썸네일을 정확한 Content-Type으로 S3에 PUT하고 Key 쌍을 반환한다', async () => {
    const image = preparedImage();
    const target = uploadTarget();
    request.mockResolvedValueOnce({ data: { images: [target] } });
    // 원본과 썸네일 두 PUT 모두 S3가 200으로 저장했다고 가정
    fetch.mockResolvedValue(new Response(null, { status: 200 }));

    const result = await uploadBoardImages([image]);

    // 이미지 한 장은 원본과 썸네일을 각각 업로드하므로 PUT이 두 번 발생
    expect(fetch).toHaveBeenCalledTimes(2);

    // Presigned URL 생성 당시 서명한 원본 Content-Type과 실제 File을 그대로 전송
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      target.originalUploadUrl,
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        body: image.originalFile,
        // KMAP의 쿠키를 다른 Origin인 S3로 보내지 않음
        credentials: 'omit',
        signal: expect.any(AbortSignal),
      }),
    );
    // 썸네일 PUT도 동일하게 서명된 WebP Content-Type을 사용
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      target.thumbnailUploadUrl,
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'image/webp' },
        body: image.thumbnailFile,
        credentials: 'omit',
        signal: expect.any(AbortSignal),
      }),
    );
    // 게시글 생성 API에는 만료되는 URL이 아니라 영구 식별자인 Key 쌍을 전달
    expect(result).toEqual([
      {
        originalObjectKey: target.originalObjectKey,
        thumbnailObjectKey: target.thumbnailObjectKey,
      },
    ]);
  });

  it('S3가 실패 상태를 반환하면 상태 코드를 포함한 업로드 오류로 변환한다', async () => {
    request.mockResolvedValueOnce({
      data: { images: [uploadTarget()] },
    });
    // 서명 불일치, 만료, 권한 문제 등을 대표하도록 S3 403 응답 사용
    fetch.mockResolvedValue(new Response(null, { status: 403 }));

    const error = await uploadBoardImages([preparedImage()]).catch(
      (caughtError) => caughtError,
    );

    // 화면에서 백엔드 오류와 구분할 수 있는 전용 오류와 원래 상태 코드 확인
    expect(error).toBeInstanceOf(BoardImageUploadError);
    expect(error).toMatchObject({
      code: 'BOARD_IMAGE_UPLOAD_FAILED',
      status: 403,
    });
  });

  it('S3 요청의 네트워크 실패를 사용자용 업로드 오류로 변환한다', async () => {
    request.mockResolvedValueOnce({
      data: { images: [uploadTarget()] },
    });
    // 브라우저 fetch는 네트워크 단절이나 CORS 실패에서 주로 TypeError로 reject됨
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(uploadBoardImages([preparedImage()])).rejects.toMatchObject({
      code: 'BOARD_IMAGE_UPLOAD_NETWORK_ERROR',
    });
  });

  it('전체 업로드 제한 시간이 지나면 진행 중 요청을 중단하고 timeout으로 구분한다', async () => {
    // 실제 1초를 기다리지 않고 Vitest의 가상 시간으로 timeout을 재현
    vi.useFakeTimers();
    request.mockResolvedValueOnce({
      data: { images: [uploadTarget()] },
    });
    // fetch가 끝나지 않은 상태를 유지하다 AbortSignal 수신 시 AbortError 반환
    fetch.mockImplementation(
      (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );

    // 운영 기본값 45초 대신 테스트에서는 1초로 줄여 같은 로직을 검증
    const uploadPromise = uploadBoardImages([preparedImage()], {
      timeoutMs: 1000,
    });
    // 시간 진행 전에 rejection handler를 먼저 연결해 미처리 Promise 경고 방지
    const rejectionExpectation = expect(uploadPromise).rejects.toMatchObject({
      code: 'BOARD_IMAGE_UPLOAD_TIMEOUT',
    });
    // 가상 시간을 1초 진행하면 내부 AbortController가 요청을 중단
    await vi.advanceTimersByTimeAsync(1000);

    await rejectionExpectation;
  });

  it('첨부 이미지가 없으면 API와 S3를 호출하지 않는다', async () => {
    // 이미지가 선택되지 않은 게시글도 정상적으로 작성할 수 있도록 빈 배열 반환
    await expect(uploadBoardImages([])).resolves.toEqual([]);

    // 불필요한 Presigned URL 요청이나 S3 네트워크 요청이 없어야 함
    expect(request).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
