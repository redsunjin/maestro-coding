import { describe, test, expect } from 'vitest';
import { gradeHit, JUDGMENT_GRADES } from './judgment.js';
import { JUDGMENT } from '../constants/maestro.js';

const LINE = 128; // 판정선 bottom(px) 예시

describe('gradeHit — 타이밍 판정 (점수전용)', () => {
  test('판정선 도달 후 grace 이내 탭은 PERFECT (+100, 콤보 +1)', () => {
    const result = gradeHit({
      noteBottom: LINE,
      lineBottom: LINE,
      arrivedAt: 10_000,
      now: 10_000 + JUDGMENT.LATE_GRACE_MS,
    });
    expect(result).toEqual({ grade: JUDGMENT_GRADES.PERFECT, score: 100, comboDelta: 1 });
  });

  test('판정선 도달 후 grace 초과 방치는 LATE (+10, 콤보 리셋)', () => {
    const result = gradeHit({
      noteBottom: LINE,
      lineBottom: LINE,
      arrivedAt: 10_000,
      now: 10_000 + JUDGMENT.LATE_GRACE_MS + 1,
    });
    expect(result).toEqual({ grade: JUDGMENT_GRADES.LATE, score: 10, comboDelta: 0 });
  });

  test('미도달 노트가 판정선에서 GREAT 창 이내면 GREAT (+70, 콤보 +1)', () => {
    const result = gradeHit({
      noteBottom: LINE + JUDGMENT.GREAT_WINDOW_PX,
      lineBottom: LINE,
      arrivedAt: null,
      now: 10_000,
    });
    expect(result).toEqual({ grade: JUDGMENT_GRADES.GREAT, score: 70, comboDelta: 1 });
  });

  test('미도달 노트가 GREAT 창 밖(성급한 탭)이면 EARLY (+40, 콤보 +1)', () => {
    const result = gradeHit({
      noteBottom: LINE + JUDGMENT.GREAT_WINDOW_PX + 1,
      lineBottom: LINE,
      arrivedAt: null,
      now: 10_000,
    });
    expect(result).toEqual({ grade: JUDGMENT_GRADES.EARLY, score: 40, comboDelta: 1 });
  });

  test('도달 상태 판정이 거리 판정보다 우선한다 (거리 0이어도 grace 초과면 LATE)', () => {
    const result = gradeHit({
      noteBottom: LINE,
      lineBottom: LINE,
      arrivedAt: 0,
      now: JUDGMENT.LATE_GRACE_MS * 2,
    });
    expect(result.grade).toBe(JUDGMENT_GRADES.LATE);
  });
});
