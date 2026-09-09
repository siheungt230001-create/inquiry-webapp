import EssayScoreTiles from "@/components/EssayScoreTiles";
import type { InquiryRecord, InquirySubQuestion } from "@/lib/types";
import { CheckIcon, WarningIcon } from "./icons";

// 보조질문/답변 판정 배지 - 학생 화면(SubQuestionsForm/SubAnswersForm)과 같은 아이콘·색을
// 써서 교사 대시보드에서도 같은 기준으로 한눈에 읽히게 한다.
function StatusBadge({ status }: { status?: "양호" | "수정 필요" | null }) {
  if (status === "양호") {
    return <CheckIcon className="text-[var(--color-mint-deep)]" aria-label="양호" />;
  }
  if (status === "수정 필요") {
    return <WarningIcon className="text-[var(--color-badge-text)]" aria-label="수정 필요" />;
  }
  return null;
}

// InquiryRecord.subQuestionsJson을 파싱해서 보조질문(+학생 답) 목록을 순서대로 보여준다.
// app/teacher/page.tsx(학생별 최신 상태)와 app/teacher/all/page.tsx(전체 보기)가 같이 쓴다.
export function SubQuestionList({ record }: { record?: InquiryRecord }) {
  if (!record) {
    return <p className="text-xs text-zinc-400">아직 보조질문 단계로 넘어가지 않았어요</p>;
  }
  let subQuestions: InquirySubQuestion[] = [];
  try {
    subQuestions = JSON.parse(record.subQuestionsJson);
  } catch {
    subQuestions = [];
  }
  if (subQuestions.length === 0) {
    // 보조질문을 하나도 안 쓴 채로 종합 글쓰기(intro/body/conclusion)에 진척이 있으면,
    // 미착수가 아니라 history 화면의 "종합 글쓰기로 이동" 링크로 보조질문 단계를
    // 건너뛰고 바로 에세이를 쓴 경우다 - 둘을 같은 문구로 보여주면 "데이터가
    // 유실됐나"로 오해하기 쉬워서 구분한다.
    const skippedToEssay =
      record.totalScore !== "" ||
      [record.intro, record.body, record.conclusion].some((v) => v.trim());
    return (
      <p className="text-xs text-zinc-400">
        {skippedToEssay
          ? "보조질문 단계를 건너뛰고 바로 종합 글쓰기를 작성했어요"
          : "아직 작성한 보조질문이 없어요"}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {record.subQuestionDesignFeedback && (
        <div className="rounded-lg border border-[var(--color-lavender)] bg-[var(--color-lavender)]/20 px-3 py-2">
          <p className="text-xs font-medium text-[var(--color-lavender-deep)]">🎯 탐구 설계 피드백</p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--color-ink)]">
            {record.subQuestionDesignFeedback}
          </p>
        </div>
      )}
      {record.answerSufficiencyFeedback && (
        <div className="rounded-lg border border-[var(--color-lavender)] bg-[var(--color-lavender)]/20 px-3 py-2">
          <p className="text-xs font-medium text-[var(--color-lavender-deep)]">📝 메인 질문 답변 충분성 피드백</p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--color-ink)]">
            {record.answerSufficiencyFeedback}
          </p>
        </div>
      )}
      {record.subQuestionProperNounFeedback && (
        <div className="rounded-lg border border-[var(--color-badge-text)]/30 bg-[var(--color-badge-text)]/10 px-3 py-2">
          <p className="text-xs font-medium text-[var(--color-badge-text)]">🔍 보조질문 표기 확인</p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--color-ink)]">
            {record.subQuestionProperNounFeedback}
          </p>
        </div>
      )}
      {record.answerProperNounFeedback && (
        <div className="rounded-lg border border-[var(--color-badge-text)]/30 bg-[var(--color-badge-text)]/10 px-3 py-2">
          <p className="text-xs font-medium text-[var(--color-badge-text)]">🔍 답변 표기 확인</p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--color-ink)]">
            {record.answerProperNounFeedback}
          </p>
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {subQuestions.map((s, i) => (
          <li key={i} className="rounded-lg border border-[var(--color-cream-200)] bg-[var(--color-cream-50)] px-3 py-2 text-xs">
            <div className="flex items-center gap-1.5 text-zinc-700">
              <span className="text-zinc-400">[{s.label}]</span> {s.question}
              <StatusBadge status={s.status} />
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-zinc-500">
              <span>{s.answer ? s.answer : "(답을 안 씀)"}</span>
              <StatusBadge status={s.answerStatus} />
              {s.answer && <span className="text-[11px] text-zinc-400">({s.answer.length}자)</span>}
            </div>
            {s.source && <div className="mt-0.5 text-[11px] text-zinc-400">출처: {s.source}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EssayBlock({
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
    <div className="rounded-lg border border-[var(--color-cream-200)] bg-[var(--color-cream-50)] px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-600">{label}</span>
        {score !== "" && <span className="text-xs text-zinc-400">{score} / {max}점</span>}
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-800">{text || "(작성 안 함)"}</p>
      {text && <p className="mt-1 text-right text-[11px] text-zinc-400">{text.length}자</p>}
    </div>
  );
}

// 종합 글쓰기(탐구_글쓰기_기록) 내용을 펼친 자리에 바로 보여준다 - 총점/세부 점수
// 타일/서론·본론·결론 전체 텍스트/AI 코멘트까지 이 안에서 다 보이므로 별도 상세
// 페이지로 보내는 링크는 필요 없다.
export function EssayDetailSection({ record }: { record?: InquiryRecord }) {
  if (!record) {
    return <p className="text-xs text-zinc-400">아직 보조질문 단계로 넘어가지 않았어요</p>;
  }

  if (record.topicMismatch) {
    return (
      <p className="rounded-lg bg-[var(--color-alert-bg)] border border-[var(--color-alert-text)]/30 px-3 py-2 text-xs font-medium text-[var(--color-alert-text)]">
        단원 확인 필요 - {record.topicMismatch}
      </p>
    );
  }

  if (record.totalScore === "") {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
        보조질문 작성 중이에요 (아직 종합 글쓰기 제출 전)
      </p>
    );
  }

  // factScore 컬럼이 도입되기 전에 채점된 행은 이 값이 항상 ""로 읽힌다(시트에 그
  // 컬럼 자체가 없었으니까) - 그걸 "구버전 채점"의 판별 신호로 쓴다. 이런 행은 본론이
  // 0~3점 기준으로 매겨져 있어서 새 4타일(서론/본론/결론/사실정확성, 본론 0~2.5)
  // 레이아웃에 그대로 끼워 넣으면 숫자가 안 맞아 보인다.
  const isLegacyScoring = record.factScore === "";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="badge badge-level">총점 {record.totalScore} / 5.0점</span>
        {isLegacyScoring && <span className="badge badge-pending">구버전 채점</span>}
      </div>
      {isLegacyScoring ? (
        <p className="text-xs text-[var(--color-ink-muted)]">
          이 기록은 이전 채점 기준(본론 0~3점, 사실정확성 항목 없음)으로 매겨졌어요.
          새 기준과 세부 점수를 직접 비교하려면 재채점이 필요해요.
        </p>
      ) : (
        <div className="max-w-md">
          <EssayScoreTiles scores={record} />
        </div>
      )}
      <EssayBlock label="서론" text={record.intro} score={record.introScore} max={1} />
      <EssayBlock
        label="본론"
        text={record.body}
        score={record.bodyScore}
        max={isLegacyScoring ? 3 : 2.5}
      />
      <EssayBlock label="결론" text={record.conclusion} score={record.conclusionScore} max={1} />
      {record.comment && (
        <div className="rounded-lg border border-[var(--color-lavender)] bg-[var(--color-lavender)]/30 px-3 py-2">
          <p className="text-xs font-medium text-[var(--color-lavender-deep)]">AI 피드백 (감점 사유)</p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--color-ink)]">{record.comment}</p>
        </div>
      )}
      {record.essayProperNounFeedback && (
        <div className="rounded-lg border border-[var(--color-badge-text)]/30 bg-[var(--color-badge-text)]/10 px-3 py-2">
          <p className="text-xs font-medium text-[var(--color-badge-text)]">🔍 표기 확인</p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--color-ink)]">
            {record.essayProperNounFeedback}
          </p>
        </div>
      )}
    </div>
  );
}
