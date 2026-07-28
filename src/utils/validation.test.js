import { describe, expect, it } from 'vitest';
import {
  validateEmail,
  validateNickname,
  validateOptionalImageUrl,
  validatePassword,
  validatePasswordConfirm,
} from './validation';

describe('validation', () => {
  it.each([
    ['', '이메일을 입력해주세요.'],
    ['invalid-email', '올바른 이메일 형식을 입력해주세요.'],
    ['user@example.com', ''],
  ])('이메일 %s 검증 결과를 반환한다', (email, expected) => {
    expect(validateEmail(email)).toBe(expected);
  });

  it.each([
    ['', '비밀번호를 입력해주세요.'],
    ['password', '8~20자의 대문자, 소문자, 숫자, 특수문자를 모두 포함해주세요.'],
    ['Password1!', ''],
  ])('비밀번호 형식을 검증한다', (password, expected) => {
    expect(validatePassword(password)).toBe(expected);
  });

  it('비밀번호 확인의 필수값과 일치 여부를 검증한다', () => {
    expect(validatePasswordConfirm('Password1!', '')).toBe(
      '비밀번호를 한 번 더 입력해주세요.',
    );
    expect(validatePasswordConfirm('Password1!', 'Password2!')).toBe(
      '비밀번호가 일치하지 않습니다.',
    );
    expect(validatePasswordConfirm('Password1!', 'Password1!')).toBe('');
  });

  it.each([
    ['', '닉네임을 입력해주세요.'],
    [' 닉네임', '닉네임 앞뒤의 공백을 제거해주세요.'],
    ['한', '닉네임은 2자 이상 10자 이하로 입력해주세요.'],
    ['올바른닉네임', ''],
  ])('닉네임 형식을 검증한다', (nickname, expected) => {
    expect(validateNickname(nickname)).toBe(expected);
  });

  it('선택 이미지 URL은 HTTP와 HTTPS만 허용한다', () => {
    expect(validateOptionalImageUrl('')).toBe('');
    expect(validateOptionalImageUrl('https://example.com/profile.png')).toBe('');
    expect(validateOptionalImageUrl('ftp://example.com/profile.png')).toBe(
      '프로필 이미지는 HTTP 또는 HTTPS URL로 입력해주세요.',
    );
    expect(validateOptionalImageUrl('not-a-url')).toBe(
      '올바른 프로필 이미지 URL을 입력해주세요.',
    );
  });
});
