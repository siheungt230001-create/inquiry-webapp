// 메인 질문 채점 로직 - app/api/submit/route.ts(동기 경로)와
// app/api/process-submit/route.ts(QStash 큐 처리 경로) 둘 다에서 재사용한다.
// 로직 자체는 그대로이고, 두 곳에서 중복해서 짜지 않으려고 뺀 것뿐이다.
import { buildPrompt, evaluateCriteriaScores } from "./rubric";
import { callGemini } from "./gemini";
import { getGroundingTextForUnit } from "./sheets";
import type { GradingResult } from "./types";

export async function gradeSubmission(
  unit: string,
  question: string,
  selfLevel: string
): Promise<GradingResult> {
  const groundingText = await getGroundingTextForUnit(unit);
  const prompt = buildPrompt(unit, groundingText, question, selfLevel);
  const rawResult = await callGemini(prompt);

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
