import { promises as fs } from "fs";
import path from "path";
import { google } from "googleapis";
import type { SubmissionRow } from "./types";
import { SHEET_COLUMNS } from "./types";

// ===== 실행 모드 =====
// GOOGLE_SERVICE_ACCOUNT_KEY와 SPREADSHEET_ID가 둘 다 설정돼 있으면 실제 Google Sheets에
// 연결합니다. 둘 중 하나라도 없으면 로컬 JSON 파일을 "가짜 시트"처럼 써서 동작합니다 -
// Google Cloud 설정 전에도 앱 전체 흐름(제출 → AI 채점 → 이력 조회)을 바로 확인할 수 있게 하기
// 위한 것입니다. 실제 배포 시에는 이 두 환경변수만 채우면 자동으로 진짜 Sheets를 씁니다.
const DEMO_MODE =
  !process.env.GOOGLE_SERVICE_ACCOUNT_KEY || !process.env.SPREADSHEET_ID;

const UNIT_SHEET_NAME = "단원_자료";
const LOG_SHEET_NAME = "제출_판정_로그";

// SubmissionRow에서 number | "" 타입인 컬럼들. types.ts와 반드시 일치시킬 것.
const NUMERIC_COLUMNS = new Set<keyof SubmissionRow>([
  "aiScore",
  "fact",
  "causal",
  "compare",
  "sentence",
  "integration",
]);

// ===== 데모 모드: 로컬 JSON 파일 저장소 =====
const DEMO_FILE = path.join(process.cwd(), "data", "demo-store.json");

interface DemoStore {
  units: { title: string; readingText: string }[];
  submissions: SubmissionRow[];
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
    return JSON.parse(raw) as DemoStore;
  } catch {
    const initial: DemoStore = { units: [SEED_UNIT], submissions: [] };
    await fs.mkdir(path.dirname(DEMO_FILE), { recursive: true });
    await fs.writeFile(DEMO_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
}

async function writeDemoStore(store: DemoStore): Promise<void> {
  await fs.mkdir(path.dirname(DEMO_FILE), { recursive: true });
  await fs.writeFile(DEMO_FILE, JSON.stringify(store, null, 2));
}

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

// ===== 공개 API =====

export async function getUnits(): Promise<{ title: string; readingText: string }[]> {
  if (DEMO_MODE) {
    const store = await readDemoStore();
    return store.units;
  }
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `${UNIT_SHEET_NAME}!A2:B`,
  });
  const rows = res.data.values || [];
  return rows
    .filter((r) => r[0])
    .map((r) => ({ title: String(r[0]).trim(), readingText: String(r[1] || "") }));
}

export async function getGroundingTextForUnit(unitTitle: string): Promise<string> {
  const units = await getUnits();
  const found = units.find((u) => u.title === unitTitle.trim());
  if (!found) {
    throw new Error(
      `"${UNIT_SHEET_NAME}"에서 단원명 "${unitTitle}"을 찾을 수 없습니다. 드롭다운 값과 단원 자료의 단원명이 정확히 일치하는지 확인하세요.`
    );
  }
  return found.readingText;
}

// 같은 학생이 같은 단원에 60초 안에 다시 제출했는지 확인 (Apps Script checkAbuseFlag_와 동일)
export async function checkAbuseFlag(email: string, unit: string): Promise<string> {
  const rows = await getSubmissionsByEmail(email);
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
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `${LOG_SHEET_NAME}!A1`,
    valueInputOption: "RAW",
    requestBody: { values },
  });
}

// 제출_판정_로그 전체 행 (최신순 정렬). 교사 대시보드/우수질문 목록이 공유해서 씀.
export async function getAllSubmissions(): Promise<SubmissionRow[]> {
  if (DEMO_MODE) {
    const store = await readDemoStore();
    return [...store.submissions].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `${LOG_SHEET_NAME}!A2:X`,
  });
  const rows = res.data.values || [];
  const parsed: SubmissionRow[] = rows.map((r) => {
    const obj: Record<string, unknown> = {};
    SHEET_COLUMNS.forEach((key, i) => {
      const raw = r[i] ?? "";
      // Sheets API는 셀 값을 전부 문자열로 돌려주므로, 숫자 컬럼은 여기서 한 번 변환해둔다
      // (안 그러면 typeof 검사로 숫자만 골라 쓰는 집계 로직이 전부 빈 값으로 취급함).
      obj[key] = NUMERIC_COLUMNS.has(key) && raw !== "" ? Number(raw) : raw;
    });
    return obj as unknown as SubmissionRow;
  });
  return parsed.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

export async function getSubmissionsByEmail(email: string): Promise<SubmissionRow[]> {
  const rows = await getAllSubmissions();
  return rows.filter((s) => s.email === email);
}

const APPROVAL_COLUMN_LETTER = String.fromCharCode(
  65 + SHEET_COLUMNS.indexOf("approval")
);

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
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `${LOG_SHEET_NAME}!A2:X`,
  });
  const raw = res.data.values || [];
  const idx = raw.findIndex(
    (r) => r[emailCol] === email && r[timestampCol] === timestamp
  );
  if (idx === -1) return false;
  const sheetRow = idx + 2; // 1행은 헤더
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `${LOG_SHEET_NAME}!${APPROVAL_COLUMN_LETTER}${sheetRow}`,
    valueInputOption: "RAW",
    requestBody: { values: [[approval]] },
  });
  return true;
}

export function isDemoMode(): boolean {
  return DEMO_MODE;
}
