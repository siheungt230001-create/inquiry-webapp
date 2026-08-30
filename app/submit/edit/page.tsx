import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import EditQuestionForm from "@/components/EditQuestionForm";
import { ArrowLeftIcon } from "@/components/icons";

export default async function EditQuestionPage({
  searchParams,
}: {
  searchParams: Promise<{ ts?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { ts } = await searchParams;
  if (!ts) redirect("/history");

  return (
    <div className="flex-1 bg-pastel-gradient px-4 py-10">
      <div className="mx-auto max-w-xl">
        <div className="mb-4 flex items-center justify-between">
          <Link href="/history" className="flex items-center gap-1 text-sm font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-pink-deep)]">
            <ArrowLeftIcon /> 내 제출 이력
          </Link>
        </div>
        <h1 className="font-heading text-2xl text-[var(--color-ink)]">질문 수정하기</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          학년/반/번호/이름이나 질문 내용을 고칠 수 있어요. 질문·단원·예상 레벨을 바꾸면 다시 채점돼요.
        </p>
        <div className="mt-6">
          <EditQuestionForm timestamp={ts} />
        </div>
      </div>
    </div>
  );
}
