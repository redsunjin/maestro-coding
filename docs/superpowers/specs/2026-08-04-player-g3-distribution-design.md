# Maestro Player G3 — 배포 준비 설계 (Chrome Web Store 제출 패킷)

- 날짜: 2026-08-04
- 상태: 확정 (사용자: 스토어 개발자 권한 보유 — 정식 제출 기준으로 준비)
- 범위: `player/` + `docs/maestro-player/` 하위만

## 0. 목표

로드맵 G3: unpacked 개발 배포를 넘어 Chrome Web Store 제출이 가능한
패킷(아이콘·버전·문구·패키징·체크리스트)을 만든다. 실제 제출은 사용자가
CWS 개발자 등록(구글 계정, $5 1회) 후 수행한다.

## 1. 아이콘

- 기존 `player/public/favicon.svg`(시안-보라 그라디언트 모티프)를 16/32/48/128
  PNG로 래스터화해 `player/extension/icons/`에 추가.
- manifest `icons` + `action.default_icon`에 연결.
- 래스터화는 Playwright(Chromium) 스크립트로 수행 — 산출 PNG는 커밋한다
  (빌드 시 재생성하지 않음, 재생성 스크립트는 `player/scripts/`에 보관).

## 2. 버저닝

- manifest `version`과 `player/package.json` version을 단일 소스로 동기
  (테스트로 고정). 릴리스 시 둘 다 올리는 절차를 체크리스트에 명시.

## 3. 패키징

- `npm run package:extension`: `build:extension` 후 `player/dist-extension/`을
  `player/output/maestro-player-extension-v<version>.zip`으로 압축
  (`player/output/`은 이미 gitignore). Node 스크립트(`scripts/packageExtension.mjs`),
  macOS `zip` CLI 사용.

## 4. 제출 문구 (docs/maestro-player/release-checklist.md)

- 스토어 리스팅 초안(ko/en): 이름, 요약(132자 이내), 상세 설명.
- **권한 justification** (manifest와 1:1 일치):
  - `tabs`: 현재 탭의 공개 저장소 URL 감지(읽기만).
  - `storage`: 마지막 launch 세션 1건 + 점수 기록(로컬 전용).
  - host `github.com/api.github.com/gitlab.com`: 공개 커밋/PR 이력 read-only 조회.
- **개인정보 문구**: 수집·전송 데이터 없음, 모든 저장은 로컬, 외부 요청은
  공개 forge API read-only 호출뿐.
- 제출 절차 체크리스트: CWS 등록 → 패킷 zip 업로드 → 스크린샷(덱 탭/런/골든)
  → 심사 대기. 사설 배포(zip 직접 설치) 절차도 부록으로.
- clean-profile smoke 절차(설치→3흐름→제거)와 잔여 수동 항목(G1 팝업, 골든
  rubric)을 릴리스 게이트로 명시.

## 5. 테스트

- `tests/extensionManifest.test.mjs`(신규): manifest version == package.json
  version, icons 4종 파일 존재+manifest 참조 일치, permissions가 문서화된
  집합(tabs/storage + 3개 host)과 정확히 일치(과잉 권한 방지).

## 6. 비범위

- 실제 CWS 제출/심사 대응(사용자), OAuth/계정 기능, iOS TestFlight(별도 트랙).
