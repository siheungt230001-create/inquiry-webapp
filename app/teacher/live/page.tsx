import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { isTeacherEmail } from "@/lib/teacher-auth";
import { getAllSubmissions, getAllInquiryRecords } from "@/lib/sheets";
import TeacherAccessDenied from "@/components/TeacherAccessDenied";
import Breadcrumb from "@/components/Breadcrumb";
import TeacherModeTabs from "@/components/TeacherModeTabs";
import LiveGrid from "@/components/LiveGrid";
import {
  buildStudentLatest,
  buildBanStats,
  buildUnitStats,
  listUnitsByRecency,
  buildInquiryRecordByMainTimestamp,
  buildLiveClassStatus,
  type BanStat,
  type UnitStat,
} from "@/lib/aggregate";
import type { SubmissionRow } from "@/lib/types";

// 프로젝터로 띄워놓고 수업 중 보는 반 전체 실시간 현황판 - 단원→반 선택은
// app/teacher/page.tsx와 같은 드릴다운(unit/ban 쿼리)을 그대로 쓰고, 반을 고르면
// 그 반 학생 전원을 한 화면에 카드로 보여주는 LiveGrid로 이어진다.
export default async function TeacherLivePage({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string; ban?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  if (!isTeacherEmail(session.user.email)) return <TeacherAccessDenied />;

  const { unit: unitParam, ban: banParam } = await searchParams;
  const rows = await getAllSubmissions();
  const units = listUnitsByRecency(rows);
  const selectedUnit = unitParam && units.includes(unitParam) ? unitParam : "";

  return (
    <div className="flex-1 bg-zinc-50 px-4 py-8 sm:py-10">
      <div className="mx-auto max-w-[1600px]">
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
          <TeacherModeTabs active="live" />
        </div>

        {!selectedUnit ? (
          <UnitListStage rows={rows} units={units} />
        ) : !banParam ? (
          <BanStage unit={selectedUnit} unitRows={rows.filter((r) => r.unit === selectedUnit)} />
        ) : (
          <LiveStage unit={selectedUnit} ban={banParam} allRows={rows} />
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
                href={`/teacher/live?unit=${encodeURIComponent(u.unit)}`}
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
        <Breadcrumb items={[{ label: "단원 목록", href: "/teacher/live" }, { label: unit }]} />
      </div>
      <Section title={`반별 현황 — ${unit}`}>
        {bans.length === 0 ? (
          <EmptyState>데이터 없음</EmptyState>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {bans.map((b: BanStat) => (
              <Link
                key={b.ban}
                href={`/teacher/live?unit=${encodeURIComponent(unit)}&ban=${encodeURIComponent(b.ban)}`}
                className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm hover:border-indigo-300 hover:bg-indigo-50/40"
              >
                <div className="text-lg font-semibold text-zinc-900">{b.ban}반</div>
                <div className="mt-1 text-xs text-zinc-500">총 {b.total}건 제출</div>
              </Link>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

// ===== 3단계: 선택한 단원+반 학생 전원의 실시간 현황 =====
async function LiveStage({
  unit,
  ban,
  allRows,
}: {
  unit: string;
  ban: string;
  allRows: SubmissionRow[];
}) {
  const unitRows = allRows.filter((r) => r.unit === unit);
  const students = buildStudentLatest(unitRows).filter((s) => s.ban === ban);
  const records = await getAllInquiryRecords();
  const recordByMainTs = buildInquiryRecordByMainTimestamp(records);
  const liveStudents = buildLiveClassStatus(students, recordByMainTs);

  return (
    <>
      <div className="mt-6">
        <Breadcrumb
          items={[
            { label: "단원 목록", href: "/teacher/live" },
            { label: unit, href: `/teacher/live?unit=${encodeURIComponent(unit)}` },
            { label: `${ban}반` },
          ]}
        />
      </div>
      <Section title={`실시간 현황판 — ${unit} · ${ban}반 (${liveStudents.length}명)`}>
        <LiveGrid unit={unit} ban={ban} initialStudents={liveStudents} />
      </Section>
    </>
  );
}
