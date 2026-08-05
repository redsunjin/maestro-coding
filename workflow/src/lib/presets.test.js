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

describe('email 프리셋 (채널 에이전트 구상)', () => {
  it('email-reply는 수신자 라벨과 제목 디테일을 만든다', () => {
    expect(formatPresetHighlight('email-reply', { to: 'client@corp.com', subject: '견적 회신', draft: '안녕하세요...' }))
      .toEqual({ label: '↩ client@corp.com', detail: '견적 회신' });
  });

  it('email-reply는 제목이 없으면 초안 앞부분을 디테일로 쓴다', () => {
    const highlight = formatPresetHighlight('email-reply', { to: 'a@b.c', draft: '긴 초안 본문입니다. 뒷부분은 잘립니다.' });
    expect(highlight.label).toBe('↩ a@b.c');
    expect(highlight.detail.startsWith('긴 초안 본문')).toBe(true);
  });

  it('email-triage는 발신자 라벨과 처리방침 디테일을 만든다', () => {
    expect(formatPresetHighlight('email-triage', { from: 'boss@corp.com', subject: '계약 검토', proposedAction: '법무 전달 후 회신' }))
      .toEqual({ label: '✉ boss@corp.com', detail: '법무 전달 후 회신' });
  });

  it('필수 필드가 없으면 null (프리셋 미적용)', () => {
    expect(formatPresetHighlight('email-reply', { subject: 'x' })).toBeNull();
    expect(formatPresetHighlight('email-triage', { subject: 'x' })).toBeNull();
  });
});
