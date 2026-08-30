// 승인 상태 배지 색상(배경+글자 톤까지 포함) - 학생 이력 페이지와 교사 대시보드가 공유해서 쓴다.
export function approvalBadgeClass(approval: string): string {
  if (approval === "승인") return "badge badge-done";
  if (approval === "재제출") return "badge badge-progress";
  if (approval === "제출완료(미승인)") return "badge badge-level";
  return "badge badge-pending"; // 처리중/빈 값
}

// 세부 채점 항목 5개(사실정확성/인과분석/비교평가/문장명료성/자료통합) 강조색 -
// components/SubmitForm.tsx의 결과 카드, app/teacher/page.tsx의 CriteriaGrid가
// 공유해서 쓴다. 순서 고정. textSafe=false인 색(노랑·청록·마젠타)은 밝은
// 배경에서 텍스트로 쓰면 대비가 약해서, 라벨 텍스트 색으로는 안 쓰고
// 보더·점 배지처럼 넓은 면적/굵은 요소에만 쓴다.
export const CRITERIA_ACCENTS = [
  { label: "사실 정확성", color: "#2a78d6", textSafe: true },
  { label: "인과·분석 깊이", color: "#eb6834", textSafe: true },
  { label: "비교·평가 요소", color: "#1baf7a", textSafe: false },
  { label: "문장 명료성", color: "#eda100", textSafe: false },
  { label: "자료 통합 깊이", color: "#e87ba4", textSafe: false },
] as const;

// 종합 글쓰기(서론/본론/결론/사실정확성) 채점 카드 강조색 - components/AnswerForm.tsx의
// ScoreBreakdown, components/EssayScoreTiles.tsx에서 쓴다. CRITERIA_ACCENTS와 같은
// 톤(같은 색 재사용)으로 맞춰서 "질문 만들기" 피드백과 "종합 글쓰기" 피드백이 같은
// 시각 언어로 보이게 한다. 본론 max=2.5, 사실정확성 max=0.5로 factScore 도입에 맞춤
// (총점 1+2.5+1+0.5=5 유지).
export const ESSAY_ACCENTS = [
  { label: "서론", color: "#2a78d6", textSafe: true, max: 1 },
  { label: "본론", color: "#eb6834", textSafe: true, max: 2.5 },
  { label: "결론", color: "#1baf7a", textSafe: false, max: 1 },
  { label: "사실정확성", color: "#e87ba4", textSafe: false, max: 0.5 },
] as const;
