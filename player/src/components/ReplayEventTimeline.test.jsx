import React from 'react';
import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import ReplayEventTimeline from './ReplayEventTimeline.jsx';

afterEach(() => {
  cleanup();
});

describe('ReplayEventTimeline', () => {
  test('renders an empty state when no replay events are available', () => {
    render(<ReplayEventTimeline events={[]} />);

    expect(screen.getByRole('heading', { name: 'Recent events' })).toBeVisible();
    expect(screen.getByText('0 events')).toBeVisible();
    expect(screen.getByText('No replay events loaded yet.')).toBeVisible();
    expect(screen.queryByRole('list', { name: 'Replay event timeline' })).not.toBeInTheDocument();
  });

  test('renders replay events in input order with branch and compact stat lines', () => {
    const events = [
      {
        eventId: 'event-merge-1',
        eventType: 'merge',
        title: 'Merge pull request #81 from feature/song',
        branchName: 'main',
        filesChanged: 2,
        linesAdded: 10,
        linesDeleted: 2,
      },
      {
        eventId: 'event-review-1',
        eventType: 'review-request-changes',
        message: 'tighten syncopation in the tension phrase',
        branchName: 'feature/song',
        changedFiles: ['src/player/tension.js'],
      },
      {
        eventId: 'event-sync-1',
        eventType: 'sync',
        message: 'pull latest main',
        branchName: 'main',
      },
      {
        eventId: 'event-resolve-1',
        eventType: 'review-resolve',
        message: 'resolved after retest',
        branchName: 'feature/song',
      },
    ];

    render(<ReplayEventTimeline events={events} />);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(4);

    expect(within(items[0]).getByText('Merge')).toBeVisible();
    expect(within(items[0]).getByText('Merge pull request #81 from feature/song')).toBeVisible();
    expect(within(items[0]).getByText('Branch main')).toBeVisible();
    expect(within(items[0]).getByText('2 files · +10 · -2')).toBeVisible();

    expect(within(items[1]).getByText('Request Changes')).toBeVisible();
    expect(within(items[1]).getByText('tighten syncopation in the tension phrase')).toBeVisible();
    expect(within(items[1]).getByText('Branch feature/song')).toBeVisible();
    expect(within(items[1]).getByText('1 file')).toBeVisible();

    expect(within(items[2]).getByText('Sync')).toBeVisible();
    expect(within(items[2]).getByText('pull latest main')).toBeVisible();
    expect(within(items[2]).getByText('Branch main')).toBeVisible();
    expect(within(items[2]).queryByText(/files|\+\d|-\d/)).not.toBeInTheDocument();

    expect(within(items[3]).getByText('Resolve Thread')).toBeVisible();
    expect(within(items[3]).getByText('resolved after retest')).toBeVisible();
    expect(within(items[3]).getByText('Branch feature/song')).toBeVisible();
  });
});
