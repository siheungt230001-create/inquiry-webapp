// AI 채점 엔진(lib/rubric.ts, lib/gemini.ts)이 실제 Gemini API 키 없이도 올바르게
// 동작하는지 확인하는 자체 테스트입니다. 실제 네트워크 요청은 fetch를 흉내내서 대신합니다.
// 실행: npx tsx scripts/selftest.ts
import { buildPrompt, RESPONSE_SCHEMA } from "../lib/rubric";

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
assert(prompt.includes("총점 4.0점 이상"), "프롬프트에 4.0점 승인 기준 포함");
assert(prompt.includes("L4 (복합형"), "프롬프트에 L4 트랙 포함");
assert(prompt.includes("정보 요소"), "프롬프트에 자료 통합 깊이 재작성 반영");
assert(RESPONSE_SCHEMA.required.includes("self_assessment_mismatch"), "스키마에 self_assessment_mismatch 필수 필드 포함");

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
