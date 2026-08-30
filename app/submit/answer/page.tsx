import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import AnswerForm from "@/components/AnswerForm";

export default async function AnswerPage({
  searchParams,
}: {
  searchParams: Promise<{ ts?: string; q?: string; unit?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { ts, q, unit } = await searchParams;
  if (!ts || !q) redirect("/history");

  const backHref = `/submit/sub-questions?ts=${encodeURIComponent(ts)}&q=${encodeURIComponent(q)}`;
  // 옛 링크(히스토리 등)는 unit 없이 들어올 수 있는데, sub-answers 화면은 unit이 없으면
  // /history로 튕겨나가므로 unit이 있을 때만 이 탭을 보여준다.
  const subAnswersHref = unit
    ? `/submit/sub-answers?ts=${encodeURIComponent(ts)}&q=${encodeURIComponent(q)}&unit=${encodeURIComponent(unit)}`
    : null;

  return (
    <div className="flex-1 bg-zinc-50 px-4 py-10">
      <div className="mx-auto max-w-xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Link href={backHref} className="text-sm text-zinc-500 hover:text-zinc-800">
              ← 보조질문으로
            </Link>
            {subAnswersHref && (
              <Link href={subAnswersHref} className="text-sm text-zinc-500 hover:text-zinc-800">
                보조질문에 답하기
              </Link>
            )}
          </div>
          <Link href="/history" className="text-sm text-zinc-500 hover:text-zinc-800">
            내 제출 이력 →
          </Link>
        </div>
        <h1 className="text-xl font-semibold text-zinc-900">종합 답안 쓰기</h1>
        <p className="mt-1 text-sm text-zinc-500">
          서론-본론-결론 순서로 메인 질문에 대한 나의 답을 정리해보세요.
        </p>
        <div className="mt-6">
          <AnswerForm timestamp={ts} mainQuestion={q} />
        </div>
      </div>
    </div>
  );
}
