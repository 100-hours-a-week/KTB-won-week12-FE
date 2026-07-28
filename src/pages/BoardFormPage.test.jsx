import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBoard, getBoard, updateBoard } from '../api/boardApi';
import BoardFormPage from './BoardFormPage';

vi.mock('../api/boardApi', () => ({
  createBoard: vi.fn(),
  getBoard: vi.fn(),
  updateBoard: vi.fn(),
}));

vi.mock('../components/AppHeader', () => ({
  default: () => <header>테스트 헤더</header>,
}));

vi.mock('../components/Portal', () => ({
  default: ({ children }) => children,
}));

const EDIT_BOARD = {
  boardId: 1,
  title: '기존 사고 제목',
  content: '기존 사고 내용',
  images: [
    {
      imageId: 100,
      imageUrl: 'https://example.com/stored-image.jpg',
    },
  ],
  author: { nickname: '작성자' },
  editableByMe: true,
};

function renderBoardForm({ mode = 'create', path } = {}) {
  const initialPath = path ?? (mode === 'edit' ? '/boards/1/edit' : '/boards/new');

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

async function enterBoardValues(user, { title = '새 사고 제목', content = '새 사고 내용' } = {}) {
  await user.type(screen.getByLabelText('제목*'), title);
  await user.type(screen.getByLabelText('내용*'), content);
}

describe('BoardFormPage', () => {
  beforeEach(() => {
    createBoard.mockReset();
    getBoard.mockReset();
    updateBoard.mockReset();
    createBoard.mockResolvedValue({ boardId: 2 });
    getBoard.mockResolvedValue(EDIT_BOARD);
    updateBoard.mockResolvedValue({ boardId: 1 });

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

    await user.click(screen.getByLabelText('제목*'));
    await user.tab();
    await user.click(screen.getByLabelText('내용*'));
    await user.tab();

    expect(screen.getByText('제목을 입력해주세요.')).toBeInTheDocument();
    expect(screen.getByText('내용을 입력해주세요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '사례 등록하기' })).toBeDisabled();
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

    expect(await screen.findByText('게시글 상세 도착')).toBeInTheDocument();
    expect(createBoard).toHaveBeenCalledWith({
      title: '새 사고 제목',
      content: '새 사고 내용',
      imageUrls: [],
    });
  });

  it('로컬 이미지를 미리보고 확대하거나 제거할 수 있다', async () => {
    const user = userEvent.setup();
    renderBoardForm();
    const imageFile = new File(['image'], 'accident.png', {
      type: 'image/png',
    });

    await user.upload(screen.getByLabelText('+ 이미지 첨부'), imageFile);

    expect(URL.createObjectURL).toHaveBeenCalledWith(imageFile);
    expect(screen.getByText('accident.png')).toBeInTheDocument();
    expect(screen.getByText('미리보기 전용')).toBeInTheDocument();

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

    await user.click(screen.getByRole('button', { name: '이미지 1 삭제' }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:board-image');
    expect(screen.getByText('첨부된 이미지가 없습니다.')).toBeInTheDocument();
  });

  it('이미지가 아닌 파일은 거부한다', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderBoardForm();
    const textFile = new File(['text'], 'notes.txt', { type: 'text/plain' });

    await user.upload(screen.getByLabelText('+ 이미지 첨부'), textFile);

    expect(screen.getByRole('alert')).toHaveTextContent(
      '이미지 파일만 첨부할 수 있습니다.',
    );
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('로컬 미리보기 이미지는 생성 payload에 포함하지 않는다', async () => {
    const user = userEvent.setup();
    renderBoardForm();
    await enterBoardValues(user);
    await user.upload(
      screen.getByLabelText('+ 이미지 첨부'),
      new File(['image'], 'local.png', { type: 'image/png' }),
    );

    await user.click(screen.getByRole('button', { name: '사례 등록하기' }));

    await waitFor(() => expect(createBoard).toHaveBeenCalledTimes(1));
    expect(createBoard).toHaveBeenCalledWith(
      expect.objectContaining({ imageUrls: [] }),
    );
  });

  it('게시글 생성 실패 메시지를 표시하고 다시 제출할 수 있게 한다', async () => {
    const user = userEvent.setup();
    createBoard.mockRejectedValueOnce(new Error('게시글 저장 실패'));
    renderBoardForm();
    await enterBoardValues(user);

    await user.click(screen.getByRole('button', { name: '사례 등록하기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('게시글 저장 실패');
    expect(screen.getByRole('button', { name: '사례 등록하기' })).toBeEnabled();
  });

  it('수정 화면에 기존 값과 저장 이미지를 불러오고 변경 전 제출을 막는다', async () => {
    renderBoardForm({ mode: 'edit' });

    expect(await screen.findByDisplayValue('기존 사고 제목')).toBeInTheDocument();
    expect(screen.getByDisplayValue('기존 사고 내용')).toBeInTheDocument();
    expect(screen.getByText('기존 이미지 1')).toBeInTheDocument();
    expect(screen.getByText('등록된 이미지')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '수정하기' })).toBeDisabled();
    expect(getBoard).toHaveBeenCalledWith(1, {
      signal: expect.any(AbortSignal),
    });
  });

  it('수정한 값과 남겨둔 저장 이미지 URL만 전송한다', async () => {
    const user = userEvent.setup();
    renderBoardForm({ mode: 'edit' });
    const titleInput = await screen.findByDisplayValue('기존 사고 제목');

    await user.clear(titleInput);
    await user.type(titleInput, '수정 사고 제목');
    await user.click(screen.getByRole('button', { name: '수정하기' }));

    expect(await screen.findByText('게시글 상세 도착')).toBeInTheDocument();
    expect(updateBoard).toHaveBeenCalledWith(1, {
      title: '수정 사고 제목',
      content: '기존 사고 내용',
      imageUrls: ['https://example.com/stored-image.jpg'],
    });
  });

  it('저장 이미지를 삭제하면 수정 payload에서도 제외한다', async () => {
    const user = userEvent.setup();
    renderBoardForm({ mode: 'edit' });
    await screen.findByText('기존 이미지 1');

    await user.click(screen.getByRole('button', { name: '이미지 1 삭제' }));
    await user.click(screen.getByRole('button', { name: '수정하기' }));

    await waitFor(() => expect(updateBoard).toHaveBeenCalledTimes(1));
    expect(updateBoard).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ imageUrls: [] }),
    );
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('수정 권한이 없으면 폼을 표시하지 않는다', async () => {
    getBoard.mockResolvedValueOnce({ ...EDIT_BOARD, editableByMe: false });
    renderBoardForm({ mode: 'edit' });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '게시글 작성자만 수정할 수 있습니다.',
    );
    expect(screen.queryByRole('button', { name: '수정하기' })).not.toBeInTheDocument();
    expect(updateBoard).not.toHaveBeenCalled();
  });

  it('올바르지 않은 수정 주소에서는 조회 API를 호출하지 않는다', async () => {
    renderBoardForm({ mode: 'edit', path: '/boards/not-a-number/edit' });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '올바르지 않은 게시글 주소입니다.',
    );
    expect(getBoard).not.toHaveBeenCalled();
  });
});
