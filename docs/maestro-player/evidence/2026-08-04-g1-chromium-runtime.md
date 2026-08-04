# G1 런타임 증명 — Chromium 145 unpacked 확장 (2026-08-04)

자동화 하니스: Playwright `launchPersistentContext` + `--load-extension=player/dist-extension`
(헤드풀). 스크립트는 세션 스크래치에서 실행했고 결과 JSON과 스크린샷을 이 디렉토리에 보존한다.

- 브라우저: Chromium 145.0.0.0 (Playwright 번들, macOS)
  - **주의**: 브랜드 Chrome 137+는 CLI `--load-extension`을 제거해 자동화는 Chromium으로
    수행했다. 브랜드 Chrome에서는 `chrome://extensions` 개발자 모드의 "압축해제된 확장
    프로그램 로드"가 여전히 동작하므로 수동 확인 경로는 유효하다.
- 확장 ID(로컬): doeppfcmkfinakicdaldhigimaemcoak
- 사전 게이트: `npm run qa`(74+24+8 통과), `npm run build:extension` 통과 (2026-08-04, PR #42 CI 포함)

## 흐름별 결과

| 흐름 | 결과 | 증거 |
| --- | --- | --- |
| A-2. GitHub 공개 URL → popup → player 자동 로드 | ✅ 로드 성공 — redsunjin/maestro-coding, 이벤트 12·커밋 8·머지 4, 차트 노트 20, 111 BPM | [`A2-player-github.png`](A2-player-github.png) |
| B. GitLab 공개 URL 수동 입력 | ✅ 로드 성공 — gitlab-org/gitlab-foss, git-public-url 모드, 이벤트 12·커밋 12 | [`B1-player-gitlab.png`](B1-player-gitlab.png) |
| C. golden demo 자동 재생 (forge 요청 0건) | ✅ 자동 프리뷰 완주 — 진행 15/17박(88% 시점 캡처), 퍼펙트 15, 점수 1540, 정확도 100%, github/gitlab 네트워크 요청 0건 | [`C1-golden-autoplay.png`](C1-golden-autoplay.png) |
| 콘솔/SW 오류 | ✅ 0건 (전체 흐름 동안 console error 미발생) | results.json |
| A-1. 실제 툴바 팝업의 현재 탭 감지 | ✅ **완결 (2026-08-04 후속 런)** — 원시 CDP(remote-debugging-port)로 실제 팝업에 attach. 감지 문구 "현재 탭에서 감지됨: redsunjin/maestro-coding (github)", URL 프리필 확인, `이 저장소 재생` 클릭 → player 탭 자동 오픈+리플레이 로드(111 BPM) | [`A1-real-popup.png`](A1-real-popup.png), [`A1-player-from-real-popup.png`](A1-player-from-real-popup.png), [`2026-08-04-g1-popup-results.json`](2026-08-04-g1-popup-results.json) |

## 수동 확인

없음 — 전 조건 자동 증거 확보 (팝업 계측은 Playwright 미지원이라 원시 CDP로 수행).
비고: openPopup은 창 활성화 상태를 요구해 재시도 루프(최대 5회)로 안정화했다.

## 재현

```bash
cd player && npm run qa && npm run build:extension
# Playwright 하니스: launchPersistentContext(profileDir, { headless:false,
#   args: ['--disable-extensions-except=<dist-extension>', '--load-extension=<dist-extension>'] })
```
