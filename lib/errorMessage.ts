// 2026-09-08 반 전체가 몰려 Sheets API 할당량이 초과되자, 거의 모든 API 라우트가
// 자기가 잡은 예외 메시지를 그대로(`${message}`) JSON 응답에 실어 보내고 있던 게
// 드러났다 - "Quota exceeded for quota metric 'Read requests'..." 같은 내부
// 기술 메시지가 학생/교사 화면에 그대로 노출됐다(app/history/page.tsx는 시트에
// 남은 status 문자열을, 이 함수를 쓰는 라우트들은 방금 잡은 예외를 각자
// 노출하고 있었음 - 원인은 같다). 이 함수 하나로 모든 라우트가 사용자에게 보여줄
// 메시지를 만들게 해서, 앞으로 새 라우트를 추가해도 같은 실수가 반복되지 않게 한다.
// 원본 메시지는 서버 로그(console.error)에만 남기고 응답에는 절대 포함하지 않는다.
export function toUserErrorMessage(err: unknown, context: string): string {
  const message = (err as Error)?.message || "";
  console.error(`[${context}]`, err);
  if (/quota exceeded/i.test(message) || /429/.test(message)) {
    return "지금 이용자가 많아 처리가 지연되고 있어요. 잠시 후 다시 시도해 주세요.";
  }
  return "일시적인 오류가 발생했어요. 잠시 후 다시 시도해 주세요.";
}
