import { RESPONSE_SCHEMA } from "./rubric";
import type { GradingResult } from "./types";

// apps_script_자동화.gs의 MODEL_CANDIDATES와 동일한 발상: 여러 모델을 순서대로 시도하다가
// 실제로 되는 모델을 자동으로 골라 씁니다. Gemini 쪽 모델 이름·무료 한도가 자주 바뀌므로
// 하나로 고정하지 않습니다.
// gemini-2.5-flash-lite/gemini-2.0-flash-lite는 30명 동시 부하 테스트(2026-08-20) 중
// 실제 API가 404("no longer available")를 반환하는 걸 확인해서 뺐다 - 폴백 순서에
// 남겨둬봤자 매번 실패만 하고 시간만 잡아먹는다. 남은 후보들의 무료 티어 한도(그날 기준):
// gemini-3.1-flash-lite 분당 15회, gemini-3.5-flash-lite 분당 15회, gemini-flash-latest
// (gemini-3.7-flash) 분당 5회 - 셋을 합쳐도 30명이 1분 안에 동시에 몰리면 부족할 수 있다.
export const MODEL_CANDIDATES = [
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-flash-latest",
];

// 1순위 모델(gemini-3.1-flash-lite) 실측 무료 티어 한도 기준 - QStash 큐(app/api/submit)의
// flow-control 속도를 여기 맞춘다. 여러 모델 한도를 합쳐서 잡지 않고 제일 낮은 확실한
// 값 하나로 보수적으로 잡는다(폴백 모델까지 합산해서 계산하면 재시도 상황에서 믿을 수 없음).
export const GEMINI_RATE_LIMIT_PER_MINUTE = 15;

// 서버리스 웜 인스턴스 사이에서만 유지되는 캐시입니다 (콜드 스타트 시 초기화돼도 문제 없음 -
// 그냥 처음부터 다시 순서대로 시도할 뿐입니다). 매번 파일/DB에 쓰지 않기 위한 최적화입니다.
let lastWorkingModel: string | null = null;

async function callGeminiWithModel<T>(
  model: string,
  prompt: string,
  apiKey: string,
  schema: object
): Promise<T> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      responseMimeType: "application/json",
      responseSchema: schema,
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
      return JSON.parse(text) as T;
    }
    if (resp.status === 404) {
      throw new Error(`오류 (404, 이 모델은 이 API 키로 사용할 수 없음): ${bodyText}`);
    }
    const canRetry = (resp.status === 429 || resp.status === 503) && attempt < maxAttempts;
    if (canRetry) {
      // 지터(무작위 지연) 추가 - 학생 여러 명이 동시에 429를 받으면 재시도도 같은 타이밍에
      // 몰릴 수 있어서, 그 몰림을 완화하려고 순수 지수 백오프에 무작위 지연을 더한다.
      const delay = 1000 * Math.pow(2, attempt) + Math.random() * 500; // 약 2~2.5초, 4~4.5초...
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    throw new Error(`오류 (${resp.status}): ${bodyText}`);
  }
  throw new Error("알 수 없는 오류로 모든 재시도가 실패했습니다.");
}

// prompt + JSON 응답 스키마를 넘기면 모델 폴백·재시도까지 다 처리해주는 범용 버전.
// callGemini()(메인 채점 전용)와 재시도 로직을 공유하려고 분리했다.
export async function callGeminiGeneric<T>(prompt: string, schema: object): Promise<T> {
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
      const result = await callGeminiWithModel<T>(model, prompt, apiKey, schema);
      lastWorkingModel = model;
      return result;
    } catch (e) {
      errors.push(`${model}: ${(e as Error).message}`);
      continue;
    }
  }
  throw new Error("모든 Gemini 모델 후보가 실패했습니다:\n" + errors.join("\n"));
}

export async function callGemini(prompt: string): Promise<GradingResult> {
  return callGeminiGeneric<GradingResult>(prompt, RESPONSE_SCHEMA);
}
