import { JUDGMENT } from '../constants/maestro.js';

export const JUDGMENT_GRADES = {
  PERFECT: 'PERFECT',
  GREAT: 'GREAT',
  EARLY: 'EARLY',
  LATE: 'LATE',
};

// 타이밍 판정 (점수전용). 도달 상태 판정이 거리 판정보다 항상 우선한다.
// comboDelta 0은 콤보 리셋을 의미한다.
export function gradeHit({ noteBottom, lineBottom, now, arrivedAt }) {
  let grade;

  if (arrivedAt != null) {
    grade = (now - arrivedAt) <= JUDGMENT.LATE_GRACE_MS
      ? JUDGMENT_GRADES.PERFECT
      : JUDGMENT_GRADES.LATE;
  } else {
    grade = (noteBottom - lineBottom) <= JUDGMENT.GREAT_WINDOW_PX
      ? JUDGMENT_GRADES.GREAT
      : JUDGMENT_GRADES.EARLY;
  }

  return {
    grade,
    score: JUDGMENT.SCORES[grade],
    comboDelta: grade === JUDGMENT_GRADES.LATE ? 0 : 1,
  };
}
