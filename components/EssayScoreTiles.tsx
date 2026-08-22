import { ESSAY_ACCENTS } from "@/lib/badge";

export interface EssayScoreValues {
  introScore: number | "";
  bodyScore: number | "";
  conclusionScore: number | "";
  factScore: number | "";
}

// "질문 만들기" 결과 카드(components/SubmitForm.tsx의 ResultCard 세부 채점, 그리고
// components/QuestionRecordCard.tsx의 CriteriaGrid)와 같은 톤 + 같은 타일 레이아웃
// (좁은 padding/작은 글씨, 색은 위 테두리로만 구분 - 점 배지는 안 쓴다). "질문 원문"
// 세부 점수 타일과 "종합 글쓰기" 타일이 같은 화면에서 나란히 있어도 어긋나 보이지
// 않게 하려고 두 컴포넌트를 같은 스타일로 맞춰뒀다. 항목별 강조색.
// components/AnswerForm.tsx(학생이 보는 화면)와 components/InquiryEssayDetail.tsx
// (교사 화면 인라인 카드)가 같이 쓴다.
export default function EssayScoreTiles({ scores }: { scores: EssayScoreValues }) {
  const values = [scores.introScore, scores.bodyScore, scores.conclusionScore, scores.factScore];
  return (
    <dl className="grid grid-cols-4 gap-2 text-center text-xs">
      {ESSAY_ACCENTS.map((c, i) => (
        <div
          key={c.label}
          className="rounded-lg border-t-2 bg-zinc-50 px-1.5 py-1.5"
          style={{ borderColor: c.color }}
        >
          <dt style={c.textSafe ? { color: c.color } : undefined} className={c.textSafe ? undefined : "text-zinc-400"}>
            {c.label}
          </dt>
          <dd className="mt-0.5 font-semibold text-zinc-800">
            {values[i] === "" ? "-" : values[i]} / {c.max}
          </dd>
        </div>
      ))}
    </dl>
  );
}
