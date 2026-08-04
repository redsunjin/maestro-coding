# Maestro Player Goal Roadmap

기준일: 2026-08-04 (최초 2026-07-10)  
상태: **G1 자동 증거 확보 — 툴바 팝업 현재 탭 감지 수동 확인 1건 대기**  
기준 브랜치: `main` (PR #42로 파운데이션 편입 완료, QA Gate `player-app` 잡 포함)  
G1 증거: [`evidence/2026-08-04-g1-chromium-runtime.md`](evidence/2026-08-04-g1-chromium-runtime.md)

## 1. 이 문서의 역할

이 문서는 Maestro Player의 **현재 실행 기준**이다. 다음 세션은 이 문서의 `현재 Goal`만 시작점으로 삼는다.

- 제품 개념과 엔티티 계약: [MVP Spec](./mvp-spec.md)
- MV3 구조와 범위 결정: [Chrome Extension Strategy](./chrome-extension-strategy.md)
- 회귀/수동 검증 절차: [Test Plan](./test-plan.md)
- 과거 생성 순서: [Bootstrap Plan](./bootstrap-plan.md)

과거 계획 문서가 현재 Goal과 충돌하면 이 문서의 범위·완료 조건이 우선한다. 완료되지 않은 항목을 완료로 표현하지 않는다.

## 2. 현재 제품 경계

### 지금 검증하는 핵심 흐름

`공개 GitHub/GitLab 저장소 탭 또는 URL → read-only replay 생성 → chart → autoplay/manual play`

- popup은 현재 탭 URL을 감지하거나 공개 URL을 받는다.
- background는 launch session만 `chrome.storage.local`에 저장하고 dedicated `player.html`을 연다.
- player page는 저장된 URL/branch를 public replay loader에 주입한다.
- golden demo는 forge 요청 없이 고정 fixture를 autoplay한다.

### 현재 제외

- 확장 프로그램의 Local Repo Mode와 desktop/server Git bridge
- 확장 프로그램의 Connected Account/token/OAuth
- side panel, Web Store 공개, 원격 score sync
- Git write 명령 (`merge`, `push`, `reset` 등)

브라우저 셸의 local/account 기능은 기존 구현 자산이지만, 현재 extension Goal의 완료 조건에는 포함하지 않는다.

## 3. Goal lifecycle 규칙

각 Goal은 하나의 사용자 흐름 또는 하나의 검증 위험만 다룬다.

1. Goal 시작 전: 이 문서에서 `NEXT`인 Goal과 선행 Goal의 evidence를 확인한다.
2. 구현 중: `player/`, `docs/maestro-player/` 외의 변경은 만들지 않는다.
3. 완료 전: Goal에 적힌 자동 검증과 수동 evidence를 모두 남긴다.
4. 완료 후: 이 문서의 상태를 `DONE`으로 바꾸고, 다음 Goal 하나만 `NEXT`로 전환한다.

`npm run qa` 또는 `npm run build:extension`만으로 실제 Chrome runtime proof를 대체할 수 없다. 반대로 수동 화면 확인만으로 회귀 테스트를 대체할 수도 없다.

## 4. Goal ledger

| Goal | 상태 | 목적 | 예상 작업량 | 선행 조건 |
| --- | --- | --- | --- | --- |
| G0 | DONE | 코드·문서 기준선과 extension bundle 정리 | 완료 | 없음 |
| G1 | NEXT | 실제 Chrome에서 public launch와 golden autoplay가 끝까지 동작하는지 증명 | 0.5–1일 | G0 |
| G2 | BLOCKED BY G1 | public replay failure UX와 반복 사용성을 베타 수준으로 보강 | 2–3일 | G1 evidence |
| G3 | BLOCKED BY G2 | private distribution 또는 Web Store 제출 준비 | 2–5일 + 심사 | G2 evidence |
| G4 | DEFERRED | Connected Account/token 또는 OAuth를 별도 trust boundary로 도입 | 별도 결정 | G3 또는 제품 결정 |

### G0 — Code and document baseline

상태: **DONE**

완료된 범위:

- MV3 popup/background/player handoff와 React player mount
- public-only extension surface, stored launch auto-load, compact golden autoplay entry
- `npm run qa`, `npm run build:extension` 통과

증거:

- `2cea287 Simplify Maestro Player extension launch flow`
- `faa12b5 Mount Maestro Player shell in extension build`

미포함 증거:

- 실제 Chrome unpacked load 및 forge runtime은 아직 이 Goal에서 주장하지 않는다.

### G1 — Unpacked Chrome runtime proof

상태: **NEXT — 자동 증거 확보 (2026-08-04), 완료 조건 4(툴바 팝업 현재 탭 감지)만 수동 확인 대기**

확보된 증거([상세](evidence/2026-08-04-g1-chromium-runtime.md), Chromium 145 + Playwright unpacked 로드):

- 조건 1·2: `npm run qa`(74+24+8), `npm run build:extension` 통과
- 조건 3: Chromium 145 unpacked 로드 (브랜드 Chrome 137+는 CLI `--load-extension` 제거 — 수동 확인은 chrome://extensions 개발자 모드 경로 사용)
- 조건 4 일부: GitHub 공개 URL → popup → player 리플레이 로드 성공 (커밋 8·머지 4·노트 20). 툴바 팝업의 현재 탭 감지만 수동 대기
- 조건 5: GitLab 공개 URL(gitlab-org/gitlab-foss) 리플레이 로드 성공 (커밋 12)
- 조건 6: golden demo 자동 프리뷰 완주 — 퍼펙트 15/점수 1540/정확도 100%, forge 요청 0건
- 조건 7: console/SW 오류 0건

검증 질문:

> MV3 extension이 실제 Chrome에서 public GitHub/GitLab 흐름과 offline golden autoplay를 read-only로 실행할 수 있는가?

허용 범위:

- `player/extension/`, extension bootstrap, public replay UX의 결함 수정
- Chrome runtime 오류·권한·CSP·storage handoff 대응
- G1 evidence와 관련 문서 업데이트

명시적 비범위:

- account token/OAuth, Local Repo bridge, side panel, Web Store 제출

완료 조건:

1. `cd player && npm run qa` 통과
2. `cd player && npm run build:extension` 통과
3. Chrome에서 `player/dist-extension/`을 unpacked로 load
4. GitHub public repo 현재 탭에서 popup → `Play This Repo` → player tab auto-load 확인
5. GitLab public URL 수동 입력 → replay load 또는 명확한 recoverable error 확인
6. golden demo 버튼 → autoplay 시작 확인 (forge 요청 없이)
7. console error, extension service-worker error, permission/CSP failure를 기록하고 해결 또는 명시적 blocker로 남김

완료 evidence:

- 실행한 Chrome 버전, 대상 URL(민감 정보 제외), 날짜
- 각 흐름의 결과와 스크린샷 또는 짧은 화면 기록
- 자동 검증 출력 요약
- unresolved blocker가 있으면 재현 절차와 다음 최소 수정

첫 명령:

```bash
cd /Users/Agent/ps-workspace/maestro/.worktrees/maestro-player/player
npm run qa
npm run build:extension
```

### G2 — Public replay beta hardening

상태: **BLOCKED BY G1**

목적:

- public replay를 한 번의 데모가 아니라 반복해서 쓸 수 있는 흐름으로 만든다.

범위:

- GitHub/GitLab API 오류, rate-limit, empty history, unsupported URL의 이해 가능한 오류/재시도 UX
- launch session과 score history의 extension-storage 정책 결정 및 검증
- 최소 2개 public repository에서 수동 replay regression
- golden listening set 청취 rubric 재확인

완료 조건:

- G1 evidence가 clean 또는 해결 가능한 이슈 목록으로 고정됨
- failure state별 UI test와 수동 재현이 존재함
- read-only guard와 `npm run qa`, `npm run build:extension` 통과

### G3 — Distribution readiness

상태: **BLOCKED BY G2**

범위:

- extension icon, versioning, privacy/permission 설명, release checklist
- private distribution 또는 Chrome Web Store submission packet
- clean-profile install/update/uninstall smoke

비범위:

- OAuth, social/account platform, local Git access

완료 조건:

- 배포 대상별 패키지와 사람 검토 항목이 분리되어 있음
- 권한·네트워크 사용·read-only 경계가 사용자 문구와 실제 manifest에 일치함

### G4 — Trusted account sources (product decision required)

상태: **DEFERRED**

이 Goal은 public MVP 성공 뒤에만 시작한다. 토큰 저장 정책, OAuth provider 등록, 개인정보/권한 문구, private repository 접근은 별도 trust boundary이므로 G1–G3에 섞지 않는다.

## 5. 현재 다음 행동

현재 할 일은 **G1만**이다. 코드를 넓히기 전에 unpacked extension을 실제 Chrome에 올려 세 가지 흐름(현재 GitHub 탭, GitLab URL, golden autoplay)을 증명한다.
