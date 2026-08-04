# Maestro Player Extension Scaffold

현재 실행 Goal과 완료 evidence는 [Goal Roadmap](../../docs/maestro-player/goal-roadmap.md)의 `G1 — Unpacked Chrome runtime proof`를 따른다.

현재 스캐폴드 범위:

- Manifest V3
- popup에서 현재 탭 GitHub/GitLab 저장소 URL 감지
- public repo URL 수동 입력
- background service worker를 통한 player page handoff
- 마지막 launch session을 `chrome.storage.local`에 저장
- extension player page에서 기존 React player shell 마운트
- 저장된 public repo seed 자동 주입 및 자동 로드
- extension 화면에서는 public URL launcher와 golden autoplay demo만 노출

로드 방법:

1. `player/`에서 `npm run build:extension`
2. Chrome `Extensions`
3. `Developer mode` 켜기
4. `Load unpacked`
5. `/Users/Agent/ps-workspace/maestro/.worktrees/maestro-player/player/dist-extension` 선택

빌드 스크립트는 `dist-extension/`를 매번 깨끗하게 지운 뒤 다시 생성한다.

소스 폴더:

- `player/extension/` 는 익스텐션 소스다.
- 실제 unpacked load 대상은 빌드 결과물 `player/dist-extension/` 이다.

현재 제외:

- connected account token UI
- side panel
- local repo bridge

다음 단계:

1. `dist-extension/`을 실제 Chrome에 unpacked로 load한다.
2. 현재 GitHub 탭, GitLab URL, golden autoplay 세 흐름의 runtime evidence를 남긴다.
3. public flow가 안정화된 뒤에만 token 기반 connected account mode를 별도 Goal로 검토한다.
