import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChannelBoard from './ChannelBoard.jsx';

const requests = [
  {
    requestId: 'dcr_1',
    subjectType: 'spend',
    actorId: 'agent_a',
    subject: { title: 'API 크레딧 $30 구매', summary: '', payload: {} },
  },
  {
    requestId: 'dcr_2',
    subjectType: 'publish',
    actorId: 'agent_b',
    subject: { title: '보고서 발송', summary: '', payload: {} },
  },
];

describe('ChannelBoard', () => {
  it('renders a note per pending request with subjectType badge', () => {
    render(<ChannelBoard requests={requests} onSelect={() => {}} />);
    const notes = screen.getAllByTestId('decision-note');
    expect(notes).toHaveLength(2);
    expect(screen.getByText('API 크레딧 $30 구매')).toBeInTheDocument();
    expect(screen.getByText('spend')).toBeInTheDocument();
    expect(screen.getByText('publish')).toBeInTheDocument();
  });

  it('calls onSelect with the request when a note is tapped', async () => {
    const onSelect = vi.fn();
    render(<ChannelBoard requests={requests} onSelect={onSelect} />);
    await userEvent.click(screen.getByText('보고서 발송'));
    expect(onSelect).toHaveBeenCalledWith(requests[1]);
  });
});

it('체인에 속한 요청 카드에 체인 배지를 표시한다', () => {
  render(
    <ChannelBoard
      requests={[
        { requestId: 'dcr_1', subjectType: 'email-triage', actorId: 'agent_mail', subject: { title: '분류', payload: {} } },
        { requestId: 'dcr_2', parentRequestId: 'dcr_1', subjectType: 'email-reply', actorId: 'agent_mail', subject: { title: '답장', payload: {} } },
      ]}
      onSelect={() => {}}
    />,
  );
  const notes = screen.getAllByTestId('decision-note');
  expect(notes.some((note) => note.textContent.includes('체인'))).toBe(true);
  const rootNote = notes.find((note) => note.textContent.includes('분류'));
  expect(rootNote.textContent.includes('체인')).toBe(false);
});
