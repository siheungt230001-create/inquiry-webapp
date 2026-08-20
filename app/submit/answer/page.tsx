import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import AnswerForm from "@/components/AnswerForm";

export default async function AnswerPage({
  searchParams,
}: {
  searchParams: Promise<{ ts?: string; q?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { ts, q } = await searchParams;
  if (!ts || !q) redirect("/history");

  const backHref = `/submit/sub-questions?ts=${encodeURIComponent(ts)}&q=${encodeURIComponent(q)}`;

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
