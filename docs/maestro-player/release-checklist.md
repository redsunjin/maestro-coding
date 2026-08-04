# Maestro Player 확장 릴리스 체크리스트 (G3)

스펙: [`../superpowers/specs/2026-08-04-player-g3-distribution-design.md`](../superpowers/specs/2026-08-04-player-g3-distribution-design.md)

## 1. 릴리스 게이트 (모든 배포 공통)

- [ ] `cd player && npm run qa` 전체 통과
- [ ] `npm run package:extension` — `player/output/maestro-player-extension-v<버전>.zip` 생성
- [ ] 버전 범프 시 `player/package.json`과 `player/extension/manifest.json` **둘 다** 갱신
      (`tests/extensionManifest.test.mjs`가 불일치를 잡는다)
- [ ] clean-profile smoke: 새 Chrome 프로필에서 unpacked 설치 → ① GitHub 탭 팝업 감지
      → ② GitLab URL 수동 로드 → ③ golden 자동 재생 → 제거까지 확인
- [ ] 잔여 수동 게이트: G1 툴바 팝업 현재 탭 감지 확인, 골든 청취 rubric 재확인

## 2. 권한 justification (manifest와 1:1 — 문구 수정 시 manifest도 검토)

| 권한 | 사용 이유 |
| --- | --- |
| `tabs` | 팝업이 현재 탭의 공개 저장소 URL을 감지(읽기 전용) |
| `storage` | 마지막 launch 세션 1건 + 점수 기록(모두 로컬, 외부 전송 없음) |
| `https://github.com/*`, `https://api.github.com/*` | 공개 커밋/PR 이력 read-only 조회 |
| `https://gitlab.com/*` | 공개 커밋/MR 이력 read-only 조회 |

## 3. 개인정보 문구 (스토어 Privacy 탭 초안)

> Maestro Player는 사용자 데이터를 수집·전송하지 않습니다. 모든 저장(마지막
> 실행 세션, 점수 기록)은 브라우저 로컬 스토리지에만 남습니다. 네트워크
> 요청은 사용자가 지정한 공개 GitHub/GitLab 저장소의 이력을 읽기 전용으로
> 조회하는 것이 전부이며, Git 쓰기 작업은 수행하지 않습니다.

## 4. Chrome Web Store 리스팅 초안

- **이름**: Maestro Player
- **요약(132자 이내)**
  - ko: `공개 GitHub/GitLab 저장소의 커밋·PR 이력을 리듬 차트로 재생하는 read-only 플레이어.`
  - en: `Replay public GitHub/GitLab history as a playable rhythm chart. Read-only, no account needed.`
- **상세 설명**: 저장소 URL 입력 또는 현재 탭 감지 → 커밋/PR 이력을 결정적
  모티프의 리듬 차트로 변환 → 수동 플레이(A/S/D/F) 또는 자동 프리뷰.
  골든 데모 팩은 네트워크 없이 동작. 점수는 로컬에만 저장.
- **스크린샷(1280×800) 목록**: ① 소스 탭(덱 셀렉터), ② 런 세션 플레이 중,
  ③ 세션 상태, ④ 기록 탭.
- **카테고리**: Developer Tools / **언어**: 한국어, English

## 5. 제출 절차

1. CWS 개발자 등록(구글 계정, $5 1회) — [보유한 Play 개발자 계정의 구글
   계정으로 등록 가능]
2. 대시보드 → 새 항목 → `output/maestro-player-extension-v<버전>.zip` 업로드
3. 리스팅 문구(§4)·권한 설명(§2)·개인정보 문구(§3) 입력, 스크린샷 첨부
4. 공개 범위 선택(비공개/일부 공개/공개) 후 심사 제출 (통상 수일)

## 부록: 사설 배포 (심사 없이 즉시)

- zip을 전달받은 사용자가 압축 해제 → `chrome://extensions` → 개발자 모드 →
  "압축해제된 확장 프로그램 로드"로 폴더 선택. (crx 사설 서명 배포는 엔터프라이즈
  정책 필요 — 범위 외)
