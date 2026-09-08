"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SUB_QUESTION_CARDS } from "@/lib/constants";
import type { SubQuestionCheckResult } from "@/lib/subQuestionFlow";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import AutoTextarea from "./AutoTextarea";
import { ArrowRightIcon, CheckIcon, WarningIcon } from "./icons";

const MIN_FILLED = 3;

function storageKey(timestamp: string) {
  return `subq:${timestamp}`;
}

// "양호"/"수정 필요" 판정 결과 - 다음 단계(보조질문 답 쓰기)가 어떤 질문이
// "양호"였는지 알아야 해서, 값과 마찬가지로 세션스토리지에 저장해둔다.
function statusStorageKey(timestamp: string) {
  return `subqStatus:${timestamp}`;
}

// 보조질문 "판정"할 때마다 개별 코멘트와 함께 받는 종합(탐구 설계) 피드백 -
// 참고용이라 진행을 막지는 않지만, 새로고침해도 남아있게 개별 코멘트와 같은
// 방식(세션스토리지 + 서버 저장)으로 들고 다닌다.
function designFeedbackKey(timestamp: string) {
  return `subqDesign:${timestamp}`;
}

// 답변/답변 판정/출처는 이 화면(보조질문 만들기) 소관이 아니라 SubAnswersForm이 쓰는
// 값이지만, saveDraft가 여기서도 같이 저장을 호출하므로 기존 값을 읽어와 그대로
// 실어 보내야 한다 - 안 그러면 여기서 저장할 때마다 답변/출처가 빈 문자열로 덮어써진다.
function answersStorageKey(timestamp: string) {
  return `subAnswers:${timestamp}`;
}
function answerStatusStorageKey(timestamp: string) {
  return `subAnswerStatus:${timestamp}`;
}
function answerSourceStorageKey(timestamp: string) {
  return `subAnswerSource:${timestamp}`;
}

function saveJson(key: string, value: unknown) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 사생활 보호 모드 등에서 sessionStorage 쓰기가 막혀 있어도 화면은 계속 동작하게 둔다
  }
}

function loadValues(timestamp: string): string[] {
  if (typeof window === "undefined") return SUB_QUESTION_CARDS.map(() => "");
  try {
    const saved = window.sessionStorage.getItem(storageKey(timestamp));
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length === SUB_QUESTION_CARDS.length) return parsed;
    }
  } catch {
    // 저장된 값이 깨졌으면 그냥 빈 값으로 시작
  }
  return SUB_QUESTION_CARDS.map(() => "");
}

function loadComments(timestamp: string): (SubQuestionCheckResult | null)[] {
  if (typeof window === "undefined") return SUB_QUESTION_CARDS.map(() => null);
  try {
    const saved = window.sessionStorage.getItem(statusStorageKey(timestamp));
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length === SUB_QUESTION_CARDS.length) return parsed;
    }
  } catch {
    // 저장된 값이 깨졌으면 그냥 빈 값으로 시작
  }
  return SUB_QUESTION_CARDS.map(() => null);
}

function loadDesignFeedback(timestamp: string): string {
  if (typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(designFeedbackKey(timestamp)) || "";
  } catch {
    return "";
  }
}

function saveDesignFeedback(timestamp: string, value: string) {
  try {
    window.sessionStorage.setItem(designFeedbackKey(timestamp), value);
  } catch {
    // 사생활 보호 모드 등에서 sessionStorage 쓰기가 막혀 있어도 화면은 계속 동작하게 둔다
  }
}

function loadCardArray<T>(key: string, fallback: T): T[] {
  if (typeof window === "undefined") return SUB_QUESTION_CARDS.map(() => fallback);
  try {
    const saved = window.sessionStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length === SUB_QUESTION_CARDS.length) return parsed;
    }
  } catch {
    // 저장된 값이 깨졌으면 그냥 기본값으로 시작
  }
  return SUB_QUESTION_CARDS.map(() => fallback);
}

export default function SubQuestionsForm({
  timestamp,
  mainQuestion,
  unit,
  isTeacherView = false,
}: {
  timestamp: string;
  mainQuestion: string;
  unit: string;
  isTeacherView?: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<string[]>(() => SUB_QUESTION_CARDS.map(() => ""));
  const [comments, setComments] = useState<(SubQuestionCheckResult | null)[]>(
    () => SUB_QUESTION_CARDS.map(() => null)
  );
  const [designFeedback, setDesignFeedback] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // sessionStorage는 서버에 없으므로 마운트 후 클라이언트에서만 불러온다. sessionStorage는
  // 탭을 닫거나 다른 기기로 오면 비어 있으므로, 그럴 때는 서버(시트)에 남은 진행 상황을
  // 대신 불러온다 - 탭을 다시 열면 다 사라져 보이던 버그의 원인이 sessionStorage 단일
  // 저장소였던 부분.
  useEffect(() => {
    const localValues = loadValues(timestamp);
    const localComments = loadComments(timestamp);
    // 교사가 다른 학생의 ts를 열람할 땐 sessionStorage를 신뢰하지 않는다 - 자세한 이유는
    // SubAnswersForm의 같은 분기 주석 참고.
    const hasLocalData = !isTeacherView && localValues.some((v) => v.trim());
    if (hasLocalData) {
      setValues(localValues);
      setComments(localComments);
      setDesignFeedback(loadDesignFeedback(timestamp));
      return;
    }
    let cancelled = false;
    fetch(`/api/inquiry-writing?ts=${encodeURIComponent(timestamp)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data.record) return;
        const items = data.record.subQuestions as {
          question: string;
          status?: SubQuestionCheckResult["status"] | null;
          comment?: string;
        }[];
        const nextValues = SUB_QUESTION_CARDS.map((_, i) => items[i]?.question ?? "");
        const nextComments = SUB_QUESTION_CARDS.map((_, i) =>
          items[i]?.status ? { status: items[i].status!, comment: items[i].comment ?? "" } : null
        );
        const nextDesignFeedback = (data.record.subQuestionDesignFeedback as string) || "";
        setValues(nextValues);
        setComments(nextComments);
        setDesignFeedback(nextDesignFeedback);
        saveJson(storageKey(timestamp), nextValues);
        saveJson(statusStorageKey(timestamp), nextComments);
        saveDesignFeedback(timestamp, nextDesignFeedback);
      })
      .catch(() => {
        // 서버에서 못 불러와도 빈 값으로 계속 진행 - 원래도 처음 쓰는 학생은 빈 값으로 시작한다
      });
    return () => {
      cancelled = true;
    };
  }, [timestamp, isTeacherView]);

  // 진행 상황(보조질문 + AI 판정)을 서버에 남긴다 - 다음 단계로 넘어갈 때뿐 아니라 AI
  // 코멘트를 받은 직후에도 저장해서, 학생이 그대로 탭을 닫아도 다시 들어왔을 때 이어 쓸 수
  // 있게 한다. 실패해도 부가 기능이라 화면 흐름은 막지 않는다.
  // 반환값(성공 여부)은 자동 저장 호출부(handleCheck/goToSubAnswers)는 무시하고, "임시
  // 저장" 버튼(handleSaveDraft)만 써서 확인/실패 문구를 보여준다.
  async function saveDraft(
    nextValues: string[],
    nextComments: (SubQuestionCheckResult | null)[],
    nextDesignFeedback: string
  ): Promise<boolean> {
    try {
      const answers = loadCardArray<string>(answersStorageKey(timestamp), "");
      const answerStatuses = loadCardArray<SubQuestionCheckResult | null>(
        answerStatusStorageKey(timestamp),
        null
      );
      const sources = loadCardArray<string>(answerSourceStorageKey(timestamp), "");
      const items = SUB_QUESTION_CARDS.map((card, i) => ({
        label: card.label,
        question: nextValues[i],
        answer: answers[i] ?? "",
        status: nextComments[i]?.status ?? null,
        comment: nextComments[i]?.comment ?? "",
        answerStatus: answerStatuses[i]?.status ?? null,
        answerComment: answerStatuses[i]?.comment ?? "",
        source: sources[i] ?? "",
      })).filter((_, i) => nextValues[i]?.trim());
      const res = await fetchWithTimeout("/api/inquiry-writing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mainQuestionTimestamp: timestamp,
          subQuestions: items,
          draft: true,
          subQuestionDesignFeedback: nextDesignFeedback,
        }),
      });
      return res.ok;
    } catch {
      // 무시 - 진행 상태 저장은 부가 기능(자동 호출 시). 수동 호출은 아래서 false를 보고 안내한다.
      return false;
    }
  }

  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [draftSaveError, setDraftSaveError] = useState(false);

  // "AI 코멘트 받기"와 무관하게 지금 입력만 그대로 저장 - 아직 판정을 안 받아도(질문이
  // 다 안 채워졌어도) 학생이 원할 때 바로 저장할 수 있게 한다.
  async function handleSaveDraft() {
    setSavingDraft(true);
    setDraftSaved(false);
    setDraftSaveError(false);
    const ok = await saveDraft(values, comments, designFeedback);
    setSavingDraft(false);
    if (ok) setDraftSaved(true);
    else setDraftSaveError(true);
  }

  function updateValue(index: number, text: string) {
    const next = [...values];
    next[index] = text;
    setValues(next);
    saveJson(storageKey(timestamp), next);
    // 내용을 고치면 그 카드의 이전 코멘트는 더 이상 맞지 않으니 지운다.
    if (comments[index]) {
      const nextComments = [...comments];
      nextComments[index] = null;
      setComments(nextComments);
      saveJson(statusStorageKey(timestamp), nextComments);
    }
    // 구성이 바뀌었으니 종합(탐구 설계) 피드백도 더 이상 맞지 않는다 - 다시 판정받아야
    // 새로 생긴다("보조질문을 수정하고 다시 판정받으면 재생성" 요구사항).
    if (designFeedback) {
      setDesignFeedback("");
      saveDesignFeedback(timestamp, "");
    }
    setDraftSaved(false);
    setDraftSaveError(false);
  }

  const filledCount = values.filter((v) => v.trim()).length;
  const canCheck = filledCount >= MIN_FILLED;
  const needsRevisionCount = comments.filter((c) => c?.status === "수정 필요").length;

  async function handleCheck() {
    setLoading(true);
    setError(null);
    try {
      const filledIndexes = values
        .map((v, i) => (v.trim() ? i : -1))
        .filter((i) => i !== -1);
      const items = filledIndexes.map((i) => ({
        label: SUB_QUESTION_CARDS[i].label,
        text: values[i],
      }));

      const res = await fetchWithTimeout("/api/sub-questions/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unit, mainQuestion, items }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "알 수 없는 오류가 발생했습니다.");
        return;
      }

      const results = data.results as SubQuestionCheckResult[];
      const nextComments = SUB_QUESTION_CARDS.map(() => null as SubQuestionCheckResult | null);
      filledIndexes.forEach((i, resultIdx) => {
        nextComments[i] = results[resultIdx] ?? null;
      });
      const nextDesignFeedback = (data.designFeedback as string) || "";
      setComments(nextComments);
      setDesignFeedback(nextDesignFeedback);
      saveJson(statusStorageKey(timestamp), nextComments);
      saveDesignFeedback(timestamp, nextDesignFeedback);
      saveDraft(values, nextComments, nextDesignFeedback);
    } catch {
      setError("코멘트를 받아오는 데 시간이 오래 걸리고 있어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  async function goToSubAnswers() {
    // 2단계 진행 상태를 서버에 다시 한번 남겨서 교사 화면에 보이게 한다 - 실패해도
    // 부가 기능이라 학생 흐름(다음 단계 이동)은 막지 않는다.
    await saveDraft(values, comments, designFeedback);
    router.push(
      `/submit/sub-answers?ts=${encodeURIComponent(timestamp)}&q=${encodeURIComponent(mainQuestion)}&unit=${encodeURIComponent(unit)}`
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-5">
        {unit && <div className="text-xs font-medium text-[var(--color-ink-muted)]">{unit}</div>}
        <div className="mt-1 font-bold text-[var(--color-ink)]">{mainQuestion}</div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={savingDraft}
          className="btn-secondary !px-4 !py-1.5 !text-xs"
        >
          {savingDraft ? "저장하는 중..." : "임시 저장"}
        </button>
        {draftSaved && (
          <span className="text-xs text-[var(--color-mint-deep)]">임시 저장됐어요</span>
        )}
        {draftSaveError && (
          <span className="text-xs text-[var(--color-badge-text)]">저장에 실패했어요. 다시 시도해 주세요.</span>
        )}
      </div>

      {designFeedback && (
        <div className="card card-lavender p-5">
          <p className="text-sm font-semibold text-[var(--color-lavender-deep)]">🎯 탐구 설계 피드백</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--color-ink)]">{designFeedback}</p>
          <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
            참고용 의견이에요 - 이대로 다음 단계로 넘어가도 괜찮아요.
          </p>
        </div>
      )}

      {SUB_QUESTION_CARDS.map((card, i) => {
        const comment = comments[i];
        const statusAccent =
          comment?.status === "양호" ? "card-mint" : comment?.status === "수정 필요" ? "card-peach" : "";

        return (
          <div key={card.key} className={`card p-5 ${statusAccent}`}>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[var(--color-ink)]">{card.label}</span>
              {comment?.status === "양호" && (
                <CheckIcon className="text-[var(--color-mint-deep)]" aria-label="양호" />
              )}
              {comment?.status === "수정 필요" && (
                <WarningIcon className="text-[var(--color-badge-text)]" aria-label="수정 필요" />
              )}
            </div>
            {card.hint && <p className="mt-1 text-xs text-[var(--color-ink-muted)]">예: {card.hint}</p>}
            <AutoTextarea
              value={values[i] ?? ""}
              onChange={(e) => updateValue(i, e.target.value)}
              className="input mt-2 min-h-[70px]"
              placeholder={card.hint ? "빈칸을 채워 나만의 질문을 만들어보세요" : "자유롭게 써보세요"}
            />
            {comment && (
              <p
                className={`mt-2 text-sm ${
                  comment.status === "양호" ? "text-[var(--color-mint-deep)]" : "text-[var(--color-badge-text)]"
                }`}
              >
                {comment.comment}
              </p>
            )}
          </div>
        );
      })}

      {error && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button onClick={handleCheck} disabled={!canCheck || loading} className="btn-primary">
        {loading
          ? "AI가 살펴보는 중..."
          : canCheck
          ? "AI 코멘트 받기"
          : `AI 코멘트 받기 (최소 ${MIN_FILLED}개 작성 필요, 현재 ${filledCount}개)`}
      </button>

      {needsRevisionCount > 0 && (
        <p className="text-center text-xs text-[var(--color-badge-text)]">
          {needsRevisionCount}개 질문은 다시 다듬으면 더 좋아요
        </p>
      )}

      <button onClick={goToSubAnswers} className="btn-secondary flex items-center justify-center gap-1">
        보조질문 답 쓰기 <ArrowRightIcon />
      </button>
    </div>
  );
}
