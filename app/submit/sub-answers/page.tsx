import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { getGroundingTextForUnit } from "@/lib/sheets";
import SubAnswersForm from "@/components/SubAnswersForm";

export default async function SubAnswersPage({
  searchParams,
}: {
  searchParams: Promise<{ ts?: string; q?: string; unit?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { ts, q, unit } = await searchParams;
  if (!ts || !q || !unit) redirect("/history");

  let readingText = "";
  try {
    readingText = await getGroundingTextForUnit(unit);
  } catch {
    readingText = "";
  }

  const backHref = `/submit/sub-questions?ts=${encodeURIComponent(ts)}&q=${encodeURIComponent(q)}&unit=${encodeURIComponent(unit)}`;

  return (
    <div className="flex-1 bg-zinc-50 px-4 py-10">
      <div className="mx-auto max-w-xl">
        <div className="mb-4 flex items-center justify-between">
          <Link href={backHref} className="text-sm text-zinc-500 hover:text-zinc-800">
            ← 보조질문으로
          </Link>
          <Link href="/history" className="text-sm text-zinc-500 hover:text-zinc-800">
            내 제출 이력 →
          </Link>
        </div>
        <h1 className="text-xl font-semibold text-zinc-900">보조질문 답 쓰기</h1>
        <p className="mt-1 text-sm text-zinc-500">
          AI 코멘트를 받은 보조질문마다 답을 찾아 적어보세요. "수정 필요" 질문은 그대로 답해도 되고, 앞 화면에서 다듬고 와도 돼요.
        </p>
        <div className="mt-6">
          <SubAnswersForm timestamp={ts} mainQuestion={q} readingText={readingText} />
        </div>
      </div>
    </div>
  );
}
