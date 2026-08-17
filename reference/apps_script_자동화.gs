/**
 * 역사 탐구 질문 - Form 제출 → Gemini 채점 → Sheets 기록 → 학생 이메일 피드백 자동화
 *
 * ===== 설치 순서 =====
 * 1. create_form.gs로 만든 Form이 연결된 스프레드시트를 엽니다.
 * 2. 응답이 쌓이는 탭 이름을 "제출_판정_로그"로 바꿔주세요. (Form이 자동으로 만든 탭
 *    이름은 보통 "설문지 응답 시트1"입니다 - 탭 이름 위에서 우클릭 > 이름 바꾸기)
 * 3. 같은 스프레드시트에 "단원_자료" 탭을 만들고 단원명 | 그라운딩_텍스트 열을 채워주세요.
 *    (AI_피드백_스프레드시트_구조.xlsx의 '단원_자료' 탭 형식 그대로)
 * 4. 확장 프로그램 > Apps Script 에서 이 파일 내용 전체를 붙여넣고 저장합니다.
 * 5. Gemini_API_키_발급_안내.md를 따라 스크립트 속성에 GEMINI_API_KEY를 저장합니다.
 * 6. 함수 선택 드롭다운에서 testGeminiConnection 을 선택해 실행 → 로그에 정상 응답이
 *    뜨는지 확인합니다. (API 키가 맞는지 확인하는 용도)
 * 7. 함수 선택 드롭다운에서 createOnFormSubmitTrigger 를 선택해 한 번만 실행합니다.
 *    → 이후로는 학생이 Form을 제출할 때마다 자동으로 채점 + 이메일 발송이 됩니다.
 *
 * ===== 응답 탭에 피드백이 안 뜰 때 =====
 * 함수 선택 드롭다운에서 runDiagnostics 를 선택해서 실행하세요. API 키/트리거 설치 여부/
 * 단원명 일치 여부/Gemini 연결까지 한 번에 점검해서 실행 로그에 알려줍니다.
 * (제일 흔한 원인: 7번의 createOnFormSubmitTrigger를 아직 실행하지 않은 경우입니다.
 * 응답 탭 "이름"을 바꾸는 것과 트리거를 "설치"하는 것은 서로 다른 작업이라, 탭 이름만
 * 바꾸고 트리거를 설치하지 않으면 자동 채점이 전혀 실행되지 않습니다.)
 */

// ========================= 설정값 =========================
var LOG_SHEET_NAME = '제출_판정_로그';
var UNIT_SHEET_NAME = '단원_자료';
// Google이 몇 달 단위로 모델 이름을 새로 내놓거나 예전 모델을 "신규 사용자에게는
// 더 이상 제공 안 함(404)" 처리하거나, 모델별 무료 하루 한도를 갑자기 바꾸는 일이
// 흔합니다. 그래서 모델 이름 하나만 고정하지 않고, 아래 후보를 순서대로 시도하다가
// 안 되는 모델은 건너뛰고 다음 모델로 자동으로 넘어가도록 만들었습니다.
// (실제로 이 프로젝트 설계 중에도 'gemini-flash-latest' → 무료 한도 20회/일짜리
// 최신 모델을 가리켜서 문제, 'gemini-2.5-flash-lite' → 신규 사용자에게 404, 두 가지를
// 순서대로 겪었습니다. 앞으로도 이런 일이 또 생길 수 있다는 전제로 만든 구조입니다.)
// 맨 위 후보부터 시도해서 성공하는 모델을 씁니다. 실행 로그(Logger.log)에 어떤
// 모델이 실제로 쓰였는지 남습니다. 필요하면 이 배열 순서나 내용을 바꾸세요 —
// ai.google.dev/gemini-api/docs/models 에서 현재 사용 가능한 이름을 확인할 수 있습니다.
var MODEL_CANDIDATES = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash-lite',
  'gemini-flash-latest',
];

// 제출_판정_로그 탭의 열 번호 (1부터 시작) - Form 문항 순서와 동일해야 합니다.
var COL = {
  TIMESTAMP: 1, EMAIL: 2, BAN: 3, NO: 4, NAME: 5, UNIT: 6, ROUND: 7,
  QUESTION: 8, SELF_LEVEL: 9, TEXTBOOK_LINK: 10, DOUBT: 11,
  STATUS: 12, AI_LEVEL: 13, AI_SCORE: 14, FACT: 15, CAUSAL: 16,
  COMPARE: 17, SENTENCE: 18, INTEGRATION: 19, APPROVAL: 20,
  MISMATCH: 21, FEEDBACK: 22, PROCESSED_AT: 23, ABUSE_FLAG: 24,
};

// ========================= 마스터 프롬프트 =========================
function buildPrompt_(unitTitle, unitReadingText, studentQuestion, selfAssessedLevel) {
  return (
'[역할 및 페르소나]\n' +
'- 당신은 중학교 역사 수업에서 학생의 탐구 질문을 코칭하는 "질문 코치 AI"입니다.\n' +
'- ask smile(소크라테스식 질문 코칭) 방식을 따릅니다.\n' +
'\n' +
'[절대 규칙]\n' +
'1. 정답 및 해설 금지: 역사적 사실이나 원인·결과에 대한 설명, 해설, 정답을 절대\n' +
'   말하지 않는다.\n' +
'2. 구조만 코칭: 오직 학생 "질문의 구조"만 코칭한다. 무엇을 비교해야 하는지, 어떤\n' +
'   기준이나 조건이 빠졌는지는 짚어주되 그 "답"은 절대 제시하지 않는다.\n' +
'3. 읽기자료 외 범위 존중: [읽기자료] 안의 내용은 그 범위 안에서만 사실 여부를\n' +
'   판단한다. 학생이 다른 시대나 다른 나라의 역사를 끌어와 비교하는 것은 폭넓은\n' +
'   사고로 인정하며, 그 외연 지식의 사실 여부로 감점하지 않는다. "그 부분은 직접\n' +
'   찾아보면 좋겠어요"처럼 스스로 확인하도록 안내한다.\n' +
'4. 학생 맞춤형 어조: 중학생 대상이므로 존댓말과 짧고 쉬운 문장을 쓴다. 전문\n' +
'   용어(Bloom, 루브릭 등)는 쓰지 않는다.\n' +
'5. 담백한 톤: 느낌표·이모지를 남발하지 않고 다정하지만 담백한 톤을 유지한다.\n' +
'\n' +
'[읽기자료]\n' + unitReadingText + '\n' +
'\n' +
'[학생 정보]\n' +
'- 제출 주제: ' + unitTitle + '\n' +
'- 학생 질문: "' + studentQuestion + '"\n' +
'- 학생이 스스로 예상한 레벨: ' + selfAssessedLevel + '\n' +
'\n' +
'[4가지 질문 틀 및 구조 점검]\n' +
'학생 질문을 아래 4가지 틀 중 가장 가까운 유형으로 먼저 분류하고, "구조적 결함"이\n' +
'있는지 확인하여 채점 및 피드백에 반영합니다.\n' +
'① 원인·이유형 ("왜 ~했을까?", "무엇이 ~의 원인이었을까?")\n' +
'   점검: 사건·시기·주체가 구체적인가? 단순 사실 확인을 넘어 다각적 인과(왜/어떻게)를\n' +
'   묻는가? 단일 원인만 전제하지 않는가?\n' +
'② 비교·평가형 ("~와 ~는 무엇이 달랐을까?", "어느 쪽이 더 ~했을까?")\n' +
'   점검: 비교 대상이 분명한가? 판단 기준이 명시되어 있는가? 기준 없이 단순 나열에\n' +
'   그치지 않았는가?\n' +
'③ 만약에(가정)형 ("~였다면 무엇이 달라졌을까?")\n' +
'   점검: 실제로 있었을 법한 역사적 조건과 판단 기준이 포함되었는가? (조건·기준\n' +
'   없는 단순 가정형 질문은 인과 및 비교 항목에서 낮은 점수 부여)\n' +
'④ 현재 연결형 ("과거와 오늘날 무엇이 달랐을까?", "현재 관점에서 어떻게 평가할\n' +
'   수 있을까?")\n' +
'   점검: 과거와 현재를 연결할 공통 기준이 있는가? 당시의 역사적 조건을 고려하는가?\n' +
'   (같은 점과 다른 점을 함께 묻는지 확인 - 같은 점만 찾으면 비유로 끝난 것이다)\n' +
'\n' +
'[채점 항목 및 기준 (총 0~5점, 각 0 / 0.5 / 1점)]\n' +
'1. 사실 정확성: 질문이 [읽기자료] 안의 내용을 언급한 부분이 자료와 일치하는가.\n' +
'   (단, 이 단원을 벗어난 다른 시대·국가 역사를 언급한 경우 감점하지 않음)\n' +
'2. 인과·분석 깊이: \'왜/어떻게\'를 묻고 단일 원인을 넘어서는가. 위 ①·③ 유형의\n' +
'   점검 포인트를 반영하여 평가한다.\n' +
'3. 비교·평가 요소: 비교 대상과 판단 기준이 모두 명시되어 있는가. 단순 나열이나\n' +
'   비유가 아닌 비판적 기준이 있는지 위 ②·③·④ 유형을 바탕으로 평가한다.\n' +
'4. 문장 명료성: 질문의 문장이 주어와 서술어를 갖추어 완결되고 구체적인가.\n' +
'5. 자료 통합 깊이: 이 질문에 답하려면 [읽기자료]를 얼마나 폭넓게 살펴봐야 하는지\n' +
'   판단한다. 먼저 질문에 등장하는 개념·인물·사건이 [읽기자료]의 어느 소제목에\n' +
'   속하는지 찾는다.\n' +
'   - 0점: 문장 하나만 봐도 답할 수 있음.\n' +
'   - 0.5점: 소제목 하나(한 문단 분량)를 읽어야 답할 수 있음.\n' +
'   - 1점: (a) 서로 다른 소제목 두 곳 이상을 연결해야 답할 수 있음, (b) 다른\n' +
'     시대나 다른 나라의 역사와 비교하는 질문임.\n' +
'   주의: "OO와 OO 중 무엇이 더 ~" 형태여도 동일 문단/자료 박스 안의 단순 비교면\n' +
'   0~0.5점으로 채점한다.\n' +
'\n' +
'[판정 및 승인 기준]\n' +
'레벨 판정: 0.0~2.4점 = L1(사실 확인형) / 2.5~3.4점 = L2(분석형) / 3.5~5.0점 =\n' +
'L3(평가·비교·적용형)\n' +
'승인 여부: 4.0점 이상 = "승인" / 4.0점 미만 = "재제출"\n' +
'\n' +
'[피드백 작성 규칙 - 반드시 4문장 이내]\n' +
'1. 잘한 점 인정: 학생 질문에서 긍정적인 요소 1가지를 구체적으로 짚어 칭찬한다.\n' +
'2. 부족한 부분 조언: 가장 점수가 낮은 채점 항목과 4가지 질문 틀의 점검 포인트를\n' +
'   근거로 짚는다(정답은 말하지 않고 구조적 개선 방향만 제시). 만약에형인데\n' +
'   조건·기준이 없으면 "그때 있었을 법한 조건을 하나 정해보면 어때요?"처럼,\n' +
'   현재연결형인데 같은 점만 있으면 "다른 점도 함께 물어보면 비교가 돼요"처럼\n' +
'   안내한다. 학생이 이미 다른 시대·나라 역사와 비교했다면 그 시도를 칭찬하되\n' +
'   정확한 내용은 스스로 다시 찾아보게 안내한다.\n' +
'3. 질문 틀 예시 제공: "예를 들어 이렇게 물어볼 수도 있어요" 형태로 질문의\n' +
'   형태(틀)만 보여주는 예시 1개를 든다. 가능하면 이 질문과 같은 틀의 형태를\n' +
'   예시로 쓴다. (실제 역사적 정답이나 사실을 담지 말 것)\n' +
'4. 격려 마무리: 짧고 따뜻하게 응원의 문장으로 마무리한다.\n' +
'\n' +
'[자가평가 비교]\n' +
'학생이 예상한 레벨과 AI 판정 레벨이 다르면, 그 차이를 한 문장으로 부드럽게\n' +
'알려준다. 같으면 self_assessment_mismatch를 빈 문자열로 둔다.\n' +
'\n' +
'요청한 JSON 스키마에 맞춰서만 응답하세요.'
  );
}

// Gemini에게 응답 형식을 강제하는 스키마 (JSON 모드)
var RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    level: { type: 'STRING', enum: ['L1', 'L2', 'L3'] },
    score: { type: 'NUMBER' },
    criteria_scores: {
      type: 'OBJECT',
      properties: {
        fact_accuracy: { type: 'NUMBER' },
        causal_depth: { type: 'NUMBER' },
        comparison_clarity: { type: 'NUMBER' },
        sentence_clarity: { type: 'NUMBER' },
        integration_depth: { type: 'NUMBER' },
      },
      required: ['fact_accuracy', 'causal_depth', 'comparison_clarity', 'sentence_clarity', 'integration_depth'],
    },
    approval: { type: 'STRING', enum: ['승인', '재제출'] },
    self_assessment_mismatch: { type: 'STRING' },
    feedback_text: { type: 'STRING' },
  },
  required: ['level', 'score', 'criteria_scores', 'approval', 'self_assessment_mismatch', 'feedback_text'],
};

// ========================= Gemini 호출 =========================
// 마지막으로 성공한 모델 이름을 기억해서, 다음 호출부터는 그 모델을 먼저 시도합니다
// (매번 처음부터 순서대로 다 시도하면 느려지고 실패한 모델에도 괜히 요청이 갑니다).
var LAST_WORKING_MODEL_PROP = 'LAST_WORKING_GEMINI_MODEL';

function callGemini_(prompt) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY가 스크립트 속성에 없습니다. Gemini_API_키_발급_안내.md 4번을 확인하세요.');
  }

  var props = PropertiesService.getScriptProperties();
  var preferred = props.getProperty(LAST_WORKING_MODEL_PROP);
  var modelsToTry = MODEL_CANDIDATES.slice();
  if (preferred && modelsToTry.indexOf(preferred) !== -1) {
    modelsToTry = [preferred].concat(modelsToTry.filter(function (m) { return m !== preferred; }));
  }

  var errors = [];
  for (var m = 0; m < modelsToTry.length; m++) {
    var model = modelsToTry[m];
    try {
      var result = callGeminiWithModel_(model, prompt, apiKey);
      if (model !== preferred) props.setProperty(LAST_WORKING_MODEL_PROP, model);
      return result;
    } catch (e) {
      errors.push(model + ': ' + e.message);
      // 404(모델 없음/신규 사용자 제공 중단)나 429(그 모델의 한도 초과)면 다음 후보로 넘어감.
      // 그 외(응답 형식 문제 등 진짜 코드 문제일 수 있는 오류)도 일단 다음 후보로 넘어가되,
      // 마지막까지 다 실패하면 아래에서 전체 오류를 합쳐서 보여줍니다.
      continue;
    }
  }
  throw new Error('모든 Gemini 모델 후보가 실패했습니다:\n' + errors.join('\n'));
}

function callGeminiWithModel_(model, prompt, apiKey) {
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey;
  var payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  };
  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  // 404(이 모델 자체가 없음/신규 사용자 제공 중단)는 재시도해도 소용없으니 바로 포기하고
  // callGemini_ 쪽에서 다음 모델 후보로 넘어가게 합니다. 429/503(일시적 과부하·한도)는
  // 이 모델 안에서 지수 백오프로 최대 3번까지만 재시도한 뒤 그래도 안 되면 역시 포기합니다
  // (한 모델에 너무 오래 매달리지 않고 다음 후보로 넘어가는 게 전체적으로 더 빠릅니다).
  var maxAttempts = 3;
  for (var attempt = 1; attempt <= maxAttempts; attempt++) {
    var resp = UrlFetchApp.fetch(url, options);
    var code = resp.getResponseCode();
    var bodyText = resp.getContentText();

    if (code === 200) {
      var data = JSON.parse(bodyText);
      var text = data.candidates[0].content.parts[0].text;
      return JSON.parse(text);
    }
    if (code === 404) {
      throw new Error('오류 (404, 이 모델은 이 API 키로 사용할 수 없음): ' + bodyText);
    }
    var canRetry = (code === 429 || code === 503) && attempt < maxAttempts;
    if (canRetry) {
      Utilities.sleep(1000 * Math.pow(2, attempt)); // 2초, 4초...
      continue;
    }
    throw new Error('오류 (' + code + '): ' + bodyText);
  }
}

function testGeminiConnection() {
  var result = callGemini_(buildPrompt_(
    '테스트 단원',
    '[테스트 소제목]\n이것은 연결 테스트용 더미 지문입니다.',
    '이것은 테스트 질문일까?',
    'L1 사실 확인형'
  ));
  Logger.log(JSON.stringify(result, null, 2));
}

// ========================= 단원 자료 조회 =========================
function getGroundingTextForUnit_(unitTitle) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(UNIT_SHEET_NAME);
  if (!sheet) throw new Error('"' + UNIT_SHEET_NAME + '" 탭을 찾을 수 없습니다.');
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(unitTitle).trim()) {
      return data[i][1];
    }
  }
  throw new Error('"' + UNIT_SHEET_NAME + '" 탭에서 단원명 "' + unitTitle + '" 을 찾을 수 없습니다. ' +
    'Form 드롭다운 값과 단원_자료 탭의 단원명이 정확히 일치하는지 확인하세요.');
}

// ========================= 남용(짧은 간격 재제출) 감지 =========================
function checkAbuseFlag_(sheet, row, email, unit) {
  if (row <= 2) return '';
  var numCols = COL.UNIT - COL.TIMESTAMP + 1; // TIMESTAMP(1) ~ UNIT(6)
  var range = sheet.getRange(2, COL.TIMESTAMP, row - 2, numCols).getValues();
  var currentTs = sheet.getRange(row, COL.TIMESTAMP).getValue();
  for (var i = range.length - 1; i >= 0; i--) {
    var ts = range[i][COL.TIMESTAMP - 1];
    var em = range[i][COL.EMAIL - 1];
    var un = range[i][COL.UNIT - 1];
    if (em === email && un === unit) {
      var diffSec = (currentTs - ts) / 1000;
      return diffSec < 60 ? ('예 (직전 제출과 ' + Math.round(diffSec) + '초 차이)') : '';
    }
  }
  return '';
}

// ========================= 결과 기록 =========================
function writeResult_(sheet, row, r, abuseFlag) {
  var now = new Date();
  sheet.getRange(row, COL.STATUS, 1, COL.ABUSE_FLAG - COL.STATUS + 1).setValues([[
    '완료',
    r.level,
    r.score,
    r.criteria_scores.fact_accuracy,
    r.criteria_scores.causal_depth,
    r.criteria_scores.comparison_clarity,
    r.criteria_scores.sentence_clarity,
    r.criteria_scores.integration_depth,
    r.approval,
    r.self_assessment_mismatch || '',
    r.feedback_text,
    now,
    abuseFlag || '',
  ]]);
}

// ========================= 학생에게 이메일 발송 =========================
function sendFeedbackEmail_(email, name, r) {
  if (!email) return; // Form의 "로그인 필요" 설정이 꺼져 있으면 이메일이 없을 수 있음
  var subject = '[역사 탐구 질문 피드백] ' + r.level + ' · ' + r.score + '점 · ' + r.approval;
  var closing = r.approval === '재제출'
    ? '활동지 STEP1로 돌아가 질문을 다듬은 뒤 다시 제출해 보세요!'
    : '수고했어요! 이 질문으로 탐구를 이어가면 좋겠어요.';
  var body =
    (name || '') + '님, 질문 피드백이 도착했어요.\n\n' +
    '판정 레벨: ' + r.level + '\n' +
    '점수: ' + r.score + ' / 5.0\n' +
    '결과: ' + r.approval + '\n\n' +
    (r.self_assessment_mismatch ? (r.self_assessment_mismatch + '\n\n') : '') +
    r.feedback_text + '\n\n' +
    closing;
  MailApp.sendEmail(email, subject, body);
}

// ========================= Form 제출 트리거 핸들러 =========================
function onFormSubmitHandler(e) {
  var sheet = e.range.getSheet();
  var row = e.range.getRow();

  var rowValues = sheet.getRange(row, 1, 1, 11).getValues()[0];
  var email = rowValues[COL.EMAIL - 1];
  var ban = rowValues[COL.BAN - 1];
  var no = rowValues[COL.NO - 1];
  var name = rowValues[COL.NAME - 1];
  var unit = rowValues[COL.UNIT - 1];
  var round_ = rowValues[COL.ROUND - 1];
  var question = rowValues[COL.QUESTION - 1];
  var selfLevel = rowValues[COL.SELF_LEVEL - 1];

  sheet.getRange(row, COL.STATUS).setValue('처리중');

  try {
    var groundingText = getGroundingTextForUnit_(unit);
    var prompt = buildPrompt_(unit, groundingText, question, selfLevel);
    var result = callGemini_(prompt);
    var abuseFlag = checkAbuseFlag_(sheet, row, email, unit);
    writeResult_(sheet, row, result, abuseFlag);
    sendFeedbackEmail_(email, name, result);
  } catch (err) {
    sheet.getRange(row, COL.STATUS).setValue('오류: ' + err.message);
    Logger.log('행 ' + row + ' 처리 중 오류: ' + err.message);
  }
}

// ========================= 트리거 설치 (한 번만 실행) =========================
function createOnFormSubmitTrigger() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // 중복 설치 방지
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onFormSubmitHandler') {
      Logger.log('이미 트리거가 설치되어 있습니다.');
      return;
    }
  }
  ScriptApp.newTrigger('onFormSubmitHandler')
    .forSpreadsheet(ss)
    .onFormSubmit()
    .create();
  Logger.log('트리거 설치 완료. 이제 Form 제출 시 자동으로 채점됩니다.');
}

// ========================= 처리 안 된 과거 행 재처리 (선택) =========================
// Form 제출은 됐는데 오류로 처리상태가 비어있거나 "오류: ..."인 행들을 다시 돌립니다.
function reprocessFailedRows() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LOG_SHEET_NAME);
  var data = sheet.getDataRange().getValues();
  var count = 0;
  for (var r = 1; r < data.length; r++) {
    var status = data[r][COL.STATUS - 1];
    if (status === '완료') continue;
    var fakeEvent = { range: sheet.getRange(r + 1, 1) };
    onFormSubmitHandler(fakeEvent);
    count++;
  }
  Logger.log(count + '개 행을 다시 처리했습니다.');
}

// ========================= 문제 진단 (피드백이 안 뜰 때 이거부터 실행) =========================
// 함수 선택 드롭다운에서 runDiagnostics 를 선택해서 실행하세요.
// 실행 후 "보기 > 실행 로그"(Ctrl+Enter)에서 결과를 확인하면 됩니다.
function runDiagnostics() {
  var lines = [];
  var ok = true;

  // 1) API 키 확인
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (apiKey) {
    lines.push('✅ GEMINI_API_KEY 설정됨 (앞 4자리: ' + apiKey.substring(0, 4) + '...)');
  } else {
    ok = false;
    lines.push('❌ GEMINI_API_KEY가 스크립트 속성에 없습니다. Gemini_API_키_발급_안내.md 4번을 따라 등록하세요.');
  }

  // 2) 트리거 설치 여부 확인 (★ 가장 흔한 원인입니다 ★)
  var triggers = ScriptApp.getProjectTriggers();
  var hasTrigger = false;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onFormSubmitHandler' &&
        triggers[i].getEventType() === ScriptApp.EventType.ON_FORM_SUBMIT) {
      hasTrigger = true;
    }
  }
  if (hasTrigger) {
    lines.push('✅ onFormSubmitHandler 트리거가 설치되어 있습니다.');
  } else {
    ok = false;
    lines.push('❌ Form 제출 트리거가 설치되어 있지 않습니다. 이게 원인일 가능성이 가장 큽니다!');
    lines.push('   → 함수 선택 드롭다운에서 createOnFormSubmitTrigger 를 선택해서 한 번 실행하세요.');
    lines.push('   → 참고: "응답 탭 이름"을 바꾸는 것과 트리거 설치는 서로 다른 작업입니다.');
    lines.push('     탭 이름을 바꿔도 트리거를 따로 설치하지 않았다면 자동 채점은 절대 실행되지 않습니다.');
  }

  // 3) 로그 시트 / 단원 자료 시트 존재 확인
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 3-0) 지금 이 스크립트가 실제로 어느 스프레드시트에 연결되어 있는지 먼저 밝힙니다.
  // Form을 여러 번 만들었거나 스프레드시트를 복사한 적이 있다면, 지금 브라우저로
  // 보고 있는 시트와 이 스크립트가 연결된 시트가 서로 다를 수 있습니다.
  var allSheetNames = ss.getSheets().map(function (s) { return s.getName(); });
  lines.push('ℹ️ 이 스크립트가 연결된 스프레드시트: "' + ss.getName() + '"');
  lines.push('   URL: ' + ss.getUrl());
  lines.push('   이 스프레드시트 안의 탭 목록: [' + allSheetNames.join(', ') + ']');
  lines.push('   → 위 URL이 지금 브라우저 주소창의 URL과 다르다면, 스크립트가 다른(예전/복사본)');
  lines.push('     스프레드시트에 연결되어 있는 것입니다. 반드시 실제로 쓰는 시트를 열고, 그 안에서');
  lines.push('     확장 프로그램 > Apps Script 로 들어가 이 코드가 있는지 확인하세요.');
  lines.push('');

  var logSheet = ss.getSheetByName(LOG_SHEET_NAME);
  var unitSheet = ss.getSheetByName(UNIT_SHEET_NAME);
  if (logSheet) {
    lines.push('✅ "' + LOG_SHEET_NAME + '" 탭을 찾았습니다.');
  } else {
    ok = false;
    lines.push('❌ "' + LOG_SHEET_NAME + '" 탭이 없습니다. Form 응답이 쌓이는 탭 이름을 정확히 이 이름으로 바꾸세요' +
      '(앞뒤 공백·오타 주의). 위 "탭 목록"에 이름이 있는지 먼저 확인하세요.');
  }
  if (unitSheet) {
    var unitRows = unitSheet.getDataRange().getValues().length - 1;
    lines.push('✅ "' + UNIT_SHEET_NAME + '" 탭을 찾았습니다 (단원 ' + Math.max(unitRows, 0) + '개 등록됨).');
  } else {
    ok = false;
    lines.push('❌ "' + UNIT_SHEET_NAME + '" 탭이 없습니다. 단원명 | 그라운딩_텍스트 열로 만들어 주세요.');
  }

  // 4) 최근 제출 행의 처리 상태 확인
  if (logSheet) {
    var data = logSheet.getDataRange().getValues();
    if (data.length <= 1) {
      lines.push('ℹ️ 아직 제출된 응답이 없습니다 (헤더 행만 있음).');
    } else {
      var lastRow = data[data.length - 1];
      var status = lastRow[COL.STATUS - 1];
      var unitOfLastRow = lastRow[COL.UNIT - 1];
      lines.push('ℹ️ 가장 최근 제출 행(맨 아래)의 처리상태(L열): "' + (status || '(비어 있음)') + '"');
      if (!status) {
        lines.push('   → 비어 있다면 트리거가 아예 실행되지 않았다는 뜻입니다 (위 2번 항목 확인).');
      } else if (String(status).indexOf('오류') === 0) {
        lines.push('   → 오류 메시지가 있다면 그 내용이 원인입니다. 특히 "단원명을 찾을 수 없습니다" 오류면,');
        lines.push('     Form의 "제출 주제" 드롭다운 값과 "' + UNIT_SHEET_NAME + '" 탭의 단원명 철자가 정확히 같은지 확인하세요.');
      } else if (status === '처리중') {
        lines.push('   → "처리중"에서 멈춰 있다면 실행이 도중에 끊긴 것입니다. reprocessFailedRows 를 실행해 다시 돌려보세요.');
      } else if (status === '완료') {
        lines.push('   → 이미 정상 처리된 행입니다. 응답 시트에서 L열 이후 칸(AI 레벨~피드백)을 오른쪽으로 스크롤해서 확인해 보세요.');
      }
      if (unitOfLastRow && unitSheet) {
        try {
          getGroundingTextForUnit_(unitOfLastRow);
          lines.push('✅ 최근 제출 단원명 "' + unitOfLastRow + '" 이 "' + UNIT_SHEET_NAME + '" 탭에서 정상적으로 조회됩니다.');
        } catch (e) {
          ok = false;
          lines.push('❌ 최근 제출 단원명 "' + unitOfLastRow + '" 을 "' + UNIT_SHEET_NAME + '" 탭에서 찾지 못했습니다. 철자/공백을 맞춰주세요.');
        }
      }
    }
  }

  // 5) Gemini 연결 자체 테스트
  // 주의: 이 테스트도 하루 요청 한도(무료 티어) 1건을 소비합니다. callGemini_는
  // MODEL_CANDIDATES 목록을 순서대로 시도하다 되는 모델을 자동으로 골라 씁니다.
  if (apiKey) {
    try {
      callGemini_(buildPrompt_('진단용 테스트', '[테스트]\n더미 지문입니다.', '이것은 테스트 질문일까?', 'L1 사실 확인형'));
      var workingModel = PropertiesService.getScriptProperties().getProperty(LAST_WORKING_MODEL_PROP);
      lines.push('✅ Gemini API 호출이 정상적으로 성공했습니다. (사용된 모델: ' + (workingModel || MODEL_CANDIDATES[0]) + ')');
    } catch (e) {
      ok = false;
      lines.push('❌ MODEL_CANDIDATES에 있는 모델을 모두 시도했지만 전부 실패했습니다:');
      lines.push('   ' + e.message.substring(0, 800));
      lines.push('   → 각 줄이 "모델명: 오류내용" 형태입니다. 전부 429/RESOURCE_EXHAUSTED라면');
      lines.push('     오늘 무료 한도를 다 쓴 것(설정 문제 아님, 내일 다시 시도)이고, 404라면');
      lines.push('     이 API 키로 그 모델을 못 쓰는 것입니다. MODEL_CANDIDATES 배열에 다른');
      lines.push('     모델 이름을 추가해보세요 (ai.google.dev/gemini-api/docs/models 참고).');
    }
  }

  lines.push('');
  lines.push(ok ? '=== 전체 결과: 문제를 찾지 못했습니다. 그래도 안 되면 이 로그를 그대로 캡처해서 문의하세요. ==='
                : '=== 전체 결과: 위 ❌ 항목을 먼저 해결하세요. ===');

  var report = lines.join('\n');
  Logger.log(report);
  try {
    SpreadsheetApp.getUi().alert(report.length > 1500 ? (report.substring(0, 1500) + '\n...(전체 내용은 실행 로그에서 확인)') : report);
  } catch (e) {
    // 메뉴 없이 에디터에서 바로 실행한 경우 alert가 안 뜰 수 있음 - 실행 로그로 충분
  }
  return report;
}
