// 메인 질문 채점 로직 - app/api/submit/route.ts(동기 경로)와
// app/api/process-submit/route.ts(QStash 큐 처리 경로) 둘 다에서 재사용한다.
// 로직 자체는 그대로이고, 두 곳에서 중복해서 짜지 않으려고 뺀 것뿐이다.
import { buildPrompt, buildOffTopicResult, evaluateCriteriaScores } from "./rubric";
import { callGemini } from "./gemini";
import { getGroundingTextForUnit } from "./sheets";
import type { GradingResult, SubmissionRow } from "./types";

export async function gradeSubmission(
  unit: string,
  question: string,
  selfLevel: string
): Promise<GradingResult> {
  const groundingText = await getGroundingTextForUnit(unit);
  const prompt = buildPrompt(unit, groundingText, question, selfLevel);
  const rawResult = await callGemini(prompt);

  // 학생이 제시된 단원과 무관한 내용으로 질문을 만들어도 구조만 갖추면 점수가 높게
  // 나와 "승인"되던 버그(2026-09-07) - 점수를 매기기 전에 단원 관련성부터 확인한다.
  // topic_relevant가 없는(구버전 응답 목업 등) 경우는 관련 있음으로 취급해 기존
  // 동작을 그대로 유지한다.
  if (rawResult.topic_relevant === false) {
    return buildOffTopicResult(unit);
  }

  // Gemini가 응답에 담아 보낸 level/score/approval은 신뢰하지 않고, criteria_scores만
  // 가져와 코드에서 재계산한다 (lib/rubric.ts의 evaluateCriteriaScores) - "레벨은
  // 낮음인데 승인" 같은 불일치가 다시는 생기지 않도록 이 값을 최종값으로 쓴다.
  const evaluated = evaluateCriteriaScores(rawResult.criteria_scores);
  return {
    ...rawResult,
    level: evaluated.level,
    track: evaluated.track,
    band: evaluated.band,
    score: evaluated.score,
    approval: evaluated.approval,
  };
}

// 채점 결과(GradingResult)를 시트에 저장할 필드로 변환한다 - app/api/submit,
// app/api/process-submit, app/api/submit/edit 세 곳이 전부 같은 매핑을 따로
// 들고 있던 걸 하나로 모았다. 단원 관련성이 없다고 판정된 결과(approval이
// "단원 확인 필요")는 점수 필드를 전부 ""로 남겨서 "숫자 점수 없음"을 보장한다 -
// GradingResult.score/criteria_scores는 항상 숫자 타입이라 여기서 걸러야 한다.
export function gradingResultToSubmissionFields(
  result: GradingResult
): Pick<
  SubmissionRow,
  | "aiLevel"
  | "levelTrack"
  | "levelBand"
  | "aiScore"
  | "fact"
  | "causal"
  | "compare"
  | "sentence"
  | "integration"
  | "approval"
  | "mismatch"
  | "feedback"
> {
  const isOffTopic = result.approval === "단원 확인 필요";
  return {
    aiLevel: isOffTopic ? "" : result.level,
    levelTrack: isOffTopic ? "" : result.track,
    levelBand: isOffTopic ? "" : result.band,
    aiScore: isOffTopic ? "" : result.score,
    fact: isOffTopic ? "" : result.criteria_scores.fact_accuracy,
    causal: isOffTopic ? "" : result.criteria_scores.causal_depth,
    compare: isOffTopic ? "" : result.criteria_scores.comparison_clarity,
    sentence: isOffTopic ? "" : result.criteria_scores.sentence_clarity,
    integration: isOffTopic ? "" : result.criteria_scores.integration_depth,
    approval: result.approval,
    mismatch: result.self_assessment_mismatch || "",
    feedback: result.feedback_text,
  };
}
