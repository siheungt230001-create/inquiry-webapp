import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import ProfileEditForm from "@/components/ProfileEditForm";
import { ArrowLeftIcon } from "@/components/icons";

export default async function ProfilePage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="flex-1 bg-pastel-gradient px-4 py-10">
      <div className="mx-auto max-w-xl">
        <div className="mb-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-1 rounded-full bg-[var(--color-cream-200)] px-3 py-1.5 text-sm font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-lavender)] hover:text-[var(--color-pink-deep)]">
            <ArrowLeftIcon /> 처음으로
          </Link>
        </div>
        <h1 className="font-heading text-2xl text-[var(--color-ink)]">내 정보 수정</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          학년/반/번호/이름이 잘못 저장됐다면 여기서 고칠 수 있어요. 이미 제출한 질문
          기록은 그대로 남고, 다음 제출부터 새 정보가 반영돼요.
        </p>
        <div className="mt-6">
          <ProfileEditForm />
        </div>
      </div>
    </div>
  );
}
