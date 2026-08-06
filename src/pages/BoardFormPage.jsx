import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  createBoard,
  getBoard,
  updateBoard,
} from '../api/boardApi';
import { uploadBoardImages } from '../api/uploadApi'; // Presigned URL을 발급받아 S3에 이미지를 업로드하는 API
import AppHeader from '../components/AppHeader';
import Portal from '../components/Portal';
import { getUserFriendlyErrorMessage } from '../utils/errorMessage'; // 이미지 처리·업로드·게시글 저장 오류를 사용자 문구로 변환
import {
  BOARD_IMAGE_MAX_COUNT,
  prepareBoardImages,
  validateBoardImageFiles,
} from '../utils/imageProcessing'; // 이미지 개수·형식 검증과 WebP 썸네일 생성에 필요한 값과 함수
import '../styles/pages/BoardFormPage.css';

const EMPTY_VALUES = {
  title: '',
  content: '',
};

function validateTitle(title) {
  const trimmedTitle = title.trim();

  if (!trimmedTitle) {
    return '제목을 입력해주세요.';
  }

  if (trimmedTitle.length > 26) {
    return '제목은 26자 이하로 입력해주세요.';
  }

  return '';
}

function validateContent(content) {
  return content.trim() ? '' : '내용을 입력해주세요.';
}

function createPayload(values, images) { // 백엔드 게시글 생성·수정 API에 전송할 요청 본문 생성
  return {
    title: values.title.trim(),
    content: values.content.trim(),
    // Presigned URL은 만료되므로 게시글에는 S3 Object Key 쌍만 전송
    images,
  };
}

function storedImageKeys(image) { // 기존 이미지에서 DB에 다시 저장할 원본·썸네일 Object Key 쌍만 추출
  return {
    originalObjectKey: image.originalObjectKey,
    thumbnailObjectKey: image.thumbnailObjectKey,
  };
}

function createInitialSnapshot(values, imageItems) { // 수정 화면을 처음 불러온 시점의 제목·내용·이미지 Key 보관
  return {
    title: values.title.trim(),
    content: values.content.trim(),
    // 최초 조회 시에는 저장된 이미지만 있으므로 만료되는 URL 대신 Key 쌍 저장
    images: imageItems.map(storedImageKeys),
  };
}

function hasSameStoredImageKeys(imageItems, initialImages) { // 현재 저장 이미지 순서와 최초 Key 순서 비교
  // 새 로컬 이미지는 아직 Object Key가 없으므로 한 장이라도 있으면 이미지가 변경된 상태
  if (imageItems.some((image) => image.kind === 'local')) {
    return false;
  }

  if (imageItems.length !== initialImages.length) {
    // 기존 이미지를 삭제한 경우 배열 길이가 달라지므로 즉시 변경으로 판단
    return false;
  }

  return imageItems.every((image, index) => {
    const initialImage = initialImages[index];

    return (
      image.originalObjectKey === initialImage.originalObjectKey &&
      image.thumbnailObjectKey === initialImage.thumbnailObjectKey
    );
  });
}

export default function BoardFormPage({ mode }) {
  const navigate = useNavigate();
  const { boardId: boardIdParam } = useParams();
  const nextImageIdRef = useRef(1);
  const imageInputRef = useRef(null);
  const localPreviewUrlsRef = useRef(new Set());
  // 페이지 이동 시 진행 중인 이미지 업로드와 게시글 저장을 중단하기 위한 Controller 보관
  const submitAbortControllerRef = useRef(null);
  const isEditMode = mode === 'edit';

  const boardId = Number(boardIdParam);
  const isValidBoardId =
    Number.isSafeInteger(boardId) &&
    boardId > 0 &&
    String(boardId) === boardIdParam;

  const [values, setValues] = useState(EMPTY_VALUES);
  const [imageItems, setImageItems] = useState([]);
  const [imageError, setImageError] = useState('');
  const [activePreviewId, setActivePreviewId] = useState(null);
  const [initialPayload, setInitialPayload] = useState(null);

  const [loadState, setLoadState] = useState(
    isEditMode ? 'loading' : 'success',
  );
  const [loadError, setLoadError] = useState('');
  const [loadVersion, setLoadVersion] = useState(0);

  const [touchedFields, setTouchedFields] = useState({
    title: false,
    content: false,
  });
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // idle → processing(썸네일 생성) → uploading(S3 PUT) → saving(게시글 API) 순서
  const [submitStage, setSubmitStage] = useState('idle');
  const [submitError, setSubmitError] = useState('');

  const titleError = validateTitle(values.title);
  const contentError = validateContent(values.content);
  const activePreview = imageItems.find(
    (image) => image.id === activePreviewId,
  );

  const isFormValid = !titleError && !contentError && !imageError;
  // 텍스트와 이미지 변경을 분리해 이미지 추가·삭제만 한 경우도 명확하게 감지
  const hasTextChanges =
    initialPayload != null &&
    (values.title.trim() !== initialPayload.title ||
      values.content.trim() !== initialPayload.content);
  const hasImageChanges =
    initialPayload != null &&
    !hasSameStoredImageKeys(imageItems, initialPayload.images);
  // 신규 작성은 유효한 입력이면 제출 가능하고 수정은 텍스트나 이미지 중 하나가 달라야 제출 가능
  const isDirty =
    !isEditMode ||
    (initialPayload != null && (hasTextChanges || hasImageChanges));
  const canSubmit =
    loadState === 'success' && isFormValid && isDirty && !isSubmitting;

  useEffect(
    () => () => {
      // 페이지를 벗어날 때 브라우저가 생성한 모든 로컬 미리보기 URL 해제
      localPreviewUrlsRef.current.forEach((previewUrl) => {
        URL.revokeObjectURL(previewUrl);
      });
      localPreviewUrlsRef.current.clear();
      // 페이지 이동 중인 이미지 업로드와 게시글 저장 요청을 함께 중단
      submitAbortControllerRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (!activePreview) {
      return undefined;
    }

    function closePreviewWithEscape(event) {
      if (event.key === 'Escape') {
        setActivePreviewId(null);
      }
    }

    window.addEventListener('keydown', closePreviewWithEscape);
    return () =>
      window.removeEventListener('keydown', closePreviewWithEscape);
  }, [activePreview]);

  useEffect(() => {
    if (!isEditMode) {
      return undefined;
    }

    if (!isValidBoardId) {
      setLoadError('올바르지 않은 게시글 주소입니다.');
      setLoadState('error');
      return undefined;
    }

    const abortController = new AbortController();

    async function loadBoardForEdit() {
      setLoadState('loading');
      setLoadError('');

      try {
        const board = await getBoard(boardId, {
          signal: abortController.signal,
        });

        // 공개 상세 조회 결과의 작성자 권한으로 수정 폼 노출 여부 결정
        if (!board.editableByMe) {
          setLoadError('게시글 작성자만 수정할 수 있습니다.');
          setLoadState('forbidden');
          return;
        }

        const nextValues = {
          title: board.title,
          content: board.content,
        };
        // 백엔드의 이미지 응답을 미리보기와 Key 재사용에 필요한 화면 상태로 변환
        const nextImageItems = board.images.map((image, index) => ({
          id: `stored-image-${image.imageId}`,
          kind: 'stored',
          // 수정 화면과 확대 미리보기에서는 원본 Presigned GET URL 사용
          src: image.originalImageUrl,
          name: `기존 이미지 ${index + 1}`,
          originalObjectKey: image.originalObjectKey,
          thumbnailObjectKey: image.thumbnailObjectKey,
        }));

        setValues(nextValues);
        setImageItems(nextImageItems);
        // 이후 제목·내용·이미지 변경 여부를 비교하기 위해 최초 수정 상태 보관
        setInitialPayload(createInitialSnapshot(nextValues, nextImageItems));
        setLoadState('success');
      } catch (error) {
        if (error.name === 'AbortError') {
          return;
        }

        setLoadError(
          error.status === 404
            ? '수정할 게시글을 찾을 수 없습니다.'
            : error.message || '게시글 정보를 불러오지 못했습니다.',
        );
        setLoadState('error');
      }
    }

    loadBoardForEdit();
    // 게시글 ID 변경이나 페이지 이동 시 이전 상세 응답 반영 차단
    return () => abortController.abort();
  }, [boardId, isEditMode, isValidBoardId, loadVersion]);

  function updateValue(event) {
    const { name, value } = event.target;
    setValues((currentValues) => ({
      ...currentValues,
      [name]: value,
    }));
    setSubmitError('');
  }

  function handleImageFiles(event) { // 사용자가 새로 선택한 로컬 이미지 검증 및 미리보기 상태 추가
    // FileList는 배열 메소드를 바로 사용할 수 없으므로 일반 배열로 변환
    const selectedFiles = Array.from(event.target.files ?? []);

    try {
      // 기존 이미지와 새로 선택한 이미지를 합쳐 게시글당 최대 5장 제한 확인
      if (imageItems.length + selectedFiles.length > BOARD_IMAGE_MAX_COUNT) {
        throw new Error('이미지는 최대 5장까지 첨부할 수 있습니다.');
      }

      // S3 요청 전에 MIME 타입, 파일명, 원본 크기를 공통 정책으로 검증
      validateBoardImageFiles(selectedFiles);
    } catch (error) {
      // 하나라도 검증에 실패하면 이번에 선택한 파일 전체를 추가하지 않음
      setImageError(error.message || '이미지를 첨부하지 못했습니다.');

      if (imageInputRef.current) {
        // 같은 파일을 수정 후 다시 선택할 수 있도록 input 값 초기화
        imageInputRef.current.value = '';
      }
      return;
    }

    // 선택한 File마다 브라우저 메모리의 임시 URL을 만들어 업로드 전 미리보기 제공
    const nextLocalImages = selectedFiles.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      localPreviewUrlsRef.current.add(previewUrl);

      return {
        id: `local-image-${nextImageIdRef.current++}`,
        kind: 'local',
        src: previewUrl,
        name: file.name,
        // 제출 시 Canvas 썸네일 생성과 S3 PUT에 사용할 원본 File 보존
        file,
      };
    });

    // 기존 등록 이미지 다음에 새 로컬 이미지를 선택 순서대로 추가
    setImageItems((currentImages) => [
      ...currentImages,
      ...nextLocalImages,
    ]);
    setImageError('');
    setSubmitError('');

    // 동일한 파일을 다시 선택해도 change 이벤트가 발생하도록 초기화
    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }
  }

  function removeImage(imageId) { // 화면과 최종 게시글 요청에서 선택한 이미지 제거
    setImageItems((currentImages) => {
      const targetImage = currentImages.find(
        (image) => image.id === imageId,
      );

      if (targetImage?.kind === 'local') {
        // 로컬 이미지만 blob URL을 사용하므로 제거 즉시 브라우저 메모리 해제
        URL.revokeObjectURL(targetImage.src);
        localPreviewUrlsRef.current.delete(targetImage.src);
      }

      return currentImages.filter((image) => image.id !== imageId);
    });

    if (activePreviewId === imageId) {
      setActivePreviewId(null);
    }

    setImageError('');
    setSubmitError('');
  }

  async function handleSubmit(event) { // 이미지 처리·S3 업로드 완료 후 게시글 생성 또는 수정
    event.preventDefault();
    setHasSubmitted(true);
    setTouchedFields({ title: true, content: true });
    setSubmitError('');

    if (!canSubmit) {
      return;
    }

    // Presigned URL 요청, S3 PUT, 게시글 저장에서 동일한 중단 신호 사용
    const abortController = new AbortController();
    submitAbortControllerRef.current = abortController;
    setIsSubmitting(true);

    try {
      // 수정 시 기존 이미지는 업로드하지 않고 Key를 재사용하며 새 로컬 파일만 처리
      const localImageItems = imageItems.filter(
        (image) => image.kind === 'local',
      );
      let uploadedImageKeys = [];

      if (localImageItems.length > 0) {
        // 원본 File을 Canvas에서 축소·인코딩해 각 이미지의 WebP 썸네일 생성
        setSubmitStage('processing');
        const preparedImages = await prepareBoardImages(
          localImageItems.map((image) => image.file),
        );

        // 원본·썸네일 메타데이터로 URL을 발급받고 브라우저가 S3에 직접 PUT
        setSubmitStage('uploading');
        uploadedImageKeys = await uploadBoardImages(preparedImages, {
          signal: abortController.signal,
        });
      }

      // 화면에 보이는 순서를 유지하면서 기존 Key와 새로 발급된 Key를 합침
      let localImageIndex = 0;
      const images = imageItems.map((image) => {
        if (image.kind === 'stored') {
          return storedImageKeys(image);
        }

        // uploadBoardImages가 로컬 이미지 순서대로 반환한 Key 쌍을 해당 위치에 배치
        const uploadedKeys = uploadedImageKeys[localImageIndex];
        localImageIndex += 1;
        return uploadedKeys;
      });
      // 기존 Key와 새 Key를 합친 뒤 만료되는 Presigned URL 없이 게시글 payload 생성
      const payload = createPayload(values, images);

      // 이미지 업로드가 끝난 뒤에만 Object Key가 포함된 게시글 API 호출
      setSubmitStage('saving');
      const response = isEditMode
        ? await updateBoard(boardId, payload)
        : await createBoard(payload);

      // 생성과 수정 응답의 boardId를 사용해 최종 상세 주소로 이동
      navigate(`/boards/${response.boardId}`, { replace: true });
    } catch (error) {
      // 페이지 이동으로 의도적으로 중단한 요청은 사용자 오류로 표시하지 않음
      if (error.name === 'AbortError') {
        return;
      }

      // 게시글 권한 오류는 별도 안내하고 나머지는 공통 오류 매퍼 사용
      setSubmitError(
        error.name === 'ApiError' && error.status === 403
          ? '게시글 작성자만 수정할 수 있습니다.'
          : getUserFriendlyErrorMessage(error, {
              fallback: `게시글을 ${isEditMode ? '수정' : '등록'}하지 못했습니다.`,
            }),
      );
    } finally {
      // 현재 요청의 Controller만 비우고 제출 상태를 다시 사용할 수 있도록 초기화
      if (submitAbortControllerRef.current === abortController) {
        submitAbortControllerRef.current = null;
      }
      setIsSubmitting(false);
      setSubmitStage('idle');
    }
  }

  function moveBack() {
    navigate(isEditMode && isValidBoardId ? `/boards/${boardId}` : '/boards');
  }

  const pageTitle = isEditMode ? '사고 사례 수정' : '사고 사례 등록';
  // 사용자가 현재 썸네일 생성·S3 업로드·게시글 저장 중 어느 단계인지 확인할 문구
  const submitButtonText = isSubmitting
    ? submitStage === 'processing'
      ? '이미지 처리 중...'
      : submitStage === 'uploading'
        ? '이미지 업로드 중...'
        : isEditMode
          ? '수정 중...'
          : '등록 중...'
    : isEditMode
      ? '수정하기'
      : '사례 등록하기';

  return (
    <>
      <AppHeader onBack={moveBack} />

      <main className="board-form-page">
        {loadState === 'loading' && (
          <p className="board-form-status">게시글 정보를 불러오는 중...</p>
        )}

        {['error', 'forbidden'].includes(loadState) && (
          <div className="board-form-status is-error" role="alert">
            <p>{loadError}</p>
            <div className="board-form-status__actions">
              {loadState === 'error' && isValidBoardId && (
                <button
                  type="button"
                  onClick={() => setLoadVersion((version) => version + 1)}
                >
                  다시 시도
                </button>
              )}
              <button type="button" onClick={moveBack}>
                상세로 돌아가기
              </button>
            </div>
          </div>
        )}

        {loadState === 'success' && (
          <section className="board-form-shell">
            <div className="board-form-heading">
              <p>교통사고 사례 공유</p>
              <h2>{pageTitle}</h2>
              <span>사고 상황과 현장 이미지를 자세히 작성해 주세요.</span>
            </div>

            <form
              className="board-form"
              noValidate
              onSubmit={handleSubmit}
            >
              <div className="board-form__group">
                <label htmlFor="board-title">제목*</label>
                <input
                  id="board-title"
                  name="title"
                  type="text"
                  maxLength="26"
                  placeholder="예: 비보호 좌회전 중 직진 차량과 충돌했습니다"
                  value={values.title}
                  onChange={updateValue}
                  onBlur={() =>
                    setTouchedFields((currentFields) => ({
                      ...currentFields,
                      title: true,
                    }))
                  }
                  aria-invalid={
                    Boolean(titleError) &&
                    (touchedFields.title || hasSubmitted)
                  }
                  aria-describedby="board-title-helper"
                />
                <div className="board-form__field-footer">
                  <p id="board-title-helper">
                    {(touchedFields.title || hasSubmitted) && titleError}
                  </p>
                  <span>{values.title.length}/26</span>
                </div>
              </div>

              <div className="board-form__group">
                <label htmlFor="board-content">내용*</label>
                <textarea
                  id="board-content"
                  name="content"
                  placeholder="사고 당시 도로 상황, 진행 방향, 신호 상태 등을 자세히 적어주세요."
                  value={values.content}
                  onChange={updateValue}
                  onBlur={() =>
                    setTouchedFields((currentFields) => ({
                      ...currentFields,
                      content: true,
                    }))
                  }
                  aria-invalid={
                    Boolean(contentError) &&
                    (touchedFields.content || hasSubmitted)
                  }
                  aria-describedby="board-content-helper"
                />
                <p
                  id="board-content-helper"
                  className="board-form__helper"
                >
                  {(touchedFields.content || hasSubmitted) && contentError}
                </p>
              </div>

              <fieldset className="board-image-fields">
                <legend>사고 현장 이미지</legend>
                <p className="board-image-fields__guide">
                  JPEG, PNG, WebP 이미지를 최대 5장까지 첨부할 수 있으며,
                  파일당 최대 크기는 5MB입니다.
                </p>

                <div className="board-image-fields__list">
                  {imageItems.map((image, index) => (
                    <article className="board-image-item" key={image.id}>
                      <button
                        type="button"
                        className="board-image-item__preview"
                        onClick={() => setActivePreviewId(image.id)}
                        aria-label={`이미지 ${index + 1} 크게 보기`}
                      >
                        <img src={image.src} alt="" />
                      </button>
                      <div className="board-image-item__info">
                        <strong>{image.name}</strong>
                        <span>
                          {image.kind === 'stored'
                            ? '등록된 이미지'
                            : '업로드할 이미지'}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="board-image-item__remove"
                        onClick={() => removeImage(image.id)}
                        disabled={isSubmitting}
                        aria-label={`이미지 ${index + 1} 삭제`}
                      >
                        ×
                      </button>
                    </article>
                  ))}
                  {imageItems.length === 0 && (
                    <p className="board-image-fields__empty">
                      첨부된 이미지가 없습니다.
                    </p>
                  )}
                </div>

                <label
                  className="board-image-fields__add"
                  htmlFor="board-image-input"
                >
                  + 이미지 첨부
                </label>
                <input
                  ref={imageInputRef}
                  id="board-image-input"
                  type="file"
                  className="board-image-fields__input"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  disabled={isSubmitting}
                  onChange={handleImageFiles}
                  aria-describedby="board-image-helper"
                />
                <p
                  id="board-image-helper"
                  className="board-form__helper"
                  role={imageError ? 'alert' : undefined}
                >
                  {imageError}
                </p>
              </fieldset>

              {/* 투표 관련 값은 백엔드 요청 본문에 포함하지 않는 안내 UI */}
              <section
                className="board-vote-preview"
                aria-labelledby="board-vote-preview-title"
              >
                <div>
                  <h3 id="board-vote-preview-title">과실 투표</h3>
                </div>
                <span>준비 중</span>
              </section>

              {submitError && (
                <p className="board-form__submit-error" role="alert">
                  {submitError}
                </p>
              )}

              <button
                type="submit"
                className="board-form__submit"
                disabled={!canSubmit}
              >
                {submitButtonText}
              </button>
            </form>
          </section>
        )}
      </main>

      {activePreview && (
        <Portal>
          <div
            className="board-image-modal"
            role="dialog"
            aria-modal="true"
            aria-label="첨부 이미지 크게 보기"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setActivePreviewId(null);
              }
            }}
          >
            <div className="board-image-modal__content">
              <button
                type="button"
                className="board-image-modal__close"
                onClick={() => setActivePreviewId(null)}
                aria-label="큰 이미지 미리보기 닫기"
              >
                ×
              </button>
              <img src={activePreview.src} alt={activePreview.name} />
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
