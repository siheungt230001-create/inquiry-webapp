"use client";

import { useEffect, useState } from "react";
import { SELF_LEVEL_LIST } from "@/lib/constants";
import type { GradingResult } from "@/lib/types";
import { approvalBadgeClass } from "@/lib/badge";

const PROFILE_KEY = "inquiry-webapp-profile";

interface Profile {
  ban: string;
  no: string;
  name: string;
}

function loadProfile(): Profile {
  if (typeof window === "undefined") return { ban: "", no: "", name: "" };
  try {
    const saved = window.localStorage.getItem(PROFILE_KEY);
    if (saved) return JSON.parse(saved) as Profile;
  } catch {
    // 저장된 값이 없거나 깨졌으면 그냥 빈 값으로 시작
  }
  return { ban: "", no: "", name: "" };
}

export default function SubmitForm() {
  const [units, setUnits] = useState<string[]>([]);
  const [profile, setProfile] = useState<Profile>(loadProfile);
  const [unit, setUnit] = useState("");
  const [question, setQuestion] = useState("");
  const [selfLevel, setSelfLevel] = useState(SELF_LEVEL_LIST[0]);
  const [textbookLink, setTextbookLink] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GradingResult | null>(null);
  const [timestamp, setTimestamp] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/units")
      .then((r) => r.json())
      .then((data) => {
        if (data.units) {
          setUnits(data.units);
          if (data.units.length > 0) setUnit(data.units[0]);
        }
      })
      .catch(() => setError("단원 목록을 불러오지 못했습니다."));
  }, []);

  function updateProfile(next: Partial<Profile>) {
    const merged = { ...profile, ...next };
    setProfile(merged);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(merged));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ban: profile.ban,
          no: profile.no,
          name: profile.name,
          unit,
          question,
          selfLevel,
          textbookLink,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "알 수 없는 오류가 발생했습니다.");
      } else {
        setResult(data.result as GradingResult);
        setTimestamp(data.timestamp as string);
      }
    } catch {
      setError("서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  if (result && timestamp) {
    return (
      <ResultCard
        result={result}
        question={question}
        timestamp={timestamp}
        onReset={() => {
          setResult(null);
          setTimestamp(null);
          setQuestion("");
        }}
        onEdit={() => {
          setResult(null);
          setTimestamp(null);
        }}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="grid grid-cols-3 gap-3">
        <Field label="반">
          <input
            value={profile.ban}
            onChange={(e) => updateProfile({ ban: e.target.value })}
            className="input"
            placeholder="예: 3"
          />
        </Field>
        <Field label="번호">
          <input
            value={profile.no}
            onChange={(e) => updateProfile({ no: e.target.value })}
            className="input"
            placeholder="예: 12"
          />
        </Field>
        <Field label="이름">
          <input
            value={profile.name}
            onChange={(e) => updateProfile({ name: e.target.value })}
            className="input"
            placeholder="이름"
          />
        </Field>
      </div>

      <Field label="제출 주제 (단원)">
        <select value={unit} onChange={(e) => setUnit(e.target.value)} className="input" required>
          {units.length === 0 && <option value="">단원 목록을 불러오는 중...</option>}
          {units.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </Field>

      <Field label="나의 탐구 질문">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          className="input min-h-[100px] resize-y"
          placeholder="예: 세종대왕은 왜 한글을 만들었을까?"
          required
        />
      </Field>

      <Field label="내 질문의 예상 레벨">
        <select value={selfLevel} onChange={(e) => setSelfLevel(e.target.value)} className="input">
          {SELF_LEVEL_LIST.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </Field>

      <Field label="교과서 연결 내용">
        <input
          value={textbookLink}
          onChange={(e) => setTextbookLink(e.target.value)}
          className="input"
          placeholder="이 질문과 관련된 교과서 쪽수·소제목"
          required
        />
      </Field>

      {error && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !unit || !textbookLink.trim()}
        className="mt-1 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {loading ? "AI가 질문을 살펴보는 중..." : "제출하기"}
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
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-zinc-600">{label}</span>
      {children}
    </label>
  );
}

function ResultCard({
  result,
  question,
  timestamp,
  onReset,
  onEdit,
}: {
  result: GradingResult;
  question: string;
  timestamp: string;
  onReset: () => void;
  onEdit: () => void;
}) {
  const approved = result.approval === "승인";
  const [finalStatus, setFinalStatus] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const displayApproval = finalStatus || result.approval;

  async function handleFinalize() {
    setFinalizing(true);
    setFinalizeError(null);
    try {
      const res = await fetch("/api/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timestamp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFinalizeError(data.error || "제출 확정에 실패했습니다.");
      } else {
        setFinalStatus(data.approval as string);
      }
    } catch {
      setFinalizeError("서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setFinalizing(false);
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <p className="font-semibold text-zinc-900">{question}</p>

      <div className="mt-3 flex items-center gap-2">
        <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold text-white">
          {result.level}
        </span>
        <span className="text-sm text-zinc-500">{result.score} / 5.0점</span>
        <span
          className={`ml-auto rounded-full px-3 py-1 text-xs font-semibold text-white ${approvalBadgeClass(displayApproval)}`}
        >
          {displayApproval}
        </span>
      </div>

      {result.self_assessment_mismatch && (
        <p className="mt-3 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-700">
          {result.self_assessment_mismatch}
        </p>
      )}

      <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">
        {result.feedback_text}
      </p>

      <details className="mt-4 text-xs text-zinc-500">
        <summary className="cursor-pointer">세부 채점 보기</summary>
        <ul className="mt-2 grid grid-cols-2 gap-1">
          <li>사실 정확성: {result.criteria_scores.fact_accuracy}</li>
          <li>인과·분석 깊이: {result.criteria_scores.causal_depth}</li>
          <li>비교·평가 요소: {result.criteria_scores.comparison_clarity}</li>
          <li>문장 명료성: {result.criteria_scores.sentence_clarity}</li>
          <li>자료 통합 깊이: {result.criteria_scores.integration_depth}</li>
        </ul>
      </details>

      {finalizeError && (
        <p className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {finalizeError}
        </p>
      )}

      {finalStatus ? (
        <p className="mt-6 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-center text-sm text-blue-700">
          제출이 완료됐어요. 최종 상태: {finalStatus}
        </p>
      ) : (
        <button
          onClick={handleFinalize}
          disabled={finalizing}
          className="mt-6 w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {finalizing ? "제출하는 중..." : "질문 제출하기"}
        </button>
      )}

      {finalStatus || approved ? (
        <button
          onClick={onReset}
          className="mt-2 w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
        >
          다른 질문 제출하기
        </button>
      ) : (
        <button
          onClick={onEdit}
          className="mt-2 w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
        >
          질문 수정하기
        </button>
      )}
    </div>
  );
}
