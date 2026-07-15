# Maestro Known Issues

기준일: 2026-02-27

## KI-001: `function bach` 주파수(Hz) 표시가 일부 환경에서 미노출

- 상태: Resolved (2026-07-14)
- 우선순위: P2
- 최초 보고: 2026-02-27
- 현상:
  - `function bach` 재생 버튼을 눌러도 헤더의 `~xxxHz` 표시가 보이지 않는 환경이 있음.
  - 동일 빌드/테스트 환경에서는 재현되지 않음(UI/E2E 통과).
- 영향 범위:
  - 기능 사용성(재생 상태 가시성) 저하
  - 핵심 승인/반려 플로우에는 영향 없음
- 현재 가설:
  1. 실제 실행 브라우저에서 YouTube 재생 상태 이벤트(`PLAYING`) 지연/미수신
  2. 뷰포트/줌/브라우저 UI 확장 영향으로 헤더 내부 요소 렌더링 충돌
  3. 브라우저 자동재생 정책 차이로 재생 요청 상태와 실제 상태 불일치
- 확인된 사실:
  - 자동 테스트에서는 `function-bach-hz` 요소 노출 검증 통과
  - 로컬 수동 테스트 보고와 자동 테스트 결과 간 불일치 존재
- 2026-03-12 완화 조치:
  - `Hz` 슬롯을 항상 렌더링해 `standby`/`~xxxHz`로 상태를 고정 노출
  - `function bach` 상태 칩(`booting/ready/queued/playing/paused/error`)과 raw player state title을 추가
  - 헤더/미니플레이어를 `flex-wrap` 가능하게 조정해 줌/좁은 뷰포트에서 칩이 덜 가려지도록 보강
- 다음 조사 계획:
  1. 런타임 디버그 오버레이(재생요청/PLAYING/CUED/state code) 일시 추가
  2. 사용자 환경 브라우저/OS/줌 비율/해상도 수집
  3. 문제 재현 세션에서 DOM 스냅샷 + computed style 확인
  4. 재현 조건 확정 후 패치 및 회귀 테스트 케이스 추가
- 2026-07-14 근본 원인 및 해결:
  - 근본 원인: `bachHzLabel`이 `isBachPlaybackRequested`(재생 의도)에 결합돼 있는데, `onStateChange`의 `PAUSED`/`ENDED` 분기가 involuntary `PAUSED`(자동재생 차단 시 YouTube가 `PLAYING` 대신 방출)에서도 해당 플래그를 리셋함. 그 결과 재생 요청 직후 `bachVizHz`가 0으로 초기화되어 라벨이 `standby`로 되돌아감.
  - 테스트가 재현하지 못한 이유: mock 플레이어의 `loadVideoById`/`loadPlaylist`가 동기적으로 `PLAYING`을 강제 방출해 자동재생 차단 경로를 타지 않았음.
  - 조치: `onStateChange`에서 involuntary `PAUSED`/`CUED`는 `isBachPlaying`만 내리고 `isBachPlaybackRequested`(재생 의도)는 유지하도록 분리. 사용자 명시적 일시정지는 `pauseBach()`가 계속 의도 플래그를 정리함. `ENDED`는 실제 재생 종료이므로 둘 다 해제.
  - 회귀 테스트: `src/App.function-bach.ui.test.jsx` — 자동재생 차단(재생 요청 후 `PAUSED`) 시에도 Hz가 `~xxxHz`로 유지되는지 검증하는 케이스 추가.
