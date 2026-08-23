import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isTeacherEmail } from "@/lib/teacher-auth";
import { getAllInquiryRecords, getSubmissionsByEmail } from "@/lib/sheets";
import { CriteriaGrid } from "@/components/QuestionRecordCard";
import { SubQuestionList } from "@/components/InquiryEssayDetail";
import EssayScoreTiles from "@/components/EssayScoreTiles";
import PrintButton from "@/components/PrintButton";
import type { InquiryRecord, SubmissionRow } from "@/lib/types";
import type { Metadata } from "next";

type SearchParams = { ts?: string; scope?: string };

function sanitizeFilenamePart(s: string): string {
  return s.replace(/[/\\:*?"<>|]/g, "_").trim();
}

// 인쇄 대화상자의 "PDF로 저장" 기본 파일명은 문서 <title>에서 가져온다 -
// app/api/inquiry-writing/pdf/route.ts의 Content-Disposition 파일명과 같은 규칙(학년-반-번호-이름-단원명).
async function loadPrintData(searchParams: SearchParams) {
  const ts = searchParams.ts;
  const scope = searchParams.scope === "simple" ? "simple" : "full";
  const session = await auth();
  if (!session?.user?.email || !ts) return { error: null, needsLogin: !session?.user?.email } as const;

  const records = await getAllInquiryRecords();
  const record = records.find((r) => r.mainQuestionTimestamp === ts);
  if (!record) return { error: "해당 기록을 찾을 수 없습니다." } as const;

  const isOwner = record.email === session.user.email;
  if (!isOwner && !isTeacherEmail(session.user.email)) {
    return { error: "권한이 없습니다." } as const;
  }
  if (record.totalScore === "") {
    return { error: "종합 글쓰기가 완료된 기록만 다운로드할 수 있습니다." } as const;
  }

  const rows = await getSubmissionsByEmail(record.email);
  const row = rows.find((r) => r.timestamp === ts);
  if (!row) return { error: "해당 질문 제출을 찾을 수 없습니다." } as const;

  return { error: null, row, record, scope } as const;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const data = await loadPrintData(await searchParams);
  if (!data.row) return { title: "탐구 글쓰기 기록" };
  const parts = [data.row.grade, data.row.ban, data.row.no, data.row.name, data.row.unit]
    .filter((p) => p !== "")
    .map(sanitizeFilenamePart);
  return { title: parts.join("-") };
}

function EssayText({
  label,
  text,
  score,
  max,
}: {
  label: string;
  text: string;
  score: number | "";
  max: number;
}) {
  return (
    <div className="mb-1.5 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-zinc-700">{label}</span>
        {score !== "" && (
          <span className="text-xs text-zinc-400">
            {score} / {max}점
          </span>
        )}
      </div>
      <p className="mt-0.5 whitespace-pre-wrap text-sm text-zinc-800">{text || "(작성 안 함)"}</p>
    </div>
  );
}

export default async function PrintInquiryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const data = await loadPrintData(sp);

  if (data.needsLogin) redirect("/login");
  if (!sp.ts) redirect("/history");
  if (data.error) {
    return (
      <div className="mx-auto max-w-xl px-6 py-10">
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {data.error}
        </p>
      </div>
    );
  }

  const row = data.row as SubmissionRow;
  const record = data.record as InquiryRecord;
  const scope = data.scope as "full" | "simple";
  const isLegacyScoring = record.factScore === "";
  const bodyMax = isLegacyScoring ? 3 : 2.5;

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 print:max-w-none print:px-0 print:py-0">
      <style>{`
        @page { size: A4; margin: 12mm 14mm; }
        @media print {
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          /* text 크기·padding·margin·gap 유틸리티가 전부 rem 기준이라, 인쇄 시
             루트 글자 크기 하나만 줄이면 화면용 크기 전체가 비례해서
             옛 PDF 버전 정도의 밀도로 같이 줄어든다. */
          html { font-size: 10px; }
        }
      `}</style>

      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <p className="text-xs text-zinc-500">
          인쇄 대화상자가 열리면 대상(프린터)을 &quot;PDF로 저장&quot;으로 바꿔서 저장하세요.
        </p>
        <PrintButton />
      </div>

      <p className="text-xs text-zinc-400">{row.unit}</p>
      <p className="mb-1.5 text-xs text-zinc-400">
        {row.grade}학년 {row.ban}반 {row.no}번 · {row.name}
      </p>
      <h1 className="mb-2.5 text-lg font-bold text-zinc-900">{row.question}</h1>

      {scope === "full" && (
        <>
          <h2 className="mb-1.5 mt-2.5 text-sm font-bold text-zinc-700">세부 점수</h2>
          <div className="max-w-md">
            <CriteriaGrid values={[row.fact, row.causal, row.compare, row.sentence, row.integration]} />
          </div>

          <h2 className="mb-1.5 mt-3 text-sm font-bold text-zinc-700">보조질문</h2>
          <SubQuestionList record={record} />
        </>
      )}

      <h2 className="mb-1.5 mt-3 text-sm font-bold text-zinc-700">종합 글쓰기</h2>
      {scope === "full" && (
        <>
          <p className="mb-1.5 text-base font-bold text-zinc-900">총점 {record.totalScore} / 5.0점</p>
          {!isLegacyScoring && (
            <div className="mb-1.5 max-w-md">
              <EssayScoreTiles scores={record} />
            </div>
          )}
        </>
      )}
      <EssayText label="서론" text={record.intro} score={scope === "full" ? record.introScore : ""} max={1} />
      <EssayText label="본론" text={record.body} score={scope === "full" ? record.bodyScore : ""} max={bodyMax} />
      <EssayText
        label="결론"
        text={record.conclusion}
        score={scope === "full" ? record.conclusionScore : ""}
        max={1}
      />

      {scope === "full" && record.comment && (
        <div className="mt-1.5 rounded-lg bg-indigo-50 px-3 py-1.5">
          <p className="text-xs font-medium text-indigo-700">AI 피드백</p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-indigo-900">{record.comment}</p>
        </div>
      )}
    </div>
  );
}
