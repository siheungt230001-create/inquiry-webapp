"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SUB_QUESTION_CARDS } from "@/lib/constants";
import type { SubQuestionCheckResult } from "@/lib/subQuestionFlow";
import AutoTextarea from "./AutoTextarea";

const MIN_FILLED = 3;

function storageKey(timestamp: string) {
  return `subq:${timestamp}`;
}

// "양호"/"수정 필요" 판정 결과 - 다음 단계(보조질문 답 쓰기)가 어떤 질문이
// "양호"였는지 알아야 해서, 값과 마찬가지로 세션스토리지에 저장해둔다.
function statusStorageKey(timestamp: string) {
  return `subqStatus:${timestamp}`;
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

export default function SubQuestionsForm({
  timestamp,
  mainQuestion,
  unit,
}: {
  timestamp: string;
  mainQuestion: string;
  unit: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<string[]>(() => SUB_QUESTION_CARDS.map(() => ""));
  const [comments, setComments] = useState<(SubQuestionCheckResult | null)[]>(
    () => SUB_QUESTION_CARDS.map(() => null)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // sessionStorage는 서버에 없으므로 마운트 후 클라이언트에서만 불러온다.
  useEffect(() => {
    setValues(loadValues(timestamp));
    setComments(loadComments(timestamp));
  }, [timestamp]);

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

      const res = await fetch("/api/sub-questions/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mainQuestion, items }),
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
      setComments(nextComments);
      saveJson(statusStorageKey(timestamp), nextComments);
    } catch {
      setError("서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  async function goToSubAnswers() {
    // 2단계 진행 상태를 서버에 남겨서 교사 화면에 보이게 한다 - 실패해도 부가 기능이라
    // 학생 흐름(다음 단계 이동)은 막지 않는다.
    try {
      const items = SUB_QUESTION_CARDS
        .map((card, i) => ({ label: card.label, question: values[i], answer: "" }))
        .filter((_, i) => values[i]?.trim());
      await fetch("/api/inquiry-writing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mainQuestionTimestamp: timestamp, subQuestions: items, draft: true }),
      });
    } catch {
      // 무시 - 진행 상태 저장은 부가 기능
    }
    router.push(
      `/submit/sub-answers?ts=${encodeURIComponent(timestamp)}&q=${encodeURIComponent(mainQuestion)}&unit=${encodeURIComponent(unit)}`
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        {unit && <div className="text-xs text-zinc-400">{unit}</div>}
        <div className="mt-1 font-bold text-zinc-900">{mainQuestion}</div>
      </div>

      {SUB_QUESTION_CARDS.map((card, i) => {
        const comment = comments[i];
        const borderClass =
          comment?.status === "양호"
            ? "border-emerald-400"
            : comment?.status === "수정 필요"
            ? "border-amber-400"
            : "border-zinc-200";

        return (
          <div
            key={card.key}
            className={`rounded-2xl border-2 bg-white p-5 shadow-sm ${borderClass}`}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-zinc-800">{card.label}</span>
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
            {card.hint && <p className="mt-1 text-xs text-zinc-400">예: {card.hint}</p>}
            <AutoTextarea
              value={values[i] ?? ""}
              onChange={(e) => updateValue(i, e.target.value)}
              className="input mt-2 min-h-[70px]"
              placeholder={card.hint ? "빈칸을 채워 나만의 질문을 만들어보세요" : "자유롭게 써보세요"}
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
      })}

      {error && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        onClick={handleCheck}
        disabled={!canCheck || loading}
        className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {loading
          ? "AI가 살펴보는 중..."
          : canCheck
          ? "AI 코멘트 받기"
          : `AI 코멘트 받기 (최소 ${MIN_FILLED}개 작성 필요, 현재 ${filledCount}개)`}
      </button>

      {needsRevisionCount > 0 && (
        <p className="text-center text-xs text-amber-600">
          {needsRevisionCount}개 질문은 다시 다듬으면 더 좋아요
        </p>
      )}

      <button
        onClick={goToSubAnswers}
        className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
      >
        보조질문 답 쓰기 →
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
