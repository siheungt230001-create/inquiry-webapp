import EssayScoreTiles from "@/components/EssayScoreTiles";
import type { InquiryRecord, InquirySubQuestion } from "@/lib/types";

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
    return <p className="text-xs text-zinc-400">아직 작성한 보조질문이 없어요</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {subQuestions.map((s, i) => (
        <li key={i} className="rounded-lg border border-[var(--color-cream-200)] bg-[var(--color-cream-50)] px-3 py-2 text-xs">
          <div className="text-zinc-700">
            <span className="text-zinc-400">[{s.label}]</span> {s.question}
          </div>
          <div className="mt-0.5 text-zinc-500">{s.answer ? s.answer : "(답을 안 씀)"}</div>
          {s.source && <div className="mt-0.5 text-[11px] text-zinc-400">출처: {s.source}</div>}
        </li>
      ))}
    </ul>
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
    </div>
  );
}
