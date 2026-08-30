// 채점 결과 타입 - apps_script_자동화.gs의 RESPONSE_SCHEMA와 1:1로 대응합니다.
export type Approval = "승인" | "재제출" | "제출완료(미승인)";

export interface CriteriaScores {
  fact_accuracy: number;
  causal_depth: number;
  comparison_clarity: number;
  sentence_clarity: number;
  integration_depth: number;
}

export interface GradingResult {
  // level/score/approval은 Gemini가 1차로 채워 보내지만, app/api/submit/route.ts에서
  // lib/rubric.ts의 evaluateCriteriaScores(criteria_scores)로 재계산한 값으로 항상
  // 덮어써진다 - Gemini 자신의 판단을 최종값으로 신뢰하지 않는다.
  level: string;
  // 분석용으로 level을 미리 쪼개둔 값들 - lib/rubric.ts의 computeTrack/computeBand가
  // 계산한다. level 문자열을 굳이 파싱하지 않아도 트랙별/구간별 집계가 바로 된다.
  track: string; // "L1" | "L2" | "L3" | "L4"
  band: string; // "" | "낮음" | "높음" | "높음(우수)" (L1은 항상 "")
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
  grade: string; // 학년 - 반 번호는 학년 간 겹칠 수 있어(예: 1학년 1반/2학년 1반) 반 표기는
  // 항상 학년과 묶어서 다룬다 (lib/aggregate.ts의 classLabel/compareGradeBan 참고).
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
  levelTrack: string; // aiLevel을 분석용으로 미리 쪼갠 값 - "L1"|"L2"|"L3"|"L4"
  levelBand: string; // aiLevel을 분석용으로 미리 쪼갠 값 - ""|"낮음"|"높음"|"높음(우수)"
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
  // 여기부터는 기존 데이터 안 깨지게 반드시 맨 끝에만 추가한다(중간 삽입 금지 -
  // 실제 시트 컬럼도 위치로만 매칭되므로 순서가 어긋나면 기존 행이 통째로 밀린다).
  "levelTrack",
  "levelBand",
  "grade",
];

// "탐구_글쓰기_기록" 시트의 한 행 - 메인 질문 채점(SubmissionRow)과는 별개 탭.
// 보조질문 개수가 3~5개로 가변이라 개별 컬럼으로 안 쪼개고 JSON 문자열 하나로 담는다.
export interface InquirySubQuestion {
  label: string;
  question: string;
  answer: string;
  // AI 코멘트 판정 결과 - 새로고침/재접속 시 SubAnswersForm이 코멘트 받은(양호/수정
  // 필요 둘 다) 항목을 답변 대상으로 다시 골라내야 하므로 subQuestionsJson 안에 같이
  // 저장한다.
  status?: "양호" | "수정 필요" | null;
  comment?: string;
  // 보조질문 "답변" 내용에 대한 별도 AI 판정 - 위 status/comment(질문 자체의 구조
  // 판정)와는 독립적인 축이라 필드를 따로 둔다.
  answerStatus?: "양호" | "수정 필요" | null;
  answerComment?: string;
  // 답을 어디서 찾았는지(교과서 쪽수, 자료명 등) - SubAnswersForm에서 답을 적은 항목은
  // 필수로 강제한다(화면단 검증). 타입은 optional로 두는데, 이 필드가 생기기 전에
  // 저장된 옛날 항목은 그냥 undefined로 읽히기 때문 - 그런 레코드까지 강제로 채울
  // 방법은 없으니 표시 쪽(SubQuestionList)에서는 없으면 그냥 안 보여준다.
  source?: string;
}

export interface InquiryRecord {
  timestamp: string; // ISO, 이 레코드의 유일 키
  email: string;
  ban: string;
  no: string;
  name: string;
  unit: string;
  mainQuestionTimestamp: string; // 원본 SubmissionRow.timestamp와 연결
  mainQuestion: string;
  subQuestionsJson: string; // JSON.stringify(InquirySubQuestion[])
  intro: string;
  body: string;
  conclusion: string;
  // 서론(0~1)/본론(0~2.5)/결론(0~1)/사실정확성(0~0.5) - AI가 매긴 점수. total은
  // 코드가 넷을 더해 계산한다(lib/subQuestionFlow.ts의 computeEssayTotal).
  introScore: number | "";
  bodyScore: number | "";
  conclusionScore: number | "";
  totalScore: number | "";
  // 종합 글쓰기 채점 시 Gemini가 준 코멘트(왜 이 점수인지) - 교사가 감점 이유를 바로
  // 확인할 수 있게 저장해둔다. 예전엔 계산만 하고 어디에도 저장 안 해서 화면에 낼 방법이
  // 없었다.
  comment: string;
  // 사실정확성(0 또는 0.5) - factScore가 도입되기 전에 채점된 옛날 행은 이 컬럼이 아예
  // 없어서 항상 ""로 읽힌다. 그 "" 자체를 "구버전 채점(본론 0~3 기준, 사실정확성 없음)"
  // 판별 신호로 쓴다 - components/InquiryEssayDetail.tsx의 EssayDetailSection 참고.
  factScore: number | "";
}

// 여기 새 컬럼을 추가할 땐 반드시 맨 끝에만 붙인다(중간 삽입 금지 - 실제 시트 컬럼도
// 위치로만 매칭되므로 순서가 어긋나면 기존 행이 통째로 밀린다).
export const INQUIRY_COLUMNS: (keyof InquiryRecord)[] = [
  "timestamp",
  "email",
  "ban",
  "no",
  "name",
  "unit",
  "mainQuestionTimestamp",
  "mainQuestion",
  "subQuestionsJson",
  "intro",
  "body",
  "conclusion",
  "introScore",
  "bodyScore",
  "conclusionScore",
  "totalScore",
  "comment",
  "factScore",
];

// "학생_프로필" 시트의 한 행 - 로그인 계정(email)마다 최근 입력한 학년/반/번호/이름을
// 기억해서, 다음에 같은 계정으로 들어왔을 때 제출 폼에 미리 채워주는 용도. 잠기지는
// 않으니 학생이 그 자리에서 계속 고칠 수 있고, 새로 제출/수정할 때마다 최신 값으로
// 갱신된다(app/api/submit/route.ts, app/api/submit/edit/route.ts).
export interface StudentProfile {
  email: string;
  grade: string;
  ban: string;
  no: string;
  name: string;
  updatedAt: string;
}

export const STUDENT_PROFILE_COLUMNS: (keyof StudentProfile)[] = [
  "email",
  "grade",
  "ban",
  "no",
  "name",
  "updatedAt",
];
