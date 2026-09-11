export const ROUND_LIST = ["1차", "2차", "3차", "4차", "5차 이상"];

// 학년/반/번호 오타(예: "30123"처럼 자릿수가 어긋난 값)가 시트에 그대로 들어가는 걸
// 막기 위한 합리적 범위 - 중학교 기준(학년 1~3), 반/번호는 실제 운영 규모보다
// 넉넉하게 잡았다(작은 학교의 큰 학급 번호까지 커버).
export const GRADE_RANGE = { min: 1, max: 3 };
export const BAN_RANGE = { min: 1, max: 20 };
export const NO_RANGE = { min: 1, max: 40 };

// 학년은 필수, 반/번호는 기존처럼 선택 입력(빈 값 허용)이지만 값이 있으면 범위를
// 벗어나지 않는지 검사한다. app/api/submit, app/api/submit/edit, app/api/profile
// (자기 정보 수정) 세 곳이 이 함수 하나만 공유해서 검증 기준이 어긋나지 않게 한다.
export function validateProfileNumbers(grade: string, ban: string, no: string): string | null {
  const inRange = (v: string, range: { min: number; max: number }) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= range.min && n <= range.max;
  };
  if (!grade.trim() || !inRange(grade, GRADE_RANGE)) {
    return `학년은 ${GRADE_RANGE.min}~${GRADE_RANGE.max} 사이 숫자로 입력해주세요.`;
  }
  if (ban.trim() && !inRange(ban, BAN_RANGE)) {
    return `반은 ${BAN_RANGE.min}~${BAN_RANGE.max} 사이 숫자로 입력해주세요.`;
  }
  if (no.trim() && !inRange(no, NO_RANGE)) {
    return `번호는 ${NO_RANGE.min}~${NO_RANGE.max} 사이 숫자로 입력해주세요.`;
  }
  return null;
}
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

// 보조질문 만들기(2단계) 카드 6개 - hint가 null인 카드("기타")는 빈칸 템플릿 없이
// 자유롭게 쓰는 칸. 카드 테두리 색은 질문 유형이 아니라 AI 판정 상태 기준(양호=민트,
// 수정 필요=피치, 미판정=무색)이라 여기엔 색 정보를 두지 않는다. 카드가 늘어나도
// SubQuestionsForm의 "AI 코멘트 받기" 최소 작성 기준(MIN_FILLED)은 그대로 3개라
// 학생이 채워야 하는 최소 개수는 안 늘어난다 - 나머지는 여전히 선택.
export const SUB_QUESTION_CARDS = [
  { key: "cause", label: "원인·배경형", hint: "○○은 왜 ~했을까?" },
  { key: "effect", label: "결과·영향형", hint: "○○ 이후 ~는 어떻게 달라졌을까?" },
  { key: "compare", label: "비교·대안형", hint: "그 당시 ○○ 말고 다른 방법은 없었을까?" },
  { key: "perspective", label: "인물 입장형", hint: "○○의 입장에서는 왜 그런 선택을 했을까?" },
  { key: "example", label: "사례형", hint: "○○의 구체적인 사례로는 무엇이 있을까?" },
  { key: "free", label: "기타 (자유롭게 쓰기)", hint: null },
] as const;
