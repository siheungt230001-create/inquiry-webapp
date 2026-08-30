import Link from "next/link";
import { auth } from "@/auth";
import { isDemoMode } from "@/lib/sheets";
import SignOutButton from "@/components/SignOutButton";

export default async function Home() {
  const session = await auth();
  const demo = isDemoMode();

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-pastel-gradient px-4">
      <div className="w-full max-w-md">
        {demo && (
          <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-xs text-amber-700">
            지금은 데모 모드로 동작 중입니다. 제출 내용은 Google Sheets가 아니라 이 서버의
            임시 파일에 저장돼요. 실제 운영하려면 SPREADSHEET_ID·서비스 계정 환경변수를
            설정하세요.
          </div>
        )}

        <div className="card p-8 text-center">
          <h1 className="font-heading text-3xl text-[var(--color-ink)]">역사 탐구 질문 코치</h1>
          <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
            질문을 다듬으면 탐구가 깊어져요. AI 코치와 함께 좋은 질문을 만들어 보세요.
          </p>

          {session ? (
            <div className="mt-6 flex flex-col gap-3">
              <p className="text-sm text-[var(--color-ink)]">
                {session.user?.name || session.user?.email}님, 환영합니다.
              </p>
              <Link href="/submit" className="btn-primary">
                질문 제출하기
              </Link>
              <Link href="/history" className="btn-secondary">
                내 제출 이력 보기
              </Link>
              <div className="mt-2">
                <SignOutButton />
              </div>
            </div>
          ) : (
            <Link href="/login" className="btn-primary mt-6 inline-block">
              로그인하고 시작하기
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
