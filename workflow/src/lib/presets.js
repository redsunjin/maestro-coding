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
  return null;
}
