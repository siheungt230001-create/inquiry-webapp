// 교사 대시보드 / 우수질문 목록에서 쓰는 집계 함수. reference/teacher_dashboard.gs의
// refreshTeacherDashboard()와 reference/export_approved_questions.gs의 getApprovedRows_()
// 로직을 그대로 옮긴 순수 함수들 (시트 접근 없음 - lib/sheets.ts가 읽어온 rows를 받아 계산만 함).
import type { SubmissionRow, InquiryRecord } from "./types";

// 반 표기를 "학년-반" 결합 형식으로 통일한다 - 같은 반 번호가 학년마다 따로
// 존재할 수 있어서(1학년 1반과 2학년 1반은 다른 반) 학년 없이 반 번호만 쓰면
// 서로 다른 반이 섞여 보인다. 학년 정보가 없는(구버전) 데이터는 예전 표기
// 그대로("X반") 둔다 - 화면에 빈 학년을 억지로 채워 넣지 않는다.
export function classLabel(grade: string, ban: string): string {
  return grade ? `${grade}-${ban}반` : `${ban}반`;
}

// 학년(없으면 맨 뒤) → 반 번호 순 정렬 비교자. 학년/반이 관련된 모든 목록·표에서
// 공유해서 쓴다(buildStudentLatest/buildBanStats/buildAllStudentsSummary).
export function compareGradeBan(aGrade: string, aBan: string, bGrade: string, bBan: string): number {
  const g = (grade: string) => (grade === "" ? Infinity : Number(grade) || 0);
  const ga = g(aGrade);
  const gb = g(bGrade);
  // Infinity - Infinity은 NaN이라(둘 다 학년 미상일 때) 뺄셈 대신 직접 비교한다.
  if (ga !== gb) return ga < gb ? -1 : 1;
  return (Number(aBan) || 0) - (Number(bBan) || 0);
}

export interface StudentLatest {
  email: string;
  name: string;
  grade: string;
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
  grade: string;
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
  grade: string;
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
        grade: row.grade,
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

    // 채점 완료(aiLevel 있음)된 것 중 가장 최근 걸 표시용으로 쓴다 - "대기중"/"오류"인
    // 더 최근 제출이 있어도 화면엔 그 학생의 최근 "완료"된 제출을 대신 보여준다(교사가
    // 요청한 필터링: 판정 안 난 제출은 카드에 안 뜨게). 완료된 게 하나도 없으면 어쩔
    // 수 없이 가장 최근 미완료 행을 쓴다 - 이땐 "채점 대기중" 표시가 실제로 맞는 정보다.
    // rows 순서는(정렬 여부와 무관하게) 신뢰하지 않고 항상 timestamp를 직접 비교한다.
    const rowIsGraded = row.aiLevel !== "";
    const existingIsGraded = existing.level !== "";
    const isNewer = new Date(row.timestamp) > new Date(existing.timestamp);
    const shouldReplace =
      rowIsGraded !== existingIsGraded ? rowIsGraded : isNewer;

    if (shouldReplace) {
      existing.name = row.name;
      existing.grade = row.grade;
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

// 학생별 최신 상태: 이메일별 가장 최근 제출 1건, 학년 → 반 → 번호 순 정렬.
export function buildStudentLatest(rows: SubmissionRow[]): StudentLatest[] {
  const byEmail = groupLatestBy(rows, (r) => r.email);
  return Array.from(byEmail.values()).sort((a, b) => {
    const gradeBanDiff = compareGradeBan(a.grade, a.ban, b.grade, b.ban);
    if (gradeBanDiff !== 0) return gradeBanDiff;
    return (Number(a.no) || 0) - (Number(b.no) || 0);
  });
}

// 한 학생이 낸 메인 질문 전부(단원 안 가리고, 묶지 않고) - 최신순. "전체 보기"의 학생
// 상세 화면에서 질문 목록으로 보여준다(같은 단원 재제출도 각각 별도 항목으로 나온다).
// 채점이 아직 안 끝난 행(status가 "대기중"이거나 아직 완료가 아닌 경우, aiLevel이
// 비어있음)은 뺀다 - 교사가 보기엔 판정·점수가 없는 빈 카드일 뿐이라 목록만 지저분해진다.
export function buildStudentQuestionHistory(rows: SubmissionRow[], email: string): SubmissionRow[] {
  return rows
    .filter((r) => r.email === email && r.aiLevel !== "")
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

// 반별 현황: 학년+반 조합별 총 제출 수 / 승인 수 / 승인율 / 평균 점수, 학년 → 반 순
// 오름차순. 학년이 없는 반은 같은 반 번호라도 따로 묶인다(반 번호만으로는 다른
// 학년의 같은 번호 반과 구분이 안 되므로).
export function buildBanStats(rows: SubmissionRow[]): BanStat[] {
  const byClass = new Map<
    string,
    { grade: string; ban: string; total: number; approved: number; scoreSum: number; scoreCount: number }
  >();
  for (const row of rows) {
    if (row.ban === "" || row.ban === null || row.ban === undefined) continue;
    const key = `${row.grade}||${row.ban}`;
    const acc = byClass.get(key) || {
      grade: row.grade,
      ban: row.ban,
      total: 0,
      approved: 0,
      scoreSum: 0,
      scoreCount: 0,
    };
    acc.total += 1;
    if (row.approval === "승인") acc.approved += 1;
    if (typeof row.aiScore === "number") {
      acc.scoreSum += row.aiScore;
      acc.scoreCount += 1;
    }
    byClass.set(key, acc);
  }
  return Array.from(byClass.values())
    .sort((a, b) => compareGradeBan(a.grade, a.ban, b.grade, b.ban))
    .map((b) => ({
      grade: b.grade,
      ban: b.ban,
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
    { name: string; grade: string; ban: string; no: string; totalCount: number; units: Set<string>; last: string }
  >();
  for (const row of rows) {
    if (!row.email) continue;
    const acc = byEmail.get(row.email) || {
      name: row.name,
      grade: row.grade,
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
      acc.grade = row.grade;
      acc.ban = row.ban;
      acc.no = row.no;
    }
    byEmail.set(row.email, acc);
  }
  return Array.from(byEmail.entries())
    .map(([email, a]) => ({
      email,
      name: a.name,
      grade: a.grade,
      ban: a.ban,
      no: a.no,
      totalCount: a.totalCount,
      unitCount: a.units.size,
      lastActivity: a.last,
    }))
    .sort((x, y) => {
      const gradeBanDiff = compareGradeBan(x.grade, x.ban, y.grade, y.ban);
      if (gradeBanDiff !== 0) return gradeBanDiff;
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
  let subQuestions: { answer?: string }[] = [];
  try {
    subQuestions = JSON.parse(record.subQuestionsJson || "[]");
  } catch {
    subQuestions = [];
  }
  // status === "양호"만 봤었는데, "수정 필요" 받고 안 고친 질문도 답을 쓸 수 있게
  // 되면서(SubAnswersForm) 그 학생은 여기서 계속 "보조질문 작성 중"으로 잘못 잡혔다.
  // 실제로 답을 썼는지로 판단한다.
  if (subQuestions.some((s) => s.answer?.trim())) return "보조질문 답변 작성 중";
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

export interface LiveStudentStatus {
  email: string;
  grade: string;
  ban: string;
  no: string;
  name: string;
  stage: InquiryStage;
  lastActivity: string; // ISO
}

// 실시간 현황판(app/teacher/live) 용 - 반 학생 전원의 현재 단계 + 마지막 활동 시각.
// students는 buildStudentLatest가 이미 골라준 "학생별 최신 제출" 목록(반→번호 순
// 정렬 유지). InquiryRecord.timestamp는 초안 자동저장 때마다 갱신되므로
// (app/api/inquiry-writing/route.ts) 메인 질문 timestamp보다 최신이면 그게 진짜
// "마지막 활동"이다.
export function buildLiveClassStatus(
  students: StudentLatest[],
  recordByMainTs: Map<string, InquiryRecord>
): LiveStudentStatus[] {
  return students.map((s) => {
    const record = recordByMainTs.get(s.timestamp);
    const lastActivity =
      record && new Date(record.timestamp) > new Date(s.timestamp) ? record.timestamp : s.timestamp;
    return {
      email: s.email,
      grade: s.grade,
      ban: s.ban,
      no: s.no,
      name: s.name,
      stage: inquiryStageOf(record),
      lastActivity,
    };
  });
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
