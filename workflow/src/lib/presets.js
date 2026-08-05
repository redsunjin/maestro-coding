// 프리셋(spend/publish)은 표시 포맷일 뿐이다 — 서버는 유형을 모른다 (스펙 §2).
export function formatPresetHighlight(subjectType, payload = {}) {
  if (subjectType === 'spend') {
    const amount = Number(payload.amount);
    if (!Number.isFinite(amount)) return null;
    const currency = typeof payload.currency === 'string' ? payload.currency.toUpperCase() : '';
    return {
      label: `${currency} ${amount}`.trim(),
      detail: payload.purpose ? String(payload.purpose) : '',
    };
  }
  if (subjectType === 'publish') {
    if (!payload.target) return null;
    return {
      label: `→ ${payload.target}`,
      detail: payload.contentSummary ? String(payload.contentSummary) : '',
    };
  }
  // 이메일 채널 프리셋 (스펙 2026-08-04 §1) — 역시 표시 전용
  if (subjectType === 'email-reply') {
    if (!payload.to) return null;
    const draftSnippet = payload.draft ? String(payload.draft).slice(0, 80) : '';
    return {
      label: `↩ ${payload.to}`,
      detail: payload.subject ? String(payload.subject) : draftSnippet,
    };
  }
  if (subjectType === 'email-triage') {
    if (!payload.from) return null;
    return {
      label: `✉ ${payload.from}`,
      detail: payload.proposedAction
        ? String(payload.proposedAction)
        : payload.subject
          ? String(payload.subject)
          : '',
    };
  }
  return null;
}
