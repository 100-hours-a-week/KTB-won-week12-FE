import { createPortal } from 'react-dom';

export default function Portal({ children }) {
  // 페이지의 stacking context와 overflow 영향을 받지 않도록 body에 렌더링
  return createPortal(children, document.body);
}
