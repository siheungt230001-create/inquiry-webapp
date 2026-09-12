import { promises as fs } from "fs";
import path from "path";
import { google } from "googleapis";
import type { SubmissionRow, InquiryRecord, StudentProfile } from "./types";
import { SHEET_COLUMNS, INQUIRY_COLUMNS, STUDENT_PROFILE_COLUMNS } from "./types";

// ===== 실행 모드 =====
// GOOGLE_SERVICE_ACCOUNT_KEY와 SPREADSHEET_ID가 둘 다 설정돼 있으면 실제 Google Sheets에
// 연결합니다. 둘 중 하나라도 없으면 로컬 JSON 파일을 "가짜 시트"처럼 써서 동작합니다 -
// Google Cloud 설정 전에도 앱 전체 흐름(제출 → AI 채점 → 이력 조회)을 바로 확인할 수 있게 하기
// 위한 것입니다. 실제 배포 시에는 이 두 환경변수만 채우면 자동으로 진짜 Sheets를 씁니다.
const DEMO_MODE =
  !process.env.GOOGLE_SERVICE_ACCOUNT_KEY || !process.env.SPREADSHEET_ID;

const UNIT_SHEET_NAME = "단원_자료";
const LOG_SHEET_NAME = "제출_판정_로그";
const INQUIRY_SHEET_NAME = "탐구_글쓰기_기록";
const STUDENT_PROFILE_SHEET_NAME = "학생_프로필";
// 학생이 스스로 학년/반/번호/이름을 고칠 때(app/api/profile POST)마다 한 행씩 쌓는
// 감사 로그 - 이상한 변경이 있었는지 교사가 나중에 시트에서 직접 확인할 수 있게 남긴다.
// 별도 대시보드 화면은 없다(요청 시 "구현 부담 크면 생략 가능"이라고 명시된 부가 기능).
const PROFILE_LOG_SHEET_NAME = "프로필_변경_로그";

// SubmissionRow에서 number | "" 타입인 컬럼들. types.ts와 반드시 일치시킬 것.
const NUMERIC_COLUMNS = new Set<keyof SubmissionRow>([
  "aiScore",
  "fact",
  "causal",
  "compare",
  "sentence",
  "integration",
]);

// InquiryRecord에서 number | "" 타입인 컬럼들.
const NUMERIC_INQUIRY_COLUMNS = new Set<keyof InquiryRecord>([
  "introScore",
  "bodyScore",
  "conclusionScore",
  "totalScore",
  "factScore",
]);

// ===== 데모 모드: 로컬 JSON 파일 저장소 =====
const DEMO_FILE = path.join(process.cwd(), "data", "demo-store.json");

interface ProfileChangeLogEntry {
  timestamp: string;
  email: string;
  before: { grade: string; ban: string; no: string; name: string };
  after: { grade: string; ban: string; no: string; name: string };
}

interface DemoStore {
  units: { title: string; readingText: string }[];
  submissions: SubmissionRow[];
  inquiryRecords: InquiryRecord[];
  studentProfiles: StudentProfile[];
  profileChangeLogs: ProfileChangeLogEntry[];
}

const SEED_UNIT = {
  title: "몽골 간섭과 고려의 개혁",
  readingText:
    "[원 간섭기 권문세족의 성장]\n" +
    "원은 고려에 정동행성을 설치해 일본 원정을 추진하며 물자와 군인을 요구했다. " +
    "정동행성은 고려 말까지 남아 내정 간섭에 이용되었다. 화주에 쌍성총관부, " +
    "서경에 동녕부, 제주도에 탐라총관부를 두고 고려 영토 일부를 직접 지배했다. " +
    "고려 왕자는 원에서 교육받고 원 공주와 결혼해 왕이 되었으며, '폐하'를 '전하'로, " +
    "'태자'를 '세자'로 부르는 등 왕실 호칭이 격하되었다. 원은 금·은·인삼·매 등 " +
    "특산물을 요구했고 환관과 공녀로 사람을 끌고 갔다.\n" +
    "원 간섭기에는 몽골어 통역관(예: 조인규), 응방의 관리(예: 윤수), 원에서 국왕과 " +
    "지낸 측근 등 친원 세력이 문벌 세력·무신 정권기 가문과 함께 권문세족을 " +
    "형성했다. 권문세족은 주로 음서로 관직에 진출했고, 불법적으로 대규모 농장을 " +
    "만들었으며 가난한 백성을 노비로 삼았다. 세금 낼 토지와 백성이 줄어 국가 " +
    "재정이 어려워졌다. 충선왕·충목왕이 개혁을 시도했지만 권문세족의 반발과 " +
    "원의 간섭으로 실패했다.\n\n" +
    "[공민왕의 개혁 정치]\n" +
    "14세기 중반 원이 쇠퇴하자 공민왕은 원의 간섭에서 벗어나고자 개혁을 시작했다. " +
    "기철 등 친원 세력을 제거하고, 정동행성을 축소했으며, 쌍성총관부를 공격해 " +
    "철령 이북 땅을 되찾았다. 왕실 호칭과 정치 제도를 원래대로 되돌리고 몽골식 " +
    "풍습을 금지했다. 명이 건국되고 원이 북쪽으로 쫓겨가자 원의 연호 사용을 " +
    "중지하고 명과 조공·책봉 관계를 수립했다.\n" +
    "내정 개혁으로는 정방을 없애 인사권을 되찾고, 신돈을 등용해 전민변정도감을 " +
    "설치했다. 전민변정도감은 권문세족이 불법으로 빼앗은 토지를 원래 주인에게 " +
    "돌려주고, 강제로 노비가 된 사람을 양인으로 풀어주었다. 성균관을 정비하고 " +
    "이색을 책임자로 임명해 유학 교육을 강화했는데, 이는 신진 사대부가 성장하는 " +
    "배경이 되었다. 개혁은 백성의 환영을 받았으나 권문세족의 반발, 홍건적·왜구의 " +
    "침략 속에서 신돈이 제거되고 공민왕이 시해되며 중단되었다.",
};

async function readDemoStore(): Promise<DemoStore> {
  try {
    const raw = await fs.readFile(DEMO_FILE, "utf-8");
    const parsed = JSON.parse(raw) as DemoStore;
    // 이 필드가 생기기 전에 저장된 demo-store.json이 남아있을 수 있으니 채워준다.
    if (!parsed.inquiryRecords) parsed.inquiryRecords = [];
    // factScore 도입 전 기록은 이 컬럼 자체가 없었다 - "구버전 채점" 판별에 쓰는
    // record.factScore === "" 체크가 undefined에는 안 걸리니 여기서 미리 채워준다.
    for (const r of parsed.inquiryRecords) {
      if (r.factScore === undefined) r.factScore = "";
      if (r.comment === undefined) r.comment = "";
      if (r.teacherFeedback === undefined) r.teacherFeedback = "";
      if (r.topicMismatch === undefined) r.topicMismatch = "";
      if (r.subQuestionDesignFeedback === undefined) r.subQuestionDesignFeedback = "";
      if (r.answerSufficiencyFeedback === undefined) r.answerSufficiencyFeedback = "";
      if (r.subQuestionProperNounFeedback === undefined) r.subQuestionProperNounFeedback = "";
      if (r.answerProperNounFeedback === undefined) r.answerProperNounFeedback = "";
      if (r.essayProperNounFeedback === undefined) r.essayProperNounFeedback = "";
    }
    for (const s of parsed.submissions) {
      if (s.grade === undefined) s.grade = "";
    }
    if (!parsed.studentProfiles) parsed.studentProfiles = [];
    if (!parsed.profileChangeLogs) parsed.profileChangeLogs = [];
    return parsed;
  } catch {
    const initial: DemoStore = {
      units: [SEED_UNIT],
      submissions: [],
      inquiryRecords: [],
      studentProfiles: [],
      profileChangeLogs: [],
    };
    await fs.mkdir(path.dirname(DEMO_FILE), { recursive: true });
    await fs.writeFile(DEMO_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
}

async function writeDemoStore(store: DemoStore): Promise<void> {
  await fs.mkdir(path.dirname(DEMO_FILE), { recursive: true });
  await fs.writeFile(DEMO_FILE, JSON.stringify(store, null, 2));
}

// Google Sheets API가 429(분당 요청 한도 초과)나 503(일시적 서버 오류)을 주면 잠깐
// 쉬었다 다시 시도한다 (lib/gemini.ts의 callGemini 재시도와 같은 이유 - 학생 여러
// 명이 한꺼번에 제출할 때 순간적인 한도 초과로 전체 요청이 바로 실패하지 않게 한다).
function getErrorStatus(err: unknown): number | undefined {
  const anyErr = err as { code?: number | string; status?: number; response?: { status?: number } };
  const raw = anyErr?.response?.status ?? anyErr?.status ?? anyErr?.code;
  const num = typeof raw === "string" ? Number(raw) : raw;
  return typeof num === "number" && !Number.isNaN(num) ? num : undefined;
}

// Google API가 429 응답에 Retry-After 헤더를 실어 보내면 그 값을 그대로 쓴다 -
// 분당 한도라 언제 리셋되는지는 서버가 제일 잘 안다. 없으면 지수 백오프로 대체.
function getRetryAfterMs(err: unknown): number | undefined {
  const anyErr = err as { response?: { headers?: Record<string, string> } };
  const header = anyErr?.response?.headers?.["retry-after"];
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isNaN(seconds) ? undefined : seconds * 1000;
}

// 2026-09-07 한 반 전체가 동시 접속했을 때 기존 maxAttempts=3(최대 대기 ~6초)로는
// 부족해서 429가 그대로 사용자에게 새어나갔다 - 시도 횟수를 늘리고 백오프 상한도
// 올렸었다(5회, 최대 8초). 2026-09-08 같은 반이 다시 몰리자 이번엔 그 5회/8초로도
// 부족해서 똑같이 429가 새어나갔다 - 분당 한도가 완전히 풀리려면 8초 간격 4번(약
// 18초)으로는 모자랄 수 있다는 뜻이므로 다시 늘린다(10회, 최대 20초). 호출 수
// 자체를 줄이는 캐시/batchGet이 우선이고, 이건 그래도 몰릴 때의 마지막 방어선이다.
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 10): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = getErrorStatus(err);
      const canRetry = (status === 429 || status === 503) && attempt < maxAttempts;
      if (!canRetry) throw err;
      // 지수 백오프(최대 20초) + 지터(무작위 지연) - 여러 요청이 동시에 재시도해
      // 다시 몰리는 것을 완화.
      const backoff = getRetryAfterMs(err) ?? Math.min(1500 * Math.pow(2, attempt - 1), 20000);
      const delay = backoff + Math.random() * 500;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("알 수 없는 오류로 모든 재시도가 실패했습니다.");
}

// ===== 짧은 TTL 메모리 캐시 =====
// getAllSubmissions/getAllInquiryRecords는 호출될 때마다 시트 전체를 새로 읽어온다.
// 실시간 현황판(app/teacher/live)이 10~15초마다 이 둘을 폴링하고, 교사 대시보드
// 페이지 전환도 매번 같은 걸 새로 읽다 보니 짧은 시간에 중복 읽기가 쌓여
// Google Sheets API 왕복(+ 429 걸리면 withRetry의 초 단위 백오프)이 체감 지연으로
// 이어졌다. 실시간 현황판도 완전 실시간일 필요는 없는 화면이라, 결과를 몇 초만
// 재사용해도 문제없다 - 쓰기(appendSubmission/update*/upsertInquiryRecord) 직후엔
// 캐시를 바로 비워서 방금 쓴 내용이 오래된 캐시에 가려지는 일은 없게 한다.
// 2026-09-07 한 반 전체가 동시 접속하는 시간대에 8초는 너무 짧아서(폴링 간격
// 3초와 맞물려) 같은 인스턴스에서도 캐시가 자주 만료되고 있었다 - 15초로 늘려서
// 캐시 적중률을 높인다(그만큼 학생에게 보이는 최신성은 최대 15초 늦어질 수 있음).
const CACHE_TTL_MS = 15000;
let submissionsCache: { value: SubmissionRow[]; expiresAt: number } | null = null;
let inquiryRecordsCache: { value: InquiryRecord[]; expiresAt: number } | null = null;

// getUnits/getStudentProfile은 원래 캐시가 없어서 /submit 페이지를 열 때마다(학생 수만큼,
// 매번) 시트 API를 새로 불렀다 - 2026-09-07 학생들이 몰리는 시간대에 이 두 경로가
// Google Sheets API의 "분당 읽기 요청" 프로젝트 공용 한도(429)를 넘겨서 getAllSubmissions
// 등 이미 캐시 중인 다른 경로까지 같이 429를 맞는 전면 장애로 번졌다. 단원 자료는
// 교사가 가끔만 고치므로 더 긴 TTL을 쓴다.
const UNITS_CACHE_TTL_MS = 120000;
let unitsCache: { value: { title: string; readingText: string }[]; expiresAt: number } | null = null;
const studentProfileCache = new Map<string, { value: StudentProfile | null; expiresAt: number }>();

// ===== 실제 Google Sheets 클라이언트 (서비스 계정) =====
function getSheetsClient() {
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY as string;
  // Vercel 등 환경변수에 JSON을 그대로 넣거나, base64로 인코딩해서 넣는 것 둘 다 지원합니다.
  const jsonStr = rawKey.trim().startsWith("{")
    ? rawKey
    : Buffer.from(rawKey, "base64").toString("utf-8");
  const credentials = JSON.parse(jsonStr);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

// ===== 여러 범위를 한 번의 API 호출로 묶어 읽기 =====
// 같은 요청 안에서 서로 다른 시트를 여러 번 읽어야 할 때(예: /submit 페이지 초기
// 로딩이 단원 목록+프로필+제출 이력을 동시에 필요로 함) values.get()을 range 개수만큼
// 부르는 대신 이걸로 한 번에 묶는다 - 호출 수 자체가 줄어야 429 재발을 막을 수 있다.
async function batchFetchRanges(ranges: string[]): Promise<string[][][]> {
  const sheets = getSheetsClient();
  const res = await withRetry(() =>
    sheets.spreadsheets.values.batchGet({
      spreadsheetId: process.env.SPREADSHEET_ID,
      ranges,
    })
  );
  return (res.data.valueRanges || []).map((vr) => vr.values || []);
}

function parseUnitsRows(rows: string[][]): { title: string; readingText: string }[] {
  return rows
    .filter((r) => r[0])
    .map((r) => ({ title: String(r[0]).trim(), readingText: String(r[1] || "") }));
}

function parseSubmissionRows(rows: string[][]): SubmissionRow[] {
  return rows.map((r) => {
    const obj: Record<string, unknown> = {};
    SHEET_COLUMNS.forEach((key, i) => {
      const raw = r[i] ?? "";
      // Sheets API는 셀 값을 전부 문자열로 돌려주므로, 숫자 컬럼은 여기서 한 번 변환해둔다
      // (안 그러면 typeof 검사로 숫자만 골라 쓰는 집계 로직이 전부 빈 값으로 취급함).
      obj[key] = NUMERIC_COLUMNS.has(key) && raw !== "" ? Number(raw) : raw;
    });
    return obj as unknown as SubmissionRow;
  });
}

function parseInquiryRows(rows: string[][]): InquiryRecord[] {
  return rows.map((r) => {
    const obj: Record<string, unknown> = {};
    INQUIRY_COLUMNS.forEach((key, i) => {
      const raw = r[i] ?? "";
      obj[key] = NUMERIC_INQUIRY_COLUMNS.has(key) && raw !== "" ? Number(raw) : raw;
    });
    return obj as unknown as InquiryRecord;
  });
}

function parseProfileRow(rows: string[][], email: string): StudentProfile | null {
  const row = rows.find((r) => r[0] === email);
  if (!row) return null;
  const obj: Record<string, unknown> = {};
  STUDENT_PROFILE_COLUMNS.forEach((key, i) => {
    obj[key] = row[i] ?? "";
  });
  return obj as unknown as StudentProfile;
}

function sortByTimestampDesc<T extends { timestamp: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

// ===== 공개 API =====

export async function getUnits(): Promise<{ title: string; readingText: string }[]> {
  if (DEMO_MODE) {
    const store = await readDemoStore();
    return store.units;
  }
  if (unitsCache && unitsCache.expiresAt > Date.now()) {
    return unitsCache.value;
  }
  const sheets = getSheetsClient();
  const res = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `${UNIT_SHEET_NAME}!A2:B`,
    })
  );
  const units = parseUnitsRows(res.data.values || []);
  unitsCache = { value: units, expiresAt: Date.now() + UNITS_CACHE_TTL_MS };
  return units;
}

export async function getGroundingTextForUnit(unitTitle: string): Promise<string> {
  const units = await getUnits();
  const found = units.find((u) => u.title === unitTitle.trim());
  if (!found) {
    // 학생/교사에게는 일반적인 안내만 보여주고, 어떤 단원명이 안 맞았는지는
    // 서버 로그(Vercel 로그)에만 남긴다 - 실제 제출 행에도 unit 컬럼이 그대로
    // 남아있으니 관리자는 시트에서 어느 단원이었는지 바로 확인할 수 있다.
    console.error(
      `[getGroundingTextForUnit] "${UNIT_SHEET_NAME}"에서 단원명 "${unitTitle}"을 찾을 수 없음 (드롭다운 값과 정확히 일치해야 함)`
    );
    throw new Error("해당 단원을 찾을 수 없습니다. 관리자에게 문의하세요.");
  }
  if (!found.readingText.trim()) {
    // 조용히 넘어가면 참고자료 없이 채점이 진행돼서 품질이 티 안 나게 나빠진다 -
    // 최소한 로그로는 남겨서 관리자가 나중에라도 알아챌 수 있게 한다.
    console.warn(
      `[getGroundingTextForUnit] "${unitTitle}" 단원의 읽기자료(B열)가 비어 있음 - 참고자료 없이 채점됨`
    );
  }
  return found.readingText;
}

// 같은 학생이 같은 단원에 60초 안에 다시 제출했는지 확인 (Apps Script checkAbuseFlag_와 동일).
// 호출부(app/api/submit/route.ts)가 이미 읽어온 rows를 넘겨받는다 - 학생 30명이 몰릴 때
// 같은 이메일의 제출 이력을 시트에서 두 번 읽는 걸(회차 계산용으로도 필요) 막기 위함.
export function checkAbuseFlag(rows: SubmissionRow[], unit: string): string {
  const sameUnit = rows.find((r) => r.unit === unit);
  if (!sameUnit) return "";
  const diffSec = (Date.now() - new Date(sameUnit.timestamp).getTime()) / 1000;
  return diffSec < 60 ? `예 (직전 제출과 ${Math.round(diffSec)}초 차이)` : "";
}

export async function appendSubmission(row: SubmissionRow): Promise<void> {
  if (DEMO_MODE) {
    const store = await readDemoStore();
    store.submissions.unshift(row);
    await writeDemoStore(store);
    return;
  }
  const sheets = getSheetsClient();
  const values = [SHEET_COLUMNS.map((key) => row[key] ?? "")];
  await withRetry(() =>
    sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `${LOG_SHEET_NAME}!A1`,
      valueInputOption: "RAW",
      // 학생 여러 명이 짧은 시간 안에 연달아 제출하면 OVERWRITE(기본값)는 "마지막 행이
      // 어디인지" 판단이 서로 어긋나 직전 제출 행을 덮어쓰는 경우가 있었다. INSERT_ROWS는
      // 매 호출을 실제 행 삽입 연산으로 처리해서 이 경합을 막는다.
      insertDataOption: "INSERT_ROWS",
      requestBody: { values },
    })
  );
  submissionsCache = null; // 방금 쓴 행이 다음 읽기에 바로 반영되게 캐시를 비운다
}

// 제출_판정_로그 전체 행 (최신순 정렬). 교사 대시보드/우수질문 목록이 공유해서 씀.
// 데모 모드는 로컬 파일 읽기라 이미 빠르니 캐시 없이 그대로 둔다 - 캐시는 실제 Sheets
// API 왕복 비용이 있는 경로에서만 의미 있다.
export async function getAllSubmissions(): Promise<SubmissionRow[]> {
  if (DEMO_MODE) {
    const store = await readDemoStore();
    return [...store.submissions].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }
  if (submissionsCache && submissionsCache.expiresAt > Date.now()) {
    return submissionsCache.value;
  }
  const sheets = getSheetsClient();
  const res = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `${LOG_SHEET_NAME}!A2:${LOG_LAST_COLUMN_LETTER}`,
    })
  );
  const sorted = sortByTimestampDesc(parseSubmissionRows(res.data.values || []));
  submissionsCache = { value: sorted, expiresAt: Date.now() + CACHE_TTL_MS };
  return sorted;
}

export async function getSubmissionsByEmail(email: string): Promise<SubmissionRow[]> {
  const rows = await getAllSubmissions();
  return rows.filter((s) => s.email === email);
}

// 스프레드시트 열 문자(A, B, ... Z, AA, AB, ...)로 변환 - 컬럼이 26개(Z)를 넘어가면
// String.fromCharCode(65+n) 방식은 깨지므로(SHEET_COLUMNS가 26개를 넘음) 자릿수를
// 제대로 계산한다.
function sheetColumnLetter(index0: number): string {
  let n = index0 + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const APPROVAL_COLUMN_LETTER = sheetColumnLetter(SHEET_COLUMNS.indexOf("approval"));
// 각 시트 마지막 컬럼 문자 - *_COLUMNS 배열에 컬럼 추가/삭제해도 range가 자동으로 따라감
// (하드코딩하면 컬럼 추가할 때마다 "Requested writing within range... tried writing to column" 에러 재발)
const LOG_LAST_COLUMN_LETTER = sheetColumnLetter(SHEET_COLUMNS.length - 1);
const INQUIRY_LAST_COLUMN_LETTER = sheetColumnLetter(INQUIRY_COLUMNS.length - 1);
const STUDENT_PROFILE_LAST_COLUMN_LETTER = sheetColumnLetter(STUDENT_PROFILE_COLUMNS.length - 1);

// 학생이 "질문 제출하기"로 최종 확정할 때 기존 행의 approval 칸만 제자리에서
// 덮어쓴다 (email+timestamp로 행을 특정 - appendSubmission이 매번 새 timestamp로
// 행을 추가하므로 이 조합이 사실상 유일 키다). 못 찾으면 false를 반환한다.
export async function updateSubmissionApproval(
  email: string,
  timestamp: string,
  approval: string
): Promise<boolean> {
  if (DEMO_MODE) {
    const store = await readDemoStore();
    const row = store.submissions.find(
      (s) => s.email === email && s.timestamp === timestamp
    );
    if (!row) return false;
    row.approval = approval;
    await writeDemoStore(store);
    return true;
  }
  // getAllSubmissions()는 최신순으로 정렬해서 반환하므로 그 인덱스로는 실제 시트
  // 행 번호를 알 수 없다 - 원본 행 순서가 보존된 raw 읽기로 직접 인덱스를 찾는다.
  const sheets = getSheetsClient();
  const emailCol = SHEET_COLUMNS.indexOf("email");
  const timestampCol = SHEET_COLUMNS.indexOf("timestamp");
  const res = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `${LOG_SHEET_NAME}!A2:${LOG_LAST_COLUMN_LETTER}`,
    })
  );
  const raw = res.data.values || [];
  const idx = raw.findIndex(
    (r) => r[emailCol] === email && r[timestampCol] === timestamp
  );
  if (idx === -1) return false;
  const sheetRow = idx + 2; // 1행은 헤더
  await withRetry(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `${LOG_SHEET_NAME}!${APPROVAL_COLUMN_LETTER}${sheetRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [[approval]] },
    })
  );
  submissionsCache = null;
  return true;
}

// QStash 큐 처리("대기중" 행 → 실제 채점 결과)에서 쓴다 - email+timestamp로 행을
// 찾아서 patch에 담긴 필드들로 그 행 전체를 덮어쓴다(updateSubmissionApproval과
// 같은 방식으로 행을 찾되, approval 한 칸이 아니라 여러 칸을 한 번에 갱신).
export async function updateSubmissionResult(
  email: string,
  timestamp: string,
  patch: Partial<SubmissionRow>
): Promise<boolean> {
  if (DEMO_MODE) {
    const store = await readDemoStore();
    const row = store.submissions.find(
      (s) => s.email === email && s.timestamp === timestamp
    );
    if (!row) return false;
    Object.assign(row, patch);
    await writeDemoStore(store);
    return true;
  }
  const sheets = getSheetsClient();
  const emailCol = SHEET_COLUMNS.indexOf("email");
  const timestampCol = SHEET_COLUMNS.indexOf("timestamp");
  const res = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `${LOG_SHEET_NAME}!A2:${LOG_LAST_COLUMN_LETTER}`,
    })
  );
  const raw = res.data.values || [];
  const idx = raw.findIndex(
    (r) => r[emailCol] === email && r[timestampCol] === timestamp
  );
  if (idx === -1) return false;
  const sheetRow = idx + 2; // 1행은 헤더

  const current: Record<string, unknown> = {};
  SHEET_COLUMNS.forEach((key, i) => {
    current[key] = raw[idx][i] ?? "";
  });
  const merged = { ...current, ...patch } as SubmissionRow;
  const values = [SHEET_COLUMNS.map((key) => merged[key] ?? "")];

  await withRetry(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `${LOG_SHEET_NAME}!A${sheetRow}:${LOG_LAST_COLUMN_LETTER}${sheetRow}`,
      valueInputOption: "RAW",
      requestBody: { values },
    })
  );
  submissionsCache = null;
  return true;
}

// ===== 탐구 글쓰기 기록 (별도 탭 - 메인 질문 채점 로그와 완전히 분리) =====

// email+mainQuestionTimestamp로 기존 행을 찾아 있으면 그 자리에서 통째로 덮어쓰고,
// 없으면 새로 추가한다. 2단계(보조질문만 작성)에서 만든 행을 3단계(종합 글쓰기 제출)에서
// 같은 행으로 갱신하기 위한 것 - 매번 새 행을 추가하면 학생 하나당 중복 행이 쌓인다.
// totalScore가 ""면 아직 채점 전(2단계 상태), 숫자가 채워지면 3단계 완료로 구분한다
// (별도 상태 컬럼을 안 둬도 되는 이유 - lib/aggregate.ts의 buildInquiryProgressMap 참고).
export async function upsertInquiryRecord(record: InquiryRecord): Promise<void> {
  if (DEMO_MODE) {
    const store = await readDemoStore();
    const idx = store.inquiryRecords.findIndex(
      (r) => r.email === record.email && r.mainQuestionTimestamp === record.mainQuestionTimestamp
    );
    if (idx === -1) {
      store.inquiryRecords.unshift(record);
    } else {
      store.inquiryRecords[idx] = record;
    }
    await writeDemoStore(store);
    return;
  }
  const sheets = getSheetsClient();
  const emailCol = INQUIRY_COLUMNS.indexOf("email");
  const mainTsCol = INQUIRY_COLUMNS.indexOf("mainQuestionTimestamp");
  const res = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `${INQUIRY_SHEET_NAME}!A2:${INQUIRY_LAST_COLUMN_LETTER}`,
    })
  );
  const raw = res.data.values || [];
  const idx = raw.findIndex(
    (r) => r[emailCol] === record.email && r[mainTsCol] === record.mainQuestionTimestamp
  );
  const values = [INQUIRY_COLUMNS.map((key) => record[key] ?? "")];

  if (idx === -1) {
    await withRetry(() =>
      sheets.spreadsheets.values.append({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `${INQUIRY_SHEET_NAME}!A1`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS", // appendSubmission과 같은 이유 - 동시 제출 시 덮어쓰기 방지
        requestBody: { values },
      })
    );
  } else {
    const sheetRow = idx + 2; // 1행은 헤더
    await withRetry(() =>
      sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `${INQUIRY_SHEET_NAME}!A${sheetRow}:${INQUIRY_LAST_COLUMN_LETTER}${sheetRow}`,
        valueInputOption: "RAW",
        requestBody: { values },
      })
    );
  }
  inquiryRecordsCache = null;
}

export async function getAllInquiryRecords(): Promise<InquiryRecord[]> {
  if (DEMO_MODE) {
    const store = await readDemoStore();
    return [...store.inquiryRecords].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }
  if (inquiryRecordsCache && inquiryRecordsCache.expiresAt > Date.now()) {
    return inquiryRecordsCache.value;
  }
  const sheets = getSheetsClient();
  const res = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `${INQUIRY_SHEET_NAME}!A2:${INQUIRY_LAST_COLUMN_LETTER}`,
    })
  );
  const sorted = sortByTimestampDesc(parseInquiryRows(res.data.values || []));
  inquiryRecordsCache = { value: sorted, expiresAt: Date.now() + CACHE_TTL_MS };
  return sorted;
}

// 교사 실시간 현황판(app/api/teacher/live-status)이 제출_판정_로그와 탐구_글쓰기_기록을
// 매번 같이 필요로 해서 - 캐시가 둘 다 만료된 순간(폴링 시작 직후 등)엔 values.get()을
// 두 번 부르는 대신 batchGet 한 번으로 묶는다. 한쪽만 만료됐으면 그냥 각자의 캐시 경로를 탄다.
export async function getSubmissionsAndInquiryRecords(): Promise<{
  submissions: SubmissionRow[];
  inquiryRecords: InquiryRecord[];
}> {
  if (DEMO_MODE) {
    const [submissions, inquiryRecords] = await Promise.all([
      getAllSubmissions(),
      getAllInquiryRecords(),
    ]);
    return { submissions, inquiryRecords };
  }

  const now = Date.now();
  const needSubmissions = !submissionsCache || submissionsCache.expiresAt <= now;
  const needInquiry = !inquiryRecordsCache || inquiryRecordsCache.expiresAt <= now;

  if (needSubmissions && needInquiry) {
    const [subValues, inqValues] = await batchFetchRanges([
      `${LOG_SHEET_NAME}!A2:${LOG_LAST_COLUMN_LETTER}`,
      `${INQUIRY_SHEET_NAME}!A2:${INQUIRY_LAST_COLUMN_LETTER}`,
    ]);
    const submissions = sortByTimestampDesc(parseSubmissionRows(subValues));
    submissionsCache = { value: submissions, expiresAt: now + CACHE_TTL_MS };
    const inquiryRecords = sortByTimestampDesc(parseInquiryRows(inqValues));
    inquiryRecordsCache = { value: inquiryRecords, expiresAt: now + CACHE_TTL_MS };
    return { submissions, inquiryRecords };
  }

  const submissions = needSubmissions ? await getAllSubmissions() : submissionsCache!.value;
  const inquiryRecords = needInquiry ? await getAllInquiryRecords() : inquiryRecordsCache!.value;
  return { submissions, inquiryRecords };
}

// 학생이 특정 메인 질문에 대해 지금까지 작성한 탐구 글쓰기 기록(진행중/완료 둘 다)을
// 하나 찾는다 - 페이지를 다시 열었을 때 sessionStorage가 비어 있어도(탭을 닫았다 열거나
// 다른 기기) 여기서 불러와 이어 쓸 수 있게 하기 위함.
export async function getInquiryRecord(
  email: string,
  mainQuestionTimestamp: string
): Promise<InquiryRecord | null> {
  const rows = await getAllInquiryRecords();
  return (
    rows.find(
      (r) => r.email === email && r.mainQuestionTimestamp === mainQuestionTimestamp
    ) ?? null
  );
}

// 교사가 특정 제출 건(mainRow)에 피드백을 남긴다. 이미 탐구 글쓰기 기록이 있으면
// 그 행에 teacherFeedback만 덧붙여 통째로 다시 쓰고, 아직 없으면(학생이 보조질문
// 단계로 아직 안 넘어감) 그 항목들만 빈 값인 새 행을 만든다. 새 행이라도 subQuestionsJson
// "[]"·totalScore ""는 upsertInquiryRecord/POST /api/inquiry-writing이 이미 진행중
// 레코드에 쓰는 값과 같아서, lib/aggregate.ts의 inquiryStageOf가 실제 보조질문 내용
// (question 텍스트) 유무로 판단하는 한 "메인 질문만 제출됨" 표시가 깨지지 않는다.
export async function upsertTeacherFeedback(
  mainRow: SubmissionRow,
  teacherFeedback: string
): Promise<void> {
  const existing = await getInquiryRecord(mainRow.email, mainRow.timestamp);
  const record: InquiryRecord = existing
    ? { ...existing, teacherFeedback }
    : {
        timestamp: new Date().toISOString(),
        email: mainRow.email,
        ban: mainRow.ban,
        no: mainRow.no,
        name: mainRow.name,
        unit: mainRow.unit,
        mainQuestionTimestamp: mainRow.timestamp,
        mainQuestion: mainRow.question,
        subQuestionsJson: "[]",
        intro: "",
        body: "",
        conclusion: "",
        introScore: "",
        bodyScore: "",
        conclusionScore: "",
        totalScore: "",
        comment: "",
        factScore: "",
        teacherFeedback,
        topicMismatch: "",
        subQuestionDesignFeedback: "",
        answerSufficiencyFeedback: "",
        subQuestionProperNounFeedback: "",
        answerProperNounFeedback: "",
        essayProperNounFeedback: "",
        subQuestionTypeFitFeedback: "",
      };
  await upsertInquiryRecord(record);
}

// ===== 학생 프로필 (로그인 계정별 최근 학년/반/번호/이름 기억) =====

export async function getStudentProfile(email: string): Promise<StudentProfile | null> {
  if (DEMO_MODE) {
    const store = await readDemoStore();
    return store.studentProfiles.find((p) => p.email === email) ?? null;
  }
  const cached = studentProfileCache.get(email);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  const sheets = getSheetsClient();
  const res = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `${STUDENT_PROFILE_SHEET_NAME}!A2:${STUDENT_PROFILE_LAST_COLUMN_LETTER}`,
    })
  );
  const profile = parseProfileRow(res.data.values || [], email);
  studentProfileCache.set(email, { value: profile, expiresAt: Date.now() + CACHE_TTL_MS });
  return profile;
}

// /submit 페이지가 마운트 시 필요로 하는 세 가지(단원 목록, 학년/반/번호/이름 프로필,
// "채점 대기중"인 제출이 있는지)를 한 번에 반환한다. 원래는 /api/units + /api/profile +
// /api/submit/status를 프런트가 동시에 fetch해서 서로 다른 시트를 각각 read하고 있었는데,
// 2026-09-07 한 반 전체가 동시에 이 페이지를 열면 (학생 수) x 3번의 Sheets 읽기가 같은
// 순간에 몰려 분당 한도(429)를 넘겼다 - 캐시가 이미 만료된 항목들만 batchGet 한 번으로
// 묶어서 호출 수 자체를 줄인다(전부 캐시돼 있으면 Sheets 호출이 0번).
export async function getSubmitInitData(email: string): Promise<{
  units: { title: string; readingText: string }[];
  profile: StudentProfile | null;
  pendingSubmission: SubmissionRow | null;
}> {
  if (DEMO_MODE) {
    const [units, profile, mySubmissions] = await Promise.all([
      getUnits(),
      getStudentProfile(email),
      getSubmissionsByEmail(email),
    ]);
    const pendingSubmission = mySubmissions[0]?.status === "대기중" ? mySubmissions[0] : null;
    return { units, profile, pendingSubmission };
  }

  const now = Date.now();
  const needUnits = !unitsCache || unitsCache.expiresAt <= now;
  const cachedProfile = studentProfileCache.get(email);
  const needProfile = !cachedProfile || cachedProfile.expiresAt <= now;
  const needSubmissions = !submissionsCache || submissionsCache.expiresAt <= now;

  const pendingRanges: { key: "units" | "profile" | "submissions"; range: string }[] = [];
  if (needUnits) pendingRanges.push({ key: "units", range: `${UNIT_SHEET_NAME}!A2:B` });
  if (needProfile) pendingRanges.push({ key: "profile", range: `${STUDENT_PROFILE_SHEET_NAME}!A2:${STUDENT_PROFILE_LAST_COLUMN_LETTER}` });
  if (needSubmissions) pendingRanges.push({ key: "submissions", range: `${LOG_SHEET_NAME}!A2:${LOG_LAST_COLUMN_LETTER}` });

  const fetched =
    pendingRanges.length > 0 ? await batchFetchRanges(pendingRanges.map((p) => p.range)) : [];
  const byKey = new Map(pendingRanges.map((p, i) => [p.key, fetched[i]]));

  let units: { title: string; readingText: string }[];
  if (needUnits) {
    units = parseUnitsRows(byKey.get("units")!);
    unitsCache = { value: units, expiresAt: now + UNITS_CACHE_TTL_MS };
  } else {
    units = unitsCache!.value;
  }

  let profile: StudentProfile | null;
  if (needProfile) {
    profile = parseProfileRow(byKey.get("profile")!, email);
    studentProfileCache.set(email, { value: profile, expiresAt: now + CACHE_TTL_MS });
  } else {
    profile = cachedProfile!.value;
  }

  let submissions: SubmissionRow[];
  if (needSubmissions) {
    submissions = sortByTimestampDesc(parseSubmissionRows(byKey.get("submissions")!));
    submissionsCache = { value: submissions, expiresAt: now + CACHE_TTL_MS };
  } else {
    submissions = submissionsCache!.value;
  }

  const mySubmission = submissions.find((s) => s.email === email);
  const pendingSubmission = mySubmission?.status === "대기중" ? mySubmission : null;

  return { units, profile, pendingSubmission };
}

// 학년/반/번호/이름을 새로 제출하거나 수정할 때마다 호출해서 "다음 로그인 때 미리
// 채워줄" 값을 최신으로 유지한다(app/api/submit/route.ts, app/api/submit/edit/route.ts).
// email당 한 행만 유지 - 있으면 그 자리에서 덮어쓰고, 없으면 새로 추가한다.
export async function upsertStudentProfile(
  profile: Pick<StudentProfile, "email" | "grade" | "ban" | "no" | "name">
): Promise<void> {
  const record: StudentProfile = { ...profile, updatedAt: new Date().toISOString() };
  if (DEMO_MODE) {
    const store = await readDemoStore();
    const idx = store.studentProfiles.findIndex((p) => p.email === profile.email);
    if (idx === -1) store.studentProfiles.push(record);
    else store.studentProfiles[idx] = record;
    await writeDemoStore(store);
    return;
  }
  const sheets = getSheetsClient();
  const res = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `${STUDENT_PROFILE_SHEET_NAME}!A2:${STUDENT_PROFILE_LAST_COLUMN_LETTER}`,
    })
  );
  const raw = res.data.values || [];
  const idx = raw.findIndex((r) => r[0] === profile.email);
  const values = [STUDENT_PROFILE_COLUMNS.map((key) => record[key] ?? "")];

  if (idx === -1) {
    await withRetry(() =>
      sheets.spreadsheets.values.append({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `${STUDENT_PROFILE_SHEET_NAME}!A1`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values },
      })
    );
  } else {
    const sheetRow = idx + 2; // 1행은 헤더
    await withRetry(() =>
      sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `${STUDENT_PROFILE_SHEET_NAME}!A${sheetRow}:${STUDENT_PROFILE_LAST_COLUMN_LETTER}${sheetRow}`,
        valueInputOption: "RAW",
        requestBody: { values },
      })
    );
  }
  studentProfileCache.delete(profile.email); // 방금 쓴 값이 다음 읽기에 바로 반영되게
}

// 학생이 "내 정보 수정" 화면(app/api/profile POST)에서 직접 학년/반/번호/이름을 바꿀
// 때마다 한 행 남긴다 - 실패해도 실제 프로필 갱신 자체를 막으면 안 되므로 호출부에서
// 항상 .catch(() => {})로 감싸 쓴다.
export async function appendProfileChangeLog(
  email: string,
  before: { grade: string; ban: string; no: string; name: string },
  after: { grade: string; ban: string; no: string; name: string }
): Promise<void> {
  const timestamp = new Date().toISOString();
  if (DEMO_MODE) {
    const store = await readDemoStore();
    store.profileChangeLogs.push({ timestamp, email, before, after });
    await writeDemoStore(store);
    return;
  }
  const sheets = getSheetsClient();
  const values = [
    [
      timestamp,
      email,
      before.grade,
      before.ban,
      before.no,
      before.name,
      after.grade,
      after.ban,
      after.no,
      after.name,
    ],
  ];
  await withRetry(() =>
    sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `${PROFILE_LOG_SHEET_NAME}!A1`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values },
    })
  );
}

export function isDemoMode(): boolean {
  return DEMO_MODE;
}
