import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DecisionSheet from './DecisionSheet.jsx';

const request = {
  requestId: 'dcr_1',
  subjectType: 'spend',
  actorId: 'agent_a',
  subject: {
    title: 'API 크레딧 $30 구매',
    summary: '리서치용',
    payload: { amount: 30, currency: 'USD', purpose: 'research-api' },
  },
};

describe('DecisionSheet', () => {
  it('shows title, preset highlight and payload', () => {
    render(<DecisionSheet request={request} onDecide={() => {}} onClose={() => {}} />);
    expect(screen.getByText('API 크레딧 $30 구매')).toBeInTheDocument();
    expect(screen.getByText('USD 30')).toBeInTheDocument();
    expect(screen.getByTestId('payload-json')).toHaveTextContent('research-api');
  });

  it('approve button decides immediately', async () => {
    const onDecide = vi.fn();
    render(<DecisionSheet request={request} onDecide={onDecide} onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: '승인' }));
    expect(onDecide).toHaveBeenCalledWith('approve', '');
  });

  it('reject flow requires reason chip or text before confirming', async () => {
    const onDecide = vi.fn();
    render(<DecisionSheet request={request} onDecide={onDecide} onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: '반려' }));
    await userEvent.click(screen.getByRole('button', { name: '비용 초과' }));
    await userEvent.click(screen.getByRole('button', { name: '반려 확정' }));
    expect(onDecide).toHaveBeenCalledWith('reject', '비용 초과');
  });

  it('backdrop tap closes the sheet', async () => {
    const onClose = vi.fn();
    render(<DecisionSheet request={request} onDecide={() => {}} onClose={onClose} />);
    await userEvent.click(screen.getByTestId('sheet-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });

  it('secondary actions decide with revise/ask/cancel vocabulary', async () => {
    const onDecide = vi.fn();
    render(<DecisionSheet request={request} onDecide={onDecide} onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: '보완 요청' }));
    expect(onDecide).toHaveBeenCalledWith('revise', '');
  });

  it('chain prop이 있으면 타임라인을 렌더하고 현재 요청을 강조한다', () => {
    render(
      <DecisionSheet
        request={{
          requestId: 'dcr_2',
          parentRequestId: 'dcr_1',
          subjectType: 'email-reply',
          actorId: 'agent_mail',
          subject: { title: '답장 초안 v1', summary: '', payload: {} },
        }}
        chain={[
          { requestId: 'dcr_1', subjectType: 'email-triage', status: 'decided', subject: { title: '메일 분류' } },
          { requestId: 'dcr_2', subjectType: 'email-reply', status: 'pending_decision', subject: { title: '답장 초안 v1' } },
        ]}
        onDecide={() => {}}
        onClose={() => {}}
      />,
    );
    const timeline = screen.getByLabelText('결정 체인');
    expect(timeline.textContent).toContain('메일 분류');
    expect(timeline.textContent).toContain('결정됨');
    expect(timeline.textContent).toContain('대기');
    expect(timeline.textContent).toContain('← 현재');
  });

  it('parentRequestId가 있으면 체인 이전 요청을 표시한다', () => {
    render(
      <DecisionSheet
        request={{
          requestId: 'dcr_2',
          parentRequestId: 'dcr_1',
          subjectType: 'email-reply',
          actorId: 'agent_mail',
          subject: { title: '답장 초안 v2', summary: '', payload: { to: 'client@corp.com' } },
        }}
        onDecide={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/체인 이전 요청: dcr_1/)).toBeInTheDocument();
  });
});
