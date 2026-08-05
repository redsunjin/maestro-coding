// 음악 이론 정량 하니스 (스펙 2026-08-04 §1): 픽스처마다 스케일 적합·그리드·밀도·도약을 게이트한다.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createChartFromMusicPlan } from '../src/lib/chartMapper.js';
import { buildMusicPlan } from '../src/lib/musicIntentMapper.js';
import { createReplayCuePlan } from '../src/lib/replayAudioEngine.js';
import {
  beatGridConformance,
  chartMaxNotesPerBeat,
  leapStats,
  scaleConformance,
  snapToScale,
} from '../src/lib/musicTheory.js';
import {
  buildGoldenListeningPackEntries,
  buildTransitionValidationFixture,
} from '../src/lib/goldenListeningPack.js';

function renderFixture(events) {
  const plan = buildMusicPlan(events, { laneCount: 4 });
  const chart = createChartFromMusicPlan(plan, { laneCount: 4, maxNotesPerBeat: 2 });
  const cuePlan = createReplayCuePlan(chart.notes, { laneCount: 4 });
  return { plan, chart, cuePlan };
}

function collectFixtures() {
  const fixtures = buildGoldenListeningPackEntries().map((entry) => ({
    label: entry.label,
    events: entry.events,
  }));
  fixtures.push({ label: 'transition-validation', events: buildTransitionValidationFixture() });
  return fixtures;
}

test('snapToScale은 항상 선법 스케일 내 피치 클래스를 돌려준다', () => {
  for (const mode of ['ionian', 'dorian', 'phrygian', 'minor-pentatonic']) {
    for (let offset = -14; offset <= 14; offset += 1) {
      const snapped = snapToScale(offset, mode);
      const pitchClass = ((snapped % 12) + 12) % 12;
      const scale = {
        ionian: [0, 2, 4, 5, 7, 9, 11],
        dorian: [0, 2, 3, 5, 7, 9, 10],
        phrygian: [0, 1, 3, 5, 7, 8, 10],
        'minor-pentatonic': [0, 3, 5, 7, 10],
      }[mode];
      assert.ok(scale.includes(pitchClass), `${mode} offset ${offset} → ${snapped}`);
    }
  }
});

test('모든 픽스처: 박 그리드 정합 100% + 밀도 상한 2/박', () => {
  for (const fixture of collectFixtures()) {
    const { chart } = renderFixture(fixture.events);
    const grid = beatGridConformance(chart, 0.25);
    assert.equal(grid.ratio, 1, `${fixture.label} 그리드 위반: ${grid.offenders.join(',')}`);
    assert.ok(chartMaxNotesPerBeat(chart) <= 2, `${fixture.label} 밀도 초과`);
  }
});

test('모든 픽스처: 발음 큐의 선법 스케일 적합률 ≥ 95%', () => {
  for (const fixture of collectFixtures()) {
    const { plan, cuePlan } = renderFixture(fixture.events);
    const conformance = scaleConformance(cuePlan, plan[0].harmony);
    assert.ok(
      conformance.ratio >= 0.95,
      `${fixture.label}: ${plan[0].harmony.key} 적합률 ${(conformance.ratio * 100).toFixed(1)}% (${conformance.conformant}/${conformance.total})`,
    );
  }
});

test('모든 픽스처: 리드 큐 도약의 옥타브 초과 비율 ≤ 40%', () => {
  for (const fixture of collectFixtures()) {
    const { cuePlan } = renderFixture(fixture.events);
    const stats = leapStats(cuePlan);
    assert.ok(
      stats.overOctaveRatio <= 0.4,
      `${fixture.label}: 옥타브 초과 도약 ${(stats.overOctaveRatio * 100).toFixed(1)}% (max ${stats.maxLeapSemitones})`,
    );
  }
});

test('buildChordOffsets는 선법에 맞게 구성음을 스냅한다', async () => {
  const { buildChordOffsets } = await import('../src/lib/musicTheory.js');
  assert.deepEqual(buildChordOffsets('triad', 'dorian'), [0, 3, 7]); // 단3도 자동 조정
  assert.deepEqual(buildChordOffsets('triad', 'ionian'), [0, 4, 7]);
  assert.deepEqual(buildChordOffsets('maj7', 'dorian'), [0, 3, 7, 10]); // 11→10 스냅
  assert.deepEqual(buildChordOffsets('add9', 'dorian'), [0, 3, 7, 14]); // 9th(pc2)는 dorian 내
});

test('accent 노트는 chordMidis(베이스 최저음 포함)를 갖고 tap 노트는 단선율을 유지한다', () => {
  let accentTotal = 0;
  for (const fixture of collectFixtures()) {
    const { plan, chart } = renderFixture(fixture.events);
    const harmony = plan[0].harmony;
    const accents = chart.notes.filter((note) => note.noteType === 'accent');
    const taps = chart.notes.filter((note) => note.noteType === 'tap');
    // 종지 없는 픽스처(예: 거친 이력 대조 B)는 accent가 0일 수 있다 — 있는 경우만 검증
    accentTotal += accents.length;
    for (const note of accents) {
      assert.ok(Array.isArray(note.chordMidis) && note.chordMidis.length >= 3, `${fixture.label} ${note.noteId} chordMidis 없음`);
      assert.equal(Math.min(...note.chordMidis), note.chordMidis[0], '베이스가 최저음이어야 함');
      for (const midi of note.chordMidis) {
        const pitchClass = ((midi - (36 + harmony.tonicIndex)) % 12 + 12) % 12;
        const scale = {
          ionian: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
          lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10], aeolian: [0, 2, 3, 5, 7, 8, 10],
          'minor-pentatonic': [0, 3, 5, 7, 10],
        }[harmony.mode];
        assert.ok(scale.includes(pitchClass), `${fixture.label} 화음 ${midi} 스케일 밖`);
      }
    }
    for (const note of taps) {
      assert.equal(note.chordMidis ?? null, null, 'tap은 단선율');
    }
  }
  assert.ok(accentTotal > 0, '전체 픽스처에 accent가 하나도 없음');
});
