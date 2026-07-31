import { describe, expect, it } from 'vitest';
import { assignChannels } from './channels.js';

const req = (id, subjectType) => ({ requestId: id, subjectType, subject: { title: id } });

describe('assignChannels', () => {
  it('groups by subjectType in first-seen round-robin order', () => {
    const channels = assignChannels(
      [req('r1', 'spend'), req('r2', 'publish'), req('r3', 'spend'), req('r4', 'deploy')],
      4,
    );
    expect(channels).toHaveLength(4);
    expect(channels[0].map((r) => r.requestId)).toEqual(['r1', 'r3']);
    expect(channels[1].map((r) => r.requestId)).toEqual(['r2']);
    expect(channels[2].map((r) => r.requestId)).toEqual(['r4']);
    expect(channels[3]).toEqual([]);
  });

  it('wraps subjectTypes beyond channelCount', () => {
    const channels = assignChannels(
      [req('r1', 'a'), req('r2', 'b'), req('r3', 'c')],
      2,
    );
    expect(channels[0].map((r) => r.requestId)).toEqual(['r1', 'r3']);
    expect(channels[1].map((r) => r.requestId)).toEqual(['r2']);
  });
});
