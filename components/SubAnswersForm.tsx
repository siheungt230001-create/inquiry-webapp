"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SUB_QUESTION_CARDS } from "@/lib/constants";
import type { SubQuestionCheckResult } from "@/lib/subQuestionFlow";
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
    const items: ApprovedItem[] = [];
    SUB_QUESTION_CARDS.forEach((card, i) => {
      if (statuses[i]?.status === "양호" && values[i]?.trim()) {
        items.push({ index: i, label: card.label, text: values[i] });
      }
    });
    setApprovedItems(items);
    setAnswers(
      loadJson<string[]>(answersKey(timestamp), SUB_QUESTION_CARDS.map(() => ""), isCardLengthArray)
    );
  }, [timestamp]);

  function updateAnswer(index: number, text: string) {
    const next = [...answers];
    next[index] = text;
    setAnswers(next);
    saveJson(answersKey(timestamp), next);
  }

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
        approvedItems.map((item) => (
          <div key={item.index} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="text-xs text-zinc-400">{item.label}</div>
            <div className="mt-1 font-semibold text-zinc-900">{item.text}</div>
            <AutoTextarea
              value={answers[item.index] ?? ""}
              onChange={(e) => updateAnswer(item.index, e.target.value)}
              className="input mt-2 min-h-[90px]"
              placeholder="이 질문에 대해 찾은 내용이나 생각을 적어보세요"
            />
          </div>
        ))
      )}

      <button
        onClick={goToAnswer}
        className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700"
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
