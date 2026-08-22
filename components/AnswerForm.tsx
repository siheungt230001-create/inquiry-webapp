"use client";

import { useEffect, useState } from "react";
import { SUB_QUESTION_CARDS } from "@/lib/constants";
import type { SubQuestionCheckResult } from "@/lib/subQuestionFlow";
import { useDebouncedEffect } from "@/lib/useDebouncedEffect";
import AutoTextarea from "./AutoTextarea";
import EssayScoreTiles from "./EssayScoreTiles";

interface Essay {
  intro: string;
  body: string;
  conclusion: string;
}

interface EssayScores {
  introScore: number;
  bodyScore: number;
  conclusionScore: number;
  factScore: number;
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
function subAnswerStatusKey(timestamp: string) {
  return `subAnswerStatus:${timestamp}`;
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

interface FullSubQuestion {
  label: string;
  question: string;
  answer: string;
  status: SubQuestionCheckResult["status"] | null;
  comment: string;
  answerStatus: SubQuestionCheckResult["status"] | null;
  answerComment: string;
}

// sessionStorage 네 키(subq/subqStatus/subAnswers/subAnswerStatus)를 합쳐서 카드별 전체
// 상태를 만든다. "양호" 아닌 항목이나 답변 판정도 그대로 들고 있어야, 이 화면에서 자동
// 저장할 때 subQuestionsJson을 통째로 덮어쓰면서 그 항목들 내용을 날려버리지 않는다.
function loadFullSubQuestions(timestamp: string): FullSubQuestion[] {
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
  const answerStatuses = loadJson<(SubQuestionCheckResult | null)[]>(
    subAnswerStatusKey(timestamp),
    SUB_QUESTION_CARDS.map(() => null),
    isCardLengthArray
  );
  return SUB_QUESTION_CARDS.map((card, i) => ({
    label: card.label,
    question: values[i] ?? "",
    answer: answers[i] ?? "",
    status: statuses[i]?.status ?? null,
    comment: statuses[i]?.comment ?? "",
    answerStatus: answerStatuses[i]?.status ?? null,
    answerComment: answerStatuses[i]?.comment ?? "",
  }));
}

// "양호" 판정을 받고(2단계) 답까지 적은(보조질문 답 쓰기 단계) 것만 참고 자료로 보여준다.
function toApprovedSubQAs(full: FullSubQuestion[]): SubQA[] {
  return full
    .filter((item) => item.status === "양호" && item.question.trim())
    .map((item) => ({ label: item.label, question: item.question, answer: item.answer }));
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
  const [fullSubQuestions, setFullSubQuestions] = useState<FullSubQuestion[]>([]);
  const [essay, setEssay] = useState<Essay>(EMPTY_ESSAY);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState<string | null>(null);
  const [scores, setScores] = useState<EssayScores | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitScores, setSubmitScores] = useState<EssayScores | null>(null);

  // sessionStorage에 값이 있으면 그대로 쓰고, 비어 있으면(탭을 닫았다 열거나 다른 기기)
  // 서버(시트)에 남은 진행 상황을 대신 불러온다.
  useEffect(() => {
    const localFull = loadFullSubQuestions(timestamp);
    const localEssay = loadEssay(timestamp);
    const hasLocalData =
      localFull.some((item) => item.question.trim()) ||
      Object.values(localEssay).some((v) => v.trim());

    if (hasLocalData) {
      setFullSubQuestions(localFull);
      setSubQAs(toApprovedSubQAs(localFull));
      setEssay(localEssay);
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
        const serverItems = data.record.subQuestions as FullSubQuestion[];
        const nextFull: FullSubQuestion[] = SUB_QUESTION_CARDS.map((card, i) => ({
          label: card.label,
          question: serverItems[i]?.question ?? "",
          answer: serverItems[i]?.answer ?? "",
          status: serverItems[i]?.status ?? null,
          comment: serverItems[i]?.comment ?? "",
          answerStatus: serverItems[i]?.answerStatus ?? null,
          answerComment: serverItems[i]?.answerComment ?? "",
        }));
        const nextEssay: Essay = {
          intro: data.record.intro ?? "",
          body: data.record.body ?? "",
          conclusion: data.record.conclusion ?? "",
        };
        setFullSubQuestions(nextFull);
        setSubQAs(toApprovedSubQAs(nextFull));
        setEssay(nextEssay);
        saveJson(essayKey(timestamp), nextEssay);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [timestamp]);

  // 서론/본론/결론을 쓰는 동안 타이핑이 잠깐 멈추면 서버에도 초안을 저장한다 - "제출하기"를
  // 누르기 전까지는 서버 저장이 아예 없어서, sessionStorage만 지워지면(탭 닫기 등) 종합
  // 글쓰기 내용이 통째로 사라지는 게 버그의 핵심 원인이었다.
  useDebouncedEffect(
    () => {
      if (!loaded) return;
      const hasAnyContent =
        fullSubQuestions.some((item) => item.question.trim()) ||
        Object.values(essay).some((v) => v.trim());
      if (!hasAnyContent) return;
      const payloadItems = fullSubQuestions
        .filter((item) => item.question.trim())
        .map((item) => ({
          label: item.label,
          question: item.question,
          answer: item.answer,
          status: item.status,
          comment: item.comment,
          answerStatus: item.answerStatus,
          answerComment: item.answerComment,
        }));
      fetch("/api/inquiry-writing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mainQuestionTimestamp: timestamp,
          subQuestions: payloadItems,
          intro: essay.intro,
          body: essay.body,
          conclusion: essay.conclusion,
          draft: true,
        }),
      }).catch(() => {
        // 무시 - 자동 저장은 부가 기능, 실패해도 화면 흐름은 막지 않는다
      });
    },
    [essay, loaded, fullSubQuestions],
    800
  );

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
        factScore: data.factScore,
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
        factScore: data.factScore,
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

// "질문 만들기" 결과 카드(components/SubmitForm.tsx의 ResultCard)와 같은 톤 -
// 항목별 강조색 배지 타일(EssayScoreTiles) + 상단에 눈에 띄는 총점. 서론/본론/결론
// 본문 자체는 이 컴포넌트 밖(AnswerForm의 textarea)에 그대로 있고, 여긴 채점 결과
// 표시만 담당한다.
function ScoreBreakdown({ scores }: { scores: EssayScores }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-zinc-500">종합 글쓰기 채점 결과</span>
        <span className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-bold text-white">
          총점 {scores.totalScore} / 5.0점
        </span>
      </div>
      <div className="mt-3 max-w-md">
        <EssayScoreTiles scores={scores} />
      </div>
    </div>
  );
}
