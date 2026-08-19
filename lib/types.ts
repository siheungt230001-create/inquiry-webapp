// 채점 결과 타입 - apps_script_자동화.gs의 RESPONSE_SCHEMA와 1:1로 대응합니다.
export type Level = "L1" | "L2" | "L3" | "L4";
export type Approval = "승인" | "재제출" | "제출완료(미승인)";

export interface CriteriaScores {
  fact_accuracy: number;
  causal_depth: number;
  comparison_clarity: number;
  sentence_clarity: number;
  integration_depth: number;
}

export interface GradingResult {
  level: Level;
  score: number;
  criteria_scores: CriteriaScores;
  approval: Approval;
  self_assessment_mismatch: string;
  feedback_text: string;
}

// 제출_판정_로그 시트의 한 행. 순서가 곧 시트 컬럼 순서입니다 (Apps Script의 COL과 동일).
export interface SubmissionRow {
  timestamp: string; // ISO
  email: string;
  ban: string;
  no: string;
  name: string;
  unit: string;
  round: string;
  question: string;
  selfLevel: string;
  textbookLink: string;
  doubt: string;
  status: string; // 처리중 | 완료 | 오류: ...
  aiLevel: string;
  aiScore: number | "";
  fact: number | "";
  causal: number | "";
  compare: number | "";
  sentence: number | "";
  integration: number | "";
  approval: string;
  mismatch: string;
  feedback: string;
  processedAt: string;
  abuseFlag: string;
}

// 시트에 쓸 때 컬럼 순서 그대로 나열 (apps_script_자동화.gs COL과 반드시 일치시킬 것)
export const SHEET_COLUMNS: (keyof SubmissionRow)[] = [
  "timestamp",
  "email",
  "ban",
  "no",
  "name",
  "unit",
  "round",
  "question",
  "selfLevel",
  "textbookLink",
  "doubt",
  "status",
  "aiLevel",
  "aiScore",
  "fact",
  "causal",
  "compare",
  "sentence",
  "integration",
  "approval",
  "mismatch",
  "feedback",
  "processedAt",
  "abuseFlag",
];
