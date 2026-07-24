import ConfirmModal from './ConfirmModal';

export default function LoginRequiredModal({
  isOpen,
  description = '로그인이 필요한 기능입니다. 로그인하시겠습니까?',
  onCancel,
  onConfirm,
}) {
  return (
    <ConfirmModal
      isOpen={isOpen}
      title="로그인이 필요합니다"
      description={description}
      confirmLabel="로그인"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
