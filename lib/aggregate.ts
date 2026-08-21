// 교사 대시보드 / 우수질문 목록에서 쓰는 집계 함수. reference/teacher_dashboard.gs의
// refreshTeacherDashboard()와 reference/export_approved_questions.gs의 getApprovedRows_()
// 로직을 그대로 옮긴 순수 함수들 (시트 접근 없음 - lib/sheets.ts가 읽어온 rows를 받아 계산만 함).
import type { SubmissionRow, InquiryRecord } from "./types";

export interface StudentLatest {
  email: string;
  name: string;
  ban: string;
  no: string;
  unit: string;
  level: string;
  score: number | "";
  approval: string;
  count: number;
  question: string;
  feedback: string;
  fact: number | "";
  causal: number | "";
  compare: number | "";
  sentence: number | "";
  integration: number | "";
  timestamp: string; // 최신 메인 질문 제출의 timestamp - InquiryRecord.mainQuestionTimestamp와 조인용
}

export interface BanStat {
  ban: string;
  total: number;
  approved: number;
  approvalRate: number;
  avgScore: number;
}

export interface UnitStat {
  unit: string;
  total: number;
  approved: number;
  approvalRate: number;
  avgScore: number;
  studentCount: number;
  lastActivity: string;
}

export interface AllStudentSummary {
  email: string;
  name: string;
  ban: string;
  no: string;
  totalCount: number;
  unitCount: number;
  lastActivity: string;
}

export interface ApprovedItem {
  ban: string;
  no: string;
  name: string;
  unit: string;
  question: string;
  score: number | "";
}

// rows를 keyOf(row)별로 묶어서 각 그룹의 가장 최근 1건만 남긴다 - buildStudentLatest(이메일별)와
// buildStudentUnitHistory(한 학생의 단원별) 둘 다 이 로직을 그대로 쓴다.
function groupLatestBy(
  rows: SubmissionRow[],
  keyOf: (row: SubmissionRow) => string
): Map<string, StudentLatest> {
  const byKey = new Map<string, StudentLatest>();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        email: row.email,
        name: row.name,
        ban: row.ban,
        no: row.no,
        unit: row.unit,
        level: row.aiLevel,
        score: row.aiScore,
        approval: row.approval,
        count: 1,
        question: row.question,
        feedback: row.feedback,
        fact: row.fact,
        causal: row.causal,
        compare: row.compare,
        sentence: row.sentence,
        integration: row.integration,
        timestamp: row.timestamp,
      });
      continue;
    }
    existing.count += 1;
    if (new Date(row.timestamp) > new Date(existing.timestamp)) {
      existing.name = row.name;
      existing.ban = row.ban;
      existing.no = row.no;
      existing.unit = row.unit;
      existing.level = row.aiLevel;
      existing.score = row.aiScore;
      existing.approval = row.approval;
      existing.question = row.question;
      existing.feedback = row.feedback;
      existing.fact = row.fact;
      existing.causal = row.causal;
      existing.compare = row.compare;
      existing.sentence = row.sentence;
      existing.integration = row.integration;
      existing.timestamp = row.timestamp;
    }
  }
  return byKey;
}

// 학생별 최신 상태: 이메일별 가장 최근 제출 1건, 반 → 번호 순 정렬.
export function buildStudentLatest(rows: SubmissionRow[]): StudentLatest[] {
  const byEmail = groupLatestBy(rows, (r) => r.email);
  return Array.from(byEmail.values()).sort((a, b) => {
    const banDiff = (Number(a.ban) || 0) - (Number(b.ban) || 0);
    if (banDiff !== 0) return banDiff;
    return (Number(a.no) || 0) - (Number(b.no) || 0);
  });
}

// 한 학생이 낸 메인 질문 전부(단원 안 가리고, 묶지 않고) - 최신순. "전체 보기"의 학생
// 상세 화면에서 질문 목록으로 보여준다(같은 단원 재제출도 각각 별도 항목으로 나온다).
export function buildStudentQuestionHistory(rows: SubmissionRow[], email: string): SubmissionRow[] {
  return rows
    .filter((r) => r.email === email)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

// 제출이 있는 단원 목록, 가장 최근 제출이 있는 단원 순으로 정렬 (대시보드 단원 드롭다운용).
export function listUnitsByRecency(rows: SubmissionRow[]): string[] {
  const latestByUnit = new Map<string, string>();
  for (const row of rows) {
    if (!row.unit) continue;
    const prev = latestByUnit.get(row.unit);
    if (!prev || new Date(row.timestamp) > new Date(prev)) {
      latestByUnit.set(row.unit, row.timestamp);
    }
  }
  return Array.from(latestByUnit.entries())
    .sort((a, b) => new Date(b[1]).getTime() - new Date(a[1]).getTime())
    .map(([unit]) => unit);
}

// 반별 현황: 반 번호별 총 제출 수 / 승인 수 / 승인율 / 평균 점수, 반 번호 오름차순.
export function buildBanStats(rows: SubmissionRow[]): BanStat[] {
  const byBan = new Map<string, { total: number; approved: number; scoreSum: number; scoreCount: number }>();
  for (const row of rows) {
    if (row.ban === "" || row.ban === null || row.ban === undefined) continue;
    const acc = byBan.get(row.ban) || { total: 0, approved: 0, scoreSum: 0, scoreCount: 0 };
    acc.total += 1;
    if (row.approval === "승인") acc.approved += 1;
    if (typeof row.aiScore === "number") {
      acc.scoreSum += row.aiScore;
      acc.scoreCount += 1;
    }
    byBan.set(row.ban, acc);
  }
  return Array.from(byBan.entries())
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([ban, b]) => ({
      ban,
      total: b.total,
      approved: b.approved,
      approvalRate: b.total ? b.approved / b.total : 0,
      avgScore: b.scoreCount ? b.scoreSum / b.scoreCount : 0,
    }));
}

// 교사 대시보드 1단계(단원 목록) - 단원별 총 제출/승인/승인율/평균점수/참여 학생 수,
// 가장 최근 활동이 있는 단원 순으로 정렬.
export function buildUnitStats(rows: SubmissionRow[]): UnitStat[] {
  const byUnit = new Map<
    string,
    { total: number; approved: number; scoreSum: number; scoreCount: number; emails: Set<string>; last: string }
  >();
  for (const row of rows) {
    if (!row.unit) continue;
    const acc = byUnit.get(row.unit) || {
      total: 0,
      approved: 0,
      scoreSum: 0,
      scoreCount: 0,
      emails: new Set<string>(),
      last: row.timestamp,
    };
    acc.total += 1;
    if (row.approval === "승인") acc.approved += 1;
    if (typeof row.aiScore === "number") {
      acc.scoreSum += row.aiScore;
      acc.scoreCount += 1;
    }
    if (row.email) acc.emails.add(row.email);
    if (new Date(row.timestamp) > new Date(acc.last)) acc.last = row.timestamp;
    byUnit.set(row.unit, acc);
  }
  return Array.from(byUnit.entries())
    .map(([unit, a]) => ({
      unit,
      total: a.total,
      approved: a.approved,
      approvalRate: a.total ? a.approved / a.total : 0,
      avgScore: a.scoreCount ? a.scoreSum / a.scoreCount : 0,
      studentCount: a.emails.size,
      lastActivity: a.last,
    }))
    .sort((x, y) => new Date(y.lastActivity).getTime() - new Date(x.lastActivity).getTime());
}

// "전체 보기" 1단계(학생 목록) - 단원을 가로질러 학생별로 총 제출 수/참여 단원 수/최근
// 활동 시각만 요약. 세부 점수는 학생을 클릭해 들어간 buildStudentUnitHistory에서 본다.
export function buildAllStudentsSummary(rows: SubmissionRow[]): AllStudentSummary[] {
  const byEmail = new Map<
    string,
    { name: string; ban: string; no: string; totalCount: number; units: Set<string>; last: string }
  >();
  for (const row of rows) {
    if (!row.email) continue;
    const acc = byEmail.get(row.email) || {
      name: row.name,
      ban: row.ban,
      no: row.no,
      totalCount: 0,
      units: new Set<string>(),
      last: row.timestamp,
    };
    acc.totalCount += 1;
    if (row.unit) acc.units.add(row.unit);
    if (new Date(row.timestamp) > new Date(acc.last)) {
      acc.last = row.timestamp;
      acc.name = row.name;
      acc.ban = row.ban;
      acc.no = row.no;
    }
    byEmail.set(row.email, acc);
  }
  return Array.from(byEmail.entries())
    .map(([email, a]) => ({
      email,
      name: a.name,
      ban: a.ban,
      no: a.no,
      totalCount: a.totalCount,
      unitCount: a.units.size,
      lastActivity: a.last,
    }))
    .sort((x, y) => {
      const banDiff = (Number(x.ban) || 0) - (Number(y.ban) || 0);
      if (banDiff !== 0) return banDiff;
      return (Number(x.no) || 0) - (Number(y.no) || 0);
    });
}

// 승인된 질문만 단원별로 묶어서 점수 내림차순. 원본 exportApprovedQuestionsDoc처럼 익명
// 공유가 기본 목적이라 이름/반은 여기서 담되, 표시 여부는 페이지(app/approved-questions)에서 결정.
export function buildApprovedByUnit(rows: SubmissionRow[]): Map<string, ApprovedItem[]> {
  const approved: ApprovedItem[] = rows
    .filter((row) => row.approval === "승인")
    .map((row) => ({
      ban: row.ban,
      no: row.no,
      name: row.name,
      unit: row.unit,
      question: row.question,
      score: row.aiScore,
    }))
    .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));

  const byUnit = new Map<string, ApprovedItem[]>();
  for (const item of approved) {
    const list = byUnit.get(item.unit) || [];
    list.push(item);
    byUnit.set(item.unit, list);
  }
  return byUnit;
}

// 메인 질문 timestamp → 그 질문에 딸린 탐구 글쓰기 기록. records는 getAllInquiryRecords()가
// 이미 최신순으로 정렬해서 주므로, 같은 mainQuestionTimestamp가 여러 번 나와도 먼저
// 만나는 게 최신 기록이다(upsertInquiryRecord가 학생당 행 하나만 유지하므로 실제로는
// 중복이 안 생기지만, 과거 데이터에 중복이 남아있어도 안전하게 처리하려고 첫 매칭만 쓴다).
export function buildInquiryRecordByMainTimestamp(
  records: InquiryRecord[]
): Map<string, InquiryRecord> {
  const map = new Map<string, InquiryRecord>();
  for (const r of records) {
    if (!r.mainQuestionTimestamp || map.has(r.mainQuestionTimestamp)) continue;
    map.set(r.mainQuestionTimestamp, r);
  }
  return map;
}

export type InquiryStage =
  | "메인 질문만 제출됨"
  | "보조질문 작성 중"
  | "보조질문 답변 작성 중"
  | "종합 글쓰기 작성 중"
  | "종합 글쓰기 완료";

// 학생이 지금 실제로 어느 단계에 있는지 판단한다. 예전엔 "진행중"/"완료" 두 값으로만
// 뭉뚱그렸는데, 보조질문 단계를 건너뛰고(history 화면의 "종합 글쓰기로 이동" 링크로)
// 바로 종합 글쓰기를 시작한 경우까지 전부 "보조질문 작성 중"으로 잘못 표시되는 문제가
// 있었다. app/page.tsx의 "이어서 작성하기" 링크도 같은 판단 기준을 써야 하므로 여기
// 하나로 모아둔다.
export function inquiryStageOf(record: InquiryRecord | undefined): InquiryStage {
  if (!record) return "메인 질문만 제출됨";
  if (record.totalScore !== "") return "종합 글쓰기 완료";
  if ([record.intro, record.body, record.conclusion].some((v) => v.trim())) {
    return "종합 글쓰기 작성 중";
  }
  let subQuestions: { status?: string | null }[] = [];
  try {
    subQuestions = JSON.parse(record.subQuestionsJson || "[]");
  } catch {
    subQuestions = [];
  }
  if (subQuestions.some((s) => s.status === "양호")) return "보조질문 답변 작성 중";
  return "보조질문 작성 중";
}

export function inquiryStageBadgeClass(stage: InquiryStage): string {
  if (stage === "종합 글쓰기 완료") return "bg-emerald-500";
  if (stage === "메인 질문만 제출됨") return "bg-zinc-400";
  return "bg-amber-500";
}

// 학생별 최신 상태 표의 각 행을 펼쳤을 때 보여줄 탐구 글쓰기 기록들 - 이메일별로 묶는다.
// records는 이미 최신순으로 정렬된 채로 오므로 그룹 내부 순서도 그대로 최신순 유지.
export function buildInquiryByEmail(records: InquiryRecord[]): Map<string, InquiryRecord[]> {
  const map = new Map<string, InquiryRecord[]>();
  for (const r of records) {
    const list = map.get(r.email) || [];
    list.push(r);
    map.set(r.email, list);
  }
  return map;
}

// 교사 대시보드 "탐구 글쓰기 기록" 섹션 - 선택된 단원/반으로 필터링(이미 최신순 정렬된 채로 옴).
export function filterInquiryRecords(
  records: InquiryRecord[],
  unit: string,
  ban: string
): InquiryRecord[] {
  return records.filter(
    (r) => (!unit || r.unit === unit) && (!ban || r.ban === ban)
  );
}
