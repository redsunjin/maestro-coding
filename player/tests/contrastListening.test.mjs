// A/B 대조 게이트 (스펙 2026-08-04 대조 §2): 개발 흐름의 질 차이가 음악 지표 차이로 번역되는지 고정한다.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildContrastCleanFlowFixture,
  buildContrastRoughFlowFixture,
  buildGoldenListeningPackEntries,
} from '../src/lib/goldenListeningPack.js';
import { buildMusicPlan } from '../src/lib/musicIntentMapper.js';

function buildSessions() {
  const clean = buildMusicPlan(buildContrastCleanFlowFixture(), { laneCount: 4 })[0];
  const rough = buildMusicPlan(buildContrastRoughFlowFixture(), { laneCount: 4 })[0];
  return { clean, rough };
}

test('대조 쌍은 같은 tonic으로 통제되고 선법이 명확히 갈린다 (ionian vs phrygian)', () => {
  const { clean, rough } = buildSessions();

  assert.equal(clean.harmony.tonic, rough.harmony.tonic, '같은 repo+PR이면 tonic이 같아야 함');
  assert.equal(clean.harmony.mode, 'ionian');
  assert.equal(rough.harmony.mode, 'phrygian');
  assert.equal(rough.harmony.chordColor, 'sus4'); // revert 지배 → 긴장 코드
});

test('거친 이력은 평균 긴장이 높고, 모범 흐름은 해소가 높다', () => {
  const { clean, rough } = buildSessions();

  assert.ok(
    rough.tensionScore >= clean.tensionScore + 0.15,
    `tension 대조 부족: rough ${rough.tensionScore.toFixed(3)} vs clean ${clean.tensionScore.toFixed(3)}`,
  );
  assert.ok(
    clean.resolutionScore >= rough.resolutionScore + 0.1,
    `resolution 대조 부족: clean ${clean.resolutionScore.toFixed(3)} vs rough ${rough.resolutionScore.toFixed(3)}`,
  );
});

test('모범 흐름의 해소 정점은 merge이고 거친 이력에는 merge가 없다', () => {
  const entries = buildGoldenListeningPackEntries();
  const cleanEntry = entries.find((entry) => entry.id === 'contrast-clean-flow');
  const roughEntry = entries.find((entry) => entry.id === 'contrast-rough-flow');

  assert.ok(cleanEntry && roughEntry, '대조 엔트리가 골든 팩에 편입되어야 함');
  assert.equal(cleanEntry.peakResolutionEvent.eventType, 'merge');
  assert.notEqual(roughEntry.peakResolutionEvent?.eventType, 'merge');
  assert.equal(roughEntry.peakTensionEvent.eventType, 'review-request-changes');
});
