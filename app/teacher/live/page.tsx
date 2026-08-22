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
  listUnitsByRecency,
  buildInquiryRecordByMainTimestamp,
  buildLiveClassStatus,
  classLabel,
  type BanStat,
} from "@/lib/aggregate";
import type { SubmissionRow } from "@/lib/types";

// 프로젝터로 띄워놓고 수업 중 보는 반 전체 실시간 현황판 - 진입하자마자(단원이
// 하나뿐이면 그 단원, 여럿이면 가장 최근 단원) 반 목록이 바로 보이게 한다.
// 예전엔 단원 목록 → 단원 선택 → 반 목록까지 클릭 두 번이 필요했는데, 단원 선택은
// 상단 탭으로 옮기고 반 목록은 항상 같은 화면에 바로 보여준다.
export default async function TeacherLivePage({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string; grade?: string; ban?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  if (!isTeacherEmail(session.user.email)) return <TeacherAccessDenied />;

  const { unit: unitParam, grade: gradeParam, ban: banParam } = await searchParams;
  const rows = await getAllSubmissions();
  const units = listUnitsByRecency(rows);
  // 쿼리의 unit이 유효하지 않거나 없으면 가장 최근 활동이 있는 단원으로 기본 선택한다.
  const selectedUnit = unitParam && units.includes(unitParam) ? unitParam : units[0] || "";
  const unitRows = rows.filter((r) => r.unit === selectedUnit);

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

        {units.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-zinc-200 bg-white px-4 py-6 text-center text-sm text-zinc-400">
            아직 제출된 질문이 없어요
          </div>
        ) : (
          <>
            {units.length > 1 && (
              <div className="mt-6 flex flex-wrap gap-2">
                {units.map((u) => (
                  <Link
                    key={u}
                    href={`/teacher/live?unit=${encodeURIComponent(u)}`}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                      u === selectedUnit ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                    }`}
                  >
                    {u}
                  </Link>
                ))}
              </div>
            )}

            {banParam !== undefined ? (
              <LiveStage
                unit={selectedUnit}
                grade={gradeParam ?? ""}
                ban={banParam}
                unitRows={unitRows}
              />
            ) : (
              <ClassListStage unit={selectedUnit} unitRows={unitRows} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ===== 반 목록 - 진입 직후 바로 보이는 화면 =====
function ClassListStage({ unit, unitRows }: { unit: string; unitRows: SubmissionRow[] }) {
  const classes = buildBanStats(unitRows);
  return (
    <>
      <div className="mt-6">
        <Breadcrumb items={[{ label: unit }]} />
      </div>
      <section className="mt-2">
        {classes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 bg-white px-4 py-6 text-center text-sm text-zinc-400">
            데이터 없음
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {classes.map((c: BanStat) => (
              <Link
                key={`${c.grade}-${c.ban}`}
                href={`/teacher/live?unit=${encodeURIComponent(unit)}&grade=${encodeURIComponent(
                  c.grade
                )}&ban=${encodeURIComponent(c.ban)}`}
                className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm hover:border-indigo-300 hover:bg-indigo-50/40"
              >
                <div className="text-lg font-semibold text-zinc-900">{classLabel(c.grade, c.ban)}</div>
                <div className="mt-1 text-xs text-zinc-500">총 {c.total}건 제출</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

// ===== 선택한 반 학생 전원의 실시간 현황 =====
async function LiveStage({
  unit,
  grade,
  ban,
  unitRows,
}: {
  unit: string;
  grade: string;
  ban: string;
  unitRows: SubmissionRow[];
}) {
  const students = buildStudentLatest(unitRows).filter((s) => s.ban === ban && s.grade === grade);
  const records = await getAllInquiryRecords();
  const recordByMainTs = buildInquiryRecordByMainTimestamp(records);
  const liveStudents = buildLiveClassStatus(students, recordByMainTs);

  return (
    <>
      <div className="mt-6">
        <Breadcrumb
          items={[
            { label: unit, href: `/teacher/live?unit=${encodeURIComponent(unit)}` },
            { label: classLabel(grade, ban) },
          ]}
        />
      </div>
      <section className="mt-2">
        <h2 className="text-sm font-semibold text-zinc-700">
          실시간 현황판 — {unit} · {classLabel(grade, ban)} ({liveStudents.length}명)
        </h2>
        <div className="mt-2">
          <LiveGrid unit={unit} grade={grade} ban={ban} initialStudents={liveStudents} />
        </div>
      </section>
    </>
  );
}
