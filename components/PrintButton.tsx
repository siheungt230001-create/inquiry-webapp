"use client";

// 인쇄 대화상자를 열기만 한다 - 실제 PDF 저장은 사용자가 대화상자에서
// "PDF로 저장"을 선택해서 완료한다(브라우저 자체 인쇄 기능, 서버 렌더링 없음).
export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
    >
      인쇄 / PDF로 저장
    </button>
  );
}
