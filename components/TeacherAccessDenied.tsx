import Link from "next/link";

export default function TeacherAccessDenied() {
  return (
    <div className="flex flex-1 items-center justify-center bg-pastel-gradient px-4">
      <div className="card w-full max-w-sm p-8 text-center">
        <p className="text-sm text-[var(--color-ink-soft)]">교사 계정만 접근할 수 있는 페이지예요.</p>
        <Link href="/" className="mt-4 inline-block text-sm font-medium text-[var(--color-pink-deep)] underline">
          처음으로
        </Link>
      </div>
    </div>
  );
}
