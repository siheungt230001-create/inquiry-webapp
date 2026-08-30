import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { getSubmissionsByEmail, getAllInquiryRecords } from "@/lib/sheets";
import { approvalBadgeClass } from "@/lib/badge";
import { buildInquiryRecordByMainTimestamp } from "@/lib/aggregate";
import PdfDownloadButton from "@/components/PdfDownloadButton";
import { ArrowLeftIcon, ArrowRightIcon } from "@/components/icons";

export default async function HistoryPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const rows = await getSubmissionsByEmail(session.user.email);
  const inquiryRecords = await getAllInquiryRecords();
  const recordByMainTs = buildInquiryRecordByMainTimestamp(inquiryRecords);
  const approvedCount = rows.filter((r) => r.approval === "승인").length;
  // "종합 글쓰기로 돌아가기" 상단 링크는 가장 최근 제출 건(rows는 최신순 정렬)을 기준으로 함.
  const latest = rows[0];
  const latestEssayHref = latest
    ? `/submit/answer?ts=${encodeURIComponent(latest.timestamp)}&q=${encodeURIComponent(latest.question)}&unit=${encodeURIComponent(latest.unit)}`
    : null;

  return (
    <div className="flex-1 bg-pastel-gradient px-4 py-10">
      <div className="mx-auto max-w-xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <Link href="/" className="flex items-center gap-1 text-sm font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-pink-deep)]">
            <ArrowLeftIcon /> 처음으로
          </Link>
          <div className="flex items-center gap-3">
            {latestEssayHref && (
              <Link href={latestEssayHref} className="text-sm font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-pink-deep)]">
                종합 글쓰기로 돌아가기
              </Link>
            )}
            <Link href="/submit" className="text-sm font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-pink-deep)]">
              새 질문 제출하기 →
            </Link>
          </div>
        </div>

        <h1 className="font-heading text-2xl text-[var(--color-ink)]">나의 질문 제출 이력</h1>
        <div className="mt-3 flex gap-2">
          <span className="badge badge-level">총 제출 {rows.length}회</span>
          <span className="badge badge-done">승인 {approvedCount}회</span>
        </div>

        {rows.length === 0 ? (
          <p className="mt-8 text-sm text-[var(--color-ink-soft)]">
            아직 제출한 질문이 없어요.{" "}
            <Link href="/submit" className="text-[var(--color-pink-deep)] underline">
              첫 질문을 제출해 보세요.
            </Link>
          </p>
        ) : (
          <div className="mt-6 flex flex-col gap-3">
            {rows.map((r, i) => {
              const badgeClass = approvalBadgeClass(r.approval);
              // 채점이 실제로 끝나서 어떤 판정이든(승인/재제출/제출완료(미승인)) 난 카드에만
              // 종합 글쓰기 버튼을 보여준다 - 아직 처리중(빈 값)이거나 채점 오류인 카드는 제외.
              const showEssayLink =
                r.approval === "승인" ||
                r.approval === "재제출" ||
                r.approval === "제출완료(미승인)";
              const essayHref = `/submit/answer?ts=${encodeURIComponent(r.timestamp)}&q=${encodeURIComponent(r.question)}&unit=${encodeURIComponent(r.unit)}`;
              const essayLabel =
                r.approval === "승인" ? "종합 글쓰기로 이동 →" : "종합 글쓰기 다시 작성하기 →";
              const record = recordByMainTs.get(r.timestamp);
              const essayCompleted = record && record.totalScore !== "";
              return (
                <div key={i} className="card p-5">
                  <div className="text-xs font-medium text-[var(--color-ink-muted)]">
                    {r.unit} · {r.round} ·{" "}
                    {r.timestamp ? new Date(r.timestamp).toLocaleString("ko-KR") : ""}
                  </div>
                  <div className="mt-1 font-medium text-[var(--color-ink)]">{r.question}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="badge badge-level">{r.aiLevel || "채점 대기중"}</span>
                    {r.aiScore !== "" && (
                      <span className="text-xs text-[var(--color-ink-soft)]">{r.aiScore}점</span>
                    )}
                    <span className={badgeClass}>{r.approval || "처리중"}</span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--color-ink)]">
                    {r.feedback || (r.status?.startsWith("오류") ? r.status : "피드백을 준비 중이에요.")}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Link
                      href={`/submit/sub-questions?ts=${encodeURIComponent(r.timestamp)}&q=${encodeURIComponent(r.question)}&unit=${encodeURIComponent(r.unit)}`}
                      className="btn-secondary inline-flex items-center gap-1 !px-3 !py-1.5 !text-xs"
                    >
                      보조질문 만들기 <ArrowRightIcon />
                    </Link>
                    {showEssayLink && (
                      <Link
                        href={essayHref}
                        className="inline-flex items-center gap-1 rounded-full border border-[var(--color-lavender)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-lavender-deep)] hover:bg-[var(--color-cream-200)]"
                      >
                        {essayLabel.replace(" →", "")} <ArrowRightIcon />
                      </Link>
                    )}
                    {essayCompleted && <PdfDownloadButton timestamp={r.timestamp} />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
