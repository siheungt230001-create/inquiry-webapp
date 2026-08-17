// 교사 대시보드 / 우수질문 목록에서 쓰는 집계 함수. reference/teacher_dashboard.gs의
// refreshTeacherDashboard()와 reference/export_approved_questions.gs의 getApprovedRows_()
// 로직을 그대로 옮긴 순수 함수들 (시트 접근 없음 - lib/sheets.ts가 읽어온 rows를 받아 계산만 함).
import type { SubmissionRow } from "./types";

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
}

export interface BanStat {
  ban: string;
  total: number;
  approved: number;
  approvalRate: number;
  avgScore: number;
}

export interface ApprovedItem {
  ban: string;
  no: string;
  name: string;
  unit: string;
  question: string;
  score: number | "";
}

// 학생별 최신 상태: 이메일별 가장 최근 제출 1건, 반 → 번호 순 정렬.
export function buildStudentLatest(rows: SubmissionRow[]): StudentLatest[] {
  const byEmail = new Map<string, StudentLatest & { ts: string }>();
  for (const row of rows) {
    if (!row.email) continue;
    const existing = byEmail.get(row.email);
    if (!existing) {
      byEmail.set(row.email, {
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
        ts: row.timestamp,
      });
      continue;
    }
    existing.count += 1;
    if (new Date(row.timestamp) > new Date(existing.ts)) {
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
      existing.ts = row.timestamp;
    }
  }
  return Array.from(byEmail.values())
    .sort((a, b) => {
      const banDiff = (Number(a.ban) || 0) - (Number(b.ban) || 0);
      if (banDiff !== 0) return banDiff;
      return (Number(a.no) || 0) - (Number(b.no) || 0);
    })
    .map((s) => ({
      email: s.email,
      name: s.name,
      ban: s.ban,
      no: s.no,
      unit: s.unit,
      level: s.level,
      score: s.score,
      approval: s.approval,
      count: s.count,
      question: s.question,
      feedback: s.feedback,
      fact: s.fact,
      causal: s.causal,
      compare: s.compare,
      sentence: s.sentence,
      integration: s.integration,
    }));
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
