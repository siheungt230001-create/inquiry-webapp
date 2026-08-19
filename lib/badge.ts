// 승인 상태 배지 색상 - 학생 이력 페이지와 교사 대시보드가 공유해서 쓴다.
export function approvalBadgeClass(approval: string): string {
  if (approval === "승인") return "bg-emerald-600";
  if (approval === "재제출") return "bg-amber-500";
  if (approval === "제출완료(미승인)") return "bg-blue-500";
  return "bg-zinc-400"; // 처리중/빈 값
}
