"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SUB_QUESTION_CARDS } from "@/lib/constants";
import type { SubQuestionCheckResult } from "@/lib/subQuestionFlow";
import { useDebouncedEffect } from "@/lib/useDebouncedEffect";
import AutoTextarea from "./AutoTextarea";

function valuesKey(timestamp: string) {
  return `subq:${timestamp}`;
}
function statusKey(timestamp: string) {
  return `subqStatus:${timestamp}`;
}
function answersKey(timestamp: string) {
  return `subAnswers:${timestamp}`;
}
function answerStatusKey(timestamp: string) {
  return `subAnswerStatus:${timestamp}`;
}

function loadJson<T>(key: string, fallback: T, isValidShape?: (v: unknown) => boolean): T {
  if (typeof window === "undefined") return fallback;
  try {
    const saved = window.sessionStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (!isValidShape || isValidShape(parsed)) return parsed as T;
    }
  } catch {
    // 저장된 값이 깨졌으면 그냥 기본값으로 시작
  }
  return fallback;
}

function saveJson(key: string, value: unknown) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 사생활 보호 모드 등에서 sessionStorage 쓰기가 막혀 있어도 화면은 계속 동작하게 둔다
  }
}

function isCardLengthArray(v: unknown): boolean {
  return Array.isArray(v) && v.length === SUB_QUESTION_CARDS.length;
}

interface ApprovedItem {
  index: number;
  label: string;
  text: string;
}

export default function SubAnswersForm({
  timestamp,
  mainQuestion,
  readingText,
}: {
  timestamp: string;
  mainQuestion: string;
  readingText: string;
}) {
  const router = useRouter();
  const [approvedItems, setApprovedItems] = useState<ApprovedItem[]>([]);
  const [answers, setAnswers] = useState<string[]>(() => SUB_QUESTION_CARDS.map(() => ""));
  // "수정 필요"거나 아직 판정 안 받은 보조질문도 그대로 들고 있어야, 답변 자동 저장 시
  // subQuestionsJson을 통째로 덮어쓰면서 그 항목들 내용을 날려버리지 않는다.
  const [allValues, setAllValues] = useState<string[]>(() => SUB_QUESTION_CARDS.map(() => ""));
  const [allStatuses, setAllStatuses] = useState<(SubQuestionCheckResult | null)[]>(
    () => SUB_QUESTION_CARDS.map(() => null)
  );
  // 답변 "내용"에 대한 AI 판정 - 보조질문 자체의 판정(allStatuses)과는 별개 축.
  const [answerComments, setAnswerComments] = useState<(SubQuestionCheckResult | null)[]>(
    () => SUB_QUESTION_CARDS.map(() => null)
  );
  const [loaded, setLoaded] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  function applyItemsToState(
    values: string[],
    statuses: (SubQuestionCheckResult | null)[],
    answersValue: string[],
    answerStatuses: (SubQuestionCheckResult | null)[]
  ) {
    const items: ApprovedItem[] = [];
    SUB_QUESTION_CARDS.forEach((card, i) => {
      if (statuses[i]?.status === "양호" && values[i]?.trim()) {
        items.push({ index: i, label: card.label, text: values[i] });
      }
    });
    setApprovedItems(items);
    setAnswers(answersValue);
    setAllValues(values);
    setAllStatuses(statuses);
    setAnswerComments(answerStatuses);
  }

  // sessionStorage에 값이 있으면(같은 탭에서 이어서 들어온 경우) 그걸 우선 쓰고, 비어
  // 있으면(탭을 닫았다 열거나 다른 기기) 서버(시트)에 남은 진행 상황을 불러온다.
  useEffect(() => {
    const values = loadJson<string[]>(
      valuesKey(timestamp),
      SUB_QUESTION_CARDS.map(() => ""),
      isCardLengthArray
    );
    const statuses = loadJson<(SubQuestionCheckResult | null)[]>(
      statusKey(timestamp),
      SUB_QUESTION_CARDS.map(() => null),
      isCardLengthArray
    );
    const answers = loadJson<string[]>(
      answersKey(timestamp),
      SUB_QUESTION_CARDS.map(() => ""),
      isCardLengthArray
    );
    const answerStatuses = loadJson<(SubQuestionCheckResult | null)[]>(
      answerStatusKey(timestamp),
      SUB_QUESTION_CARDS.map(() => null),
      isCardLengthArray
    );

    if (values.some((v) => v.trim())) {
      applyItemsToState(values, statuses, answers, answerStatuses);
      setLoaded(true);
      return;
    }

    let cancelled = false;
    fetch(`/api/inquiry-writing?ts=${encodeURIComponent(timestamp)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.record) {
          setLoaded(true);
          return;
        }
        const serverItems = data.record.subQuestions as {
          question: string;
          answer: string;
          status?: SubQuestionCheckResult["status"] | null;
          answerStatus?: SubQuestionCheckResult["status"] | null;
          answerComment?: string;
        }[];
        const nextValues = SUB_QUESTION_CARDS.map((_, i) => serverItems[i]?.question ?? "");
        const nextStatuses = SUB_QUESTION_CARDS.map((_, i) =>
          serverItems[i]?.status ? { status: serverItems[i].status!, comment: "" } : null
        );
        const nextAnswers = SUB_QUESTION_CARDS.map((_, i) => serverItems[i]?.answer ?? "");
        const nextAnswerStatuses = SUB_QUESTION_CARDS.map((_, i) =>
          serverItems[i]?.answerStatus
            ? { status: serverItems[i].answerStatus!, comment: serverItems[i]?.answerComment ?? "" }
            : null
        );
        applyItemsToState(nextValues, nextStatuses, nextAnswers, nextAnswerStatuses);
        saveJson(valuesKey(timestamp), nextValues);
        saveJson(statusKey(timestamp), nextStatuses);
        saveJson(answersKey(timestamp), nextAnswers);
        saveJson(answerStatusKey(timestamp), nextAnswerStatuses);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [timestamp]);

  function updateAnswer(index: number, text: string) {
    const next = [...answers];
    next[index] = text;
    setAnswers(next);
    saveJson(answersKey(timestamp), next);
    // 답을 고치면 그 항목의 이전 AI 피드백은 더 이상 맞지 않으니 지운다.
    if (answerComments[index]) {
      const nextComments = [...answerComments];
      nextComments[index] = null;
      setAnswerComments(nextComments);
      saveJson(answerStatusKey(timestamp), nextComments);
    }
  }

  const filledAnswerCount = approvedItems.filter((item) => answers[item.index]?.trim()).length;

  async function handleCheckAnswers() {
    setChecking(true);
    setCheckError(null);
    try {
      const items = approvedItems.map((item) => ({
        label: item.label,
        subQuestion: item.text,
        answer: answers[item.index] ?? "",
      }));
      const res = await fetch("/api/sub-answers/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mainQuestion, items }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCheckError(data.error || "알 수 없는 오류가 발생했습니다.");
        return;
      }
      const results = data.results as SubQuestionCheckResult[];
      const nextComments = [...answerComments];
      approvedItems.forEach((item, i) => {
        nextComments[item.index] = results[i] ?? null;
      });
      setAnswerComments(nextComments);
      saveJson(answerStatusKey(timestamp), nextComments);
    } catch {
      setCheckError("서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setChecking(false);
    }
  }

  // 답변을 입력하는 동안 타이핑이 잠깐 멈추면 서버에도 진행 상황을 저장한다 - 이 화면
  // 자체에는 원래 서버 저장 호출이 아예 없어서, sessionStorage만 지워지면(탭 닫기 등)
  // 답변이 통째로 사라지는 게 버그의 핵심 원인이었다. "양호" 아닌 항목까지 포함한
  // allValues/allStatuses를 그대로 같이 보내야 subQuestionsJson 전체 덮어쓰기로
  // 그 항목들이 날아가지 않는다.
  useDebouncedEffect(
    () => {
      if (!loaded || approvedItems.length === 0) return;
      const payloadItems = SUB_QUESTION_CARDS
        .map((card, i) => ({
          label: card.label,
          question: allValues[i],
          answer: approvedItems.some((a) => a.index === i) ? answers[i] ?? "" : "",
          status: allStatuses[i]?.status ?? null,
          comment: allStatuses[i]?.comment ?? "",
          answerStatus: answerComments[i]?.status ?? null,
          answerComment: answerComments[i]?.comment ?? "",
        }))
        .filter((_, i) => allValues[i]?.trim());
      fetch("/api/inquiry-writing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mainQuestionTimestamp: timestamp, subQuestions: payloadItems, draft: true }),
      }).catch(() => {
        // 무시 - 자동 저장은 부가 기능, 실패해도 화면 흐름은 막지 않는다
      });
    },
    [answers, loaded, approvedItems, allValues, allStatuses, answerComments],
    800
  );

  function goToAnswer() {
    router.push(
      `/submit/answer?ts=${encodeURIComponent(timestamp)}&q=${encodeURIComponent(mainQuestion)}`
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-xs text-zinc-400">메인 질문</div>
        <div className="mt-1 font-bold text-zinc-900">{mainQuestion}</div>
      </div>

      {readingText && (
        <details className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <summary className="cursor-pointer text-sm font-medium text-zinc-700">
            읽기자료 보기
          </summary>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
            {readingText}
          </p>
        </details>
      )}

      {approvedItems.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-center shadow-sm">
          <p className="text-sm text-zinc-500">
            아직 &quot;양호&quot; 판정을 받은 보조질문이 없어요.
          </p>
          <Link
            href={`/submit/sub-questions?ts=${encodeURIComponent(timestamp)}&q=${encodeURIComponent(mainQuestion)}`}
            className="mt-2 inline-block text-sm font-medium text-indigo-600 underline"
          >
            보조질문 만들기로 돌아가서 AI 코멘트 받기
          </Link>
        </div>
      ) : (
        approvedItems.map((item) => {
          const comment = answerComments[item.index];
          const borderClass =
            comment?.status === "양호"
              ? "border-emerald-400"
              : comment?.status === "수정 필요"
              ? "border-amber-400"
              : "border-zinc-200";

          return (
            <div
              key={item.index}
              className={`rounded-2xl border-2 bg-white p-5 shadow-sm ${borderClass}`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">{item.label}</span>
                {comment?.status === "양호" && (
                  <span className="text-emerald-600" aria-label="양호">
                    ✓
                  </span>
                )}
                {comment?.status === "수정 필요" && (
                  <span className="text-amber-600" aria-label="수정 필요">
                    ⚠
                  </span>
                )}
              </div>
              <div className="mt-1 font-semibold text-zinc-900">{item.text}</div>
              <AutoTextarea
                value={answers[item.index] ?? ""}
                onChange={(e) => updateAnswer(item.index, e.target.value)}
                className="input mt-2 min-h-[90px]"
                placeholder="이 질문에 대해 찾은 내용이나 생각을 적어보세요"
              />
              {comment && (
                <p
                  className={`mt-2 text-sm ${
                    comment.status === "양호" ? "text-emerald-700" : "text-amber-700"
                  }`}
                >
                  {comment.comment}
                </p>
              )}
            </div>
          );
        })
      )}

      {checkError && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {checkError}
        </p>
      )}

      {approvedItems.length > 0 && (
        <button
          onClick={handleCheckAnswers}
          disabled={checking || filledAnswerCount === 0}
          className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {checking
            ? "AI가 살펴보는 중..."
            : filledAnswerCount === 0
            ? "AI 피드백 받기 (답을 먼저 적어주세요)"
            : "AI 피드백 받기"}
        </button>
      )}

      <button
        onClick={goToAnswer}
        className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
      >
        종합 답안 쓰기 →
      </button>

      <style jsx global>{`
        .input {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid #d4d4d8;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          outline: none;
        }
        .input:focus {
          border-color: #71717a;
        }
      `}</style>
    </div>
  );
}
