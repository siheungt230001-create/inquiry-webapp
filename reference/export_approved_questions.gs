/**
 * 승인(4.0점 이상)된 좋은 질문만 따로 모으는 도구.
 *
 * '제출_판정_로그' 시트를 이 파일과 같은 스프레드시트(Form이 연결된 그 시트)에
 * 붙여넣고 실행하세요. Gemini 연동(Apps Script 자동화, 다음 단계)이 아직 없어도
 * 이 파일 자체는 지금 바로 넣어둘 수 있습니다 — 나중에 로그가 쌓이면 그대로 동작합니다.
 *
 * 설치 방법:
 * ⚠️ 이 파일은 apps_script_자동화.gs(Code.gs)가 정의한 LOG_SHEET_NAME/COL 전역 변수를
 * 그대로 가져다 씁니다(자체적으로 다시 선언하지 않습니다) — 반드시 apps_script_자동화.gs와
 * 같은 Apps Script 프로젝트에 함께 넣어야 합니다. 둘 중 하나만 있으면 오류가 납니다.
 * 1. 이 스프레드시트의 확장 프로그램 > Apps Script 로 들어가서 이 코드를 붙여넣고 저장.
 * 2. 스프레드시트를 새로고침하면 상단 메뉴에 "질문 피드백 도구"와 "우수질문" 두 개가 생깁니다.
 * 3. "우수질문" 메뉴에서 원하는 방식으로 "우수 질문 모음"을 만드세요.
 *    - "우수 질문 모음 만들기 (Google Doc, 익명)" → 학생들에게 공유/투영할 문서 생성
 *    - "우수 질문 모음 만들기 (시트 탭)" → 스프레드시트 안에 필터된 목록 탭 생성 (선생님용, 이름 포함)
 *    - "질문 피드백 도구 > 교사 대시보드 새로고침" → teacher_dashboard.gs의
 *      refreshTeacherDashboard()를 실행합니다. 이 메뉴 항목이 동작하려면 teacher_dashboard.gs도
 *      같은 프로젝트에 추가되어 있어야 합니다.
 *
 * 참고: Google Sheets 수식만으로도 실시간 필터가 가능합니다. 새 탭 A1 셀에 아래 수식을
 * 붙여넣으면 승인된 질문이 자동으로 나열됩니다 (이 xlsx 데모 파일에는 QUERY 함수가
 * Excel/LibreOffice에는 없어서 수식이 아니라 예시 값으로만 넣어뒀습니다):
 *   =QUERY(제출_판정_로그!A2:X, "select F, H, N where T = '승인' order by N desc", 0)
 */

// LOG_SHEET_NAME과 COL은 여기서 다시 선언하지 않습니다 — apps_script_자동화.gs가
// 이미 선언한 전역 변수를 그대로 씁니다(같은 프로젝트 안이라 파일 간에 공유됩니다).
// 예전 버전에서는 이 파일이 COL을 (STATUS 등이 빠진) 더 작은 객체로 다시 선언했는데,
// 그게 apps_script_자동화.gs의 COL을 덮어써서 Form 자동 채점이 "COL.STATUS is null"
// 오류로 조용히 실패하는 원인이었습니다. 다시 선언하지 마세요.

function onOpen() {
  var ui = SpreadsheetApp.getUi();

  // 상단 메뉴 1: 질문 피드백 도구 (대시보드 등 전체 관리용)
  ui.createMenu('질문 피드백 도구')
    .addItem('교사 대시보드 새로고침', 'refreshTeacherDashboard')
    .addToUi();

  // 상단 메뉴 2: 우수질문 ("질문 피드백 도구" 옆에 따로 보이는 독립 메뉴)
  ui.createMenu('우수질문')
    .addItem('우수 질문 모음 만들기 (Google Doc, 익명)', 'exportApprovedQuestionsDoc')
    .addItem('우수 질문 모음 만들기 (시트 탭, 이름 포함)', 'exportApprovedQuestionsToSheet')
    .addToUi();
}

function getApprovedRows_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LOG_SHEET_NAME);
  if (!sheet) {
    throw new Error('"' + LOG_SHEET_NAME + '" 시트를 찾을 수 없습니다. 시트 이름을 확인하세요.');
  }
  var data = sheet.getDataRange().getValues();
  var rows = [];
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    if (row[COL.APPROVAL - 1] === '승인') {
      rows.push({
        ban: row[COL.BAN - 1],
        no: row[COL.NO - 1],
        name: row[COL.NAME - 1],
        unit: row[COL.UNIT - 1],
        question: row[COL.QUESTION - 1],
        score: row[COL.AI_SCORE - 1],
      });
    }
  }
  return rows;
}

/**
 * 학생들에게 그대로 보여줄 수 있는 익명 Google Doc을 만듭니다.
 * (이름·번호는 넣지 않습니다. 필요하면 SHOW_BAN, SHOW_SCORE를 true로 바꾸세요.)
 */
function exportApprovedQuestionsDoc() {
  var SHOW_BAN = false;   // true로 바꾸면 "2반 학생 질문"처럼 반만 표시
  var SHOW_SCORE = false; // true로 바꾸면 AI 총점도 함께 표시

  var rows = getApprovedRows_();
  var byUnit = {};
  rows.forEach(function (item) {
    if (!byUnit[item.unit]) byUnit[item.unit] = [];
    byUnit[item.unit].push(item);
  });

  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var doc = DocumentApp.create('우수 질문 모음 - ' + today);
  var body = doc.getBody();
  body.appendParagraph('이번 시간 승인된 좋은 질문 모음').setHeading(DocumentApp.ParagraphHeading.TITLE);

  var units = Object.keys(byUnit);
  if (units.length === 0) {
    body.appendParagraph('아직 승인(4.0점 이상)된 질문이 없습니다.');
  } else {
    units.forEach(function (unit) {
      body.appendParagraph(unit).setHeading(DocumentApp.ParagraphHeading.HEADING1);
      byUnit[unit].forEach(function (item) {
        var prefix = SHOW_BAN ? (item.ban + '반 학생 · ') : '';
        var suffix = SHOW_SCORE ? ('  (' + item.score + '점)') : '';
        body.appendListItem(prefix + item.question + suffix)
          .setGlyphType(DocumentApp.GlyphType.NUMBER);
      });
    });
  }

  doc.saveAndClose();
  var url = doc.getUrl();
  Logger.log('생성된 문서 링크: ' + url);
  SpreadsheetApp.getUi().alert('우수 질문 모음 Doc이 만들어졌습니다.\n' + url);
  return url;
}

/**
 * 같은 스프레드시트 안에 "우수_질문_모음" 탭을 만들어 승인된 질문을 나열합니다.
 * 선생님이 보는 용도라 이름을 포함합니다. (학생 공유용은 위 Doc 함수를 쓰세요.)
 */
function exportApprovedQuestionsToSheet() {
  var rows = getApprovedRows_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var outName = '우수_질문_모음';
  var out = ss.getSheetByName(outName);
  if (out) {
    out.clear();
  } else {
    out = ss.insertSheet(outName);
  }
  out.appendRow(['단원명', '반', '번호', '이름', '질문', 'AI_총점']);
  out.getRange(1, 1, 1, 6).setFontWeight('bold');

  rows
    .sort(function (a, b) { return b.score - a.score; })
    .forEach(function (item) {
      out.appendRow([item.unit, item.ban, item.no, item.name, item.question, item.score]);
    });

  out.autoResizeColumns(1, 6);
  SpreadsheetApp.getUi().alert('"' + outName + '" 탭에 승인된 질문 ' + rows.length + '개를 모았습니다.');
}
