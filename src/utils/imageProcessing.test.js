import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BOARD_IMAGE_MAX_ORIGINAL_SIZE,
  BOARD_IMAGE_MAX_THUMBNAIL_SIZE,
  BoardImageProcessingError,
  calculateThumbnailDimensions,
  createBoardImageThumbnail,
  prepareBoardImages,
  validateBoardImageFile,
  validateBoardImageFiles,
} from './imageProcessing';

// File의 실제 byte 수가 size가 되도록 Uint8Array로 테스트용 이미지 생성
// 파일명, MIME 타입, 크기를 바꿔 동일한 helper로 경계값을 검증한다.
function imageFile({
  name = 'accident.png',
  type = 'image/png',
  size = 10,
} = {}) {
  return new File([new Uint8Array(size)], name, { type });
}

describe('imageProcessing', () => {
  // jsdom은 Canvas 렌더링과 이미지 디코딩을 직접 수행하지 않으므로
  // 브라우저 API 호출 여부를 확인할 mock과 spy를 각 테스트에서 준비한다.
  let getContextSpy;
  let toBlobSpy;
  let drawImage;
  let closeBitmap;

  beforeEach(() => {
    drawImage = vi.fn();
    closeBitmap = vi.fn();

    // getContext('2d')가 이미지 그리기에 사용할 가짜 2D context를 반환하도록 설정
    getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({ drawImage });
    toBlobSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((callback) => {
        // 실제 인코딩 대신 WebP MIME 타입을 가진 Blob을 callback에 전달
        callback(new Blob(['thumbnail'], { type: 'image/webp' }));
      });

    // 원본 디코딩 결과를 1600x800 이미지로 고정해 640x320 축소를 검증
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({
        width: 1600,
        height: 800,
        close: closeBitmap,
      }),
    );
  });

  afterEach(() => {
    // prototype과 전역 객체에 설치한 mock이 다른 테스트에 영향을 주지 않도록 복원
    getContextSpy.mockRestore();
    toBlobSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it.each(['image/jpeg', 'image/png', 'image/webp'])(
    '%s 원본 이미지를 허용한다',
    (type) => {
      const file = imageFile({ type });

      // 정상 파일은 새 객체로 바꾸지 않고 원래 File을 그대로 반환
      expect(validateBoardImageFile(file)).toBe(file);
    },
  );

  it('지원하지 않는 형식과 5MB 초과 원본을 거부한다', () => {
    // 백엔드에서 허용하지 않는 GIF는 공통 이미지 처리 오류로 거부
    expect(() =>
      validateBoardImageFile(imageFile({ type: 'image/gif' })),
    ).toThrowError(BoardImageProcessingError);

    // 상수보다 1byte 큰 파일을 만들어 최대 크기 경계를 확인
    expect(() =>
      validateBoardImageFile(
        imageFile({ size: BOARD_IMAGE_MAX_ORIGINAL_SIZE + 1 }),
      ),
    ).toThrow('원본 이미지는 5MB 이하이어야 합니다.');
  });

  it('게시글 이미지 개수를 최대 5장으로 제한한다', () => {
    // 제한보다 한 장 많은 6개 File을 생성
    const files = Array.from({ length: 6 }, (_, index) =>
      imageFile({ name: `image-${index}.png` }),
    );

    expect(() => validateBoardImageFiles(files)).toThrow(
      '이미지는 최대 5장까지 첨부할 수 있습니다.',
    );
  });

  it('원본 비율을 유지하면서 긴 변을 최대 640px로 축소한다', () => {
    // 긴 변이 1600인 이미지는 0.4배로 줄어 640x320이 되어야 함
    expect(calculateThumbnailDimensions(1600, 800)).toEqual({
      width: 640,
      height: 320,
    });
    // 이미 640px 이하인 이미지는 확대하지 않고 원래 크기를 유지
    expect(calculateThumbnailDimensions(320, 200)).toEqual({
      width: 320,
      height: 200,
    });
  });

  it('Canvas로 640px WebP 썸네일 File을 생성한다', async () => {
    const file = imageFile({ name: 'accident.png' });

    // 원본 File 디코딩부터 WebP File 생성까지의 공개 함수를 실행
    const thumbnail = await createBoardImageThumbnail(file);

    // createImageBitmap에 사용자가 선택한 원본 File이 전달됐는지 확인
    expect(createImageBitmap).toHaveBeenCalledWith(file);

    // 1600x800 원본이 계산된 Canvas 크기 640x320으로 그려졌는지 확인
    expect(drawImage).toHaveBeenCalledWith(
      expect.any(Object),
      0,
      0,
      640,
      320,
    );
    // Canvas 인코딩 형식과 품질이 구현 정책인 WebP, 0.7인지 확인
    expect(toBlobSpy).toHaveBeenCalledWith(
      expect.any(Function),
      'image/webp',
      0.7,
    );
    // Blob이 S3에 업로드 가능한 이름과 MIME 타입을 가진 File로 변환됐는지 확인
    expect(thumbnail).toBeInstanceOf(File);
    expect(thumbnail.name).toBe('accident-thumbnail.webp');
    expect(thumbnail.type).toBe('image/webp');
    // 디코딩된 Bitmap 메모리가 성공 후에도 해제되는지 확인
    expect(closeBitmap).toHaveBeenCalledTimes(1);
  });

  it('생성한 WebP 썸네일이 1MB를 초과하면 거부한다', async () => {
    // 이번 테스트에서만 toBlob이 제한보다 1byte 큰 WebP를 반환하도록 교체
    toBlobSpy.mockImplementationOnce((callback) => {
      callback(
        new Blob([new Uint8Array(BOARD_IMAGE_MAX_THUMBNAIL_SIZE + 1)], {
          type: 'image/webp',
        }),
      );
    });

    await expect(createBoardImageThumbnail(imageFile())).rejects.toMatchObject({
      code: 'BOARD_IMAGE_THUMBNAIL_SIZE_INVALID',
    });

    // 실패한 경우에도 finally에서 Bitmap 자원이 해제되어야 함
    expect(closeBitmap).toHaveBeenCalledTimes(1);
  });

  it('여러 원본을 각각 원본·썸네일 쌍으로 준비한다', async () => {
    const files = [
      imageFile({ name: 'first.png' }),
      imageFile({ name: 'second.jpg', type: 'image/jpeg' }),
    ];

    // 실제 화면에서 업로드 직전에 호출할 배열 단위 준비 함수를 실행
    const prepared = await prepareBoardImages(files);

    // 원본 순서가 유지되고 각 원본마다 별도의 WebP 썸네일이 생성되는지 확인
    expect(prepared).toHaveLength(2);
    expect(prepared[0]).toMatchObject({ originalFile: files[0] });
    expect(prepared[0].thumbnailFile.name).toBe('first-thumbnail.webp');
    expect(prepared[1]).toMatchObject({ originalFile: files[1] });
    expect(prepared[1].thumbnailFile.name).toBe('second-thumbnail.webp');
  });
});
