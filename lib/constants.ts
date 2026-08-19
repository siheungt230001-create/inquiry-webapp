export const ROUND_LIST = ["1차", "2차", "3차", "4차", "5차 이상"];
export const SELF_LEVEL_LIST = [
  "L1 사실 확인형",
  "L2 분석형",
  "L3 평가·비교·적용형",
  "L4 복합형",
];

// 같은 학생이 같은 단원에 몇 번째로 제출하는지(1부터 시작)를 ROUND_LIST 표기로 변환.
// 학생이 직접 고르지 않고 서버가 기존 제출 개수를 세어 자동으로 매긴다.
export function formatRound(submissionNumber: number): string {
  const idx = Math.min(submissionNumber, ROUND_LIST.length) - 1;
  return ROUND_LIST[Math.max(idx, 0)];
}
