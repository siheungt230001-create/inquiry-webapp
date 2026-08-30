import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { getGroundingTextForUnit } from "@/lib/sheets";
import SubAnswersForm from "@/components/SubAnswersForm";
import { ArrowLeftIcon } from "@/components/icons";

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
    <div className="flex-1 bg-pastel-gradient px-4 py-10">
      <div className="mx-auto max-w-xl">
        <div className="mb-4 flex items-center justify-between">
          <Link
            href={backHref}
            className="flex items-center gap-1 text-sm font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-pink-deep)]"
          >
            <ArrowLeftIcon /> 보조질문으로
          </Link>
          <Link href="/history" className="text-sm font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-pink-deep)]">
            내 제출 이력 →
          </Link>
        </div>
        <h1 className="font-heading text-2xl text-[var(--color-ink)]">보조질문 답 쓰기</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          AI 코멘트를 받은 보조질문마다 답을 찾아 적어보세요. &quot;수정 필요&quot; 질문은 그대로 답해도 되고, 앞 화면에서 다듬고 와도 돼요.
        </p>
        <div className="mt-6">
          <SubAnswersForm timestamp={ts} mainQuestion={q} readingText={readingText} unit={unit} />
        </div>
      </div>
    </div>
  );
}
