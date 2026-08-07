import '../styles/components/DefaultProfileAvatar.css';

export default function DefaultProfileAvatar({
  className = '',
  ariaLabel,
}) {
  const accessibilityProps = ariaLabel
    ? { role: 'img', 'aria-label': ariaLabel }
    : { 'aria-hidden': true };

  return (
    <span
      className={`default-profile-avatar ${className}`.trim()}
      {...accessibilityProps}
    >
      {/* 별도 이미지 요청 없이 모든 화면에서 같은 사람 상반신 모양을 사용 */}
      <svg viewBox="0 0 64 64" focusable="false">
        <circle cx="32" cy="22" r="11" />
        <path d="M11 57c1.7-14.2 9.4-22 21-22s19.3 7.8 21 22H11Z" />
      </svg>
    </span>
  );
}
