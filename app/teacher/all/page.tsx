import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { isTeacherEmail } from "@/lib/teacher-auth";
import { getAllSubmissions, getAllInquiryRecords } from "@/lib/sheets";
import TeacherAccessDenied from "@/components/TeacherAccessDenied";
import Breadcrumb from "@/components/Breadcrumb";
import TeacherModeTabs from "@/components/TeacherModeTabs";
import { QuestionRecordCard } from "@/components/QuestionRecordCard";
import {
  buildAllStudentsSummary,
  buildStudentQuestionHistory,
  buildBanStats,
  buildInquiryByEmail,
  classLabel,
  type BanStat,
} from "@/lib/aggregate";
import type { SubmissionRow } from "@/lib/types";

// 단원을 가로지르는 종합 보기 - 1단계는 반 목록(전체 단원 합산), 반을 클릭하면 2단계로
// 그 반 학생 목록, 학생을 클릭하면 3단계로 그 학생의 단원별 질문 이력이 나온다.
// /teacher(단원→반→학생 드릴다운)와는 축이 다른 별도 화면(이쪽은 단원을 안 가린다).
export default async function TeacherAllPage({
  searchParams,
}: {
  searchParams: Promise<{ grade?: string; ban?: string; student?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  if (!isTeacherEmail(session.user.email)) return <TeacherAccessDenied />;

  const { grade: gradeParam, ban: banParam, student: studentEmail } = await searchParams;
  const rows = await getAllSubmissions();

  return (
    <div className="flex-1 bg-zinc-50 px-4 py-8 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex items-center justify-between">
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800">
            ← 처음으로
          </Link>
          <Link href="/approved-questions" className="text-sm text-zinc-500 hover:text-zinc-800">
            우수질문 목록 →
          </Link>
        </div>

        <h1 className="text-xl font-semibold text-zinc-900 sm:text-2xl">교사 대시보드</h1>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <TeacherModeTabs active="all" />
        </div>

        {studentEmail ? (
          <StudentHistoryStage rows={rows} email={studentEmail} />
        ) : banParam !== undefined ? (
          <StudentSummaryStage rows={rows} grade={gradeParam ?? ""} ban={banParam} />
        ) : (
          <BanListStage rows={rows} />
        )}
      </div>
    </div>
  );
}

// ===== 1단계: 반 목록(전체 단원 합산) =====
function BanListStage({ rows }: { rows: SubmissionRow[] }) {
  const bans = buildBanStats(rows);
  return (
    <>
      <div className="mt-6">
        <Breadcrumb items={[{ label: "전체 보기" }]} />
      </div>
      <Section title={`반 목록 (${bans.length}개 반, 전체 단원 합산)`}>
        {bans.length === 0 ? (
          <EmptyState>데이터 없음</EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                  <th className="px-4 py-2.5">반</th>
                  <th className="px-4 py-2.5">총 제출</th>
                  <th className="px-4 py-2.5">승인</th>
                  <th className="px-4 py-2.5">승인율</th>
                  <th className="px-4 py-2.5">평균 점수</th>
                </tr>
              </thead>
              <tbody>
                {bans.map((b: BanStat) => (
                  <tr key={`${b.grade}-${b.ban}`} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                    <td className="px-4 py-2.5 font-medium text-zinc-900">
                      <Link
                        href={`/teacher/all?grade=${encodeURIComponent(b.grade)}&ban=${encodeURIComponent(b.ban)}`}
                        className="underline decoration-dotted underline-offset-2 hover:text-indigo-600"
                      >
                        {classLabel(b.grade, b.ban)}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">{b.total}</td>
                    <td className="px-4 py-2.5">{b.approved}</td>
                    <td className="px-4 py-2.5">{(b.approvalRate * 100).toFixed(1)}%</td>
                    <td className="px-4 py-2.5">{b.avgScore.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-zinc-700">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-200 bg-white px-4 py-6 text-center text-sm text-zinc-400">
      {children}
    </div>
  );
}

// ===== 2단계: 한 반의 학생 목록(전체 단원 합산) =====
function StudentSummaryStage({ rows, grade, ban }: { rows: SubmissionRow[]; grade: string; ban: string }) {
  const students = buildAllStudentsSummary(rows.filter((r) => r.ban === ban && r.grade === grade));
  return (
    <>
      <div className="mt-6">
        <Breadcrumb items={[{ label: "전체 보기", href: "/teacher/all" }, { label: classLabel(grade, ban) }]} />
      </div>
      <Section title={`${classLabel(grade, ban)} 학생 목록 (${students.length}명, 전체 단원 합산)`}>
        {students.length === 0 ? (
          <EmptyState>데이터 없음</EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                  <th className="whitespace-nowrap px-4 py-2.5">이름</th>
                  <th className="px-4 py-2.5">반</th>
                  <th className="px-4 py-2.5">번호</th>
                  <th className="px-4 py-2.5">참여 단원 수</th>
                  <th className="px-4 py-2.5">총 제출</th>
                  <th className="px-4 py-2.5">최근 활동</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.email} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-zinc-900">
                      <Link
                        href={`/teacher/all?student=${encodeURIComponent(s.email)}`}
                        className="underline decoration-dotted underline-offset-2 hover:text-indigo-600"
                      >
                        {s.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{classLabel(s.grade, s.ban)}</td>
                    <td className="px-4 py-3">{s.no}번</td>
                    <td className="px-4 py-3">{s.unitCount}개</td>
                    <td className="px-4 py-3">{s.totalCount}회</td>
                    <td className="px-4 py-3 text-zinc-500">{new Date(s.lastActivity).toLocaleString("ko-KR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}

// ===== 2단계: 한 학생이 낸 질문 목록 - 질문을 펼치면 그 질문의 종합 글쓰기까지 바로 보인다 =====
async function StudentHistoryStage({ rows, email }: { rows: SubmissionRow[]; email: string }) {
  const questions = buildStudentQuestionHistory(rows, email);
  if (questions.length === 0) notFound();
  const { name, grade, ban, no } = questions[0];

  const allInquiryRecords = await getAllInquiryRecords();
  const studentInquiryRecords = buildInquiryByEmail(allInquiryRecords).get(email) || [];
  const recordByMainTs = new Map(studentInquiryRecords.map((r) => [r.mainQuestionTimestamp, r]));

  return (
    <>
      <div className="mt-6">
        <Breadcrumb
          items={[
            { label: "전체 보기", href: "/teacher/all" },
            {
              label: classLabel(grade, ban),
              href: `/teacher/all?grade=${encodeURIComponent(grade)}&ban=${encodeURIComponent(ban)}`,
            },
            { label: name },
          ]}
        />
      </div>
      <Section title={`${classLabel(grade, ban)} ${no}번 · ${name} — 질문 목록 (${questions.length}건)`}>
        <div className="flex flex-col gap-2">
          {questions.map((q) => (
            <QuestionRecordCard
              key={q.timestamp}
              q={q}
              record={recordByMainTs.get(q.timestamp)}
              showUnit
            />
          ))}
        </div>
      </Section>
    </>
  );
}

