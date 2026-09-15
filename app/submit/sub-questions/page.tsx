import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { isTeacherEmail } from "@/lib/teacher-auth";
import { getSubmissionsByEmail } from "@/lib/sheets";
import SubQuestionsForm from "@/components/SubQuestionsForm";
import { ArrowLeftIcon } from "@/components/icons";

export default async function SubQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ ts?: string; q?: string; unit?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { ts, q, unit } = await searchParams;
  if (!ts || !q) redirect("/history");

  // 필수 단계("질문 수정하기")를 안 거쳤으면 여기로 못 들어오게 막는다 - 카드의
  // "질문 수정하기" 버튼이 기본 진입로지만, URL을 직접 쳐서 들어오는 경우까지
  // 막으려면 서버에서 한 번 더 확인해야 한다.
  const rows = await getSubmissionsByEmail(session.user?.email || "");
  const row = rows.find((r) => r.timestamp === ts);
  if (row && !row.revisedAt) {
    redirect(`/submit/edit?ts=${encodeURIComponent(ts)}`);
  }

  return (
    <div className="flex-1 bg-pastel-gradient px-4 py-10">
      <div className="mx-auto max-w-xl">
        <div className="mb-4 flex items-center justify-between">
          <Link
            href={`/submit/edit?ts=${encodeURIComponent(ts)}`}
            className="flex items-center gap-1 rounded-full bg-[var(--color-cream-200)] px-3 py-1.5 text-sm font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-lavender)] hover:text-[var(--color-pink-deep)]"
          >
            <ArrowLeftIcon /> 질문 수정하기
          </Link>
        </div>
        <h1 className="font-heading text-2xl text-[var(--color-ink)]">보조질문 만들기</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          메인 질문을 여러 각도로 쪼개 보세요. 최소 3개를 채우면 AI 코멘트를 받을 수 있어요.
        </p>
        <div className="mt-6">
          <SubQuestionsForm
            timestamp={ts}
            mainQuestion={q}
            unit={unit || ""}
            isTeacherView={isTeacherEmail(session.user?.email)}
          />
        </div>
      </div>
    </div>
  );
}
