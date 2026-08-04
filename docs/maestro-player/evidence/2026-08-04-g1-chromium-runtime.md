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
| A-1. 실제 툴바 팝업의 현재 탭 감지 | ⏳ **수동 확인 대기** — `chrome.action.openPopup()`은 오류 없이 resolve됐으나(팝업 표시 추정) Playwright가 팝업 페이지를 계측하지 못해 감지 문구를 자동 단언하지 못함 | 아래 수동 절차 |

## 남은 수동 확인 (1건, 약 30초)

1. Chrome `chrome://extensions` → 개발자 모드 → "압축해제된 확장 프로그램 로드" → `player/dist-extension` 선택
2. 공개 GitHub 저장소 탭(예: github.com/redsunjin/maestro-coding)에서 툴바의 Maestro Player 아이콘 클릭
3. 팝업에 "감지된 저장소" 문구와 URL 프리필이 뜨는지 확인 → `이 저장소 재생` 클릭 → player 탭 자동 로드 확인

이 확인이 끝나면 roadmap의 G1을 DONE으로, G2를 NEXT로 전환한다.

## 재현

```bash
cd player && npm run qa && npm run build:extension
# Playwright 하니스: launchPersistentContext(profileDir, { headless:false,
#   args: ['--disable-extensions-except=<dist-extension>', '--load-extension=<dist-extension>'] })
```
