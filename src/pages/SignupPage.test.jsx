import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkEmailAvailability,
  checkNicknameAvailability,
  signup,
} from '../api/authApi';
import { AUTH_STATUS, AuthContext } from '../auth/AuthContext';
import SignupPage from './SignupPage';

vi.mock('../api/authApi', () => ({
  checkEmailAvailability: vi.fn(),
  checkNicknameAvailability: vi.fn(),
  signup: vi.fn(),
}));

vi.mock('../components/AppHeader', () => ({
  default: () => <header>테스트 헤더</header>,
}));

vi.mock('../components/Portal', () => ({
  default: ({ children }) => children,
}));

function renderSignupPage(status = AUTH_STATUS.UNAUTHENTICATED) {
  render(
    <AuthContext.Provider value={{ status }}>
      <MemoryRouter initialEntries={['/signup']}>
        <Routes>
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/login" element={<div>로그인 화면 도착</div>} />
          <Route path="/boards" element={<div>게시글 목록 도착</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

async function enterValidSignupValues(user) {
  await user.type(screen.getByLabelText('이메일*'), 'user@example.com');
  await user.tab();
  await screen.findByText('사용 가능한 이메일입니다.');

  await user.type(screen.getByLabelText('닉네임*'), '테스터');
  await user.click(screen.getByRole('button', { name: '중복 확인' }));
  await screen.findByText('사용 가능한 닉네임입니다.');

  await user.type(screen.getByLabelText('비밀번호*'), 'Password1!');
  await user.type(
    screen.getByLabelText('비밀번호 확인*'),
    'Password1!',
  );
}

describe('SignupPage', () => {
  beforeEach(() => {
    checkEmailAvailability.mockReset();
    checkNicknameAvailability.mockReset();
    signup.mockReset();
    checkEmailAvailability.mockResolvedValue(true);
    checkNicknameAvailability.mockResolvedValue(true);
    signup.mockResolvedValue({ id: 1, email: 'user@example.com' });

  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('로컬 입력 형식이 잘못되면 중복 확인과 제출을 막는다', async () => {
    const user = userEvent.setup();
    renderSignupPage();

    await user.type(screen.getByLabelText('이메일*'), 'invalid-email');
    await user.tab();
    await user.type(screen.getByLabelText('닉네임*'), '한');
    await user.tab();
    await user.type(screen.getByLabelText('비밀번호*'), 'short');
    await user.tab();
    await user.type(screen.getByLabelText('비밀번호 확인*'), 'different');
    await user.tab();

    expect(
      screen.getByText('올바른 이메일 형식을 입력해주세요.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('닉네임은 2자 이상 10자 이하로 입력해주세요.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('비밀번호가 일치하지 않습니다.'),
    ).toBeInTheDocument();
    expect(checkEmailAvailability).not.toHaveBeenCalled();
    expect(checkNicknameAvailability).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '회원가입' })).toBeDisabled();
  });

  it('이메일은 blur로, 닉네임은 버튼으로 중복 확인한 뒤 가입한다', async () => {
    const user = userEvent.setup();
    renderSignupPage();
    await enterValidSignupValues(user);

    const submitButton = screen.getByRole('button', { name: '회원가입' });
    expect(submitButton).toBeEnabled();
    await user.click(submitButton);

    expect(await screen.findByText('로그인 화면 도착')).toBeInTheDocument();
    expect(checkEmailAvailability).toHaveBeenCalledWith(
      'user@example.com',
      { signal: expect.any(AbortSignal) },
    );
    expect(checkNicknameAvailability).toHaveBeenCalledWith('테스터', {
      signal: expect.any(AbortSignal),
    });
    expect(signup).toHaveBeenCalledWith(
      {
        email: 'user@example.com',
        nickname: '테스터',
        password: 'Password1!',
      },
      { signal: expect.any(AbortSignal) },
    );
  });

  it('중복 확인이 끝난 값을 수정하면 이전 결과와 제출 가능 상태를 무효화한다', async () => {
    const user = userEvent.setup();
    renderSignupPage();
    await enterValidSignupValues(user);

    expect(screen.getByRole('button', { name: '회원가입' })).toBeEnabled();

    await user.type(screen.getByLabelText('이메일*'), 'x');

    expect(
      screen.queryByText('사용 가능한 이메일입니다.'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '회원가입' })).toBeDisabled();
  });

  it('이미 사용 중인 이메일과 닉네임을 각각 표시한다', async () => {
    const user = userEvent.setup();
    checkEmailAvailability.mockResolvedValueOnce(false);
    checkNicknameAvailability.mockResolvedValueOnce(false);
    renderSignupPage();

    await user.type(screen.getByLabelText('이메일*'), 'used@example.com');
    await user.tab();
    expect(
      await screen.findByText('이미 사용 중인 이메일입니다.'),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText('닉네임*'), '중복닉네임');
    await user.click(screen.getByRole('button', { name: '중복 확인' }));
    expect(
      await screen.findByText('이미 사용 중인 닉네임입니다.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '회원가입' })).toBeDisabled();
  });

  it('기본 프로필 이미지와 로그인 후 변경 안내를 표시한다', () => {
    renderSignupPage();

    expect(screen.getByAltText('기본 프로필 이미지')).toHaveAttribute(
      'src',
      '/kmap_icon.svg',
    );
    expect(
      screen.getByText(
        '프로필 사진 변경은 로그인 후 회원 정보 수정에서 가능합니다.',
      ),
    ).toBeInTheDocument();
    // 회원가입에서는 저장되지 않는 파일 입력을 노출하지 않는다.
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('백엔드의 이메일 중복 오류를 사용자용 메시지로 표시한다', async () => {
    const user = userEvent.setup();
    signup.mockRejectedValueOnce({
      status: 409,
      code: 'EMAIL_ALREADY_EXISTS',
      message: 'Email already exists',
    });
    renderSignupPage();
    await enterValidSignupValues(user);

    await user.click(screen.getByRole('button', { name: '회원가입' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '이미 가입된 이메일입니다. 로그인하거나 다른 이메일을 사용해주세요.',
    );
    expect(screen.getByRole('button', { name: '회원가입' })).toBeEnabled();
  });

  it('가입 요청이 오래 걸리면 스피너를 표시하고 8초 후 중단한다', async () => {
    const user = userEvent.setup();
    renderSignupPage();
    await enterValidSignupValues(user);

    signup.mockImplementationOnce(
      (values, { signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(new DOMException('요청 중단', 'AbortError'));
          });
        }),
    );

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: '회원가입' }));

    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      '서버 응답을 기다리는 중입니다.',
    );

    await act(async () => {
      vi.advanceTimersByTime(7600);
      await Promise.resolve();
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      '서버 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.',
    );
  });

  it('이미 인증된 사용자는 회원가입 화면에서 게시글 목록으로 이동한다', async () => {
    renderSignupPage(AUTH_STATUS.AUTHENTICATED);

    expect(await screen.findByText('게시글 목록 도착')).toBeInTheDocument();
    expect(signup).not.toHaveBeenCalled();
  });
});
