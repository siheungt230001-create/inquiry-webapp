import { RESPONSE_SCHEMA } from "./rubric";
import type { GradingResult } from "./types";

// apps_script_자동화.gs의 MODEL_CANDIDATES와 동일한 발상: 여러 모델을 순서대로 시도하다가
// 실제로 되는 모델을 자동으로 골라 씁니다. Gemini 쪽 모델 이름·무료 한도가 자주 바뀌므로
// 하나로 고정하지 않습니다.
export const MODEL_CANDIDATES = [
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
  "gemini-flash-latest",
];

// 서버리스 웜 인스턴스 사이에서만 유지되는 캐시입니다 (콜드 스타트 시 초기화돼도 문제 없음 -
// 그냥 처음부터 다시 순서대로 시도할 뿐입니다). 매번 파일/DB에 쓰지 않기 위한 최적화입니다.
let lastWorkingModel: string | null = null;

async function callGeminiWithModel(
  model: string,
  prompt: string,
  apiKey: string
): Promise<GradingResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  };

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const bodyText = await resp.text();

    if (resp.status === 200) {
      const data = JSON.parse(bodyText);
      const text = data.candidates[0].content.parts[0].text;
      return JSON.parse(text) as GradingResult;
    }
    if (resp.status === 404) {
      throw new Error(`오류 (404, 이 모델은 이 API 키로 사용할 수 없음): ${bodyText}`);
    }
    const canRetry = (resp.status === 429 || resp.status === 503) && attempt < maxAttempts;
    if (canRetry) {
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt))); // 2초, 4초...
      continue;
    }
    throw new Error(`오류 (${resp.status}): ${bodyText}`);
  }
  throw new Error("알 수 없는 오류로 모든 재시도가 실패했습니다.");
}

export async function callGemini(prompt: string): Promise<GradingResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY 환경변수가 설정되지 않았습니다. .env.local을 확인하세요.");
  }

  let modelsToTry = [...MODEL_CANDIDATES];
  if (lastWorkingModel && modelsToTry.includes(lastWorkingModel)) {
    modelsToTry = [lastWorkingModel, ...modelsToTry.filter((m) => m !== lastWorkingModel)];
  }

  const errors: string[] = [];
  for (const model of modelsToTry) {
    try {
      const result = await callGeminiWithModel(model, prompt, apiKey);
      lastWorkingModel = model;
      return result;
    } catch (e) {
      errors.push(`${model}: ${(e as Error).message}`);
      continue;
    }
  }
  throw new Error("모든 Gemini 모델 후보가 실패했습니다:\n" + errors.join("\n"));
}
