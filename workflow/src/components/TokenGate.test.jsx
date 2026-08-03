import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TokenGate from './TokenGate.jsx';

describe('TokenGate', () => {
  it('입력한 토큰(trim)으로 onSubmit을 호출한다', async () => {
    const onSubmit = vi.fn();
    render(<TokenGate onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('서버 토큰'), '  wf-secret  ');
    await userEvent.click(screen.getByRole('button', { name: '연결' }));
    expect(onSubmit).toHaveBeenCalledWith('wf-secret');
  });

  it('빈 값이면 연결 버튼이 비활성화된다', () => {
    render(<TokenGate onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: '연결' })).toBeDisabled();
  });
});
