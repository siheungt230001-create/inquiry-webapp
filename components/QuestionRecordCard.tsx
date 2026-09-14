import { approvalBadgeClass, CRITERIA_ACCENTS } from "@/lib/badge";
import { inquiryStageOf, inquiryStageBadgeClass, progressStatusOf } from "@/lib/aggregate";
import { SubQuestionList, EssayDetailSection } from "@/components/InquiryEssayDetail";
import PdfDownloadButton from "@/components/PdfDownloadButton";
import TeacherFeedbackBox from "@/components/TeacherFeedbackBox";
import { ChatBubbleIcon } from "@/components/icons";
import type { InquiryRecord, SubmissionRow } from "@/lib/types";

// 이 제출 건에 선생님 피드백(교사 코멘트)이 저장돼 있는지 - 학생이 코멘트를 받고도
// 이어서 안 쓰고 다른 질문으로 넘어가는 경우가 많아서, 카드를 펼치지 않아도 요약줄에서
// 바로 알아볼 수 있게 한다. 빈 문자열/공백만 있는 경우는 "저장된 코멘트 없음"으로 본다.
export function hasTeacherFeedback(record: InquiryRecord | undefined): boolean {
  return Boolean(record?.teacherFeedback?.trim());
}

// hover 시 코멘트 내용을 미리 보여주는 작은 말풍선 - 네이티브 title 속성만으로 구현해서
// 별도 상태·JS 없이도 브라우저 기본 툴팁이 뜬다. 60자 넘으면 잘라서 요약만 보여준다.
function TeacherFeedbackIndicator({ feedback }: { feedback: string }) {
  const preview = feedback.trim();
  const title = `선생님 피드백: ${preview.length > 60 ? `${preview.slice(0, 60)}...` : preview}`;
  return (
    <span title={title} className="inline-flex">
      <ChatBubbleIcon className="h-3.5 w-3.5 shrink-0 text-[var(--color-lavender-deep)]" aria-label={title} />
    </span>
  );
}

// "질문 만들기" 세부 채점 5개 타일 - app/teacher/page.tsx, app/teacher/all/page.tsx가 같이 쓴다.
export function CriteriaGrid({ values }: { values: (number | "")[] }) {
  return (
    <dl className="grid grid-cols-5 gap-2 text-center text-xs">
      {CRITERIA_ACCENTS.map((c, i) => (
        <div key={c.label} className="rounded-lg border-t-2 bg-[var(--color-cream-50)] px-1.5 py-1.5" style={{ borderColor: c.color }}>
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
    <span className={`whitespace-nowrap ${inquiryStageBadgeClass(stage)}`}>
      {stage}
      {showScore && ` (${record!.totalScore}점)`}
    </span>
  );
}

// 보조질문이 만들어졌거나 종합 글쓰기가 시작된(=inquiryStageOf가 "메인 질문만 제출됨"이
// 아닌) 질문에만 붙는 표시 - 같은 단원에 여러 번 제출한 것 중 어느 게 지금 실제로
// 진행 중인지(가장 최근 활동) 구분한다(lib/aggregate.ts의 pickCurrentInquiryTimestamps).
function CurrentAttemptBadge({ isCurrent }: { isCurrent: boolean }) {
  return isCurrent ? (
    <span className="badge badge-current">▶ 진행 중</span>
  ) : (
    <span className="badge badge-pending">이전 시도</span>
  );
}

// 질문 하나(SubmissionRow)를 펼치면 질문 원문/세부 점수/보조질문/종합 글쓰기까지
// 전부 그 자리에서 보이는 카드 - app/teacher/page.tsx(단원별 보기)와
// app/teacher/all/page.tsx(전체 보기) 둘 다 학생의 질문 이력을 나열할 때 이걸 쓴다.
// showUnit=true면 요약 줄에 단원명도 같이 보여준다(단원을 안 가리는 "전체 보기"에서만 필요).
// isCurrentAttempt는 같은 단원에 진행 흔적 있는 질문이 여러 개일 때만 의미가 있다
// (호출부가 pickCurrentInquiryTimestamps로 계산해서 넘겨준다).
export function QuestionRecordCard({
  q,
  record,
  showUnit = false,
  isCurrentAttempt = false,
}: {
  q: SubmissionRow;
  record: InquiryRecord | undefined;
  showUnit?: boolean;
  isCurrentAttempt?: boolean;
}) {
  const hasProgress = inquiryStageOf(record) !== "메인 질문만 제출됨";
  const hasComment = hasTeacherFeedback(record);
  return (
    <details key={q.timestamp} className="card">
      <summary className="grid cursor-pointer grid-cols-[70px_16px_60px_130px_50px_160px_16px_70px_200px_150px_1fr] items-center gap-x-3 gap-y-1.5 px-4 py-3">
        <span className="truncate text-xs text-zinc-400">{showUnit ? q.unit : ""}</span>
        <span className="flex justify-center">
          {hasComment && <TeacherFeedbackIndicator feedback={record!.teacherFeedback} />}
        </span>
        <span className="text-[10px] text-zinc-400">질문 판정</span>
        <span className="badge badge-level">{q.aiLevel || "채점 대기중"}</span>
        <span className="text-xs text-zinc-500">{q.aiScore !== "" ? `${q.aiScore}점` : ""}</span>
        {/* 점수·레벨과 무관하게 어디까지 진행/저장했는지만 보여준다 - "단원 확인 필요"는
            진행 단계가 아니라 별도 판정이라 그대로 둔다. */}
        {q.approval === "단원 확인 필요" ? (
          <span className={approvalBadgeClass(q.approval)}>{q.approval}</span>
        ) : (
          <span className={inquiryStageBadgeClass(inquiryStageOf(record))}>
            {progressStatusOf(record)}
          </span>
        )}
        <span className="flex h-4 w-px justify-self-center bg-zinc-200" aria-hidden />
        <span className="text-[10px] text-zinc-400">탐구 글쓰기</span>
        <span className="flex flex-wrap items-center gap-1">
          <ProgressBadge record={record} />
          {hasProgress && <CurrentAttemptBadge isCurrent={isCurrentAttempt} />}
        </span>
        <span className="whitespace-nowrap text-xs text-zinc-400">
          {new Date(q.timestamp).toLocaleString("ko-KR")}
        </span>
        <span className="min-w-0 truncate text-xs text-zinc-500">{q.question}</span>
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
        <TeacherFeedbackBox
          email={q.email}
          timestamp={q.timestamp}
          initialFeedback={record?.teacherFeedback ?? ""}
        />
      </div>
    </details>
  );
}
