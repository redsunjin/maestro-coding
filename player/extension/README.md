# Maestro Player Extension Scaffold

현재 스캐폴드 범위:

- Manifest V3
- popup에서 현재 탭 GitHub/GitLab 저장소 URL 감지
- public repo URL 수동 입력
- background service worker를 통한 player page handoff
- 마지막 launch session을 `chrome.storage.local`에 저장
- extension player page에서 기존 React player shell 마운트
- 저장된 public repo seed 자동 주입 및 자동 로드

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

1. extension 안에서 `Public Repo URL` 중심 UI를 더 단순하게 줄인다.
2. golden listening demo와 autoplay preview 진입을 extension flow에 더 직접 연결한다.
3. public flow가 안정화되면 token 기반 connected account mode를 extension에 노출한다.
