import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { isTeacherEmail } from "@/lib/teacher-auth";
import { getAllInquiryRecords } from "@/lib/sheets";
import TeacherAccessDenied from "@/components/TeacherAccessDenied";
import type { InquirySubQuestion } from "@/lib/types";

export default async function InquiryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  if (!isTeacherEmail(session.user.email)) return <TeacherAccessDenied />;

  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const records = await getAllInquiryRecords();
  const record = records.find((r) => r.timestamp === id);
  if (!record) notFound();

  let subQuestions: InquirySubQuestion[] = [];
  try {
    subQuestions = JSON.parse(record.subQuestionsJson);
  } catch {
    subQuestions = [];
  }

  return (
    <div className="flex-1 bg-zinc-50 px-4 py-10">
      <div className="mx-auto max-w-xl">
        <div className="mb-4">
          <Link
            href={`/teacher?unit=${encodeURIComponent(record.unit)}&ban=${encodeURIComponent(record.ban)}`}
            className="text-sm text-zinc-500 hover:text-zinc-800"
          >
            ← {record.unit} · {record.ban}반
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-zinc-900">탐구 글쓰기 기록</h1>
          {record.totalScore !== "" && (
            <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold text-white">
              총점 {record.totalScore} / 5.0점
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          {record.ban}반 {record.no}번 · {record.name} · {record.unit} ·{" "}
          {new Date(record.timestamp).toLocaleString("ko-KR")}
        </p>

        <div className="mt-6 flex flex-col gap-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="text-xs text-zinc-400">메인 질문</div>
            <div className="mt-1 font-bold text-zinc-900">{record.mainQuestion}</div>

            {subQuestions.length > 0 && (
              <div className="mt-3 border-t border-zinc-100 pt-3">
                <div className="text-xs text-zinc-400">보조질문과 답</div>
                <ul className="mt-1 flex flex-col gap-2">
                  {subQuestions.map((s, i) => (
                    <li key={i} className="text-sm">
                      <div className="text-zinc-700">
                        <span className="text-zinc-400">[{s.label}]</span> {s.question}
                      </div>
                      <div className="mt-0.5 text-zinc-500">
                        {s.answer ? s.answer : "(답을 안 씀)"}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-zinc-600">서론</div>
              {record.introScore !== "" && (
                <span className="text-xs text-zinc-400">{record.introScore} / 1점</span>
              )}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-800">
              {record.intro || "(작성 안 함)"}
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-zinc-600">본론</div>
              {record.bodyScore !== "" && (
                <span className="text-xs text-zinc-400">{record.bodyScore} / 3점</span>
              )}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-800">
              {record.body || "(작성 안 함)"}
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-zinc-600">결론</div>
              {record.conclusionScore !== "" && (
                <span className="text-xs text-zinc-400">{record.conclusionScore} / 1점</span>
              )}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-800">
              {record.conclusion || "(작성 안 함)"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
