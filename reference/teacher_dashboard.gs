/**
 * 교사 대시보드 새로고침
 * - '제출_판정_로그'를 읽어서 '교사_대시보드' 탭의 "학생별 최신 상태"와
 *   "표본 검토 대상(자가평가 불일치·남용의심)"을 다시 계산해 채웁니다.
 * - "전체 현황"과 "단원별 현황"은 Sheets 수식(COUNTIFS 등)이라 이 스크립트 없이도
 *   자동으로 최신 값을 보여줍니다. 이 스크립트는 "학생별 최신 상태"처럼 수식으로
 *   만들기 까다로운 집계표만 담당합니다.
 *
 * 설치: apps_script_자동화.gs, export_approved_questions.gs 와 같은 Apps Script
 * 프로젝트에 새 파일로 추가하세요 (같은 스프레드시트에 연결된 프로젝트).
 * ⚠️ apps_script_자동화.gs(Code.gs)가 반드시 같은 프로젝트에 있어야 합니다 — 이 파일은
 * 그 파일이 선언한 LOG_SHEET_NAME/COL 전역 변수를 그대로 가져다 쓰고, 여기서 다시
 * 선언하지 않습니다 (다시 선언하면 다른 파일의 COL을 덮어써서 자동 채점이 깨집니다).
 *
 * 실행 방법: 함수 선택 드롭다운에서 refreshTeacherDashboard 선택 후 실행.
 * (또는 export_approved_questions.gs의 메뉴 "교사 대시보드 새로고침" 클릭)
 */

var DASH_SHEET_NAME = '교사_대시보드';

// build_sheets.py로 만든 '교사_대시보드' 탭 레이아웃 기준 헤더 행 번호입니다.
// 탭을 직접 다시 만들었다면 이 숫자를 실제 헤더 행 번호에 맞게 바꾸세요.
var STUDENT_TABLE_HEADER_ROW = 19;
var REVIEW_TABLE_HEADER_ROW = 24;
var BAN_TABLE_HEADER_ROW = 29; // "반별 현황" 표 (여러 반 운영 시 사용)
var MAX_ROWS_TO_CLEAR = 200; // 한 반 인원 등을 고려한 여유분
var MAX_BAN_ROWS_TO_CLEAR = 20; // 반 개수(최대 20반까지) 여유분

function refreshTeacherDashboard() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var logSheet = ss.getSheetByName(LOG_SHEET_NAME);
  var dashSheet = ss.getSheetByName(DASH_SHEET_NAME);
  if (!logSheet || !dashSheet) {
    throw new Error('"' + LOG_SHEET_NAME + '" 또는 "' + DASH_SHEET_NAME + '" 탭을 찾을 수 없습니다.');
  }
  var data = logSheet.getDataRange().getValues();

  var byStudent = {}; // key: 이메일
  var byBan = {};     // key: 반 번호 - 여러 반 운영 시 반별 현황 집계용
  var reviewRows = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var email = row[COL.EMAIL - 1];
    if (!email) continue; // 빈 행 스킵

    var ban = row[COL.BAN - 1];
    var ts = row[COL.TIMESTAMP - 1];
    var approval = row[COL.APPROVAL - 1];
    var score = row[COL.AI_SCORE - 1];

    if (!byStudent[email] || new Date(ts) > new Date(byStudent[email].ts)) {
      byStudent[email] = {
        ts: ts,
        name: row[COL.NAME - 1],
        ban: ban,
        no: row[COL.NO - 1],
        unit: row[COL.UNIT - 1],
        level: row[COL.AI_LEVEL - 1],
        score: score,
        approval: approval,
        count: 0,
      };
    }
    byStudent[email].count += 1;

    // 반별 현황 (모든 제출 기준 - 8개 반처럼 여러 반을 한 시트에서 같이 운영할 때
    // 반 번호로 빠르게 훑어볼 수 있도록 별도로 집계합니다)
    if (ban !== '' && ban !== null) {
      if (!byBan[ban]) byBan[ban] = { total: 0, approved: 0, scoreSum: 0, scoreCount: 0 };
      byBan[ban].total += 1;
      if (approval === '승인') byBan[ban].approved += 1;
      if (typeof score === 'number') {
        byBan[ban].scoreSum += score;
        byBan[ban].scoreCount += 1;
      }
    }

    var mismatch = row[COL.MISMATCH - 1];
    var abuse = row[COL.ABUSE_FLAG - 1];
    if (mismatch || abuse) {
      var signal = mismatch ? '자가평가 불일치' + (abuse ? ' + 남용의심' : '') : '남용의심';
      reviewRows.push([row[COL.NAME - 1], row[COL.ROUND - 1], signal, mismatch || abuse]);
    }
  }

  // ---- 학생별 최신 상태 표 다시 쓰기 (반 → 번호 순, 8개 반을 순서대로 훑어보기 좋음) ----
  var studentDataRow = STUDENT_TABLE_HEADER_ROW + 1;
  dashSheet.getRange(studentDataRow, 2, MAX_ROWS_TO_CLEAR, 8).clearContent();
  var studentKeys = Object.keys(byStudent);
  studentKeys.sort(function (a, b) {
    var sa = byStudent[a], sb = byStudent[b];
    if (sa.ban !== sb.ban) return (sa.ban || 0) - (sb.ban || 0);
    return (sa.no || 0) - (sb.no || 0);
  });
  studentKeys.forEach(function (email, idx) {
    var s = byStudent[email];
    dashSheet.getRange(studentDataRow + idx, 2, 1, 8).setValues([[
      s.name, s.ban, s.no, s.unit, s.level, s.score, s.approval, s.count,
    ]]);
  });

  // ---- 반별 현황 표 다시 쓰기 ----
  var banDataRow = BAN_TABLE_HEADER_ROW + 1;
  dashSheet.getRange(banDataRow, 2, MAX_BAN_ROWS_TO_CLEAR, 5).clearContent();
  var banKeys = Object.keys(byBan).sort(function (a, b) { return Number(a) - Number(b); });
  banKeys.forEach(function (ban, idx) {
    var b = byBan[ban];
    var avgScore = b.scoreCount ? (b.scoreSum / b.scoreCount) : 0;
    var approvalRate = b.total ? (b.approved / b.total) : 0;
    var r = dashSheet.getRange(banDataRow + idx, 2, 1, 5);
    r.setValues([[ban + '반', b.total, b.approved, approvalRate, avgScore]]);
    r.getCell(1, 4).setNumberFormat('0.0%');
    r.getCell(1, 5).setNumberFormat('0.00');
  });

  // ---- 표본 검토 대상 표 다시 쓰기 ----
  var reviewDataRow = REVIEW_TABLE_HEADER_ROW + 1;
  dashSheet.getRange(reviewDataRow, 2, MAX_ROWS_TO_CLEAR, 4).clearContent();
  reviewRows.forEach(function (r, idx) {
    dashSheet.getRange(reviewDataRow + idx, 2, 1, 4).setValues([r]);
  });

  SpreadsheetApp.getUi().alert(
    '교사 대시보드를 새로고침했습니다.\n' +
    '학생 ' + studentKeys.length + '명 (' + banKeys.length + '개 반), 검토 대상 ' + reviewRows.length + '건.'
  );
}
