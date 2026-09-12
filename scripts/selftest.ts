// AI 채점 엔진(lib/rubric.ts, lib/gemini.ts)이 실제 Gemini API 키 없이도 올바르게
// 동작하는지 확인하는 자체 테스트입니다. 실제 네트워크 요청은 fetch를 흉내내서 대신합니다.
// 실행: npx tsx scripts/selftest.ts
import {
  buildPrompt,
  buildOffTopicResult,
  RESPONSE_SCHEMA,
  APPROVAL_THRESHOLD,
  computeApproval,
  computeLevelBand,
  computeTrack,
  evaluateCriteriaScores,
  computeFinalStatus,
  FEEDBACK_FALLBACK_TEXT,
} from "../lib/rubric";
import { gradingResultToSubmissionFields } from "../lib/gradeSubmission";
import { validateProfileNumbers } from "../lib/constants";
import {
  sanitizeProperNounFeedback,
  ensureNonEmpty,
  buildSubQuestionCheckPrompt,
  buildSubAnswerCheckPrompt,
  SUB_QUESTION_RESPONSE_SCHEMA,
  SUB_QUESTION_COMMENT_FALLBACK,
  SUB_ANSWER_COMMENT_FALLBACK,
  DESIGN_FEEDBACK_FALLBACK,
  ANSWER_SUFFICIENCY_FEEDBACK_FALLBACK,
} from "../lib/subQuestionFlow";

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("OK:", msg);
  }
}

// 1) 프롬프트에 필수 섹션이 모두 들어가는지 확인
const prompt = buildPrompt(
  "몽골 간섭과 고려의 개혁",
  "[원 간섭기 권문세족의 성장]\n더미 지문",
  "공민왕은 왜 전민변정도감을 설치했을까?",
  "L2 분석형"
);
assert(prompt.includes("[읽기자료]"), "프롬프트에 [읽기자료] 섹션 포함");
assert(prompt.includes("더미 지문"), "프롬프트에 실제 읽기자료 내용이 삽입됨");
assert(prompt.includes("[자가평가 비교]"), "프롬프트에 [자가평가 비교] 섹션 포함");
assert(prompt.includes("[4가지 질문 틀 및 구조 점검]"), "프롬프트에 4가지 질문 틀 섹션 포함");
assert(prompt.includes(`총점 ${APPROVAL_THRESHOLD}점 이상`), "프롬프트에 승인 기준이 APPROVAL_THRESHOLD와 일치");
assert(prompt.includes("완성된 대안 질문 금지"), "프롬프트에 예시 복붙 방지 규칙 포함");
assert(prompt.includes("L4 (복합형"), "프롬프트에 L4 트랙 포함");
assert(prompt.includes("정보 요소"), "프롬프트에 자료 통합 깊이 재작성 반영");
assert(RESPONSE_SCHEMA.required.includes("self_assessment_mismatch"), "스키마에 self_assessment_mismatch 필수 필드 포함");
assert(RESPONSE_SCHEMA.required.includes("topic_relevant"), "스키마에 topic_relevant 필수 필드 포함(단원 관련성 게이트)");
assert(prompt.includes("단원 관련성 확인"), "프롬프트에 단원 관련성 확인 섹션 포함");
assert(prompt.includes("[채점 심화 지침"), "프롬프트에 채점 심화 지침 섹션 포함");
assert(prompt.includes("문장의 모호성 점검"), "프롬프트에 문장 모호성 점검 지침(A) 포함");
assert(prompt.includes("가정형·비교형 질문의 구체성 점검"), "프롬프트에 가정·비교형 구체성 지침(B) 포함");
assert(prompt.includes("추상적 개념의 구체화 점검"), "프롬프트에 추상적 개념 구체화 지침(C) 포함");
assert(prompt.includes("레벨 강요 금지"), "프롬프트에 레벨 강요 금지 안내 포함");
assert(prompt.includes("절대 빈 문자열로 두지 않는다"), "프롬프트에 feedback_text 빈 문자열 금지 규칙 포함");

// 2026-09-07 학생이 단원과 무관한 질문을 만들어도 구조만 갖추면 점수가 높게 나와
// "승인"되던 버그 - buildOffTopicResult가 점수 없이 "단원 확인 필요" 상태만 돌려주고,
// gradingResultToSubmissionFields가 그 상태를 시트에 숫자 0이 아니라 빈 값("")으로
// 남기는지 확인한다(0으로 남으면 반별 평균이 부당하게 낮아진다).
const offTopic = buildOffTopicResult("몽골 간섭과 고려의 개혁");
assert(offTopic.approval === "단원 확인 필요", "단원 무관 결과의 approval은 '단원 확인 필요'");
assert(offTopic.feedback_text.includes("몽골 간섭과 고려의 개혁"), "단원 무관 안내 문구에 단원명이 들어감");
const offTopicFields = gradingResultToSubmissionFields(offTopic);
assert(offTopicFields.aiScore === "", "단원 무관 결과는 aiScore를 0이 아니라 빈 값으로 저장");
assert(offTopicFields.aiLevel === "", "단원 무관 결과는 aiLevel도 빈 값으로 저장");

// 2) computeApproval/computeLevelBand/computeFinalStatus가 같은 기준값(APPROVAL_THRESHOLD)으로
// 서로 모순되지 않는 결과를 내는지 확인 - "레벨은 낮음인데 승인" 같은 불일치 재발 방지.
assert(computeApproval(APPROVAL_THRESHOLD) === "승인", `${APPROVAL_THRESHOLD}점은 승인`);
assert(computeApproval(APPROVAL_THRESHOLD - 0.5) === "재제출", `${APPROVAL_THRESHOLD - 0.5}점은 재제출`);
assert(
  computeLevelBand("L2", APPROVAL_THRESHOLD) === "L2-높음",
  `${APPROVAL_THRESHOLD}점은 L2-높음 (승인 기준과 일치)`
);
assert(
  computeLevelBand("L2", APPROVAL_THRESHOLD - 0.5) === "L2-낮음",
  `${APPROVAL_THRESHOLD - 0.5}점은 L2-낮음 (재제출 기준과 일치)`
);
assert(computeFinalStatus(APPROVAL_THRESHOLD) === "승인", "computeFinalStatus도 같은 기준점 사용");

// computeTrack: 항목2·3 조합 4가지 전부 확인
assert(computeTrack(0, 0) === "L1", "인과0·비교0 → L1");
assert(computeTrack(1, 0) === "L2", "인과>0·비교0 → L2");
assert(computeTrack(0, 1) === "L3", "인과0·비교>0 → L3");
assert(computeTrack(0.5, 0.5) === "L4", "인과>0·비교>0 → L4");

// evaluateCriteriaScores: Gemini 자신이 응답에 담아 보낸 level/score/approval이 틀려도
// (여기서는 일부러 L4/5.0점/승인이라고 거짓 응답한 상황을 흉내냄) criteria_scores만
// 보고 코드가 올바른 값(L1/2.0점/재제출)으로 재계산하는지 확인 - 오늘 고친 핵심 버그.
const dishonestGeminiResponse = {
  level: "L4",
  score: 5.0,
  approval: "승인",
  criteria_scores: {
    fact_accuracy: 1,
    causal_depth: 0,
    comparison_clarity: 0,
    sentence_clarity: 1,
    integration_depth: 0,
  },
};
const evaluated = evaluateCriteriaScores(dishonestGeminiResponse.criteria_scores);
assert(evaluated.track === "L1", "criteria_scores 기준 실제 트랙은 L1 (Gemini의 L4 자체 판단 무시)");
assert(evaluated.score === 2.0, "criteria_scores 합산 실제 총점은 2.0 (Gemini의 5.0 자체 판단 무시)");
assert(evaluated.approval === "재제출", "실제 승인 여부는 재제출 (Gemini의 승인 자체 판단 무시)");
assert(evaluated.level === "L1", "실제 레벨은 L1 (Gemini의 L4 자체 판단 무시)");

// Gemini가 항목별로 0/0.5/1이 아닌 임의 소수(0.8, 0.3 등)를 응답에 담아 보내는 경우 -
// responseSchema의 NUMBER 타입은 enum을 못 걸어 스키마만으로는 못 막으므로, 응답을
// 받은 뒤 가장 가까운 허용값으로 강제 반올림해야 한다(2026-09-10, 박지후 학생 3.8점 건).
const sloppyCriteria = {
  fact_accuracy: 1,
  causal_depth: 0.8,
  comparison_clarity: 0.7,
  sentence_clarity: 0.3,
  integration_depth: 0.2,
};
const roundedEvaluated = evaluateCriteriaScores(sloppyCriteria);
assert(
  roundedEvaluated.criteria.causal_depth === 1 &&
    roundedEvaluated.criteria.comparison_clarity === 0.5 &&
    roundedEvaluated.criteria.sentence_clarity === 0.5 &&
    roundedEvaluated.criteria.integration_depth === 0,
  "항목별 임의 소수(0.8/0.7/0.3/0.2)는 가장 가까운 허용값(1/0.5/0.5/0)으로 반올림됨"
);
assert(roundedEvaluated.score === 3, "반올림된 항목 합산 총점은 3 (1+1+0.5+0.5+0)");

// 정상 채점 결과는 gradingResultToSubmissionFields를 거쳐도 숫자가 그대로 남아야
// 한다(단원 무관 분기가 정상 케이스까지 건드리지 않는지 확인).
const normalResult = {
  ...evaluated,
  self_assessment_mismatch: "",
  feedback_text: "테스트",
  criteria_scores: dishonestGeminiResponse.criteria_scores,
};
const normalFields = gradingResultToSubmissionFields(normalResult);
assert(normalFields.aiScore === 2.0, "정상 채점 결과는 aiScore가 숫자 그대로 저장됨");

// gradeSubmission.ts가 쓰는 안전장치와 같은 조건 - Gemini가 feedback_text를 빈
// 문자열로 돌려줘도(채점 심화 지침으로 요구사항이 늘면서 재발할 수 있는 문제) 학생
// 화면에 빈 피드백이 노출되지 않도록 대체 문구가 준비돼 있는지 확인한다.
assert(FEEDBACK_FALLBACK_TEXT.trim().length > 0, "feedback_text가 비었을 때 쓸 대체 문구가 준비돼 있음");
const emptyFeedback = "";
const fallbackApplied = emptyFeedback.trim() ? emptyFeedback : FEEDBACK_FALLBACK_TEXT;
assert(fallbackApplied === FEEDBACK_FALLBACK_TEXT, "빈 feedback_text는 대체 문구로 치환됨");

// 2) callGemini() 성공 경로 - fetch를 가짜로 바꿔서 실제 네트워크 없이 파싱 로직만 검증
async function testCallGeminiSuccess() {
  process.env.GEMINI_API_KEY = "fake-key-for-test";
  const fakeResult = {
    level: "L2",
    score: 3.2,
    criteria_scores: {
      fact_accuracy: 1,
      causal_depth: 1,
      comparison_clarity: 0.5,
      sentence_clarity: 0.5,
      integration_depth: 0.2,
    },
    approval: "재제출",
    self_assessment_mismatch: "",
    feedback_text: "테스트 피드백입니다.",
  };

  let callCount = 0;
  const originalFetch = global.fetch;
  // @ts-expect-error - 테스트 목적의 fetch 스텁
  global.fetch = async () => {
    callCount++;
    return {
      status: 200,
      text: async () =>
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify(fakeResult) }] } }],
        }),
    };
  };

  const { callGemini } = await import("../lib/gemini");
  const result = await callGemini(prompt);
  assert(callCount === 1, "callGemini가 fetch를 정확히 1번 호출함 (첫 모델에서 바로 성공)");
  assert(result.level === "L2" && result.score === 3.2, "callGemini가 응답 JSON을 정확히 파싱함");

  global.fetch = originalFetch;
}

// 3) callGemini() 모델 폴백 - 첫 모델이 404면 다음 후보로 자동 전환되는지 확인
async function testModelFallback() {
  process.env.GEMINI_API_KEY = "fake-key-for-test";
  let attempt = 0;
  const originalFetch = global.fetch;
  // @ts-expect-error - 테스트 목적의 fetch 스텁
  global.fetch = async () => {
    attempt++;
    if (attempt === 1) {
      return { status: 404, text: async () => JSON.stringify({ error: "model not found" }) };
    }
    return {
      status: 200,
      text: async () =>
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      level: "L1",
                      score: 1.0,
                      criteria_scores: {
                        fact_accuracy: 1,
                        causal_depth: 0,
                        comparison_clarity: 0,
                        sentence_clarity: 0,
                        integration_depth: 0,
                      },
                      approval: "재제출",
                      self_assessment_mismatch: "",
                      feedback_text: "두번째 모델 응답",
                    }),
                  },
                ],
              },
            },
          ],
        }),
    };
  };

  // 모듈 캐시 때문에 lastWorkingModel이 이전 테스트에서 남아있을 수 있으니 새 프로세스처럼 재확인
  const { callGemini } = await import("../lib/gemini");
  const result = await callGemini(prompt);
  assert(attempt >= 2, "첫 모델 404 실패 후 다음 모델 후보로 자동 전환함 (호출 " + attempt + "회)");
  assert(result.feedback_text === "두번째 모델 응답", "두 번째 모델의 응답을 정상적으로 반환함");

  global.fetch = originalFetch;
}

// 2026-09-07 학년/반/번호 오타("30123"처럼 자릿수가 어긋난 값)가 시트에 그대로
// 들어가지 못하게 막는 범위 검증 - app/api/submit, app/api/submit/edit,
// app/api/profile(내 정보 수정) 세 곳이 공유하는 함수라 여기서 한 번만 확인한다.
assert(validateProfileNumbers("3", "1", "23") === null, "정상 범위(3학년 1반 23번)는 통과");
assert(validateProfileNumbers("3", "", "") === null, "반/번호는 비어 있어도 통과(선택 입력)");
assert(validateProfileNumbers("30123", "1", "23") !== null, "학년에 자릿수 어긋난 값(30123)은 거부");
assert(validateProfileNumbers("4", "1", "23") !== null, "범위를 벗어난 학년(4)은 거부");
assert(validateProfileNumbers("", "1", "23") !== null, "학년이 비어 있으면 거부(필수 입력)");
assert(validateProfileNumbers("3", "99", "23") !== null, "범위를 벗어난 반(99)은 거부");
assert(validateProfileNumbers("3", "1", "abc") !== null, "숫자가 아닌 번호는 거부");

// sanitizeProperNounFeedback: "OO는 OO의 오타로 보여요. 정확한 표기는 OO예요."에서
// 지적한 단어와 정정한 단어가 완전히 같으면(자기 자신을 오타라고 지적) 그 문장을
// 버려야 한다(2026-09-10, 박시원 학생의 "충선왕은 충선왕의 오타로 보여요..." 건).
assert(
  sanitizeProperNounFeedback("충선왕은 충선왕의 오타로 보여요. 정확한 표기는 충선왕이에요.") === "",
  "지적한 단어와 정정한 단어가 완전히 같으면 피드백을 통째로 버림"
);
assert(
  sanitizeProperNounFeedback("장동행성은 정동행성의 오타로 보여요. 정확한 표기는 정동행성이에요.") !== "",
  "실제로 다른 단어를 지적하는 정상 피드백은 그대로 남김"
);
assert(sanitizeProperNounFeedback("") === "", "빈 피드백은 그대로 빈 문자열");

// 메인 질문(lib/rubric.ts)에 넣은 채점 심화 지침(A/B/C)을 보조질문 만들기/답하기
// 프롬프트에도 똑같이 반영했는지 확인한다.
const subQPrompt = buildSubQuestionCheckPrompt("더미 읽기자료", "공민왕은 왜 전민변정도감을 설치했을까?", [
  { label: "원인·배경형", text: "공민왕은 왜 개혁을 했을까?" },
]);
assert(subQPrompt.includes("[질문 다듬기 심화 지침"), "보조질문 프롬프트에 심화 지침 섹션 포함");
assert(subQPrompt.includes("문장의 모호성"), "보조질문 프롬프트에 (A) 모호성·역사적 오류 지침 포함");
assert(subQPrompt.includes("뻔한 가정형·비교형"), "보조질문 프롬프트에 (B) 가정·비교형 구체성 지침 포함");
assert(subQPrompt.includes("추상적 개념의 구체화"), "보조질문 프롬프트에 (C) 추상적 개념 구체화 지침 포함");
assert(subQPrompt.includes("레벨(유형) 강요 금지"), "보조질문 프롬프트에 레벨(유형) 강요 금지 안내 포함");
assert(subQPrompt.includes("comment는 절대 빈 문자열로 두지 않는다"), "보조질문 프롬프트에 comment 빈 문자열 금지 규칙 포함");

// "유형 억지 끼워맞추기" 감지(2026-09-12 추가) - 형식은 맞지만 맥락상 부자연스러운
// 질문(인물 입장형+심정 추측 등)에 다른 유형을 제안하는 참고용 피드백.
assert(subQPrompt.includes("[유형 억지 끼워맞추기 감지"), "보조질문 프롬프트에 유형 억지 끼워맞추기 감지 섹션 포함");
assert(subQPrompt.includes("인물 입장형"), "보조질문 프롬프트에 인물 입장형+감정 추측 예시 포함");
assert(subQPrompt.includes("사례형"), "보조질문 프롬프트에 사례형 전환 제안 예시 포함");
assert(
  "typeFitFeedback" in SUB_QUESTION_RESPONSE_SCHEMA.properties &&
    (SUB_QUESTION_RESPONSE_SCHEMA.required as readonly string[]).includes("typeFitFeedback"),
  "SUB_QUESTION_RESPONSE_SCHEMA에 typeFitFeedback 필드 포함"
);

const subAPrompt = buildSubAnswerCheckPrompt("더미 읽기자료", "공민왕은 왜 전민변정도감을 설치했을까?", [
  { label: "원인·배경형", subQuestion: "공민왕은 왜 개혁을 했을까?", answer: "여러 이유로 개혁을 했다." },
]);
assert(subAPrompt.includes("[답변 다듬기 심화 지침"), "보조답변 프롬프트에 심화 지침 섹션 포함");
assert(subAPrompt.includes("문장의 모호성"), "보조답변 프롬프트에 (A) 모호성·역사적 오류 지침 포함");
assert(subAPrompt.includes("추상적 개념의 구체화"), "보조답변 프롬프트에 (C) 추상적 개념 구체화 지침 포함");
assert(subAPrompt.includes("레벨(유형) 강요 금지"), "보조답변 프롬프트에 레벨(유형) 강요 금지 안내 포함");
assert(subAPrompt.includes("comment는 절대 빈 문자열로 두지 않는다"), "보조답변 프롬프트에 comment 빈 문자열 금지 규칙 포함");

// 안전장치: Gemini가 그래도 빈 문자열을 주면 대체 문구로 채워지는지 확인.
assert(ensureNonEmpty("", SUB_QUESTION_COMMENT_FALLBACK) === SUB_QUESTION_COMMENT_FALLBACK, "보조질문 comment 빈 값은 대체 문구로 치환");
assert(ensureNonEmpty("이미 채워진 코멘트", SUB_QUESTION_COMMENT_FALLBACK) === "이미 채워진 코멘트", "채워진 comment는 그대로 유지");
assert(ensureNonEmpty("", SUB_ANSWER_COMMENT_FALLBACK) === SUB_ANSWER_COMMENT_FALLBACK, "보조답변 comment 빈 값은 대체 문구로 치환");
assert(ensureNonEmpty("", DESIGN_FEEDBACK_FALLBACK) === DESIGN_FEEDBACK_FALLBACK, "designFeedback 빈 값은 대체 문구로 치환");
assert(ensureNonEmpty("", ANSWER_SUFFICIENCY_FEEDBACK_FALLBACK) === ANSWER_SUFFICIENCY_FEEDBACK_FALLBACK, "answerSufficiencyFeedback 빈 값은 대체 문구로 치환");

(async () => {
  await testCallGeminiSuccess();
  await testModelFallback();
  if (process.exitCode === 1) {
    console.error("\n일부 테스트 실패");
  } else {
    console.log("\n모든 자체 테스트 통과");
  }
})();
