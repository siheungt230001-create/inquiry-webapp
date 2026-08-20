"use client";

import { useEffect, useState } from "react";
import { SUB_QUESTION_CARDS } from "@/lib/constants";
import type { SubQuestionCheckResult } from "@/lib/subQuestionFlow";
import AutoTextarea from "./AutoTextarea";

interface Essay {
  intro: string;
  body: string;
  conclusion: string;
}

interface EssayScores {
  introScore: number;
  bodyScore: number;
  conclusionScore: number;
  totalScore: number;
}

interface SubQA {
  label: string;
  question: string;
  answer: string;
}

const EMPTY_ESSAY: Essay = { intro: "", body: "", conclusion: "" };

function subQuestionsKey(timestamp: string) {
  return `subq:${timestamp}`;
}
function subQuestionsStatusKey(timestamp: string) {
  return `subqStatus:${timestamp}`;
}
function subAnswersKey(timestamp: string) {
  return `subAnswers:${timestamp}`;
}

function essayKey(timestamp: string) {
  return `essay:${timestamp}`;
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

// "양호" 판정을 받고(2단계) 답까지 적은(보조질문 답 쓰기 단계) 것만 참고 자료로 보여준다.
function loadSubQAs(timestamp: string): SubQA[] {
  const values = loadJson<string[]>(
    subQuestionsKey(timestamp),
    SUB_QUESTION_CARDS.map(() => ""),
    isCardLengthArray
  );
  const statuses = loadJson<(SubQuestionCheckResult | null)[]>(
    subQuestionsStatusKey(timestamp),
    SUB_QUESTION_CARDS.map(() => null),
    isCardLengthArray
  );
  const answers = loadJson<string[]>(
    subAnswersKey(timestamp),
    SUB_QUESTION_CARDS.map(() => ""),
    isCardLengthArray
  );

  const result: SubQA[] = [];
  SUB_QUESTION_CARDS.forEach((card, i) => {
    if (statuses[i]?.status === "양호" && values[i]?.trim()) {
      result.push({ label: card.label, question: values[i], answer: answers[i] ?? "" });
    }
  });
  return result;
}

function loadEssay(timestamp: string): Essay {
  if (typeof window === "undefined") return EMPTY_ESSAY;
  try {
    const saved = window.sessionStorage.getItem(essayKey(timestamp));
    if (saved) return { ...EMPTY_ESSAY, ...JSON.parse(saved) };
  } catch {
    // 저장된 값이 깨졌으면 그냥 빈 값으로 시작
  }
  return EMPTY_ESSAY;
}

export default function AnswerForm({
  timestamp,
  mainQuestion,
}: {
  timestamp: string;
  mainQuestion: string;
}) {
  const [subQAs, setSubQAs] = useState<SubQA[]>([]);
  const [essay, setEssay] = useState<Essay>(EMPTY_ESSAY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState<string | null>(null);
  const [scores, setScores] = useState<EssayScores | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitScores, setSubmitScores] = useState<EssayScores | null>(null);

  useEffect(() => {
    setSubQAs(loadSubQAs(timestamp));
    setEssay(loadEssay(timestamp));
  }, [timestamp]);

  function updateEssay(patch: Partial<Essay>) {
    const next = { ...essay, ...patch };
    setEssay(next);
    saveJson(essayKey(timestamp), next);
  }

  async function handleFeedback() {
    setLoading(true);
    setError(null);
    setComment(null);
    setScores(null);
    try {
      const res = await fetch("/api/essay-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mainQuestion,
          subQuestions: subQAs.map((s) => s.answer ? `${s.question} → ${s.answer}` : s.question),
          intro: essay.intro,
          body: essay.body,
          conclusion: essay.conclusion,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "알 수 없는 오류가 발생했습니다.");
        return;
      }
      setComment(data.comment as string);
      setScores({
        introScore: data.introScore,
        bodyScore: data.bodyScore,
        conclusionScore: data.conclusionScore,
        totalScore: data.totalScore,
      });
    } catch {
      setError("서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/inquiry-writing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mainQuestionTimestamp: timestamp,
          subQuestions: subQAs,
          intro: essay.intro,
          body: essay.body,
          conclusion: essay.conclusion,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || "알 수 없는 오류가 발생했습니다.");
        return;
      }
      setSubmitScores({
        introScore: data.introScore,
        bodyScore: data.bodyScore,
        conclusionScore: data.conclusionScore,
        totalScore: data.totalScore,
      });
      setSubmitted(true);
    } catch {
      setSubmitError("서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-xs text-zinc-400">메인 질문</div>
        <div className="mt-1 font-bold text-zinc-900">{mainQuestion}</div>

        {subQAs.length > 0 && (
          <div className="mt-3 border-t border-zinc-100 pt-3">
            <div className="text-xs text-zinc-400">내가 만든 보조질문과 답</div>
            <ul className="mt-1 flex flex-col gap-2">
              {subQAs.map((s, i) => (
                <li key={i} className="text-sm">
                  <div className="text-zinc-700">
                    <span className="text-zinc-400">[{s.label}]</span> {s.question}
                  </div>
                  <div className="mt-0.5 text-zinc-500">
                    {s.answer ? s.answer : "(아직 답을 안 씀)"}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-700">
        지금까지 만든 보조질문과 답변을 활용해서 메인 질문에 대한 나만의 탐구 글을
        완성해봅시다. 서론 → 본론 → 결론 순서로 차근차근 써보세요.
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-600">
            서론 - 이 글에서 다룰 질문을 자신의 말로 다시 소개해보세요
          </span>
          <span className="text-xs text-zinc-400">
            힌트: 메인 질문을 그대로 베끼지 말고 자신의 말로 풀어써보세요. 왜 이
            질문이 궁금했는지 한두 문장 덧붙이면 더 좋아요.
          </span>
          <AutoTextarea
            value={essay.intro}
            onChange={(e) => updateEssay({ intro: e.target.value })}
            className="input mt-1 min-h-[70px]"
          />
        </label>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-600">
            본론 - 보조질문 순서대로 답을 연결해서 서술해보세요
          </span>
          <span className="text-xs text-zinc-400">
            힌트: 각 답변이 왜 메인 질문과 연결되는지 한 문장씩 설명해주면 글이
            더 탄탄해져요. &quot;먼저&quot;, &quot;또한&quot;, &quot;그 결과&quot; 같은
            연결어를 써보면 자연스럽게 이어져요.
          </span>
          <AutoTextarea
            value={essay.body}
            onChange={(e) => updateEssay({ body: e.target.value })}
            className="input mt-1 min-h-[160px]"
          />
        </label>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-600">
            결론 - 메인 질문에 대한 나의 결론을 정리해보세요
          </span>
          <span className="text-xs text-zinc-400">
            힌트: 본론 내용을 요약하면서 처음 메인 질문에 대한 나의 생각을
            명확히 정리해보세요. 새로운 정보를 추가하기보다는 지금까지 쓴
            내용을 정리하는 자리예요.
          </span>
          <AutoTextarea
            value={essay.conclusion}
            onChange={(e) => updateEssay({ conclusion: e.target.value })}
            className="input mt-1 min-h-[70px]"
          />
        </label>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {scores && <ScoreBreakdown scores={scores} />}

      {comment && (
        <p className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-700 whitespace-pre-wrap">
          {comment}
        </p>
      )}

      <p className="text-center text-xs text-zinc-400">
        제출 전에 확인해보세요 — 보조질문 답변을 다 활용했나요? 결론이 처음
        질문에 답하고 있나요?
      </p>

      <button
        onClick={handleFeedback}
        disabled={loading}
        className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {loading ? "AI가 살펴보는 중..." : "AI 피드백 받기"}
      </button>

      {submitError && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {submitError}
        </p>
      )}

      {submitted ? (
        <div className="flex flex-col gap-3">
          {submitScores && <ScoreBreakdown scores={submitScores} />}
          <p className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-center text-sm text-blue-700">
            제출이 완료됐어요. 선생님이 이 탐구 글쓰기 기록을 확인할 수 있어요.
          </p>
        </div>
      ) : (
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
        >
          {submitting ? "제출하는 중..." : "제출하기"}
        </button>
      )}

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

function ScoreBreakdown({ scores }: { scores: EssayScores }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold text-white">
        총점 {scores.totalScore} / 5.0점
      </span>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
        {[
          ["서론", scores.introScore, 1],
          ["본론", scores.bodyScore, 3],
          ["결론", scores.conclusionScore, 1],
        ].map(([label, value, max]) => (
          <div key={label as string} className="rounded-lg bg-zinc-50 px-1.5 py-1.5">
            <dt className="text-zinc-400">{label}</dt>
            <dd className="mt-0.5 font-semibold text-zinc-800">
              {value} / {max}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
