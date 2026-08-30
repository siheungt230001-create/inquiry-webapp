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

// 보조질문 만들기(2단계) 카드 5개 - hint가 null인 카드("기타")는 빈칸 템플릿 없이
// 자유롭게 쓰는 칸. accent는 카드 성격별 파스텔 보더 색(globals.css의 .card-* 클래스).
export const SUB_QUESTION_CARDS = [
  { key: "cause", label: "원인·배경형", hint: "○○은 왜 ~했을까?", accent: "card-mint" },
  { key: "effect", label: "결과·영향형", hint: "○○ 이후 ~는 어떻게 달라졌을까?", accent: "card-lavender" },
  { key: "compare", label: "비교·대안형", hint: "그 당시 ○○ 말고 다른 방법은 없었을까?", accent: "card-peach" },
  { key: "perspective", label: "인물 입장형", hint: "○○의 입장에서는 왜 그런 선택을 했을까?", accent: "card-pink" },
  { key: "free", label: "기타 (자유롭게 쓰기)", hint: null, accent: "" },
] as const;
