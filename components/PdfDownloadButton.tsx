"use client";

import { useState } from "react";

// 종합 글쓰기가 완료된 기록에만 붙는 PDF 다운로드 - 누르면 범위를 고르는 작은
// 드롭다운이 뜬다. 서버에서 PDF를 직접 그리는 대신(@react-pdf/renderer + 대용량
// 한글 폰트 조합이 실제 학생 글 분량에서 렌더링에 1분 넘게 걸려 서버 프로세스를
// 통째로 멈춰 세웠다) 인쇄용 페이지를 새 탭으로 열고 브라우저 자체 인쇄 기능의
// "PDF로 저장"에 맡긴다 - 서버 렌더링·폰트 번들링이 전혀 필요 없고 한글도 항상
// 정확히 나온다.
export default function PdfDownloadButton({ timestamp }: { timestamp: string }) {
  const [open, setOpen] = useState(false);
  const base = `/print/inquiry?ts=${encodeURIComponent(timestamp)}`;

  return (
    <div className="relative inline-block">
      <button type="button" onClick={() => setOpen((v) => !v)} className="btn-secondary !px-3 !py-1.5 !text-xs">
        PDF 다운로드
      </button>
      {open && (
        <div className="card absolute left-0 z-10 mt-1 w-60 overflow-hidden !rounded-2xl p-0">
          <a
            href={`${base}&scope=full`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 hover:bg-[var(--color-cream-50)]"
          >
            <div className="text-sm font-medium text-[var(--color-ink)]">전체 다운로드</div>
            <div className="text-xs text-[var(--color-ink-muted)]">세부 점수·보조질문·AI 코멘트 포함 (새 탭에서 인쇄 → PDF로 저장)</div>
          </a>
          <a
            href={`${base}&scope=simple`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="block border-t border-[var(--color-cream-200)] px-3 py-2 hover:bg-[var(--color-cream-50)]"
          >
            <div className="text-sm font-medium text-[var(--color-ink)]">간단 다운로드</div>
            <div className="text-xs text-[var(--color-ink-muted)]">글(서론·본론·결론)만 깔끔하게 (새 탭에서 인쇄 → PDF로 저장)</div>
          </a>
        </div>
      )}
    </div>
  );
}
