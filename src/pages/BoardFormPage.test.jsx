import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBoard, getBoard, updateBoard } from '../api/boardApi';
import { uploadBoardImages } from '../api/uploadApi';
import { prepareBoardImages } from '../utils/imageProcessing';
import BoardFormPage from './BoardFormPage';

// 게시글 조회·생성·수정의 실제 네트워크 요청 대신 호출 인자와 화면 분기만 검증
vi.mock('../api/boardApi', () => ({
  createBoard: vi.fn(),
  getBoard: vi.fn(),
  updateBoard: vi.fn(),
}));

// S3 업로드는 uploadApi 단위 테스트에서 검증하므로 여기서는 반환 Key를 제어
vi.mock('../api/uploadApi', () => ({
  uploadBoardImages: vi.fn(),
}));

// 파일 형식·크기 검증은 실제 구현을 사용하되 jsdom에서 실행할 수 없는
// Canvas 썸네일 생성 함수만 mock으로 교체한다.
vi.mock('../utils/imageProcessing', async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    prepareBoardImages: vi.fn(),
  };
});

vi.mock('../components/AppHeader', () => ({
  // 헤더 내부 인증 상태와 메뉴 렌더링을 제외하고 폼 동작에만 집중
  default: () => <header>테스트 헤더</header>,
}));

vi.mock('../components/Portal', () => ({
  // 모달을 document.body로 이동하지 않고 현재 테스트 DOM에 바로 렌더링
  default: ({ children }) => children,
}));

// 수정 화면에서 백엔드가 반환할 게시글과 S3 이미지 응답 예시
const EDIT_BOARD = {
  boardId: 1,
  title: '기존 사고 제목',
  content: '기존 사고 내용',
  images: [
    {
      imageId: 100,
      originalObjectKey: 'boards/7/stored/original.jpg',
      thumbnailObjectKey: 'boards/7/stored/thumbnail.webp',
      originalImageUrl: 'https://example.com/stored-original.jpg',
      thumbnailImageUrl: 'https://example.com/stored-thumbnail.webp',
    },
  ],
  author: { nickname: '작성자' },
  editableByMe: true,
};

function renderBoardForm({ mode = 'create', path } = {}) {
  // mode에 맞는 기본 주소를 사용하되 잘못된 boardId 테스트에서는 path를 직접 전달
  const initialPath = path ?? (mode === 'edit' ? '/boards/1/edit' : '/boards/new');

  // 생성·수정 후 navigate 결과도 같은 MemoryRouter 안의 문구로 확인
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/boards/new"
          element={<BoardFormPage mode="create" />}
        />
        <Route
          path="/boards/:boardId/edit"
          element={<BoardFormPage mode="edit" />}
        />
        <Route path="/boards/:boardId" element={<div>게시글 상세 도착</div>} />
        <Route path="/boards" element={<div>게시글 목록 도착</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

// 여러 테스트에서 반복되는 제목·내용 입력을 실제 사용자 타이핑으로 수행
async function enterBoardValues(user, { title = '새 사고 제목', content = '새 사고 내용' } = {}) {
  await user.type(screen.getByLabelText('제목*'), title);
  await user.type(screen.getByLabelText('내용*'), content);
}

describe('BoardFormPage', () => {
  beforeEach(() => {
    // 이전 테스트의 호출 기록과 일회성 성공·실패 응답을 모두 초기화
    createBoard.mockReset();
    getBoard.mockReset();
    updateBoard.mockReset();
    prepareBoardImages.mockReset();
    uploadBoardImages.mockReset();
    // 별도 설정이 없는 테스트에서 사용할 게시글 API 기본 성공 응답
    createBoard.mockResolvedValue({ boardId: 2 });
    getBoard.mockResolvedValue(EDIT_BOARD);
    updateBoard.mockResolvedValue({ boardId: 1 });
    // Canvas를 실행하지 않고 원본마다 WebP File이 생성된 것처럼 결과 반환
    prepareBoardImages.mockImplementation(async (files) =>
      files.map((originalFile, index) => ({
        originalFile,
        thumbnailFile: new File(
          [`thumbnail-${index}`],
          `${originalFile.name}-thumbnail.webp`,
          { type: 'image/webp' },
        ),
      })),
    );
    // S3 PUT이 완료됐다고 가정하고 입력 순서대로 Object Key 쌍 반환
    uploadBoardImages.mockImplementation(async (preparedImages) =>
      preparedImages.map((_, index) => ({
        originalObjectKey: `boards/7/new-${index}/original.png`,
        thumbnailObjectKey: `boards/7/new-${index}/thumbnail.webp`,
      })),
    );

    // jsdom에 없는 blob 미리보기 API를 mock해 생성·해제 호출을 확인
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:board-image'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
  });

  it('신규 작성에서 필수 입력을 검증한다', async () => {
    const user = userEvent.setup();
    renderBoardForm();

    // 입력 후 포커스를 이동해 onBlur 검증 메시지를 노출
    await user.click(screen.getByLabelText('제목*'));
    await user.tab();
    await user.click(screen.getByLabelText('내용*'));
    await user.tab();

    expect(screen.getByText('제목을 입력해주세요.')).toBeInTheDocument();
    expect(screen.getByText('내용을 입력해주세요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '사례 등록하기' })).toBeDisabled();
    // 유효하지 않은 폼은 버튼이 비활성화되고 API도 호출되지 않음
    expect(createBoard).not.toHaveBeenCalled();
  });

  it('입력값을 trim한 payload로 게시글을 생성하고 상세 화면으로 이동한다', async () => {
    const user = userEvent.setup();
    renderBoardForm();
    await enterBoardValues(user, {
      title: '  새 사고 제목  ',
      content: '  새 사고 내용  ',
    });

    await user.click(screen.getByRole('button', { name: '사례 등록하기' }));

    // 생성 응답의 boardId 주소로 이동했는지 확인
    expect(await screen.findByText('게시글 상세 도착')).toBeInTheDocument();

    // 이미지가 없는 게시글도 images 빈 배열을 포함해 새 백엔드 계약으로 전송
    expect(createBoard).toHaveBeenCalledWith({
      title: '새 사고 제목',
      content: '새 사고 내용',
      images: [],
      vote: null,
    });
  });

  it('투표 토글을 켜면 대상과 기간을 검증한다', async () => {
    const user = userEvent.setup();
    renderBoardForm();
    await enterBoardValues(user);

    await user.click(screen.getByRole('checkbox', { name: '과실 투표 추가' }));

    // 토글을 켠 순간 필수 투표값이 비어 있으므로 게시글 제출도 함께 차단
    expect(screen.getByLabelText('왼쪽 대상*')).toBeInTheDocument();
    expect(screen.getByLabelText('오른쪽 대상*')).toBeInTheDocument();
    expect(screen.getByLabelText('투표 기간*')).toHaveValue(24);
    expect(screen.getByRole('button', { name: '사례 등록하기' })).toBeDisabled();

    await user.type(screen.getByLabelText('왼쪽 대상*'), 'A 차량');
    await user.type(screen.getByLabelText('오른쪽 대상*'), 'A 차량');
    await user.tab();

    expect(screen.getAllByText('양쪽 투표 대상은 서로 달라야 합니다.'))
      .toHaveLength(2);

    const durationInput = screen.getByLabelText('투표 기간*');
    await user.clear(durationInput);
    await user.type(durationInput, '169');
    await user.tab();
    expect(
      screen.getByText('투표 기간은 1시간 이상 168시간 이하로 입력해주세요.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '사례 등록하기' })).toBeDisabled();
  });

  it('활성화한 투표값을 trim하고 기간을 숫자로 변환해 생성 요청에 포함한다', async () => {
    const user = userEvent.setup();
    renderBoardForm();
    await enterBoardValues(user);
    await user.click(screen.getByRole('checkbox', { name: '과실 투표 추가' }));
    await user.type(screen.getByLabelText('왼쪽 대상*'), '  A 차량  ');
    await user.type(screen.getByLabelText('오른쪽 대상*'), '  B 차량  ');
    const durationInput = screen.getByLabelText('투표 기간*');
    await user.clear(durationInput);
    await user.type(durationInput, '48');

    await user.click(screen.getByRole('button', { name: '사례 등록하기' }));

    expect(await screen.findByText('게시글 상세 도착')).toBeInTheDocument();
    expect(createBoard).toHaveBeenCalledWith({
      title: '새 사고 제목',
      content: '새 사고 내용',
      images: [],
      vote: {
        leftLabel: 'A 차량',
        rightLabel: 'B 차량',
        durationHours: 48,
      },
    });
  });

  it('로컬 이미지를 미리보고 확대하거나 제거할 수 있다', async () => {
    const user = userEvent.setup();
    renderBoardForm();
    const imageFile = new File(['image'], 'accident.png', {
      type: 'image/png',
    });

    await user.upload(screen.getByLabelText('+ 이미지 첨부'), imageFile);

    // 아직 S3에 올리지 않은 File로 blob URL을 만들어 목록 미리보기 표시
    expect(URL.createObjectURL).toHaveBeenCalledWith(imageFile);
    expect(screen.getByText('accident.png')).toBeInTheDocument();
    expect(screen.getByText('업로드할 이미지')).toBeInTheDocument();

    // 미리보기 버튼을 누르면 Portal 기반 확대 모달이 열림
    await user.click(
      screen.getByRole('button', { name: '이미지 1 크게 보기' }),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByAltText('accident.png')).toHaveAttribute(
      'src',
      'blob:board-image',
    );
    await user.click(
      screen.getByRole('button', { name: '큰 이미지 미리보기 닫기' }),
    );

    // 로컬 이미지 제거 시 사용하던 blob URL도 함께 해제
    await user.click(screen.getByRole('button', { name: '이미지 1 삭제' }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:board-image');
    expect(screen.getByText('첨부된 이미지가 없습니다.')).toBeInTheDocument();
  });

  it('이미지가 아닌 파일은 거부한다', async () => {
    // input accept 필터를 우회해 페이지 내부 MIME 타입 검증을 직접 확인
    const user = userEvent.setup({ applyAccept: false });
    renderBoardForm();
    const textFile = new File(['text'], 'notes.txt', { type: 'text/plain' });

    await user.upload(screen.getByLabelText('+ 이미지 첨부'), textFile);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'JPEG, PNG, WebP 이미지만 첨부할 수 있습니다.',
    );
    // 검증 실패 파일은 imageItems에 추가하지 않으므로 미리보기 URL도 생성하지 않음
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('새 이미지를 WebP 썸네일과 함께 S3에 올리고 반환된 Key로 게시글을 생성한다', async () => {
    const user = userEvent.setup();
    renderBoardForm();
    await enterBoardValues(user);
    const localFile = new File(['image'], 'local.png', {
      type: 'image/png',
    });
    await user.upload(
      screen.getByLabelText('+ 이미지 첨부'),
      localFile,
    );

    // 폼 제출 시 prepareBoardImages → uploadBoardImages → createBoard 순서로 실행
    await user.click(screen.getByRole('button', { name: '사례 등록하기' }));

    await waitFor(() => expect(createBoard).toHaveBeenCalledTimes(1));

    // 사용자가 선택한 원본 File만 썸네일 생성 함수로 전달
    expect(prepareBoardImages).toHaveBeenCalledWith([localFile]);

    // 준비된 원본·썸네일 쌍과 페이지 이탈용 AbortSignal로 S3 업로드
    expect(uploadBoardImages).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ originalFile: localFile }),
      ]),
      { signal: expect.any(AbortSignal) },
    );
    // S3가 반환한 Key만 게시글 요청에 포함하고 File이나 Presigned URL은 제외
    expect(createBoard).toHaveBeenCalledWith({
      title: '새 사고 제목',
      content: '새 사고 내용',
      images: [
        {
          originalObjectKey: 'boards/7/new-0/original.png',
          thumbnailObjectKey: 'boards/7/new-0/thumbnail.webp',
        },
      ],
      vote: null,
    });
  });

  it('이미지 업로드 실패 메시지를 표시하고 게시글 생성 API는 호출하지 않는다', async () => {
    const user = userEvent.setup();
    // Presigned URL 발급 또는 S3 PUT이 실패한 상황을 재현
    uploadBoardImages.mockRejectedValueOnce(
      new Error('이미지 업로드에 실패했습니다. 다시 시도해주세요.'),
    );
    renderBoardForm();
    await enterBoardValues(user);
    await user.upload(
      screen.getByLabelText('+ 이미지 첨부'),
      new File(['image'], 'local.png', { type: 'image/png' }),
    );

    await user.click(screen.getByRole('button', { name: '사례 등록하기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '이미지 업로드에 실패했습니다. 다시 시도해주세요.',
    );
    // 이미지가 완전히 업로드되지 않았으므로 잘못된 Key로 게시글을 생성하지 않음
    expect(createBoard).not.toHaveBeenCalled();

    // finally에서 제출 상태가 초기화돼 사용자가 다시 시도할 수 있어야 함
    expect(
      screen.getByRole('button', { name: '사례 등록하기' }),
    ).toBeEnabled();
  });

  it('게시글 생성 실패 메시지를 표시하고 다시 제출할 수 있게 한다', async () => {
    const user = userEvent.setup();
    // 이미지가 없는 상태에서 최종 게시글 API만 실패한 상황 재현
    createBoard.mockRejectedValueOnce(new Error('게시글 저장 실패'));
    renderBoardForm();
    await enterBoardValues(user);

    await user.click(screen.getByRole('button', { name: '사례 등록하기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('게시글 저장 실패');
    expect(screen.getByRole('button', { name: '사례 등록하기' })).toBeEnabled();
  });

  it('수정 화면에 기존 값과 저장 이미지를 불러오고 변경 전 제출을 막는다', async () => {
    renderBoardForm({ mode: 'edit' });

    // 상세 응답의 제목·내용·원본 Presigned URL을 수정 상태로 변환해 표시
    expect(await screen.findByDisplayValue('기존 사고 제목')).toBeInTheDocument();
    expect(screen.getByDisplayValue('기존 사고 내용')).toBeInTheDocument();
    expect(screen.getByText('기존 이미지 1')).toBeInTheDocument();
    expect(screen.getByText('등록된 이미지')).toBeInTheDocument();
    // 생성 후에는 투표 대상과 기간을 바꿀 수 없으므로 수정 화면에 토글을 노출하지 않음
    expect(
      screen.queryByRole('checkbox', { name: '과실 투표 추가' }),
    ).not.toBeInTheDocument();
    // 최초 snapshot과 동일한 상태에서는 불필요한 수정 요청을 차단
    expect(screen.getByRole('button', { name: '수정하기' })).toBeDisabled();
    expect(getBoard).toHaveBeenCalledWith(1, {
      signal: expect.any(AbortSignal),
    });
  });

  it('수정한 값과 남겨둔 저장 이미지 Object Key만 전송한다', async () => {
    const user = userEvent.setup();
    renderBoardForm({ mode: 'edit' });
    const titleInput = await screen.findByDisplayValue('기존 사고 제목');

    await user.clear(titleInput);
    await user.type(titleInput, '수정 사고 제목');
    await user.click(screen.getByRole('button', { name: '수정하기' }));

    expect(await screen.findByText('게시글 상세 도착')).toBeInTheDocument();
    // 기존 Presigned GET URL이 아니라 DB에 저장된 원본·썸네일 Key를 재전송
    expect(updateBoard).toHaveBeenCalledWith(1, {
      title: '수정 사고 제목',
      content: '기존 사고 내용',
      images: [
        {
          originalObjectKey: 'boards/7/stored/original.jpg',
          thumbnailObjectKey: 'boards/7/stored/thumbnail.webp',
        },
      ],
    });
    // 새 로컬 File이 없으므로 썸네일 생성과 S3 업로드를 건너뜀
    expect(prepareBoardImages).not.toHaveBeenCalled();
    expect(uploadBoardImages).not.toHaveBeenCalled();
  });

  it('수정 시 기존 Key를 유지하고 새 이미지만 업로드해 화면 순서대로 전송한다', async () => {
    const user = userEvent.setup();
    renderBoardForm({ mode: 'edit' });
    await screen.findByText('기존 이미지 1');
    const localFile = new File(['image'], 'new-image.png', {
      type: 'image/png',
    });

    await user.upload(screen.getByLabelText('+ 이미지 첨부'), localFile);
    // 제목·내용을 건드리지 않아도 새 로컬 이미지 자체가 변경 사항이므로 버튼 활성화
    expect(screen.getByRole('button', { name: '수정하기' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '수정하기' }));

    await waitFor(() => expect(updateBoard).toHaveBeenCalledTimes(1));
    // 기존 이미지는 제외하고 새로 추가한 File만 이미지 처리 대상으로 전달
    expect(prepareBoardImages).toHaveBeenCalledWith([localFile]);

    // 화면 순서인 기존 이미지 다음에 새 S3 Object Key가 배치되는지 확인
    expect(updateBoard).toHaveBeenCalledWith(1, {
      title: '기존 사고 제목',
      content: '기존 사고 내용',
      images: [
        {
          originalObjectKey: 'boards/7/stored/original.jpg',
          thumbnailObjectKey: 'boards/7/stored/thumbnail.webp',
        },
        {
          originalObjectKey: 'boards/7/new-0/original.png',
          thumbnailObjectKey: 'boards/7/new-0/thumbnail.webp',
        },
      ],
    });
  });

  it('저장 이미지를 삭제하면 수정 payload에서도 제외한다', async () => {
    const user = userEvent.setup();
    renderBoardForm({ mode: 'edit' });
    await screen.findByText('기존 이미지 1');

    await user.click(screen.getByRole('button', { name: '이미지 1 삭제' }));
    // 기존 이미지 삭제만 수행해도 최초 Object Key 구성과 달라져 버튼 활성화
    expect(screen.getByRole('button', { name: '수정하기' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '수정하기' }));

    await waitFor(() => expect(updateBoard).toHaveBeenCalledTimes(1));
    // 화면에서 제거한 기존 Key는 수정 요청의 images 배열에도 포함되지 않음
    expect(updateBoard).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ images: [] }),
    );
    // 기존 이미지는 S3 URL을 사용하므로 로컬 blob URL 해제 대상이 아님
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('수정 권한이 없으면 폼을 표시하지 않는다', async () => {
    // 공개 상세 조회는 가능하지만 editableByMe가 false인 다른 사용자 게시글
    getBoard.mockResolvedValueOnce({ ...EDIT_BOARD, editableByMe: false });
    renderBoardForm({ mode: 'edit' });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '게시글 작성자만 수정할 수 있습니다.',
    );
    expect(screen.queryByRole('button', { name: '수정하기' })).not.toBeInTheDocument();
    expect(updateBoard).not.toHaveBeenCalled();
  });

  it('올바르지 않은 수정 주소에서는 조회 API를 호출하지 않는다', async () => {
    // 라우트 파라미터를 숫자로 해석할 수 없는 경우 서버 요청 전 차단
    renderBoardForm({ mode: 'edit', path: '/boards/not-a-number/edit' });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '올바르지 않은 게시글 주소입니다.',
    );
    expect(getBoard).not.toHaveBeenCalled();
  });
});
