import { describe, expect, it } from 'vitest';
import { formatPresetHighlight } from './presets.js';

describe('formatPresetHighlight', () => {
  it('formats spend payload with amount and purpose', () => {
    expect(formatPresetHighlight('spend', { amount: 30, currency: 'usd', purpose: 'research' }))
      .toEqual({ label: 'USD 30', detail: 'research' });
  });

  it('formats publish payload with target', () => {
    expect(formatPresetHighlight('publish', { target: 'client@corp.com', contentSummary: '월간 보고서' }))
      .toEqual({ label: '→ client@corp.com', detail: '월간 보고서' });
  });

  it('returns null for unknown types or missing fields', () => {
    expect(formatPresetHighlight('deploy', { env: 'prod' })).toBeNull();
    expect(formatPresetHighlight('spend', {})).toBeNull();
    expect(formatPresetHighlight('publish', {})).toBeNull();
  });
});
