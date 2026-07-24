import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  createBoard,
  getBoard,
  updateBoard,
} from '../api/boardApi';
import AppHeader from '../components/AppHeader';
import Portal from '../components/Portal';
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

function createPayload(values, imageItems) {
  return {
    title: values.title.trim(),
    content: values.content.trim(),
    // S3 도입 전에는 백엔드에 이미 저장된 HTTP 이미지 URL만 다시 전송
    imageUrls: imageItems
      .filter((image) => image.kind === 'stored')
      .map((image) => image.src),
  };
}

export default function BoardFormPage({ mode }) {
  const navigate = useNavigate();
  const { boardId: boardIdParam } = useParams();
  const nextImageIdRef = useRef(1);
  const imageInputRef = useRef(null);
  const localPreviewUrlsRef = useRef(new Set());
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
  const [submitError, setSubmitError] = useState('');

  const titleError = validateTitle(values.title);
  const contentError = validateContent(values.content);
  const payload = useMemo(
    () => createPayload(values, imageItems),
    [imageItems, values],
  );
  const activePreview = imageItems.find(
    (image) => image.id === activePreviewId,
  );

  const isFormValid = !titleError && !contentError && !imageError;
  const isDirty =
    !isEditMode ||
    (initialPayload != null &&
      JSON.stringify(payload) !== JSON.stringify(initialPayload));
  const canSubmit =
    loadState === 'success' && isFormValid && isDirty && !isSubmitting;

  useEffect(
    () => () => {
      // 페이지를 벗어날 때 브라우저가 생성한 모든 로컬 미리보기 URL 해제
      localPreviewUrlsRef.current.forEach((previewUrl) => {
        URL.revokeObjectURL(previewUrl);
      });
      localPreviewUrlsRef.current.clear();
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
        const nextImageItems = board.images.map((image, index) => ({
          id: `stored-image-${image.imageId}`,
          kind: 'stored',
          src: image.imageUrl,
          name: `기존 이미지 ${index + 1}`,
        }));

        setValues(nextValues);
        setImageItems(nextImageItems);
        setInitialPayload(createPayload(nextValues, nextImageItems));
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

  function handleImageFiles(event) {
    const selectedFiles = Array.from(event.target.files ?? []);
    const imageFiles = selectedFiles.filter((file) =>
      file.type.startsWith('image/'),
    );

    setImageError(
      imageFiles.length === selectedFiles.length
        ? ''
        : '이미지 파일만 첨부할 수 있습니다.',
    );

    const nextLocalImages = imageFiles.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      localPreviewUrlsRef.current.add(previewUrl);

      return {
        id: `local-image-${nextImageIdRef.current++}`,
        kind: 'local',
        src: previewUrl,
        name: file.name,
      };
    });

    setImageItems((currentImages) => [
      ...currentImages,
      ...nextLocalImages,
    ]);
    setSubmitError('');

    // 동일한 파일을 다시 선택해도 change 이벤트가 발생하도록 초기화
    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }
  }

  function removeImage(imageId) {
    setImageItems((currentImages) => {
      const targetImage = currentImages.find(
        (image) => image.id === imageId,
      );

      if (targetImage?.kind === 'local') {
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

  async function handleSubmit(event) {
    event.preventDefault();
    setHasSubmitted(true);
    setTouchedFields({ title: true, content: true });
    setSubmitError('');

    if (!canSubmit) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = isEditMode
        ? await updateBoard(boardId, payload)
        : await createBoard(payload);

      // 생성과 수정 응답의 boardId를 사용해 최종 상세 주소로 이동
      navigate(`/boards/${response.boardId}`, { replace: true });
    } catch (error) {
      setSubmitError(
        error.status === 403
          ? '게시글 작성자만 수정할 수 있습니다.'
          : error.message ||
              `게시글을 ${isEditMode ? '수정' : '등록'}하지 못했습니다.`,
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function moveBack() {
    navigate(isEditMode && isValidBoardId ? `/boards/${boardId}` : '/boards');
  }

  const pageTitle = isEditMode ? '사고 사례 수정' : '사고 사례 등록';

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
                  새로 첨부한 이미지는 아직 미리보기만
                  제공되며 게시글에는 저장되지 않습니다.
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
                            : '미리보기 전용'}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="board-image-item__remove"
                        onClick={() => removeImage(image.id)}
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
                  accept="image/*"
                  multiple
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
                {isSubmitting
                  ? isEditMode
                    ? '수정 중...'
                    : '등록 중...'
                  : isEditMode
                    ? '수정하기'
                    : '사례 등록하기'}
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
