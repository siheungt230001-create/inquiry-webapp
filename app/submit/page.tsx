import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import SubmitForm from "@/components/SubmitForm";
import { ArrowLeftIcon } from "@/components/icons";

export default async function SubmitPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="flex-1 bg-pastel-gradient px-4 py-10">
      <div className="mx-auto max-w-xl">
        <div className="mb-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-1 text-sm font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-pink-deep)]">
            <ArrowLeftIcon /> 처음으로
          </Link>
          <Link href="/history" className="text-sm font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-pink-deep)]">
            내 제출 이력 →
          </Link>
        </div>
        <h1 className="font-heading text-2xl text-[var(--color-ink)]">탐구 질문 제출하기</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          질문을 적고 제출하면 AI 코치가 구조를 살펴보고 바로 피드백을 줍니다.
        </p>
        <div className="mt-6">
          <SubmitForm />
        </div>
      </div>
    </div>
  );
}
