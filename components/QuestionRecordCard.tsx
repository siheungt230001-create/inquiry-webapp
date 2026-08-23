import { approvalBadgeClass, CRITERIA_ACCENTS } from "@/lib/badge";
import { inquiryStageOf, inquiryStageBadgeClass } from "@/lib/aggregate";
import { SubQuestionList, EssayDetailSection } from "@/components/InquiryEssayDetail";
import TeacherCommentBox from "@/components/TeacherCommentBox";
import PdfDownloadButton from "@/components/PdfDownloadButton";
import type { InquiryRecord, SubmissionRow } from "@/lib/types";

// "질문 만들기" 세부 채점 5개 타일 - app/teacher/page.tsx, app/teacher/all/page.tsx가 같이 쓴다.
export function CriteriaGrid({ values }: { values: (number | "")[] }) {
  return (
    <dl className="grid grid-cols-5 gap-2 text-center text-xs">
      {CRITERIA_ACCENTS.map((c, i) => (
        <div key={c.label} className="rounded-lg border-t-2 bg-zinc-50 px-1.5 py-1.5" style={{ borderColor: c.color }}>
          <dt style={c.textSafe ? { color: c.color } : undefined} className={c.textSafe ? undefined : "text-zinc-400"}>
            {c.label}
          </dt>
          <dd className="mt-0.5 font-semibold text-zinc-800">{values[i] === "" ? "-" : values[i]}</dd>
        </div>
      ))}
    </dl>
  );
}

// 학생의 메인 질문 제출에 이어지는 탐구 글쓰기 진행 상태 - record가 없으면 아직
// 보조질문 단계로 넘어간 적 없다는 뜻(메인 질문만 제출됨). "질문 판정" 배지 옆에
// 점수가 붙는 것과 맞춰서, 완료 상태일 땐 종합 글쓰기 총점도 같이 보여준다.
export function ProgressBadge({ record }: { record: InquiryRecord | undefined }) {
  const stage = inquiryStageOf(record);
  const showScore = stage === "종합 글쓰기 완료" && record && record.totalScore !== "";
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold text-white ${inquiryStageBadgeClass(stage)}`}
    >
      {stage}
      {showScore && ` (${record!.totalScore}점)`}
    </span>
  );
}

// 질문 하나(SubmissionRow)를 펼치면 질문 원문/세부 점수/보조질문/종합 글쓰기까지
// 전부 그 자리에서 보이는 카드 - app/teacher/page.tsx(단원별 보기)와
// app/teacher/all/page.tsx(전체 보기) 둘 다 학생의 질문 이력을 나열할 때 이걸 쓴다.
// showUnit=true면 요약 줄에 단원명도 같이 보여준다(단원을 안 가리는 "전체 보기"에서만 필요).
export function QuestionRecordCard({
  q,
  record,
  showUnit = false,
}: {
  q: SubmissionRow;
  record: InquiryRecord | undefined;
  showUnit?: boolean;
}) {
  return (
    <details key={q.timestamp} className="rounded-2xl border border-zinc-200 bg-white open:shadow-sm">
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
        {showUnit && <span className="text-xs text-zinc-400">{q.unit}</span>}
        <span className="flex items-center gap-1.5">
          <span className="text-[10px] text-zinc-400">질문 판정</span>
          <span className="rounded-full bg-zinc-900 px-2.5 py-0.5 text-xs font-semibold text-white">
            {q.aiLevel || "채점 대기중"}
          </span>
          {q.aiScore !== "" && <span className="text-xs text-zinc-500">{q.aiScore}점</span>}
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold text-white ${approvalBadgeClass(
              q.approval
            )}`}
          >
            {q.approval || "처리중"}
          </span>
        </span>
        <span className="h-4 w-px bg-zinc-200" aria-hidden />
        <span className="flex items-center gap-1.5">
          <span className="text-[10px] text-zinc-400">탐구 글쓰기</span>
          <ProgressBadge record={record} />
        </span>
        <span className="whitespace-nowrap text-xs text-zinc-400">
          {new Date(q.timestamp).toLocaleString("ko-KR")}
        </span>
        <span className="ml-auto max-w-[45%] min-w-0 truncate text-xs text-zinc-500">{q.question}</span>
      </summary>

      <div className="flex flex-col gap-4 border-t border-zinc-100 px-4 py-4">
        <div>
          <p className="text-xs font-medium text-zinc-500">질문 원문</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-800">{q.question}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-zinc-500">세부 점수</p>
          <div className="mt-1 max-w-md">
            <CriteriaGrid values={[q.fact, q.causal, q.compare, q.sentence, q.integration]} />
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-zinc-500">보조질문</p>
          <div className="mt-1">
            <SubQuestionList record={record} />
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-zinc-500">종합 글쓰기</p>
          <div className="mt-1">
            <EssayDetailSection record={record} />
          </div>
          {record && record.totalScore !== "" && (
            <div className="mt-2">
              <PdfDownloadButton timestamp={q.timestamp} />
            </div>
          )}
        </div>
        <div>
          <p className="text-xs font-medium text-zinc-500">교사 코멘트</p>
          <div className="mt-1">
            <TeacherCommentBox email={q.email} timestamp={q.timestamp} initialComment={q.teacherComment} />
          </div>
        </div>
      </div>
    </details>
  );
}
