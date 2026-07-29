import '../styles/components/BrandLogo.css';

export default function BrandLogo({ className = '' }) {
  const classNames = ['brand-logo', className].filter(Boolean).join(' ');

  return (
    <img
      className={classNames}
      src="/kmap_logo.svg"
      alt="크맵"
    />
  );
}
