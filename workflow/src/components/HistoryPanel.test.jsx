import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import HistoryPanel from './HistoryPanel.jsx';

const entries = [
  {
    id: 'hist_2',
    timestamp: '2026-07-31T10:00:00.000Z',
    event: 'DECIDED',
    requestId: 'dcr_1',
    actorId: 'agent_a',
    subjectType: 'spend',
    title: 'API 크레딧 $30 구매',
    decision: 'approve',
    comment: '한도 내',
    decidedBy: 'operator',
  },
  {
    id: 'hist_1',
    timestamp: '2026-07-31T09:59:00.000Z',
    event: 'REQUEST_CREATED',
    requestId: 'dcr_1',
    actorId: 'agent_a',
    subjectType: 'spend',
    title: 'API 크레딧 $30 구매',
    decision: null,
    comment: null,
    decidedBy: null,
  },
];

describe('HistoryPanel', () => {
  it('renders ledger rows with event label, actor, decision and reason', () => {
    render(<HistoryPanel entries={entries} />);
    const rows = screen.getAllByTestId('history-entry');
    expect(rows).toHaveLength(2);
    expect(screen.getByText('결정')).toBeInTheDocument();
    expect(screen.getByText('요청 생성')).toBeInTheDocument();
    expect(screen.getByText(/approve/)).toBeInTheDocument();
    expect(screen.getByText(/한도 내/)).toBeInTheDocument();
    expect(screen.getAllByText(/agent_a/).length).toBeGreaterThan(0);
  });

  it('shows empty state when there are no entries', () => {
    render(<HistoryPanel entries={[]} />);
    expect(screen.getByText('아직 기록된 결정이 없습니다')).toBeInTheDocument();
  });
});
