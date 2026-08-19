import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { getSubmissionsByEmail } from "@/lib/sheets";
import { approvalBadgeClass } from "@/lib/badge";

export default async function HistoryPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const rows = await getSubmissionsByEmail(session.user.email);
  const approvedCount = rows.filter((r) => r.approval === "승인").length;

  return (
    <div className="flex-1 bg-zinc-50 px-4 py-10">
      <div className="mx-auto max-w-xl">
        <div className="mb-4 flex items-center justify-between">
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800">
            ← 처음으로
          </Link>
          <Link href="/submit" className="text-sm text-zinc-500 hover:text-zinc-800">
            새 질문 제출하기 →
          </Link>
        </div>

        <h1 className="text-xl font-semibold text-zinc-900">나의 질문 제출 이력</h1>
        <div className="mt-3 flex gap-2">
          <span className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs text-indigo-700">
            총 제출 {rows.length}회
          </span>
          <span className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">
            승인 {approvedCount}회
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="mt-8 text-sm text-zinc-500">
            아직 제출한 질문이 없어요.{" "}
            <Link href="/submit" className="underline">
              첫 질문을 제출해 보세요.
            </Link>
          </p>
        ) : (
          <div className="mt-6 flex flex-col gap-3">
            {rows.map((r, i) => {
              const badgeClass = approvalBadgeClass(r.approval);
              return (
                <div key={i} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                  <div className="text-xs text-zinc-400">
                    {r.unit} · {r.round} ·{" "}
                    {r.timestamp ? new Date(r.timestamp).toLocaleString("ko-KR") : ""}
                  </div>
                  <div className="mt-1 font-medium text-zinc-900">{r.question}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="rounded-full bg-zinc-900 px-2.5 py-0.5 text-xs font-semibold text-white">
                      {r.aiLevel || "채점 대기중"}
                    </span>
                    {r.aiScore !== "" && (
                      <span className="text-xs text-zinc-500">{r.aiScore}점</span>
                    )}
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold text-white ${badgeClass}`}>
                      {r.approval || "처리중"}
                    </span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-700">
                    {r.feedback || (r.status?.startsWith("오류") ? r.status : "피드백을 준비 중이에요.")}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
