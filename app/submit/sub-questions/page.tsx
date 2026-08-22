import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import SubQuestionsForm from "@/components/SubQuestionsForm";

export default async function SubQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ ts?: string; q?: string; unit?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { ts, q, unit } = await searchParams;
  if (!ts || !q) redirect("/history");

  return (
    <div className="flex-1 bg-zinc-50 px-4 py-10">
      <div className="mx-auto max-w-xl">
        <div className="mb-4 flex items-center justify-between">
          <Link href={`/submit/edit?ts=${encodeURIComponent(ts)}`} className="text-sm text-zinc-500 hover:text-zinc-800">
            ← 질문 수정하기
          </Link>
        </div>
        <h1 className="text-xl font-semibold text-zinc-900">보조질문 만들기</h1>
        <p className="mt-1 text-sm text-zinc-500">
          메인 질문을 여러 각도로 쪼개 보세요. 최소 3개를 채우면 AI 코멘트를 받을 수 있어요.
        </p>
        <div className="mt-6">
          <SubQuestionsForm timestamp={ts} mainQuestion={q} unit={unit || ""} />
        </div>
      </div>
    </div>
  );
}
