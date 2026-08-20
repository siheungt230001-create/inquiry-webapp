// 실행: npx tsx lib/aggregate.test.ts
import assert from "node:assert";
import { buildStudentLatest, buildBanStats, buildApprovedByUnit, listUnitsByRecency } from "./aggregate";
import type { SubmissionRow } from "./types";

function row(overrides: Partial<SubmissionRow>): SubmissionRow {
  return {
    timestamp: "2026-08-17T00:00:00.000Z",
    email: "a@school.kr",
    ban: "1",
    no: "1",
    name: "학생1",
    unit: "단원1",
    round: "1차",
    question: "질문",
    selfLevel: "L1 사실 확인형",
    textbookLink: "",
    doubt: "",
    status: "완료",
    aiLevel: "L1",
    levelTrack: "L1",
    levelBand: "",
    aiScore: 3,
    fact: 1,
    causal: 1,
    compare: 1,
    sentence: 1,
    integration: 1,
    approval: "재제출",
    mismatch: "",
    feedback: "",
    processedAt: "",
    abuseFlag: "",
    ...overrides,
  };
}

const rows: SubmissionRow[] = [
  row({ email: "a@school.kr", ban: "2", no: "5", timestamp: "2026-08-17T00:00:00.000Z", aiScore: 3, approval: "재제출" }),
  row({ email: "a@school.kr", ban: "2", no: "5", timestamp: "2026-08-17T01:00:00.000Z", aiScore: 4.2, approval: "승인", question: "최신 질문", name: "학생A" }),
  row({ email: "b@school.kr", ban: "1", no: "9", timestamp: "2026-08-17T00:30:00.000Z", aiScore: 4.5, approval: "승인", name: "학생B", question: "B의 질문", unit: "단원2" }),
  row({ email: "c@school.kr", ban: "1", no: "2", timestamp: "2026-08-17T00:00:00.000Z", mismatch: "자가 L3, AI L1", name: "학생C" }),
  row({ email: "d@school.kr", ban: "1", no: "3", timestamp: "2026-08-17T00:00:00.000Z", abuseFlag: "예 (10초 차이)", name: "학생D" }),
];

// 학생별 최신 상태: a는 2건 중 최신(2번째) 값이 남고 count=2, 반 순 정렬로 b(1반)가 a(2반)보다 앞.
const students = buildStudentLatest(rows);
assert.equal(students.length, 4);
assert.equal(students[0].ban, "1"); // 1반이 2반보다 먼저
assert.equal(students[students.length - 1].email, "a@school.kr"); // 2반은 맨 뒤
const aStudent = students.find((s) => s.email === "a@school.kr")!;
assert.equal(aStudent.count, 2);
assert.equal(aStudent.approval, "승인"); // 최신 값(승인)으로 덮어써야 함
assert.equal(aStudent.score, 4.2);
assert.equal(aStudent.question, "최신 질문"); // 상세 필드도 최신 값으로 덮어써야 함

// 반별 현황: 1반 3건(승인 2), 2반 2건(승인 1)
const bans = buildBanStats(rows);
assert.equal(bans.length, 2);
assert.equal(bans[0].ban, "1");
assert.equal(bans[0].total, 3);
assert.equal(bans[0].approved, 1);
assert.ok(Math.abs(bans[0].approvalRate - 1 / 3) < 1e-9);

// 단원 목록: 가장 최근 제출이 있는 단원이 먼저 (단원2가 마지막 제출, 단원1이 그다음 최신)
const units = listUnitsByRecency(rows);
assert.deepEqual(units, ["단원1", "단원2"]);

// 승인 질문 단원별 묶음: 단원1(a의 최신 승인 1건) + 단원2(b 1건), 점수 내림차순
const approved = buildApprovedByUnit(rows);
assert.equal(approved.size, 2);
assert.equal(approved.get("단원1")![0].question, "최신 질문");
assert.equal(approved.get("단원2")![0].name, "학생B");

console.log("aggregate.test.ts OK");
