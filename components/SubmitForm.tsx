"use client";

import { useEffect, useRef, useState } from "react";
import { SELF_LEVEL_LIST } from "@/lib/constants";
import type { GradingResult } from "@/lib/types";
import { approvalBadgeClass, CRITERIA_ACCENTS } from "@/lib/badge";
import AutoTextarea from "./AutoTextarea";

const PROFILE_KEY = "inquiry-webapp-profile";

interface Profile {
  grade: string;
  ban: string;
  no: string;
  name: string;
}

function loadProfile(): Profile {
  if (typeof window === "undefined") return { grade: "", ban: "", no: "", name: "" };
  try {
    const saved = window.localStorage.getItem(PROFILE_KEY);
    if (saved) return { grade: "", ...JSON.parse(saved) } as Profile;
  } catch {
    // 저장된 값이 없거나 깨졌으면 그냥 빈 값으로 시작
  }
  return { grade: "", ban: "", no: "", name: "" };
}

// 큐 모드(QSTASH_TOKEN 설정됨)에서 "채점 중" 상태로 폴링하던 중에 화면을 이동하거나
// 새로고침하면 이 컴포넌트가 통째로 다시 마운트되면서 question 등 state가 초기화돼,
// 방금 제출한 질문이 사라진 것처럼 보이는 게 버그의 원인이었다. 제출 직후 이 값을
// 저장해두고 마운트 시 우선 여기서 복구한다(sessionStorage라 탭 안에서는 새로고침에도
// 살아남는다). 탭을 닫았다 열었거나 다른 기기라 이것도 비어 있으면 서버(가장 최근
// 제출이 아직 "대기중"인지)로 한 번 더 확인한다.
const PENDING_SUBMIT_KEY = "pendingSubmit";

interface PendingSubmit {
  timestamp: string;
  question: string;
  unit: string;
  selfLevel: string;
  textbookLink: string;
}

function savePendingSubmit(p: PendingSubmit) {
  try {
    window.sessionStorage.setItem(PENDING_SUBMIT_KEY, JSON.stringify(p));
  } catch {
    // 사생활 보호 모드 등에서 sessionStorage 쓰기가 막혀 있어도 화면은 계속 동작하게 둔다
  }
}

function loadPendingSubmit(): PendingSubmit | null {
  try {
    const saved = window.sessionStorage.getItem(PENDING_SUBMIT_KEY);
    if (saved) return JSON.parse(saved) as PendingSubmit;
  } catch {
    // 저장된 값이 깨졌으면 그냥 없는 것으로 취급
  }
  return null;
}

function clearPendingSubmit() {
  try {
    window.sessionStorage.removeItem(PENDING_SUBMIT_KEY);
  } catch {
    // 무시
  }
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
  const [polling, setPolling] = useState(false);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStartRef = useRef(0);

  useEffect(() => {
    // 언마운트 시 폴링 타이머 정리
    return () => {
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    fetch("/api/units")
      .then((r) => r.json())
      .then((data) => {
        if (data.units) {
          setUnits(data.units);
          // 복구된 제출이 이미 unit을 채워놨을 수 있으니, 비어있을 때만 첫 단원으로 기본
          // 선택한다 - 여기서 무조건 덮어쓰면 아래 복구 effect가 채운 값이 지워진다.
          if (data.units.length > 0) setUnit((prev) => prev || data.units[0]);
        }
      })
      .catch(() => setError("단원 목록을 불러오지 못했습니다."));
  }, []);

  // 마운트 시 "채점 대기 중"인 제출이 있으면 폼과 폴링 상태를 복구한다.
  useEffect(() => {
    const local = loadPendingSubmit();
    if (local) {
      resumePending(local.timestamp, local.question, local.unit, local.selfLevel, local.textbookLink);
      return;
    }
    let cancelled = false;
    fetch("/api/submit/status")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || data.status !== "대기중") return;
        const pending: PendingSubmit = {
          timestamp: data.timestamp,
          question: data.question,
          unit: data.unit,
          selfLevel: data.selfLevel,
          textbookLink: data.textbookLink,
        };
        savePendingSubmit(pending);
        resumePending(pending.timestamp, pending.question, pending.unit, pending.selfLevel, pending.textbookLink);
      })
      .catch(() => {
        // 서버에서 못 불러와도 그냥 빈 폼으로 시작 - 원래도 첫 제출인 학생은 이 상태다
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resumePending(
    ts: string,
    q: string,
    u: string,
    level: string,
    link: string
  ) {
    setQuestion(q);
    setUnit(u);
    setSelfLevel(level);
    setTextbookLink(link);
    setTimestamp(ts);
    setPolling(true);
    pollStartRef.current = Date.now();
    pollStatus(ts);
  }

  function updateProfile(next: Partial<Profile>) {
    const merged = { ...profile, ...next };
    setProfile(merged);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(merged));
  }

  const POLL_INTERVAL_MS = 3000;
  const POLL_TIMEOUT_MS = 5 * 60 * 1000;

  function stopPolling() {
    if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    setPolling(false);
  }

  async function pollStatus(ts: string) {
    if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
      stopPolling();
      setError("채점이 너무 오래 걸리고 있어요. 잠시 후 이력에서 결과를 확인해 주세요.");
      return;
    }
    try {
      const res = await fetch(`/api/submit/status?ts=${encodeURIComponent(ts)}`);
      const data = await res.json();
      if (!res.ok) {
        stopPolling();
        setError(data.error || "결과를 확인하지 못했습니다.");
        return;
      }
      if (data.status === "완료") {
        stopPolling();
        clearPendingSubmit();
        setResult(data.result as GradingResult);
        setTimestamp(ts);
        return;
      }
      if (data.status === "오류") {
        stopPolling();
        clearPendingSubmit();
        setError("채점 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      pollTimeoutRef.current = setTimeout(() => pollStatus(ts), POLL_INTERVAL_MS);
    } catch {
      pollTimeoutRef.current = setTimeout(() => pollStatus(ts), POLL_INTERVAL_MS);
    }
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
          grade: profile.grade,
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
      } else if (data.queued) {
        const ts = data.timestamp as string;
        setTimestamp(ts);
        setPolling(true);
        pollStartRef.current = Date.now();
        savePendingSubmit({ timestamp: ts, question, unit, selfLevel, textbookLink });
        pollStatus(ts);
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

  if (polling) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="font-semibold text-zinc-900">{question}</p>
        <p className="mt-4 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-700">
          제출이 접수됐어요. 순서대로 채점 중이니 잠시만 기다려 주세요.
        </p>
      </div>
    );
  }

  if (result && timestamp) {
    return (
      <ResultCard
        result={result}
        question={question}
        timestamp={timestamp}
        onReset={() => {
          clearPendingSubmit();
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
      <div className="grid grid-cols-4 gap-3">
        <Field label="학년">
          <input
            value={profile.grade}
            onChange={(e) => updateProfile({ grade: e.target.value })}
            className="input"
            placeholder="예: 3"
            required
          />
        </Field>
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
        <AutoTextarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          className="input min-h-[100px]"
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
        disabled={loading || !unit || !profile.grade.trim() || !textbookLink.trim()}
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
        <ul className="mt-2 grid grid-cols-2 gap-1.5">
          {CRITERIA_ACCENTS.map((c, i) => {
            const value = [
              result.criteria_scores.fact_accuracy,
              result.criteria_scores.causal_depth,
              result.criteria_scores.comparison_clarity,
              result.criteria_scores.sentence_clarity,
              result.criteria_scores.integration_depth,
            ][i];
            return (
              <li
                key={c.label}
                className="flex items-center gap-1.5 border-l-2 py-0.5 pl-2"
                style={{ borderColor: c.color }}
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: c.color }}
                />
                <span style={c.textSafe ? { color: c.color } : undefined}>{c.label}</span>
                <span className="text-zinc-500">: {value}</span>
              </li>
            );
          })}
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
