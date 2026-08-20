import Link from "next/link";

export default function TeacherAccessDenied() {
  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm text-zinc-500">교사 계정만 접근할 수 있는 페이지예요.</p>
        <Link href="/" className="mt-4 inline-block text-sm font-medium text-indigo-600 underline">
          처음으로
        </Link>
      </div>
    </div>
  );
}
