import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { isTeacherEmail } from "@/lib/teacher-auth";
import { getAllSubmissions, getAllInquiryRecords } from "@/lib/sheets";
import { approvalBadgeClass, CRITERIA_ACCENTS } from "@/lib/badge";
import TeacherAccessDenied from "@/components/TeacherAccessDenied";
import Breadcrumb from "@/components/Breadcrumb";
import TeacherModeTabs from "@/components/TeacherModeTabs";
import {
  buildAllStudentsSummary,
  buildStudentQuestionHistory,
  buildBanStats,
  buildInquiryByEmail,
  inquiryStageOf,
  inquiryStageBadgeClass,
  type BanStat,
} from "@/lib/aggregate";
import type { InquiryRecord, InquirySubQuestion, SubmissionRow } from "@/lib/types";

// 단원을 가로지르는 종합 보기 - 1단계는 반 목록(전체 단원 합산), 반을 클릭하면 2단계로
// 그 반 학생 목록, 학생을 클릭하면 3단계로 그 학생의 단원별 질문 이력이 나온다.
// /teacher(단원→반→학생 드릴다운)와는 축이 다른 별도 화면(이쪽은 단원을 안 가린다).
export default async function TeacherAllPage({
  searchParams,
}: {
  searchParams: Promise<{ ban?: string; student?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  if (!isTeacherEmail(session.user.email)) return <TeacherAccessDenied />;

  const { ban: banParam, student: studentEmail } = await searchParams;
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
        ) : banParam ? (
          <StudentSummaryStage rows={rows} ban={banParam} />
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
                  <tr key={b.ban} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                    <td className="px-4 py-2.5 font-medium text-zinc-900">
                      <Link
                        href={`/teacher/all?ban=${encodeURIComponent(b.ban)}`}
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
function StudentSummaryStage({ rows, ban }: { rows: SubmissionRow[]; ban: string }) {
  const students = buildAllStudentsSummary(rows.filter((r) => r.ban === ban));
  return (
    <>
      <div className="mt-6">
        <Breadcrumb items={[{ label: "전체 보기", href: "/teacher/all" }, { label: `${ban}반` }]} />
      </div>
      <Section title={`${ban}반 학생 목록 (${students.length}명, 전체 단원 합산)`}>
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
                    <td className="px-4 py-3">{s.ban}반</td>
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
  const { name, ban, no } = questions[0];

  const allInquiryRecords = await getAllInquiryRecords();
  const studentInquiryRecords = buildInquiryByEmail(allInquiryRecords).get(email) || [];
  const recordByMainTs = new Map(studentInquiryRecords.map((r) => [r.mainQuestionTimestamp, r]));

  return (
    <>
      <div className="mt-6">
        <Breadcrumb
          items={[
            { label: "전체 보기", href: "/teacher/all" },
            { label: `${ban}반`, href: `/teacher/all?ban=${encodeURIComponent(ban)}` },
            { label: name },
          ]}
        />
      </div>
      <Section title={`${ban}반 ${no}번 · ${name} — 질문 목록 (${questions.length}건)`}>
        <div className="flex flex-col gap-2">
          {questions.map((q) => (
            <details key={q.timestamp} className="rounded-2xl border border-zinc-200 bg-white open:shadow-sm">
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
                <span className="text-xs text-zinc-400">{q.unit}</span>
                <span className="flex items-center gap-1.5">
                  <span className="text-[10px] text-zinc-400">질문 판정</span>
                  <span className="rounded-full bg-zinc-900 px-2.5 py-0.5 text-xs font-semibold text-white">
                    {q.aiLevel || "채점 대기중"}
                  </span>
                  {q.aiScore !== "" && <span className="text-xs text-zinc-500">{q.aiScore}점</span>}
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold text-white ${approvalBadgeClass(
                      q.approval
                    )}`}
                  >
                    {q.approval || "처리중"}
                  </span>
                </span>
                <span className="h-4 w-px bg-zinc-200" aria-hidden />
                <span className="flex items-center gap-1.5">
                  <span className="text-[10px] text-zinc-400">탐구 글쓰기</span>
                  <ProgressBadge record={recordByMainTs.get(q.timestamp)} />
                </span>
                <span className="whitespace-nowrap text-xs text-zinc-400">
                  {new Date(q.timestamp).toLocaleString("ko-KR")}
                </span>
                <span className="ml-auto max-w-[45%] min-w-0 truncate text-xs text-zinc-500">{q.question}</span>
              </summary>

              <div className="flex flex-col gap-4 border-t border-zinc-100 px-4 py-4">
                <div>
                  <p className="text-xs font-medium text-zinc-500">질문 원문</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-800">{q.question}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-500">AI 피드백</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">{q.feedback}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-500">세부 점수</p>
                  <div className="mt-1 max-w-md">
                    <CriteriaGrid values={[q.fact, q.causal, q.compare, q.sentence, q.integration]} />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-500">종합 글쓰기</p>
                  <div className="mt-1">
                    <EssaySection record={recordByMainTs.get(q.timestamp)} />
                  </div>
                </div>
              </div>
            </details>
          ))}
        </div>
      </Section>
    </>
  );
}

function CriteriaGrid({ values }: { values: (number | "")[] }) {
  return (
    <dl className="grid grid-cols-5 gap-2 text-center text-xs">
      {CRITERIA_ACCENTS.map((c, i) => (
        <div key={c.label} className="rounded-lg border-t-2 bg-zinc-50 px-1.5 py-1.5" style={{ borderColor: c.color }}>
          <dt style={c.textSafe ? { color: c.color } : undefined} className={c.textSafe ? undefined : "text-zinc-400"}>
            {c.label}
          </dt>
          <dd className="mt-0.5 font-semibold text-zinc-800">{values[i] === "" ? "-" : values[i]}</dd>
        </div>
      ))}
    </dl>
  );
}

// 그 질문에 이어지는 종합 글쓰기(탐구_글쓰기_기록) 내용을 펼친 자리에 바로 보여준다 -
// 링크 목록이 아니라 서론/본론/결론과 점수를 그 자리에서 읽을 수 있게(2단계면 보조질문만).
function EssaySection({ record }: { record?: InquiryRecord }) {
  if (!record) {
    return <p className="text-xs text-zinc-400">아직 보조질문 단계로 넘어가지 않았어요</p>;
  }

  let subQuestions: InquirySubQuestion[] = [];
  try {
    subQuestions = JSON.parse(record.subQuestionsJson);
  } catch {
    subQuestions = [];
  }

  if (record.totalScore === "") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
        <p className="font-medium">보조질문 작성 중이에요 (아직 종합 글쓰기 제출 전)</p>
        {subQuestions.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {subQuestions.map((s, i) => (
              <li key={i}>
                <span className="text-amber-500">[{s.label}]</span> {s.question}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-zinc-900 px-2.5 py-0.5 text-xs font-semibold text-white">
          총점 {record.totalScore} / 5.0점
        </span>
        <Link
          href={`/teacher/inquiry/${encodeURIComponent(record.timestamp)}`}
          className="text-xs text-indigo-600 hover:underline"
        >
          전체 보기 →
        </Link>
      </div>
      <EssayBlock label="서론" text={record.intro} score={record.introScore} max={1} />
      <EssayBlock label="본론" text={record.body} score={record.bodyScore} max={3} />
      <EssayBlock label="결론" text={record.conclusion} score={record.conclusionScore} max={1} />
    </div>
  );
}

function EssayBlock({
  label,
  text,
  score,
  max,
}: {
  label: string;
  text: string;
  score: number | "";
  max: number;
}) {
  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-600">{label}</span>
        {score !== "" && <span className="text-xs text-zinc-400">{score} / {max}점</span>}
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-800">{text || "(작성 안 함)"}</p>
    </div>
  );
}

function ProgressBadge({ record }: { record: InquiryRecord | undefined }) {
  const stage = inquiryStageOf(record);
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold text-white ${inquiryStageBadgeClass(stage)}`}
    >
      {stage}
    </span>
  );
}

