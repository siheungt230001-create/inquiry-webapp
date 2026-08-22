import { ESSAY_ACCENTS } from "@/lib/badge";

export interface EssayScoreValues {
  introScore: number | "";
  bodyScore: number | "";
  conclusionScore: number | "";
}

// "질문 만들기" 결과 카드(components/SubmitForm.tsx의 ResultCard 세부 채점)와 같은 톤 -
// 항목별 강조색 배지 타일. components/AnswerForm.tsx(학생이 보는 화면)와
// app/teacher/inquiry/[id]/page.tsx(교사 상세 화면)가 같이 쓴다.
export default function EssayScoreTiles({ scores }: { scores: EssayScoreValues }) {
  const values = [scores.introScore, scores.bodyScore, scores.conclusionScore];
  return (
    <dl className="grid grid-cols-3 gap-2">
      {ESSAY_ACCENTS.map((c, i) => (
        <div
          key={c.label}
          className="rounded-lg border-t-2 bg-zinc-50 px-2 py-2 text-center"
          style={{ borderColor: c.color }}
        >
          <dt className="flex items-center justify-center gap-1.5 text-xs">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
            <span style={c.textSafe ? { color: c.color } : undefined} className={c.textSafe ? undefined : "text-zinc-500"}>
              {c.label}
            </span>
          </dt>
          <dd className="mt-1 text-sm font-semibold text-zinc-800">
            {values[i] === "" ? "-" : values[i]} / {c.max}
          </dd>
        </div>
      ))}
    </dl>
  );
}
