import { useCallback, useRef, useState } from 'react';
import { toHttpUrl } from '../utils/server-address.js';

// 승인 전 리뷰 데이터(HTTP 지연 로드)를 관리한다. requestId가 없으면(Mock 노트) 즉시 폴백.
export default function useMergeReview({ wsUrl }) {
  const [review, setReview] = useState(null);
  const [isReviewLoading, setIsReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState(null);
  const activeRequestIdRef = useRef(null);

  const clearReview = useCallback(() => {
    activeRequestIdRef.current = null;
    setReview(null);
    setIsReviewLoading(false);
    setReviewError(null);
  }, []);

  const loadReview = useCallback(async (requestId) => {
    if (!requestId) {
      clearReview();
      return;
    }

    const apiUrl = toHttpUrl(wsUrl, `/api/requests/${encodeURIComponent(requestId)}/review`);
    if (!apiUrl) {
      setReview(null);
      setReviewError('서버 주소를 해석할 수 없습니다.');
      return;
    }

    activeRequestIdRef.current = requestId;
    setIsReviewLoading(true);
    setReviewError(null);
    setReview(null);

    try {
      const response = await fetch(apiUrl);
      if (activeRequestIdRef.current !== requestId) return;
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setReviewError(body?.error || `HTTP ${response.status}`);
        return;
      }
      const data = await response.json();
      if (activeRequestIdRef.current !== requestId) return;
      setReview(data);
    } catch (error) {
      if (activeRequestIdRef.current !== requestId) return;
      setReviewError(error?.message || 'REVIEW_FETCH_FAILED');
    } finally {
      if (activeRequestIdRef.current === requestId) {
        setIsReviewLoading(false);
      }
    }
  }, [clearReview, wsUrl]);

  return { review, isReviewLoading, reviewError, loadReview, clearReview };
}
