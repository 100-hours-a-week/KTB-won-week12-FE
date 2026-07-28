import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Portal from './Portal';

describe('Portal', () => {
  it('자식 요소를 컴포넌트 container가 아닌 document.body에 렌더링한다', () => {
    const { container } = render(
      <Portal>
        <div data-testid="portal-content">포털 내용</div>
      </Portal>,
    );

    const content = screen.getByTestId('portal-content');
    expect(document.body).toContainElement(content);
    expect(container).not.toContainElement(content);
  });
});
