import { createHash } from "node:crypto";
import type { EssayFeedbackResult } from "./subQuestionFlow";

// "AI 피드백 받기"(app/api/essay-feedback)와 "제출하기"(app/api/inquiry-writing, draft:false)가
// 글이 안 바뀌었는데도 매번 따로 Gemini를 불러 채점하던 문제를 막는다. 점수는 여전히
// 클라이언트를 믿지 않는다 - 재사용 여부는 서버가 직접 계산한 입력 해시가 일치할 때만
// 허용하고, 반환값은 항상 이 캐시에 저장해둔(=실제로 Gemini가 채점한) 결과다.
//
// lib/gemini.ts의 lastWorkingModel과 같은 패턴: 서버리스 웜 인스턴스 사이에서만 유지되는
// 캐시라 콜드 스타트로 비어도 문제 없다 - 그냥 다시 채점할 뿐이다.
const cache = new Map<string, { hash: string; result: EssayFeedbackResult }>();

export function hashEssayInputs(
  mainQuestion: string,
  subQuestions: string[],
  intro: string,
  body: string,
  conclusion: string
): string {
  return createHash("sha256")
    .update(JSON.stringify([mainQuestion, subQuestions, intro, body, conclusion]))
    .digest("hex");
}

export function rememberEssayFeedback(key: string, hash: string, result: EssayFeedbackResult) {
  cache.set(key, { hash, result });
}

export function recallEssayFeedback(key: string, hash: string): EssayFeedbackResult | null {
  const entry = cache.get(key);
  return entry && entry.hash === hash ? entry.result : null;
}
