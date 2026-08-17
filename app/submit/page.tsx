import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import SubmitForm from "@/components/SubmitForm";

export default async function SubmitPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="flex-1 bg-zinc-50 px-4 py-10">
      <div className="mx-auto max-w-xl">
        <div className="mb-4 flex items-center justify-between">
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800">
            ← 처음으로
          </Link>
          <Link href="/history" className="text-sm text-zinc-500 hover:text-zinc-800">
            내 제출 이력 →
          </Link>
        </div>
        <h1 className="text-xl font-semibold text-zinc-900">탐구 질문 제출하기</h1>
        <p className="mt-1 text-sm text-zinc-500">
          질문을 적고 제출하면 AI 코치가 구조를 살펴보고 바로 피드백을 줍니다.
        </p>
        <div className="mt-6">
          <SubmitForm />
        </div>
      </div>
    </div>
  );
}
