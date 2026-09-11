// 종합 글쓰기(서론/본론/결론) 채점 로직 - app/api/essay-feedback/route.ts("AI 피드백
// 받기" 미리보기)와 app/api/inquiry-writing/route.ts("제출하기") 둘 다에서 재사용한다.
// lib/gradeSubmission.ts(메인 질문 채점)와 같은 이유로 뺐다.
import {
  buildEssayFeedbackPrompt,
  buildOffTopicEssayComment,
  sanitizeProperNounFeedback,
  ESSAY_RESPONSE_SCHEMA,
  type EssayFeedbackResult,
} from "./subQuestionFlow";
import { callGeminiGeneric } from "./gemini";
import { getGroundingTextForUnit } from "./sheets";

export async function gradeEssay(
  unitTitle: string,
  mainQuestion: string,
  subQuestions: string[],
  intro: string,
  body: string,
  conclusion: string
): Promise<EssayFeedbackResult> {
  const groundingText = await getGroundingTextForUnit(unitTitle);
  const prompt = buildEssayFeedbackPrompt(
    unitTitle,
    groundingText,
    mainQuestion,
    subQuestions,
    intro,
    body,
    conclusion
  );
  const rawResult = await callGeminiGeneric<EssayFeedbackResult & { topic_relevant?: boolean }>(
    prompt,
    ESSAY_RESPONSE_SCHEMA
  );

  // 글이 단원 자료와 완전히 무관하면 점수를 매기지 않는다(lib/gradeSubmission.ts의
  // 메인 질문 관련성 체크와 같은 이유·같은 기준). topic_relevant가 없으면(과거 캐시
  // 등) 관련 있음으로 취급해 기존 동작을 유지한다.
  if (rawResult.topic_relevant === false) {
    return {
      comment: "",
      introScore: 0,
      bodyScore: 0,
      conclusionScore: 0,
      factScore: 0,
      properNounFeedback: "",
      topicMismatch: buildOffTopicEssayComment(unitTitle),
    };
  }
  return { ...rawResult, properNounFeedback: sanitizeProperNounFeedback(rawResult.properNounFeedback) };
}
