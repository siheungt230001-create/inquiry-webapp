// 보조질문 만들기(2단계) / 종합 답안 쓰기(3단계) 전용 프롬프트·스키마·타입입니다.
// 메인 질문 채점 로직(lib/rubric.ts)과는 완전히 분리되어 있고, 이 파일을 고쳐도
// 메인 채점 흐름에는 영향이 없습니다.

export interface SubQuestionCheckResult {
  status: "양호" | "수정 필요";
  comment: string;
}

// score: Gemini가 채점 기준에 따라 매긴 값. total은 Gemini에게 안 물어보고
// 코드가 세 점수를 더해서 계산한다 - Gemini 자신의 합산 계산을 신뢰하지 않는
// 원칙(lib/rubric.ts의 evaluateCriteriaScores와 동일한 이유).
export interface EssayFeedbackResult {
  comment: string;
  introScore: number; // 0~1, 0.5 단위
  bodyScore: number; // 0~3, 0.5 단위
  conclusionScore: number; // 0~1, 0.5 단위
}

export function computeEssayTotal(result: {
  introScore: number;
  bodyScore: number;
  conclusionScore: number;
}): number {
  return result.introScore + result.bodyScore + result.conclusionScore;
}

// [학생이 적은 보조질문 목록] 입력 순서와 응답 배열 순서가 1:1로 대응해야 한다.
export function buildSubQuestionCheckPrompt(
  mainQuestion: string,
  items: { label: string; text: string }[]
): string {
  const itemsText = items
    .map((it, i) => `${i + 1}. [${it.label}] "${it.text}"`)
    .join("\n");

  return `[역할]
당신은 중학생의 역사 탐구를 돕는 코치입니다. 학생이 메인 질문 하나를 여러
보조질문으로 쪼개 봤습니다. 각 보조질문이 메인 질문과 잘 연결되는지만
짧게 코멘트하세요.

[절대 규칙]
1. 정답이나 역사적 사실, 완성된 대안 질문 문장을 대신 써주지 않는다. 방향만
   말로 안내한다.
2. 존댓말, 중학생이 이해하기 쉬운 짧은 문장을 쓴다.

[메인 질문]
"${mainQuestion}"

[학생이 만든 보조질문 목록]
${itemsText}

[각 보조질문 채점 기준]
- 메인 질문과 관련이 있는가(주어·초점이 메인 질문에서 다루는 대상/사건과
  이어지는가)?
- 단순 사실 확인 수준에 머물지 않고, 조금이라도 생각해볼 거리가 있는가?
- 메인 질문과 주어·초점이 완전히 동떨어졌다면 "수정 필요"로 판정하고,
  막연한 코멘트 대신 "~에 대한 내용으로 질문을 만들어보세요"처럼 메인
  질문과 다시 연결되는 구체적인 방향을 제시한다.
- 위 기준을 충분히 만족하면 "양호"로 판정하고, 잘한 점을 짧게 언급한다.

[출력]
학생이 만든 보조질문 목록과 같은 순서로, 항목마다 status("양호" 또는
"수정 필요")와 comment(1~2문장) 하나씩을 담은 배열을 반환하세요.

요청한 JSON 스키마에 맞춰서만 응답하세요.`;
}

export const SUB_QUESTION_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    results: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          status: { type: "STRING", enum: ["양호", "수정 필요"] },
          comment: { type: "STRING" },
        },
        required: ["status", "comment"],
      },
    },
  },
  required: ["results"],
} as const;

// 보조질문 "답변" 자체에 대한 피드백 - 보조질문 채점(위 buildSubQuestionCheckPrompt,
// 질문의 구조만 봄)과는 별개로, 학생이 각 보조질문에 실제로 적은 답 내용을 체크한다.
// status/comment 형태를 그대로 재사용해 UI에서 기존 "양호/수정 필요" 배지를 그대로
// 쓸 수 있게 했다.
export type SubAnswerCheckResult = SubQuestionCheckResult;

// [보조질문-답변 쌍] 입력 순서와 응답 배열 순서가 1:1로 대응해야 한다.
export function buildSubAnswerCheckPrompt(
  mainQuestion: string,
  items: { label: string; subQuestion: string; answer: string }[]
): string {
  const itemsText = items
    .map(
      (it, i) =>
        `${i + 1}. [${it.label}] 보조질문: "${it.subQuestion}"\n   학생 답: "${
          it.answer || "(작성 안 함)"
        }"`
    )
    .join("\n");

  return `[역할]
당신은 중학생의 역사 탐구를 돕는 코치입니다. 학생이 보조질문마다 스스로 답을
찾아 적었습니다. 각 답이 그 보조질문에 실제로 답이 되는지만 짧게 코멘트하세요.

[절대 규칙]
1. 정답이나 역사적 사실을 대신 써주지 않는다. 방향만 말로 안내한다.
2. 존댓말, 중학생이 이해하기 쉬운 짧은 문장을 쓴다.
3. 학생 답에 명백히 틀린 역사적 사실이 있다고 판단되면(보조질문이 [읽기자료]
   범위 밖이라 다른 자료로 조사한 내용이어도 마찬가지), 아래 status 판정과는
   무관하게 comment에서 짚어준다. 이때도 정답을 대신 알려주지 않고 "그 부분은
   자료를 다시 한번 확인해보면 좋겠어요"처럼 스스로 확인하도록만 안내한다.
   확신이 서지 않는 내용이라면 굳이 언급하지 않는다. 사실 오류만으로는 "수정
   필요"로 판정하지 않는다(아래 4번 기준 참고).

[메인 질문]
"${mainQuestion}"

[보조질문과 학생이 쓴 답]
${itemsText}

[각 답변 판정 기준 - status]
- 답이 그 보조질문의 초점(주어·대상)에서 벗어나지 않고 실제로 답하고 있는가?
- 완전히 빈 답이거나, 질문과 무관한 내용이거나, 단순히 질문을 되풀이하기만
  했다면 "수정 필요"로 판정하고, "~에 대해 좀 더 구체적으로 적어보세요"처럼
  무엇을 보완하면 좋을지 방향을 준다.
- 답이 짧더라도 보조질문의 핵심에 답하고 있다면 "양호"로 판정하고, 잘한 점을
  짧게 언급한다. 완벽한 문장이 아니어도 괜찮다 - 정답 여부가 아니라 "질문에
  답이 되는가"만 본다.
- 위 [절대 규칙] 3번의 사실 오류는 이 판정 기준에 넣지 않는다(구조·관련성만
  본다). 사실 오류가 있어도 질문에 성실히 답했다면 "양호"로 판정하고, 사실
  확인 안내만 comment에 덧붙인다.

[출력]
[보조질문과 학생이 쓴 답] 목록과 같은 순서로, 항목마다 status("양호" 또는
"수정 필요")와 comment(1~2문장, 사실 오류를 짚어줄 때는 최대 2문장) 하나씩을
담은 배열을 반환하세요.

요청한 JSON 스키마에 맞춰서만 응답하세요.`;
}

export const SUB_ANSWER_RESPONSE_SCHEMA = SUB_QUESTION_RESPONSE_SCHEMA;

export function buildEssayFeedbackPrompt(
  mainQuestion: string,
  subQuestions: string[],
  intro: string,
  body: string,
  conclusion: string
): string {
  const subQuestionsText = subQuestions.length
    ? subQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")
    : "(작성한 보조질문 없음)";

  return `[역할]
당신은 중학생의 역사 탐구 글쓰기를 돕는 코치입니다. 학생이 메인 질문에 대해
서론-본론-결론 구조로 종합 답안을 썼습니다. 구조가 잘 갖춰졌는지만 짧게
코멘트하세요.

[절대 규칙]
1. 정답이나 역사적 사실을 대신 써주지 않는다. 구조에 대한 조언만 한다.
2. 존댓말, 중학생이 이해하기 쉬운 짧은 문장을 쓴다.
3. 학생이 쓴 답안에서 역사적 사실이 명백히 틀렸다고 판단되면(보조질문이
   [읽기자료] 범위 밖이라 다른 자료로 조사한 내용이어도 마찬가지), 아래
   [채점 기준]의 점수와는 무관하게 짚어준다. 이때도 정답이나 올바른 사실을
   대신 알려주지 않고 "그 부분은 자료를 다시 한번 확인해보면 좋겠어요"처럼
   학생이 스스로 확인하도록만 안내한다. 확신이 서지 않는 내용이라면 굳이
   언급하지 않는다.

[메인 질문]
"${mainQuestion}"

[학생이 만든 보조질문 목록]
${subQuestionsText}

[학생이 쓴 답안]
- 서론: "${intro || "(작성 안 함)"}"
- 본론: "${body || "(작성 안 함)"}"
- 결론: "${conclusion || "(작성 안 함)"}"

[코멘트 기준]
- 위 보조질문들이 본론에서 답변으로 충분히 반영됐는가?
- 결론이 메인 질문에 실제로 답하고 있는가, 아니면 딴 이야기로 끝났는가?
- 답안에 언급된 사실 중 명백히 틀린 부분이 있는가? (있다면 위 [절대 규칙]
  3번에 따라 점수에는 반영하지 않고, 코멘트 맨 끝에 한 문장만 짧게 덧붙인다.
  없으면 이 문장은 생략한다.)
- 잘한 점 1가지를 먼저 짧게 칭찬한 뒤, 부족한 부분이 있으면 구조적으로
  무엇을 보완하면 좋을지 안내한다(3~4문장 이내, 사실 오류를 짚어주는 경우
  최대 5문장까지 허용).

[채점 기준 (총 5점, 각 항목 0/0.5/1/1.5/2/2.5/3 중 해당 범위 내에서 0.5 단위로)]
- 서론(0~1점): 메인 질문에 대한 문제의식이 잘 드러났는가.
- 본론(0~3점): 보조질문 글쓰기 내용, 메인 질문에 따른 보조질문의 탐구내용이
  논리적으로 잘 연결되는가. 이 항목이 배점이 가장 크므로 보조질문들이 실제로
  얼마나 잘 반영·연결됐는지를 기준으로 세밀하게 판단한다.
- 결론(0~1점): 본론의 핵심 내용을 잘 요약하고, 메인 질문에 대한 탐구 결과
  혹은(필요시) 자신의 견해가 설득력 있게 제시되었는가.
- 부분 점수를 적극적으로 활용한다(완벽하지 않아도 시도가 보이면 0점 대신
  중간 점수를 준다). 정답 여부가 아니라 구조·논리적 연결을 기준으로 채점한다.
- 사실 오류(위 [절대 규칙] 3번)는 이 세 항목 중 어디에도 감점 요인으로 넣지
  않는다. 채점은 어디까지나 구조·논리적 연결 기준으로만 한다.

요청한 JSON 스키마에 맞춰서만 응답하세요.`;
}

export const ESSAY_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    comment: { type: "STRING" },
    introScore: { type: "NUMBER" },
    bodyScore: { type: "NUMBER" },
    conclusionScore: { type: "NUMBER" },
  },
  required: ["comment", "introScore", "bodyScore", "conclusionScore"],
} as const;
