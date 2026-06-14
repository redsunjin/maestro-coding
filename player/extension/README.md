# Maestro Player Extension Scaffold

현재 스캐폴드 범위:

- Manifest V3
- popup에서 현재 탭 GitHub/GitLab 저장소 URL 감지
- public repo URL 수동 입력
- background service worker를 통한 player page handoff
- 마지막 launch session을 `chrome.storage.local`에 저장

로드 방법:

1. Chrome `Extensions`
2. `Developer mode` 켜기
3. `Load unpacked`
4. `/Users/Agent/ps-workspace/maestro/.worktrees/maestro-player/player/extension` 선택

현재 제외:

- 기존 React run shell 마운트
- autoplay preview
- connected account token UI
- side panel
- local repo bridge

다음 단계:

1. `player.html`에 기존 `player/src` React shell을 마운트한다.
2. 저장된 repo seed를 public replay loader 초기값으로 주입한다.
3. golden listening demo와 autoplay preview를 extension flow에 연결한다.
