import React from 'react';
import { describe, expect, test } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import SourceModeGuide from './SourceModeGuide.jsx';

describe('SourceModeGuide', () => {
  test('renders all modes and marks the active mode with readiness cues', () => {
    render(<SourceModeGuide mode="public" />);

    expect(screen.getByRole('heading', { name: 'Choose the right input path' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Local Repo' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Public Repo URL' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Connected Account' })).toBeInTheDocument();

    const publicCard = screen.getByRole('heading', { name: 'Public Repo URL' }).closest('article');
    const localCard = screen.getByRole('heading', { name: 'Local Repo' }).closest('article');

    expect(publicCard).toHaveAttribute('aria-current', 'step');
    expect(localCard).not.toHaveAttribute('aria-current');
    expect(within(publicCard).getByText('Ready now')).toBeInTheDocument();
    expect(within(publicCard).getByText('Active mode')).toBeInTheDocument();
    expect(within(localCard).getByText('Staged')).toBeInTheDocument();
    expect(within(localCard).getByText(/desktop or server bridge/i)).toBeInTheDocument();
  });

  test('accepts per-mode source state overrides for current readiness and cues', () => {
    render(
      <SourceModeGuide
        mode="account"
        sourceState={{
          public: {
            cue: '2 events loaded from openai/maestro-player.',
          },
          account: {
            readiness: 'Connected',
            readinessTone: 'ready',
            cue: '12 repositories synced and ready to load.',
            capabilities: [
              'Private repository picker is available.',
              'Replay can load without manual URLs once the token is accepted.',
            ],
          },
        }}
      />,
    );

    const accountCard = screen.getByRole('heading', { name: 'Connected Account' }).closest('article');
    const publicCard = screen.getByRole('heading', { name: 'Public Repo URL' }).closest('article');

    expect(accountCard).toHaveAttribute('aria-current', 'step');
    expect(within(accountCard).getByText('Connected')).toBeInTheDocument();
    expect(within(accountCard).getByText('12 repositories synced and ready to load.')).toBeInTheDocument();
    expect(within(accountCard).getByText('Private repository picker is available.')).toBeInTheDocument();
    expect(within(publicCard).getByText('2 events loaded from openai/maestro-player.')).toBeInTheDocument();
  });
});
