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
} from "../lib/rubric";
import { gradingResultToSubmissionFields } from "../lib/gradeSubmission";

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

(async () => {
  await testCallGeminiSuccess();
  await testModelFallback();
  if (process.exitCode === 1) {
    console.error("\n일부 테스트 실패");
  } else {
    console.log("\n모든 자체 테스트 통과");
  }
})();
