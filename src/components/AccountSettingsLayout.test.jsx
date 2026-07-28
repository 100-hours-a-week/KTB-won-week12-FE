import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import AccountSettingsLayout from './AccountSettingsLayout';

vi.mock('./AppHeader', () => ({
  default: ({ onBack }) => (
    <button type="button" onClick={onBack}>
      테스트 뒤로가기
    </button>
  ),
}));

function SettingsPanel() {
  return (
    <AccountSettingsLayout
      eyebrow="계정 관리"
      title="회원정보 수정"
      description="설정 설명"
    >
      <div>설정 폼 내용</div>
    </AccountSettingsLayout>
  );
}

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/settings/profile']}>
      <Routes>
        <Route path="/settings/profile" element={<SettingsPanel />} />
        <Route path="/settings/password" element={<div>비밀번호 설정 도착</div>} />
        <Route path="/boards" element={<div>게시글 목록 도착</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AccountSettingsLayout', () => {
  it('제목·설명·자식과 현재 설정 메뉴를 표시한다', () => {
    renderLayout();

    expect(screen.getByRole('heading', { name: '회원정보 수정' })).toBeInTheDocument();
    expect(screen.getByText('설정 설명')).toBeInTheDocument();
    expect(screen.getByText('설정 폼 내용')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '회원정보 수정' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('설정 메뉴와 뒤로가기 경로를 연결한다', async () => {
    const user = userEvent.setup();
    const { unmount } = renderLayout();

    await user.click(screen.getByRole('link', { name: '비밀번호 수정' }));
    expect(await screen.findByText('비밀번호 설정 도착')).toBeInTheDocument();

    unmount();
    renderLayout();
    await user.click(screen.getByRole('button', { name: '테스트 뒤로가기' }));
    expect(await screen.findByText('게시글 목록 도착')).toBeInTheDocument();
  });
});
