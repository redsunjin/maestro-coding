import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

import PlayerDeckTabs from './PlayerDeckTabs.jsx';

afterEach(() => {
  cleanup();
});

describe('PlayerDeckTabs', () => {
  test('renders four deck tabs with the active tab selected', () => {
    render(
      <PlayerDeckTabs activeTab="source" onSelect={() => {}} indicators={{}} language="en" />,
    );

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(4);
    expect(screen.getByRole('tab', { name: /Source/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Play/ })).toHaveAttribute('aria-selected', 'false');
  });

  test('clicking a tab calls onSelect with the tab id', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <PlayerDeckTabs activeTab="source" onSelect={onSelect} indicators={{}} language="en" />,
    );

    await user.click(screen.getByRole('tab', { name: /Records/ }));
    expect(onSelect).toHaveBeenCalledWith('records');
  });

  test('lights the LED for tabs whose indicator is on', () => {
    render(
      <PlayerDeckTabs
        activeTab="source"
        onSelect={() => {}}
        indicators={{ play: true, records: false }}
        language="en"
      />,
    );

    const playTab = screen.getByRole('tab', { name: /Play/ });
    const recordsTab = screen.getByRole('tab', { name: /Records/ });
    expect(playTab.querySelector('.player-deck-tab__led--on')).not.toBeNull();
    expect(recordsTab.querySelector('.player-deck-tab__led--on')).toBeNull();
  });

  test('uses korean labels when language is ko', () => {
    render(
      <PlayerDeckTabs activeTab="play" onSelect={() => {}} indicators={{}} language="ko" />,
    );

    expect(screen.getByRole('tab', { name: /플레이/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /기록/ })).toBeInTheDocument();
  });
});
