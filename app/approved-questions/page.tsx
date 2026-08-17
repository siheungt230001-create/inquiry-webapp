import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { getAllSubmissions } from "@/lib/sheets";
import { buildApprovedByUnit } from "@/lib/aggregate";

export default async function ApprovedQuestionsPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const rows = await getAllSubmissions();
  const byUnit = buildApprovedByUnit(rows);
  const totalCount = Array.from(byUnit.values()).reduce((sum, list) => sum + list.length, 0);

  return (
    <div className="flex-1 bg-zinc-50 px-4 py-8 sm:py-10">
      <div className="mx-auto max-w-xl">
        <div className="mb-4 flex items-center justify-between">
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800">
            ← 처음으로
          </Link>
          <Link href="/history" className="text-sm text-zinc-500 hover:text-zinc-800">
            나의 제출 이력 →
          </Link>
        </div>

        <h1 className="text-xl font-semibold text-zinc-900 sm:text-2xl">우수 질문 모음</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700">
            승인된 질문 {totalCount}개
          </span>
          <span className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-600">익명 공개</span>
        </div>

        {totalCount === 0 ? (
          <p className="mt-8 text-sm text-zinc-500">아직 승인된 질문이 없어요.</p>
        ) : (
          <div className="mt-6 flex flex-col gap-7">
            {Array.from(byUnit.entries()).map(([unit, items]) => (
              <div key={unit}>
                <div className="flex items-baseline gap-2">
                  <h2 className="text-sm font-semibold text-zinc-700">{unit}</h2>
                  <span className="text-xs text-zinc-400">{items.length}개</span>
                </div>
                <ol className="mt-2 flex flex-col gap-2">
                  {items.map((item, i) => (
                    <li
                      key={i}
                      className="flex gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800 shadow-sm"
                    >
                      <span className="shrink-0 font-semibold text-indigo-400">{i + 1}.</span>
                      <span className="leading-relaxed">{item.question}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
