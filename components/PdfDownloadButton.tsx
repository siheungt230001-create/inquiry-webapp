"use client";

import { useState } from "react";

// 종합 글쓰기가 완료된 기록에만 붙는 PDF 다운로드 - 누르면 범위를 고르는 작은
// 드롭다운이 뜬다. 실제 다운로드는 그냥 <a href>로 API 라우트를 가리켜서 브라우저의
// 기본 다운로드 동작에 맡긴다(app/api/inquiry-writing/pdf) - fetch+blob으로 굳이
// 감쌀 이유가 없다.
export default function PdfDownloadButton({ timestamp }: { timestamp: string }) {
  const [open, setOpen] = useState(false);
  const base = `/api/inquiry-writing/pdf?ts=${encodeURIComponent(timestamp)}`;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
      >
        PDF 다운로드
      </button>
      {open && (
        <div className="absolute left-0 z-10 mt-1 w-56 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg">
          <a
            href={`${base}&scope=full`}
            onClick={() => setOpen(false)}
            className="block px-3 py-2 hover:bg-zinc-50"
          >
            <div className="text-sm font-medium text-zinc-800">전체 다운로드</div>
            <div className="text-xs text-zinc-400">세부 점수·보조질문·AI 코멘트 포함</div>
          </a>
          <a
            href={`${base}&scope=simple`}
            onClick={() => setOpen(false)}
            className="block border-t border-zinc-100 px-3 py-2 hover:bg-zinc-50"
          >
            <div className="text-sm font-medium text-zinc-800">간단 다운로드</div>
            <div className="text-xs text-zinc-400">글(서론·본론·결론)만 깔끔하게</div>
          </a>
        </div>
      )}
    </div>
  );
}
