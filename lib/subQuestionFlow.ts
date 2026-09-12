// 보조질문 만들기(2단계) / 종합 답안 쓰기(3단계) 전용 프롬프트·스키마·타입입니다.
// 메인 질문 채점 로직(lib/rubric.ts)과는 완전히 분리되어 있고, 이 파일을 고쳐도
// 메인 채점 흐름에는 영향이 없습니다.

// "OO는 OO의 오타로 보여요. 정확한 표기는 OO예요." 패턴에서 [틀린 표기]/[정확한 표기]를
// 뽑아낸다. 세 군데(buildSubQuestionCheckPrompt/buildSubAnswerCheckPrompt/
// buildEssayFeedbackPrompt)의 properNounFeedback이 전부 이 문장 틀을 쓰므로 패턴 하나를
// 공유한다.
const TYPO_FEEDBACK_PATTERN =
  /([^\s".,]+?)(?:은|는)\s+([^\s".,]+?)의\s*오타로\s*보여요\.\s*정확한\s*표기는\s*([^\s".,]+?)(?:이에요|예요|입니다)\.?/g;

// 보이지 않는 폭 없는 문자(zero-width space 등)와 공백 차이 때문에 겉보기엔 같아 보이는
// 두 문자열이 다르게 비교되는 걸 막는다. 코드포인트 숫자로만 다뤄서 소스 파일 안에 실제
// 폭 없는 문자를 심지 않는다.
const ZERO_WIDTH_CODE_POINTS = [0x200b, 0x200c, 0x200d, 0x2060, 0xfeff];
function normalizeForCompare(s: string): string {
  let out = s.normalize("NFC");
  for (const codePoint of ZERO_WIDTH_CODE_POINTS) {
    out = out.split(String.fromCodePoint(codePoint)).join("");
  }
  return out.replace(/\s/g, "");
}

// Gemini가 "OO는 OO의 오타로 보여요. 정확한 표기는 OO예요."처럼 지적한 단어와 정정한
// 단어가 완전히 같은, 자기 자신을 오타라고 지적하는 문장을 만들 때가 있다(2026-09-10,
// 박시원 학생의 "충선왕은 충선왕의 오타로 보여요. 정확한 표기는 충선왕이에요." 건 - 원문에
// 실제 오타나 숨은 유니코드 차이는 없었고 AI가 지어낸 오탐이었다). responseSchema의 STRING
// 타입은 이런 내용 검증을 걸 수 없으므로 응답을 받은 뒤 여기서 걸러낸다.
export function sanitizeProperNounFeedback(feedback: string): string {
  if (!feedback) return feedback;
  const cleaned = feedback.replace(TYPO_FEEDBACK_PATTERN, (match, wrong, correctA, correctB) => {
    const isSelfReferential =
      normalizeForCompare(wrong) === normalizeForCompare(correctA) ||
      normalizeForCompare(wrong) === normalizeForCompare(correctB);
    return isSelfReferential ? "" : match;
  });
  return cleaned.trim();
}

// 채점 심화 지침(질문/답변 다듬기 (A)(B)(C))으로 프롬프트 요구사항이 늘면서, Gemini가
// 가끔 comment/designFeedback/answerSufficiencyFeedback을 빈 문자열로 돌려주는
// 신뢰성 문제가 재발할 수 있다 - lib/rubric.ts의 FEEDBACK_FALLBACK_TEXT와 같은 이유.
// 프롬프트에 "빈 문자열 금지"를 못박아뒀지만, 그것만 믿지 않고 호출부(app/api/
// sub-questions/check, app/api/sub-answers/check)에서 한 번 더 확인해서 채운다.
export const SUB_QUESTION_COMMENT_FALLBACK =
  "이 질문을 다시 한번 살펴봐 주세요. 스스로 다듬을 부분이 있는지 확인해보면 좋겠어요.";
export const SUB_ANSWER_COMMENT_FALLBACK =
  "이 답을 다시 한번 살펴봐 주세요. 조금 더 구체적으로 적어볼 부분이 있는지 확인해보면 좋겠어요.";
export const DESIGN_FEEDBACK_FALLBACK =
  "보조질문 세트를 잘 살펴봤어요. 메인 질문에 다 답이 되는지 스스로 한번 점검해보면 좋겠어요.";
export const ANSWER_SUFFICIENCY_FEEDBACK_FALLBACK =
  "답변들을 잘 살펴봤어요. 메인 질문에 충분히 답이 되는지 스스로 한번 점검해보면 좋겠어요.";

export function ensureNonEmpty(text: string, fallback: string): string {
  return text?.trim() ? text : fallback;
}

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
  bodyScore: number; // 0~2.5, 0.5 단위
  conclusionScore: number; // 0~1, 0.5 단위
  factScore: number; // 0 또는 0.5 - 명백한 역사적 사실 오류가 없으면 0.5(만점), 있으면 0
  // 글 내용이 단원 자료와 무관하다고 AI가 판정했을 때만 채워지는 안내 문구(코드가
  // 직접 구성 - buildOffTopicEssayComment). 채워져 있으면 위 점수 4개는 의미 없는
  // 값(0)이고, 실제 저장 시엔 ""로 바뀐다(app/api/inquiry-writing/route.ts).
  topicMismatch?: string;
  // 학생 답안 속 역사적 고유명사(인물·사건·제도·기관명) 표기 오류(오타 포함)를
  // 짚어주는 참고용 피드백 - 점수(introScore 등)에는 전혀 영향을 주지 않는다.
  // 오류가 없으면 빈 문자열.
  properNounFeedback: string;
}

// 종합 글쓰기가 [읽기자료]와 완전히 다른 주제일 때 보여줄 안내 문구 - lib/rubric.ts의
// buildOffTopicResult(메인 질문용)와 같은 톤으로 통일한다.
export function buildOffTopicEssayComment(unitTitle: string): string {
  return `이 글의 내용이 제시된 단원(${unitTitle}) 자료와 관련이 없어 보입니다. 단원 자료를 참고해서 다시 작성해주세요.`;
}

export function computeEssayTotal(result: {
  introScore: number;
  bodyScore: number;
  conclusionScore: number;
  factScore: number;
}): number {
  return result.introScore + result.bodyScore + result.conclusionScore + result.factScore;
}

// [학생이 적은 보조질문 목록] 입력 순서와 응답 배열 순서가 1:1로 대응해야 한다.
export function buildSubQuestionCheckPrompt(
  unitReadingText: string,
  mainQuestion: string,
  items: { label: string; text: string }[]
): string {
  const itemsText = items
    .map((it, i) => `${i + 1}. [${it.label}] "${it.text}"`)
    .join("\n");

  return `[역할]
당신은 중학생의 역사 탐구를 돕는 코치입니다. 학생이 메인 질문 하나를 여러
보조질문으로 쪼개 봤습니다. 각 보조질문이 메인 질문과 잘 연결되는지, 그리고
보조질문 전체를 모아놓았을 때 메인 질문에 제대로 도달하는지를 코멘트하세요.

[절대 규칙]
1. 정답이나 역사적 사실, 완성된 대안 질문 문장을 대신 써주지 않는다. 방향만
   말로 안내한다.
2. 존댓말, 중학생이 이해하기 쉬운 짧은 문장을 쓴다.

[읽기자료 - 이 단원이 다루는 내용]
${unitReadingText}

[메인 질문]
"${mainQuestion}"

[학생이 만든 보조질문 목록]
${itemsText}

[고유명사·표기 확인 - properNounFeedback]
개별 판정과는 별개로, 학생이 쓴 보조질문 문구들 안에 역사적 인물·사건·제도·기관명
등 고유명사의 표기 오류(오타 포함)가 있는지 확인한다.
- 오류를 발견하면 "OO는 OO의 오타로 보여요. 정확한 표기는 OO예요."처럼 무엇이
  어떻게 틀렸는지 구체적으로 짚어준다(예: "장동행성은 정동행성의 오타로
  보여요. 정확한 표기는 정동행성이에요.").
- 이 피드백은 점수나 status("양호"/"수정 필요") 판정에는 전혀 영향을 주지
  않는 참고용이다.
- 표기 오류를 하나도 못 찾았으면 빈 문자열("")로 둔다. 확신이 서지 않으면
  언급하지 않는다.

[유형 억지 끼워맞추기 감지 - typeFitFeedback]
개별 판정과는 별개로, 학생이 고른 질문 유형(label) 형식 자체는 맞지만 메인
질문의 맥락에서 보면 억지로 끼워 맞춘 느낌이 나는 보조질문이 있는지 확인한다 -
유형이 "틀렸다"는 게 아니라, 그 유형으로 묻기에 지금 맥락이 자연스럽지
않다는 뜻이다.
- 가장 흔한 패턴: "인물 입장형"을 골라서 백성 등 인물의 감정·심정을 추측하는
  질문(예: "권문세족이 농장을 확대하면서 백성들은 얼마나 힘들었을까?"). 역사
  탐구에서는 감정을 추측하는 것보다 실제로 기록된 역사적 사실·사례를 찾아
  탐구하는 게 더 가치 있으므로, 이런 경우 "사례형"으로 바꿔볼 것을 구체적으로
  제안한다.
  예) "권문세족이 농장을 확대하면서 백성들은 얼마나 힘들었을까?"(인물
  입장형, 감정 추측) → "당시 역사적으로 기록된 권문세족의 토지 확대 사례는
  어떤 것이 있을까?"(사례형, 실제 기록 탐구)처럼, 어떤 유형으로 바꾸면 더
  자연스러운지와 그 이유를 짧게 설명한다.
- 이 외에도 형식은 맞지만 맥락상 자연스럽지 않은 조합을 발견하면 같은
  방식(더 자연스러운 유형 제안 + 이유)으로 짚어준다.
- 이 피드백은 점수나 status("양호"/"수정 필요") 판정에는 전혀 영향을 주지
  않는 참고용이다 - 유형을 바꾸라고 강제하는 게 아니라 선택지를 보여주는
  톤을 유지한다.
- 끼워맞춘 느낌이 나는 질문을 하나도 못 찾았으면 빈 문자열("")로 둔다.
  확신이 서지 않으면 언급하지 않는다.

[각 보조질문 채점 기준 - results]
- 메인 질문과 관련이 있는가(주어·초점이 메인 질문에서 다루는 대상/사건과
  이어지는가)?
- 위 [읽기자료]가 다루는 주제·시대와 완전히 다른(통째로 다른 단원 이야기인)
  질문인가? - 단순히 표현이 서툴거나 자료의 일부만 다루는 정도는 여기 해당
  하지 않는다.
- 단순 사실 확인 수준에 머물지 않고, 조금이라도 생각해볼 거리가 있는가?
- 메인 질문과 주어·초점이 완전히 동떨어졌거나 단원 주제와 완전히 다르다면
  "수정 필요"로 판정하고, 막연한 코멘트 대신 "~에 대한 내용으로 질문을
  만들어보세요"처럼 메인 질문·단원 자료와 다시 연결되는 구체적인 방향을
  제시한다.
- 위 기준을 충분히 만족하면 "양호"로 판정하고, 잘한 점을 짧게 언급한다.

[질문 다듬기 심화 지침 - comment를 쓸 때 아래 (A)(B)(C)에 해당하는 문제가 있으면
반드시 구체적으로 짚는다. 새 판정 기준이 아니라 위 status 판정 근거를 더 구체적인
말로 설명하는 지침이다]

(A) 문장의 모호성 · 역사적 오류 점검
보조질문의 주어·목적어·대상이 불분명하면(예: "누구에게" 영향을 끼쳤다는 건지,
"누가" 개혁을 했다는 건지가 안 밝혀진 경우) 어느 부분이 모호한지 정확히
지목한다. 질문 문장 자체가 [읽기자료]와 반대되는 방향으로 서술돼 있으면(예:
실제로는 A가 B에게 영향을 준 사건인데 "B가 A에게 영향을 주었다"처럼 방향이
뒤집힌 경우), 정답을 대신 알려주지 않고 "OO라고 이해하면 될까요? 그렇다면
질문을 이렇게 고쳐보면 어때요?"처럼 학생 스스로 확인하게 하는 확인 질문 +
방향 제시 형태로만 안내한다.

(B) 뻔한 가정형·비교형 점검
"만약에 ~했더라면 어떻게 되었을까?"처럼 조건을 특정하지 않은 가정형이나,
비교 대상을 명시하지 않고 그냥 "공통점과 차이점은?"이라고만 묻는 비교형은
템플릿을 그대로 베낀 것에 가깝다. 구체적인 대안(무엇을 안 했을 때인지)이나
구체적인 비교 대상(어떤 시대·인물)을 직접 명시하도록 유도한다.

(C) 추상적 개념의 구체화 점검
질문에 추상적인 표현("대외적 위기", "여러 문제" 등)만 있고 [읽기자료] 속
구체적인 역사적 개념·사건명·정책명이 안 들어가 있으면, 그 구체적인 명칭을
키워드로 넣어 질문을 다듬도록 유도한다(학생 질문의 실제 고유명사를 그대로
재사용해 완성된 대안 질문을 만들어주지는 않는다 - 위 [절대 규칙] 그대로 적용).

★ 레벨(유형) 강요 금지: 위 (A)(B)(C)는 학생이 고른 질문 유형(label)을 다른
유형으로 바꾸라고 강요하는 게 아니라, 지금 유형 안에서 더 구체적인 질문이
되도록 돕는 방향이다. 다만 그렇게 다듬었을 때 다른 유형의 특징(예: 비교 요소)이
자연스럽게 생기는 경우라면 "이렇게 더 발전시키면 다른 방향의 질문도 될 수
있어요" 정도로 참고용 한 문장만 덧붙인다 - 강요가 아니라 선택지를 보여주는
톤을 유지한다.

comment는 절대 빈 문자열로 두지 않는다 - 판정 근거를 항상 1~2문장으로 채운다.

[탐구 설계 종합 피드백 - designFeedback]
개별 보조질문 판정과는 별개로, 보조질문 전체를 하나의 세트로 봤을 때
"이 보조질문들에 다 답하면 메인 질문의 핵심적인 답에 도달할 수 있는가"를
평가하는 코멘트를 2~4문장으로 작성한다.
- 메인 질문이 묻는 핵심 요소 중 지금 보조질문 세트가 다루지 못한 부분이
  있으면 짚어준다("~에 대한 보조질문이 빠진 것 같아요"처럼).
- 반대로 메인 질문과 무관한 곁가지로 새는 보조질문이 섞여 있으면 짚어준다.
- 구성이 이미 탄탄하면(빠진 부분·곁가지 없이 메인 질문 전체를 잘 커버하면)
  그 점을 칭찬한다.
- 이 피드백은 참고용이다 - 개별 보조질문의 "양호"/"수정 필요" 판정과 결론이
  달라도(예: 개별로는 다 "양호"인데 전체 구성엔 빈틈이 있음) 괜찮다. 강제로
  뭔가를 고치라고 다그치는 톤이 아니라, 다음 단계로 넘어가도 되는 학생에게도
  참고할 만한 관찰을 주는 톤으로 쓴다.
- designFeedback도 절대 빈 문자열로 두지 않는다.

[출력]
- results: 학생이 만든 보조질문 목록과 같은 순서로, 항목마다 status("양호"
  또는 "수정 필요")와 comment(1~2문장, 절대 빈 문자열 아님) 하나씩을 담은 배열.
- designFeedback: 위 기준대로 작성한 탐구 설계 종합 피드백 문자열 하나.
- properNounFeedback: 위 [고유명사·표기 확인] 기준대로 작성한 문자열 하나
  (오류가 없으면 "").
- typeFitFeedback: 위 [유형 억지 끼워맞추기 감지] 기준대로 작성한 문자열 하나
  (문제 없으면 "").

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
    designFeedback: { type: "STRING" },
    properNounFeedback: { type: "STRING" },
    typeFitFeedback: { type: "STRING" },
  },
  required: ["results", "designFeedback", "properNounFeedback", "typeFitFeedback"],
} as const;

// 보조질문 "답변" 자체에 대한 피드백 - 보조질문 채점(위 buildSubQuestionCheckPrompt,
// 질문의 구조만 봄)과는 별개로, 학생이 각 보조질문에 실제로 적은 답 내용을 체크한다.
// status/comment 형태를 그대로 재사용해 UI에서 기존 "양호/수정 필요" 배지를 그대로
// 쓸 수 있게 했다.
export type SubAnswerCheckResult = SubQuestionCheckResult;

// [보조질문-답변 쌍] 입력 순서와 응답 배열 순서가 1:1로 대응해야 한다.
export function buildSubAnswerCheckPrompt(
  unitReadingText: string,
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

[읽기자료 - 이 단원이 다루는 내용]
${unitReadingText}

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

[답변 다듬기 심화 지침 - comment를 쓸 때 아래 (A)(C)에 해당하는 문제가 있으면
반드시 구체적으로 짚는다. 새 판정 기준이 아니라 위 status 판정 근거를 더 구체적인
말로 설명하는 지침이다]

(A) 문장의 모호성 · 역사적 오류 점검
답변의 주어·목적어·대상이 불분명하면(예: "그들이 그것을 했다"처럼 누구·무엇을
가리키는지 안 밝혀진 경우) 어느 부분이 모호한지 정확히 지목한다. 답변 내용이
[읽기자료]와 반대되는 방향으로 서술돼 있으면(위 [절대 규칙] 3번의 사실 오류에
해당) 정답을 대신 알려주지 않고 "OO라고 이해하면 될까요? 다시 한번 확인해볼까요?"
처럼 학생 스스로 확인하게 하는 확인 질문 형태로만 안내한다.

(C) 추상적 개념의 구체화 점검
답변에 추상적인 표현("여러 이유로", "그런 상황 때문에" 등)만 있고 [읽기자료]
속 구체적인 역사적 개념·사건명·정책명이 안 들어가 있으면, 그 구체적인 명칭을
넣어 답을 보완하도록 유도한다(정답 자체를 대신 채워주지는 않는다).

★ 레벨(유형) 강요 금지: 위 (A)(C)는 학생이 고른 보조질문 유형(label)이나 답변
방향을 다른 쪽으로 바꾸라고 강요하는 게 아니라, 지금 답변 안에서 더 구체적이
되도록 돕는 방향이다.

comment는 절대 빈 문자열로 두지 않는다 - 판정 근거를 항상 1~2문장으로 채운다.

[고유명사·표기 확인 - properNounFeedback]
개별 판정과는 별개로, 학생이 쓴 답 안에 역사적 인물·사건·제도·기관명 등
고유명사의 표기 오류(오타 포함)가 있는지 확인한다.
- 오류를 발견하면 "OO는 OO의 오타로 보여요. 정확한 표기는 OO예요."처럼 무엇이
  어떻게 틀렸는지 구체적으로 짚어준다(예: "장동행성은 정동행성의 오타로
  보여요. 정확한 표기는 정동행성이에요.").
- 이 피드백은 점수나 status("양호"/"수정 필요") 판정에는 전혀 영향을 주지
  않는 참고용이다.
- 표기 오류를 하나도 못 찾았으면 빈 문자열("")로 둔다. 확신이 서지 않으면
  언급하지 않는다.

[메인 질문 답변 충분성 종합 피드백 - answerSufficiencyFeedback]
개별 답변 판정과는 별개로, 위 보조질문 답변들을 전부 종합했을 때 "메인 질문에
대한 충분한 답이 되는가"를 평가하는 코멘트를 2~4문장으로 작성한다.
- 메인 질문이 묻는 핵심 요소 중 지금 답변들이 다루지 못했거나 얕게만 다룬
  부분이 있으면 짚어준다("~부분은 좀 더 구체적으로 조사해보면 좋겠어요"처럼).
- 답변들을 종합하면 메인 질문에 이미 충분히 답이 되면 그 점을 칭찬한다.
- 이 피드백은 참고용이다 - 개별 답변의 "양호"/"수정 필요" 판정과 결론이
  달라도(예: 개별로는 다 "양호"인데 전체로 보면 빠진 부분이 있음) 괜찮다.
  강제로 뭔가를 고치라고 다그치는 톤이 아니라, 이대로 다음 단계(종합 글쓰기)로
  넘어가도 되는 학생에게도 참고할 만한 관찰을 주는 톤으로 쓴다.
- answerSufficiencyFeedback도 절대 빈 문자열로 두지 않는다.

[출력]
- results: [보조질문과 학생이 쓴 답] 목록과 같은 순서로, 항목마다 status
  ("양호" 또는 "수정 필요")와 comment(1~2문장, 절대 빈 문자열 아님. 사실 오류를
  짚어줄 때는 최대 2문장) 하나씩을 담은 배열.
- answerSufficiencyFeedback: 위 기준대로 작성한 답변 충분성 종합 피드백 문자열
  하나.
- properNounFeedback: 위 [고유명사·표기 확인] 기준대로 작성한 문자열 하나
  (오류가 없으면 "").

요청한 JSON 스키마에 맞춰서만 응답하세요.`;
}

export const SUB_ANSWER_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    results: SUB_QUESTION_RESPONSE_SCHEMA.properties.results,
    answerSufficiencyFeedback: { type: "STRING" },
    properNounFeedback: { type: "STRING" },
  },
  required: ["results", "answerSufficiencyFeedback", "properNounFeedback"],
} as const;

export function buildEssayFeedbackPrompt(
  unitTitle: string,
  unitReadingText: string,
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

[읽기자료 - 이 단원(${unitTitle})이 다루는 내용]
${unitReadingText}

[0. 단원 관련성 확인 - 반드시 채점보다 먼저 판단]
학생이 쓴 서론/본론/결론이 위 [읽기자료]가 다루는 주제·시대·사건과 관련이
있는지 먼저 확인한다. topic_relevant는 "완전히 다른 주제/단원"일 때만
false로 판정하는 엄격한 기준이다 - 단순히 부실하거나 짧거나 보조질문을
잘 못 살렸다고 false로 판정하지 않는다(그런 경우는 아래 채점 항목에서
낮은 점수로 반영한다). [읽기자료]에 나온 소재를 다른 시대·인물·오늘날
관점과 비교하는 내용은 관련 있음(true)으로 본다. false면 아래 채점
항목(introScore 등)은 전부 0으로 채우고 comment는 빈 문자열로 둔다 -
코드가 별도로 안내 문구를 구성한다.

[절대 규칙]
1. 정답이나 역사적 사실을 대신 써주지 않는다. 구조에 대한 조언만 한다.
2. 존댓말, 중학생이 이해하기 쉬운 짧은 문장을 쓴다.
3. 아래 [채점 기준]의 "사실정확성" 항목은 반드시 이 규칙대로 판정한다:
   학생이 쓴 답안 속 역사적 사실이 명백히 왜곡·오류라고 판단되면, [읽기자료]
   범위 안이든 밖(보조질문이 범위 밖이라 다른 자료로 조사한 내용)이든
   관계없이 factScore를 0으로 매긴다. 오류가 사소한 표현 차이 수준이거나
   확신이 서지 않으면 factScore는 0.5(만점)로 두고 언급도 하지 않는다 -
   특히 [읽기자료] 범위 밖 내용은 당신 자신도 잘못 알고 있을 수 있으니,
   확실히 아는 내용에 대해서만 0점을 준다. factScore를 0으로 매겼다면
   아래 [코멘트 기준]에 따라 그 사실을 명확히 알려준다(단, 이때도 정답이나
   올바른 사실 자체를 대신 알려주지 않고, "다시 한번 확인해보면 좋겠어요"
   처럼 방향만 안내한다). factScore는 서론/본론/결론 점수와는 완전히 별개다
   - 사실 오류가 있어도 구조·논리가 좋으면 서론/본론/결론은 그 자체 기준으로
   따로 매긴다.

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
- 잘한 점 1가지를 먼저 짧게 칭찬한 뒤, 부족한 부분이 있으면 구조적으로
  무엇을 보완하면 좋을지 안내한다(3~4문장 이내, 아래 사실 오류 문장을
  추가하는 경우 최대 5문장까지 허용).
- 사실 오류를 코멘트에 넣을 때는 반드시 아래 규칙을 지킨다:
  · factScore가 0.5(만점)이면, 사실 오류 관련 문장을 절대 넣지 않는다.
    만점인데 뭔가 걸리는 것처럼 들리는 문장이 있으면 안 된다.
  · [절대 규칙] 3번에 따라 factScore를 0으로 매겼다면, "감점 사유: ~"로
    시작하는 문장을 코멘트 끝에 넣어 왜 깎였는지 알려준다.

[고유명사·표기 확인 - properNounFeedback]
채점과는 별개로, 학생이 쓴 서론/본론/결론 안에 역사적 인물·사건·제도·기관명
등 고유명사의 표기 오류(오타 포함)가 있는지 확인한다.
- 오류를 발견하면 "OO는 OO의 오타로 보여요. 정확한 표기는 OO예요."처럼 무엇이
  어떻게 틀렸는지 구체적으로 짚어준다(예: "장동행성은 정동행성의 오타로
  보여요. 정확한 표기는 정동행성이에요.").
- 이 피드백은 introScore 등 채점 점수나 topic_relevant 판정에는 전혀 영향을
  주지 않는 참고용이다.
- 표기 오류를 하나도 못 찾았으면 빈 문자열("")로 둔다. 확신이 서지 않으면
  언급하지 않는다.
- topic_relevant가 false인 경우에는 이 항목도 빈 문자열("")로 둔다.

[채점 기준 (총 5점, 항목별 배점 아래 참고, 각 0.5점 단위)]
- 서론(0~1점): 메인 질문에 대한 문제의식이 잘 드러났는가.
- 본론(0~2.5점): 보조질문 글쓰기 내용, 메인 질문에 따른 보조질문의
  탐구내용이 논리적으로 잘 연결되는가. 이 항목이 배점이 가장 크므로
  보조질문들이 실제로 얼마나 잘 반영·연결됐는지를 기준으로 세밀하게
  판단한다.
- 결론(0~1점): 본론의 핵심 내용을 잘 요약하고, 메인 질문에 대한 탐구 결과
  혹은(필요시) 자신의 견해가 설득력 있게 제시되었는가.
- 사실정확성(0 또는 0.5점): 위 [절대 규칙] 3번대로 판정한다 - 명백한 역사적
  사실 오류가 없으면 0.5(만점), 있으면 0.
- 서론/본론/결론은 부분 점수를 적극적으로 활용한다(완벽하지 않아도 시도가
  보이면 0점 대신 중간 점수를 준다). 정답 여부가 아니라 구조·논리적 연결을
  기준으로 채점하고, 사실 오류는 이 세 항목에 전혀 반영하지 않는다 -
  사실정확성 항목에서만 다룬다.

요청한 JSON 스키마에 맞춰서만 응답하세요.`;
}

export const ESSAY_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    topic_relevant: { type: "BOOLEAN" },
    comment: { type: "STRING" },
    introScore: { type: "NUMBER" },
    bodyScore: { type: "NUMBER" },
    conclusionScore: { type: "NUMBER" },
    factScore: { type: "NUMBER" },
    properNounFeedback: { type: "STRING" },
  },
  required: [
    "topic_relevant",
    "comment",
    "introScore",
    "bodyScore",
    "conclusionScore",
    "factScore",
    "properNounFeedback",
  ],
} as const;
