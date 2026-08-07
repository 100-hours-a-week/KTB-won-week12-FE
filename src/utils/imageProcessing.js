export const BOARD_IMAGE_MAX_COUNT = 5;
export const BOARD_IMAGE_MAX_ORIGINAL_SIZE = 5 * 1024 * 1024;
export const BOARD_IMAGE_MAX_THUMBNAIL_SIZE = 1024 * 1024;
export const BOARD_IMAGE_THUMBNAIL_TYPE = 'image/webp';
export const BOARD_IMAGE_THUMBNAIL_MAX_DIMENSION = 640;
export const BOARD_IMAGE_THUMBNAIL_QUALITY = 0.7;

const BOARD_IMAGE_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

// 화면에서 오류 원인에 맞는 안내 문구를 선택할 수 있도록 안정적인 code를 함께 보존
export class BoardImageProcessingError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BoardImageProcessingError';
    this.code = code;
  }
}

//사진 파일 검증
export function validateBoardImageFile(file) {
  if (!(file instanceof File)) {
    throw new BoardImageProcessingError(
      'BOARD_IMAGE_FILE_REQUIRED',
      '이미지 파일을 선택해주세요.',
    );
  }

  if (file.name.trim().length === 0 || file.name.length > 255) {
    throw new BoardImageProcessingError(
      'BOARD_IMAGE_FILE_NAME_INVALID',
      '이미지 파일 이름은 255자 이하이어야 합니다.',
    );
  }

  if (!BOARD_IMAGE_CONTENT_TYPES.has(file.type.toLowerCase())) {
    throw new BoardImageProcessingError(
      'BOARD_IMAGE_CONTENT_TYPE_INVALID',
      'JPEG, PNG, WebP 이미지만 첨부할 수 있습니다.',
    );
  }

  if (file.size <= 0 || file.size > BOARD_IMAGE_MAX_ORIGINAL_SIZE) {
    throw new BoardImageProcessingError(
      'BOARD_IMAGE_ORIGINAL_SIZE_INVALID',
      '원본 이미지는 5MB 이하이어야 합니다.',
    );
  }

  return file;
}

// 프로필 원본도 게시글 원본과 같은 파일명, MIME 타입, 5MB 제한을 사용한다.
export function validateProfileImageFile(file) {
  return validateBoardImageFile(file);
}

// 업로드한 파일 갯수와 각 파일을 검증
export function validateBoardImageFiles(files) {
  if (!Array.isArray(files)) {
    throw new TypeError('이미지 파일 목록은 배열이어야 합니다.');
  }

  if (files.length > BOARD_IMAGE_MAX_COUNT) {
    throw new BoardImageProcessingError(
      'BOARD_IMAGE_COUNT_LIMIT',
      '이미지는 최대 5장까지 첨부할 수 있습니다.',
    );
  }

  files.forEach(validateBoardImageFile);
  return files;
}

//썸네일 이미지 크기 계산
export function calculateThumbnailDimensions(
  width,
  height,
  maxDimension = BOARD_IMAGE_THUMBNAIL_MAX_DIMENSION,
) {
  if (width <= 0 || height <= 0 || maxDimension <= 0) {
    throw new BoardImageProcessingError(
      'BOARD_IMAGE_DIMENSIONS_INVALID',
      '이미지 크기를 확인할 수 없습니다.',
    );
  }

  const scale = Math.min(1, maxDimension / Math.max(width, height));

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

//canvas에 그려진 이미지를 webp 바이너리 데이터로 변환
function canvasToWebpBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.type !== BOARD_IMAGE_THUMBNAIL_TYPE) {
        reject(
          new BoardImageProcessingError(
            'BOARD_IMAGE_WEBP_UNSUPPORTED',
            '현재 브라우저에서는 WebP 썸네일을 만들 수 없습니다.',
          ),
        );
        return;
      }

      resolve(blob);
    }, BOARD_IMAGE_THUMBNAIL_TYPE, quality);
  });
}

//썸네일 생성(이미지 축소) 함수
export async function createBoardImageThumbnail(
  file,
  {
    maxDimension = BOARD_IMAGE_THUMBNAIL_MAX_DIMENSION,
    quality = BOARD_IMAGE_THUMBNAIL_QUALITY,
  } = {},
) {
  validateBoardImageFile(file);

  let imageBitmap;

  try {
    imageBitmap = await createImageBitmap(file);
    const dimensions = calculateThumbnailDimensions(
      imageBitmap.width,
      imageBitmap.height,
      maxDimension,
    );
    const canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new BoardImageProcessingError(
        'BOARD_IMAGE_CANVAS_UNAVAILABLE',
        '이미지 썸네일을 만들 수 없습니다.',
      );
    }

    context.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);
    const thumbnailBlob = await canvasToWebpBlob(canvas, quality);

    if (
      thumbnailBlob.size <= 0 ||
      thumbnailBlob.size > BOARD_IMAGE_MAX_THUMBNAIL_SIZE
    ) {
      throw new BoardImageProcessingError(
        'BOARD_IMAGE_THUMBNAIL_SIZE_INVALID',
        '썸네일 이미지가 1MB를 초과했습니다.',
      );
    }

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([thumbnailBlob], `${baseName}-thumbnail.webp`, {
      type: BOARD_IMAGE_THUMBNAIL_TYPE,
      lastModified: Date.now(),
    });
  } catch (error) {
    if (error instanceof BoardImageProcessingError) {
      throw error;
    }

    throw new BoardImageProcessingError(
      'BOARD_IMAGE_DECODE_FAILED',
      '이미지 파일을 읽을 수 없습니다.',
    );
  } finally {
    imageBitmap?.close?.();
  }
}

export async function prepareBoardImages(files) {
  validateBoardImageFiles(files);

  return Promise.all(
    files.map(async (originalFile) => ({
      originalFile,
      thumbnailFile: await createBoardImageThumbnail(originalFile),
    })),
  );
}
