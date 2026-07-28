import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { changeCurrentUserPassword } from '../api/userApi';
import PasswordSettingsPage from './PasswordSettingsPage';

vi.mock('../api/userApi', () => ({
  changeCurrentUserPassword: vi.fn(),
}));

vi.mock('../components/AppHeader', () => ({
  default: () => <header>테스트 헤더</header>,
}));

function renderPasswordSettings() {
  return render(
    <MemoryRouter initialEntries={['/settings/password']}>
      <PasswordSettingsPage />
    </MemoryRouter>,
  );
}

async function enterValidPasswords(user) {
  await user.type(screen.getByLabelText('현재 비밀번호'), 'Original1!');
  await user.type(screen.getByLabelText('새 비밀번호'), 'Changed1!');
  await user.type(screen.getByLabelText('새 비밀번호 확인'), 'Changed1!');
}

describe('PasswordSettingsPage', () => {
  beforeEach(() => {
    changeCurrentUserPassword.mockReset();
    changeCurrentUserPassword.mockResolvedValue(undefined);
  });

  it('현재 비밀번호와 새 비밀번호 형식 및 확인 값을 검증한다', async () => {
    const user = userEvent.setup();
    renderPasswordSettings();

    await user.click(screen.getByLabelText('현재 비밀번호'));
    await user.tab();
    await user.type(screen.getByLabelText('새 비밀번호'), 'short');
    await user.tab();
    await user.type(screen.getByLabelText('새 비밀번호 확인'), 'different');
    await user.tab();

    expect(screen.getByText('현재 비밀번호를 입력해주세요.')).toBeInTheDocument();
    expect(
      screen.getByText(
        '8~20자의 대문자, 소문자, 숫자, 특수문자를 모두 포함해주세요.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('비밀번호가 일치하지 않습니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '비밀번호 수정' })).toBeDisabled();
  });

  it('현재 비밀번호와 동일한 새 비밀번호를 차단한다', async () => {
    const user = userEvent.setup();
    renderPasswordSettings();

    await user.type(screen.getByLabelText('현재 비밀번호'), 'Password1!');
    await user.type(screen.getByLabelText('새 비밀번호'), 'Password1!');
    await user.tab();
    await user.type(screen.getByLabelText('새 비밀번호 확인'), 'Password1!');

    expect(
      screen.getByText('새 비밀번호는 현재 비밀번호와 다르게 입력해주세요.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '비밀번호 수정' })).toBeDisabled();
  });

  it('비밀번호 변경 성공 후 입력값을 비우고 완료 문구를 표시한다', async () => {
    const user = userEvent.setup();
    renderPasswordSettings();
    await enterValidPasswords(user);

    await user.click(screen.getByRole('button', { name: '비밀번호 수정' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      '비밀번호가 수정되었습니다.',
    );
    expect(changeCurrentUserPassword).toHaveBeenCalledWith({
      originalPassword: 'Original1!',
      changedPassword: 'Changed1!',
    });
    expect(screen.getByLabelText('현재 비밀번호')).toHaveValue('');
    expect(screen.getByLabelText('새 비밀번호')).toHaveValue('');
    expect(screen.getByLabelText('새 비밀번호 확인')).toHaveValue('');
  });

  it('현재 비밀번호 오류 코드를 사용자용 문구로 표시한다', async () => {
    const user = userEvent.setup();
    changeCurrentUserPassword.mockRejectedValueOnce({
      status: 400,
      code: 'PASSWORD_INCORRECT',
      message: 'Password incorrect',
    });
    renderPasswordSettings();
    await enterValidPasswords(user);

    await user.click(screen.getByRole('button', { name: '비밀번호 수정' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '현재 비밀번호가 올바르지 않습니다.',
    );
    expect(screen.getByRole('button', { name: '비밀번호 수정' })).toBeEnabled();
  });
});
