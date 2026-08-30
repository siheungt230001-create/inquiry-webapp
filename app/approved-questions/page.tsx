import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { getAllSubmissions } from "@/lib/sheets";
import { buildApprovedByUnit } from "@/lib/aggregate";
import { ArrowLeftIcon } from "@/components/icons";

export default async function ApprovedQuestionsPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const rows = await getAllSubmissions();
  const byUnit = buildApprovedByUnit(rows);
  const totalCount = Array.from(byUnit.values()).reduce((sum, list) => sum + list.length, 0);

  return (
    <div className="flex-1 bg-pastel-gradient px-4 py-8 sm:py-10">
      <div className="mx-auto max-w-xl">
        <div className="mb-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-1 text-sm font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-pink-deep)]">
            <ArrowLeftIcon /> 처음으로
          </Link>
          <Link href="/history" className="text-sm font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-pink-deep)]">
            나의 제출 이력 →
          </Link>
        </div>

        <h1 className="font-heading text-2xl text-[var(--color-ink)] sm:text-3xl">우수 질문 모음</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="badge badge-level">승인된 질문 {totalCount}개</span>
          <span className="badge badge-pending">익명 공개</span>
        </div>

        {totalCount === 0 ? (
          <p className="mt-8 text-sm text-[var(--color-ink-soft)]">아직 승인된 질문이 없어요.</p>
        ) : (
          <div className="mt-6 flex flex-col gap-7">
            {Array.from(byUnit.entries()).map(([unit, items]) => (
              <div key={unit}>
                <div className="flex items-baseline gap-2">
                  <h2 className="font-heading text-base text-[var(--color-ink)]">{unit}</h2>
                  <span className="text-xs text-[var(--color-ink-muted)]">{items.length}개</span>
                </div>
                <ol className="mt-2 flex flex-col gap-2">
                  {items.map((item, i) => (
                    <li key={i} className="card flex gap-3 px-4 py-3 text-sm text-[var(--color-ink)]">
                      <span className="shrink-0 font-semibold text-[var(--color-pink-deep)]">{i + 1}.</span>
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
