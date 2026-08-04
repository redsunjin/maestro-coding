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
