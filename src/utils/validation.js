const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d\s])\S{8,20}$/;

export function validateEmail(email) {
  if (email.length === 0) {
    return '이메일을 입력해주세요.';
  }

  if (!EMAIL_REGEX.test(email)) {
    return '올바른 이메일 형식을 입력해주세요.';
  }

  return '';
}

export function validatePassword(password) {
  if (password.length === 0) {
    return '비밀번호를 입력해주세요.';
  }

  if (!PASSWORD_REGEX.test(password)) {
    return '8~20자의 대문자, 소문자, 숫자, 특수문자를 모두 포함해주세요.';
  }

  return '';
}

export function validatePasswordConfirm(password, passwordConfirm) {
  if (passwordConfirm.length === 0) {
    return '비밀번호를 한 번 더 입력해주세요.';
  }

  if (password !== passwordConfirm) {
    return '비밀번호가 일치하지 않습니다.';
  }

  return '';
}

export function validateNickname(nickname) {
  if (nickname.length === 0) {
    return '닉네임을 입력해주세요.';
  }

  if (nickname !== nickname.trim()) {
    return '닉네임 앞뒤의 공백을 제거해주세요.';
  }

  if (nickname.length < 2 || nickname.length > 10) {
    return '닉네임은 2자 이상 10자 이하로 입력해주세요.';
  }

  return '';
}

export function validateOptionalImageUrl(imageUrl) {
  if (imageUrl.length === 0) {
    return '';
  }

  try {
    const parsedUrl = new URL(imageUrl);

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return '프로필 이미지는 HTTP 또는 HTTPS URL로 입력해주세요.';
    }
  } catch {
    return '올바른 프로필 이미지 URL을 입력해주세요.';
  }

  return '';
}
