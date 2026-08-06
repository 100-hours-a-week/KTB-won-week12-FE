import { request } from './httpClient';
import {
  BOARD_IMAGE_MAX_COUNT,
  BOARD_IMAGE_MAX_THUMBNAIL_SIZE,
  BOARD_IMAGE_THUMBNAIL_TYPE,
  validateBoardImageFile,
} from '../utils/imageProcessing';

export const BOARD_IMAGE_UPLOAD_TIMEOUT_MS = 45_000;

// 백엔드 API 오류와 S3 직접 업로드 오류를 화면에서 구분할 수 있도록 별도 오류 타입 사용
export class BoardImageUploadError extends Error {
  constructor(code, message, { status = null } = {}) {
    super(message);
    this.name = 'BoardImageUploadError';
    this.code = code;
    this.status = status;
  }
}

//사용자가 업로드한 이미지 검증
function validatePreparedImages(preparedImages) {
  if (!Array.isArray(preparedImages)) {
    throw new TypeError('업로드할 이미지 목록은 배열이어야 합니다.');
  }

  if (preparedImages.length > BOARD_IMAGE_MAX_COUNT) {
    throw new BoardImageUploadError(
      'BOARD_IMAGE_COUNT_LIMIT',
      '이미지는 최대 5장까지 첨부할 수 있습니다.',
    );
  }

  preparedImages.forEach(({ originalFile, thumbnailFile } = {}) => {
    validateBoardImageFile(originalFile);

    if (
      !(thumbnailFile instanceof File) ||
      thumbnailFile.type !== BOARD_IMAGE_THUMBNAIL_TYPE ||
      thumbnailFile.size <= 0 ||
      thumbnailFile.size > BOARD_IMAGE_MAX_THUMBNAIL_SIZE
    ) {
      throw new BoardImageUploadError(
        'BOARD_IMAGE_THUMBNAIL_INVALID',
        'WebP 썸네일 파일이 필요합니다.',
      );
    }
  });
}

// 브라우저 file을 백엔드 DTO 형식으로 변환
function toUploadMetadata({ originalFile, thumbnailFile }) {
  return {
    originalFileName: originalFile.name,
    originalContentType: originalFile.type,
    originalSize: originalFile.size,
    thumbnailContentType: thumbnailFile.type,
    thumbnailSize: thumbnailFile.size,
  };
}

//업로드하는 이미지가 정해진 형식을 지키는지 검증
function validateUploadTarget(target, preparedImage) {
  const requiredStringFields = [
    'originalObjectKey',
    'originalUploadUrl',
    'originalContentType',
    'thumbnailObjectKey',
    'thumbnailUploadUrl',
    'thumbnailContentType',
  ];

  if (
    !target ||
    requiredStringFields.some(
      (field) =>
        typeof target[field] !== 'string' || target[field].length === 0,
    ) ||
    target.originalContentType !== preparedImage.originalFile.type ||
    target.thumbnailContentType !== preparedImage.thumbnailFile.type
  ) {
    throw new TypeError('이미지 업로드 URL 응답 형식이 올바르지 않습니다.');
  }

  return target;
}

//백엔드 API 요청으로 presigned upload url을 받아온다.
export async function requestBoardImageUploadUrls(
  preparedImages,
  { signal } = {},
) {
  validatePreparedImages(preparedImages);

  if (preparedImages.length === 0) {
    return [];
  }

  const response = await request('/uploads/board-images/presigned-urls', {
    method: 'POST',
    body: {
      images: preparedImages.map(toUploadMetadata),
    },
    signal,
  });
  const uploadTargets = response?.data?.images;

  if (
    !Array.isArray(uploadTargets) ||
    uploadTargets.length !== preparedImages.length
  ) {
    throw new TypeError('이미지 업로드 URL 응답 형식이 올바르지 않습니다.');
  }

  return uploadTargets.map((target, index) =>
    validateUploadTarget(target, preparedImages[index]),
  );
}

//S3에 직업 업로드 요청
async function uploadObject(uploadUrl, file, contentType, signal) {
  let response;

  try {
    response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
      },
      body: file,
      // S3에는 애플리케이션 쿠키나 Authorization 헤더를 전송하지 않음
      credentials: 'omit',
      signal,
    });
  } catch (error) {
    // 사용자의 페이지 이동이나 전체 업로드 제한 시간으로 중단된 경우 상위에서 구분
    if (signal.aborted) {
      throw error;
    }

    throw new BoardImageUploadError(
      'BOARD_IMAGE_UPLOAD_NETWORK_ERROR',
      '이미지 업로드 중 네트워크 오류가 발생했습니다.',
    );
  }

  if (!response.ok) {
    throw new BoardImageUploadError(
      'BOARD_IMAGE_UPLOAD_FAILED',
      '이미지 업로드에 실패했습니다. 다시 시도해주세요.',
      { status: response.status },
    );
  }
}

function createAbortContext(externalSignal, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('이미지 업로드 제한 시간은 양수이어야 합니다.');
  }

  const controller = new AbortController();
  let didTimeout = false;

  const abortFromExternalSignal = () => {
    controller.abort(externalSignal.reason);
  };

  if (externalSignal?.aborted) {
    abortFromExternalSignal();
  } else {
    externalSignal?.addEventListener('abort', abortFromExternalSignal, {
      once: true,
    });
  }

  const timeoutId = globalThis.setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    didTimeout: () => didTimeout,
    cleanup() {
      globalThis.clearTimeout(timeoutId);
      externalSignal?.removeEventListener('abort', abortFromExternalSignal);
    },
  };
}

//전체 흐름을 조합.
export async function uploadBoardImages(
  preparedImages,
  { signal, timeoutMs = BOARD_IMAGE_UPLOAD_TIMEOUT_MS } = {},
) {
  validatePreparedImages(preparedImages);

  if (preparedImages.length === 0) {
    return [];
  }

  const abortContext = createAbortContext(signal, timeoutMs);

  try {
    const uploadTargets = await requestBoardImageUploadUrls(preparedImages, {
      signal: abortContext.signal,
    });

    await Promise.all(
      uploadTargets.flatMap((target, index) => {
        const preparedImage = preparedImages[index];

        return [
          uploadObject(
            target.originalUploadUrl,
            preparedImage.originalFile,
            target.originalContentType,
            abortContext.signal,
          ),
          uploadObject(
            target.thumbnailUploadUrl,
            preparedImage.thumbnailFile,
            target.thumbnailContentType,
            abortContext.signal,
          ),
        ];
      }),
    );

    return uploadTargets.map((target) => ({
      originalObjectKey: target.originalObjectKey,
      thumbnailObjectKey: target.thumbnailObjectKey,
    }));
  } catch (error) {
    if (abortContext.didTimeout()) {
      throw new BoardImageUploadError(
        'BOARD_IMAGE_UPLOAD_TIMEOUT',
        '이미지 업로드 시간이 초과되었습니다. 다시 시도해주세요.',
      );
    }

    throw error;
  } finally {
    abortContext.cleanup();
  }
}
