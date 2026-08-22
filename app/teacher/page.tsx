import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { isTeacherEmail } from "@/lib/teacher-auth";
import { getAllSubmissions, getAllInquiryRecords } from "@/lib/sheets";
import { approvalBadgeClass } from "@/lib/badge";
import TeacherAccessDenied from "@/components/TeacherAccessDenied";
import Breadcrumb from "@/components/Breadcrumb";
import TeacherModeTabs from "@/components/TeacherModeTabs";
import { QuestionRecordCard } from "@/components/QuestionRecordCard";
import {
  buildStudentLatest,
  buildStudentQuestionHistory,
  buildBanStats,
  buildUnitStats,
  listUnitsByRecency,
  buildInquiryRecordByMainTimestamp,
  type StudentLatest,
  type BanStat,
  type UnitStat,
} from "@/lib/aggregate";
import type { InquiryRecord, SubmissionRow } from "@/lib/types";

// 단원 → 반 → 학생 순으로 드릴다운하는 계층형 대시보드. searchParams의 unit/ban 유무로
// 지금 몇 단계인지 결정한다(unit 없으면 1단계, unit만 있으면 2단계, 둘 다 있으면 3단계).
// 여러 단원을 가로지르는 종합 보기는 /teacher/all이 따로 맡는다.
export default async function TeacherPage({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string; ban?: string; student?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  if (!isTeacherEmail(session.user.email)) return <TeacherAccessDenied />;

  const { unit: unitParam, ban: banParam, student: studentEmail } = await searchParams;
  const rows = await getAllSubmissions();
  const units = listUnitsByRecency(rows);
  const selectedUnit = unitParam && units.includes(unitParam) ? unitParam : "";

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
          <TeacherModeTabs active="unit" />
        </div>

        {!selectedUnit ? (
          <UnitListStage rows={rows} units={units} />
        ) : !banParam ? (
          <BanStage unit={selectedUnit} unitRows={rows.filter((r) => r.unit === selectedUnit)} />
        ) : (
          <StudentBanStage unit={selectedUnit} ban={banParam} allRows={rows} highlightEmail={studentEmail} />
        )}

      </div>
    </div>
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

// ===== 1단계: 단원 목록 =====
function UnitListStage({ rows, units }: { rows: SubmissionRow[]; units: string[] }) {
  const unitStats = buildUnitStats(rows);
  return (
    <>
      <div className="mt-6">
        <Breadcrumb items={[{ label: "단원 목록" }]} />
      </div>
      <Section title={`교과 단원 (${units.length}개)`}>
        {unitStats.length === 0 ? (
          <EmptyState>아직 제출된 질문이 없어요</EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {unitStats.map((u) => (
              <Link
                key={u.unit}
                href={`/teacher?unit=${encodeURIComponent(u.unit)}`}
                className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm hover:border-indigo-300 hover:bg-indigo-50/40"
              >
                <div className="font-semibold text-zinc-900">{u.unit}</div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-500 sm:grid-cols-4">
                  <div>
                    <dt>총 제출</dt>
                    <dd className="font-medium text-zinc-800">{u.total}</dd>
                  </div>
                  <div>
                    <dt>참여 학생</dt>
                    <dd className="font-medium text-zinc-800">{u.studentCount}명</dd>
                  </div>
                  <div>
                    <dt>승인율</dt>
                    <dd className="font-medium text-zinc-800">{(u.approvalRate * 100).toFixed(1)}%</dd>
                  </div>
                  <div>
                    <dt>평균 점수</dt>
                    <dd className="font-medium text-zinc-800">{u.avgScore.toFixed(2)}</dd>
                  </div>
                </dl>
              </Link>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
// ===== 2단계: 선택한 단원의 반별 현황 =====
function BanStage({ unit, unitRows }: { unit: string; unitRows: SubmissionRow[] }) {
  const bans = buildBanStats(unitRows);
  return (
    <>
      <div className="mt-6">
        <Breadcrumb items={[{ label: "단원 목록", href: "/teacher" }, { label: unit }]} />
      </div>
      <Section title={`반별 현황 — ${unit}`}>
        <BanTable unit={unit} bans={bans} />
      </Section>
    </>
  );
}

function BanTable({ unit, bans }: { unit: string; bans: BanStat[] }) {
  if (bans.length === 0) return <EmptyState>데이터 없음</EmptyState>;
  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-zinc-200 bg-white sm:block">
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
            {bans.map((b) => (
              <tr key={b.ban} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                <td className="px-4 py-2.5 font-medium text-zinc-900">
                  <Link
                    href={`/teacher?unit=${encodeURIComponent(unit)}&ban=${encodeURIComponent(b.ban)}`}
                    className="underline decoration-dotted underline-offset-2 hover:text-indigo-600"
                  >
                    {b.ban}반
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

      <div className="grid grid-cols-2 gap-3 sm:hidden">
        {bans.map((b) => (
          <Link
            key={b.ban}
            href={`/teacher?unit=${encodeURIComponent(unit)}&ban=${encodeURIComponent(b.ban)}`}
            className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
          >
            <div className="text-sm font-semibold text-zinc-900">{b.ban}반</div>
            <dl className="mt-2 space-y-1 text-xs text-zinc-500">
              <div className="flex justify-between">
                <dt>총 제출</dt>
                <dd className="font-medium text-zinc-800">{b.total}</dd>
              </div>
              <div className="flex justify-between">
                <dt>승인</dt>
                <dd className="font-medium text-zinc-800">{b.approved}</dd>
              </div>
              <div className="flex justify-between">
                <dt>승인율</dt>
                <dd className="font-medium text-zinc-800">{(b.approvalRate * 100).toFixed(1)}%</dd>
              </div>
              <div className="flex justify-between">
                <dt>평균 점수</dt>
                <dd className="font-medium text-zinc-800">{b.avgScore.toFixed(2)}</dd>
              </div>
            </dl>
          </Link>
        ))}
      </div>
    </>
  );
}

// ===== 3단계: 선택한 단원+반의 학생별 최신 상태 =====
async function StudentBanStage({
  unit,
  ban,
  allRows,
  highlightEmail,
}: {
  unit: string;
  ban: string;
  allRows: SubmissionRow[];
  highlightEmail?: string;
}) {
  const unitRows = allRows.filter((r) => r.unit === unit);
  const students = buildStudentLatest(unitRows).filter((s) => s.ban === ban);
  const allInquiryRecords = await getAllInquiryRecords();
  const recordByMainTs = buildInquiryRecordByMainTimestamp(allInquiryRecords);

  return (
    <>
      <div className="mt-6">
        <Breadcrumb
          items={[
            { label: "단원 목록", href: "/teacher" },
            { label: unit, href: `/teacher?unit=${encodeURIComponent(unit)}` },
            { label: `${ban}반` },
          ]}
        />
      </div>
      <Section title={`학생별 최신 상태 — ${unit} · ${ban}반 (${students.length}명)`}>
        <StudentTable
          students={students}
          unitRows={unitRows}
          recordByMainTs={recordByMainTs}
          highlightEmail={highlightEmail}
        />
      </Section>
    </>
  );
}

// 학생별 최신 상태 표 - 각 학생은 접힌 한 줄(최신 질문 판정 요약)로 표시되고, 펼치면
// 그 학생이 이 단원에 낸 제출 전체(1차/2차 등 다회차 포함)가 각각 펼쳐볼 수 있는
// 카드로 나온다 - 예전엔 최신 1건만 보이고 나머지 회차는 "전체 보기"에서만 보였다.
// <details>/<summary>는 기본이 접힌 상태라 반/학생이 많아져도 표가 안 길어진다.
function StudentTable({
  students,
  unitRows,
  recordByMainTs,
  highlightEmail,
}: {
  students: StudentLatest[];
  unitRows: SubmissionRow[];
  recordByMainTs: Map<string, InquiryRecord>;
  highlightEmail?: string;
}) {
  if (students.length === 0) return <EmptyState>데이터 없음</EmptyState>;
  return (
    <div className="flex flex-col gap-2">
      {students.map((s) => {
        const questions = buildStudentQuestionHistory(unitRows, s.email);
        return (
          <details
            key={s.email}
            id={s.email}
            open={s.email === highlightEmail}
            className="rounded-2xl border border-zinc-200 bg-white open:shadow-sm"
          >
            <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
              <span className="font-medium text-zinc-900">
                {s.ban}반 {s.no}번 · {s.name}
              </span>
              {/* 최신 질문 자체의 AI 판정 - 펼치면 보이는 회차별 판정과는 별개로 한눈에 보는 요약 */}
              <span className="flex items-center gap-1.5">
                <span className="text-[10px] text-zinc-400">최신 질문 판정</span>
                <span className="rounded-full bg-zinc-900 px-2.5 py-0.5 text-xs font-semibold text-white">
                  {s.level || "채점 대기중"}
                </span>
                {s.score !== "" && <span className="text-xs text-zinc-500">{s.score}점</span>}
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold text-white ${approvalBadgeClass(
                    s.approval
                  )}`}
                >
                  {s.approval || "처리중"}
                </span>
              </span>
              <span className="text-xs text-zinc-400">총 {s.count}회 제출</span>
              <span className="ml-auto max-w-[45%] min-w-0 truncate text-xs text-zinc-500">{s.question}</span>
            </summary>

            <div className="flex flex-col gap-2 border-t border-zinc-100 px-4 py-4">
              {questions.length === 0 ? (
                <p className="text-xs text-zinc-400">아직 채점 완료된 제출이 없어요</p>
              ) : (
                questions.map((q) => (
                  <QuestionRecordCard key={q.timestamp} q={q} record={recordByMainTs.get(q.timestamp)} />
                ))
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
