import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { isTeacherEmail } from "@/lib/teacher-auth";
import { getAllSubmissions } from "@/lib/sheets";
import { approvalBadgeClass } from "@/lib/badge";
import {
  buildStudentLatest,
  buildBanStats,
  listUnitsByRecency,
  type StudentLatest,
  type BanStat,
} from "@/lib/aggregate";

export default async function TeacherPage({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string; ban?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  if (!isTeacherEmail(session.user.email)) {
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

  const { unit: unitParam, ban: banParam } = await searchParams;
  const rows = await getAllSubmissions();
  const units = listUnitsByRecency(rows);
  const selectedUnit = unitParam && units.includes(unitParam) ? unitParam : units[0] || "";
  const selectedBan = banParam || "";

  const unitRows = selectedUnit ? rows.filter((r) => r.unit === selectedUnit) : rows;
  const allStudentsInUnit = buildStudentLatest(unitRows);
  const students = selectedBan
    ? allStudentsInUnit.filter((s) => s.ban === selectedBan)
    : allStudentsInUnit;
  const bans = buildBanStats(rows);

  const banHref = (ban: string) => {
    const params = new URLSearchParams();
    if (selectedUnit) params.set("unit", selectedUnit);
    if (ban && ban !== selectedBan) params.set("ban", ban);
    const qs = params.toString();
    return qs ? `/teacher?${qs}` : "/teacher";
  };

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
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700">
            학생 {students.length}명
          </span>
          <span className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700">
            {bans.length}개 반
          </span>
          {selectedBan && (
            <Link
              href={selectedUnit ? `/teacher?unit=${encodeURIComponent(selectedUnit)}` : "/teacher"}
              className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-200"
            >
              {selectedBan}반 필터 해제 ×
            </Link>
          )}
        </div>

        <Section title="반별 현황">
          <BanTable bans={bans} selectedBan={selectedBan} banHref={banHref} />
        </Section>

        <section className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-zinc-700">
              학생별 최신 상태 — {selectedUnit || "단원 없음"} ({students.length}명)
            </h2>
            {units.length > 1 && (
              <form className="flex items-center gap-2">
                <label htmlFor="unit-select" className="text-xs text-zinc-500">
                  단원
                </label>
                <input type="hidden" name="ban" value={selectedBan} />
                <select
                  id="unit-select"
                  name="unit"
                  defaultValue={selectedUnit}
                  className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs text-zinc-800 outline-none focus:border-zinc-500"
                >
                  {units.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
                >
                  보기
                </button>
              </form>
            )}
          </div>
          <div className="mt-2">
            <StudentTable students={students} />
          </div>
        </section>
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

function BanTable({
  bans,
  selectedBan,
  banHref,
}: {
  bans: BanStat[];
  selectedBan: string;
  banHref: (ban: string) => string;
}) {
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
              <tr
                key={b.ban}
                className={`border-b border-zinc-100 last:border-0 ${
                  selectedBan === b.ban ? "bg-indigo-50" : ""
                }`}
              >
                <td className="px-4 py-2.5 font-medium text-zinc-900">
                  <Link href={banHref(b.ban)} className="underline decoration-dotted underline-offset-2 hover:text-indigo-600">
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
            href={banHref(b.ban)}
            className={`rounded-2xl border p-4 shadow-sm ${
              selectedBan === b.ban ? "border-indigo-400 bg-indigo-50" : "border-zinc-200 bg-white"
            }`}
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

function CriteriaGrid({ s }: { s: StudentLatest }) {
  return (
    <dl className="grid grid-cols-5 gap-2 text-center text-xs">
      {[
        ["사실 정확성", s.fact],
        ["인과·분석 깊이", s.causal],
        ["비교·평가 요소", s.compare],
        ["문장 명료성", s.sentence],
        ["자료 통합 깊이", s.integration],
      ].map(([label, value]) => (
        <div key={label as string} className="rounded-lg bg-zinc-50 px-1.5 py-1.5">
          <dt className="text-zinc-400">{label}</dt>
          <dd className="mt-0.5 font-semibold text-zinc-800">{value === "" ? "-" : value}</dd>
        </div>
      ))}
    </dl>
  );
}

function StudentTable({ students }: { students: StudentLatest[] }) {
  if (students.length === 0) return <EmptyState>데이터 없음</EmptyState>;
  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-zinc-200 bg-white sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
              <th className="whitespace-nowrap px-4 py-2.5">이름</th>
              <th className="px-4 py-2.5">번호</th>
              <th className="px-4 py-2.5">레벨</th>
              <th className="px-4 py-2.5">총점</th>
              <th className="px-4 py-2.5">세부 점수</th>
              <th className="whitespace-nowrap px-4 py-2.5">승인여부</th>
              <th className="px-4 py-2.5">총 제출</th>
              <th className="w-[160px] max-w-[160px] px-4 py-2.5">질문 원문</th>
              <th className="min-w-[280px] px-4 py-2.5">AI 피드백</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.email} className="border-b border-zinc-100 align-top last:border-0">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-zinc-900">{s.name}</td>
                <td className="px-4 py-3">{s.no}번</td>
                <td className="px-4 py-3">{s.level}</td>
                <td className="px-4 py-3">{s.score}</td>
                <td className="px-4 py-3 w-[280px]">
                  <CriteriaGrid s={s} />
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold text-white ${approvalBadgeClass(
                      s.approval
                    )}`}
                  >
                    {s.approval || "처리중"}
                  </span>
                </td>
                <td className="px-4 py-3">{s.count}</td>
                <td className="w-[160px] max-w-[160px] whitespace-pre-wrap px-4 py-3 text-zinc-700">{s.question}</td>
                <td className="whitespace-pre-wrap px-4 py-3 text-zinc-700">{s.feedback}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 sm:hidden">
        {students.map((s) => (
          <div key={s.email} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="font-medium text-zinc-900">
                {s.ban}반 {s.no}번 · {s.name}
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold text-white ${approvalBadgeClass(
                  s.approval
                )}`}
              >
                {s.approval || "처리중"}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
              <span className="rounded-full bg-zinc-900 px-2.5 py-0.5 font-semibold text-white">
                {s.level || "채점 대기중"}
              </span>
              {s.score !== "" && <span>{s.score}점</span>}
              <span className="ml-auto">총 {s.count}회 제출</span>
            </div>

            <p className="mt-3 text-xs font-medium text-zinc-500">질문</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-800">{s.question}</p>

            <p className="mt-3 text-xs font-medium text-zinc-500">AI 피드백</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">{s.feedback}</p>

            <div className="mt-3">
              <CriteriaGrid s={s} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
