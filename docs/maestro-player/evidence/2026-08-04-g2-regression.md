# G2 리그레션 기록 — 정보 다이어트 빌드 (2026-08-04)

하니스: G1과 동일 (Playwright + Chromium 145 unpacked, `--load-extension`).
대상 빌드: 덱 탭 + 정보 다이어트 + 오류 분류 반영본.

| 흐름 | 결과 |
| --- | --- |
| GitLab 공개 URL(gitlab-org/gitlab-foss) → player | ✅ 로드 + 플레이 탭 자동 전환 (109 BPM 수동 플레이 준비) |
| golden demo 자동 재생 | ✅ 런 진행 중 (112 BPM), forge 요청 0건 |
| GitHub 공개 URL(redsunjin/maestro-coding) → player | ✅ launch 핸드오프 정상 (로드 검증은 2026-08-04 G1 증거와 vitest 하니스 픽스처로 커버) |
| 콘솔/SW 오류 | ✅ 0건 |

수동 잔여: 툴바 팝업 현재 탭 감지(G1), 골든 청취 rubric 재확인(사용자 청취).
