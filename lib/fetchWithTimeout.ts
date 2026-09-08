// 2026-09-08 반 전체가 몰려 Google Sheets API 할당량이 초과되자, withRetry(재시도)가
// 오래 걸리는 동안 클라이언트 fetch가 끝없이 매달려서 "저장하는 중..." 같은 로딩
// 상태가 영원히 안 풀리는 사고가 여러 화면(프로필 수정 등)에서 반복됐다. 서버 쪽
// 재시도 시간과 무관하게 클라이언트가 일정 시간 뒤엔 포기하고 사용자에게 명확히
// 알리도록, 상호작용형(사용자가 응답을 기다리는) fetch 호출에 공통으로 씌우는 타임아웃.
export class FetchTimeoutError extends Error {
  constructor() {
    super("요청 시간이 너무 오래 걸리고 있어요.");
    this.name = "FetchTimeoutError";
  }
}

export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs = 18000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw new FetchTimeoutError();
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
