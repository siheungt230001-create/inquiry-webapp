"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SELF_LEVEL_LIST } from "@/lib/constants";
import AutoTextarea from "./AutoTextarea";

interface EditableFields {
  grade: string;
  ban: string;
  no: string;
  name: string;
  unit: string;
  question: string;
  selfLevel: string;
  textbookLink: string;
}

// 이미 제출한 메인 질문을 고치는 화면 - components/SubmitForm.tsx의 입력 항목과 같지만,
// 새로 제출하는 게 아니라 기존 행(email+timestamp)을 그 자리에서 덮어쓴다는 점이 다르다.
// 큐 모드/폴링이 필요 없다 - 수정은 학생이 직접 누르는 드문 동작이라 항상 그 자리에서
// 동기적으로 처리한다(app/api/submit/edit/route.ts).
export default function EditQuestionForm({ timestamp }: { timestamp: string }) {
  const [units, setUnits] = useState<string[]>([]);
  const [fields, setFields] = useState<EditableFields | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ regraded: boolean; result?: { level: string; score: number; approval: string } } | null>(null);

  useEffect(() => {
    fetch("/api/units")
      .then((r) => r.json())
      .then((data) => setUnits(data.units || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`/api/submit/edit?ts=${encodeURIComponent(timestamp)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setLoadError(data.error);
          return;
        }
        setFields(data as EditableFields);
      })
      .catch(() => setLoadError("불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
  }, [timestamp]);

  function update<K extends keyof EditableFields>(key: K, value: EditableFields[K]) {
    setFields((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaved(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!fields) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/submit/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timestamp, ...fields }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error || "알 수 없는 오류가 발생했습니다.");
        return;
      }
      setSaved({ regraded: data.regraded, result: data.result });
    } catch {
      setSaveError("서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm text-red-700">{loadError}</p>
      </div>
    );
  }

  if (!fields) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm text-zinc-400">불러오는 중...</p>
      </div>
    );
  }

  const backHref = `/submit/sub-questions?ts=${encodeURIComponent(timestamp)}&q=${encodeURIComponent(
    fields.question
  )}&unit=${encodeURIComponent(fields.unit)}`;

  return (
    <form
      onSubmit={handleSave}
      className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
    >
      <div className="grid grid-cols-4 gap-3">
        <Field label="학년">
          <input
            value={fields.grade}
            onChange={(e) => update("grade", e.target.value)}
            className="input"
            required
          />
        </Field>
        <Field label="반">
          <input value={fields.ban} onChange={(e) => update("ban", e.target.value)} className="input" />
        </Field>
        <Field label="번호">
          <input value={fields.no} onChange={(e) => update("no", e.target.value)} className="input" />
        </Field>
        <Field label="이름">
          <input value={fields.name} onChange={(e) => update("name", e.target.value)} className="input" />
        </Field>
      </div>

      <Field label="제출 주제 (단원)">
        <select value={fields.unit} onChange={(e) => update("unit", e.target.value)} className="input" required>
          {units.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </Field>

      <Field label="나의 탐구 질문">
        <AutoTextarea
          value={fields.question}
          onChange={(e) => update("question", e.target.value)}
          className="input min-h-[100px]"
          required
        />
      </Field>

      <Field label="내 질문의 예상 레벨">
        <select value={fields.selfLevel} onChange={(e) => update("selfLevel", e.target.value)} className="input">
          {SELF_LEVEL_LIST.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </Field>

      <Field label="교과서 연결 내용">
        <input
          value={fields.textbookLink}
          onChange={(e) => update("textbookLink", e.target.value)}
          className="input"
          required
        />
      </Field>

      {saveError && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {saveError}
        </p>
      )}

      {saved && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800">
          {saved.regraded && saved.result ? (
            <>
              수정 내용으로 다시 채점했어요 — {saved.result.level} · {saved.result.score}점 ·{" "}
              {saved.result.approval}
            </>
          ) : (
            "저장됐어요."
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <button
          type="submit"
          disabled={saving || !fields.unit || !fields.textbookLink.trim()}
          className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {saving ? "저장하는 중..." : "수정 저장"}
        </button>
        {saved && (
          <Link
            href={backHref}
            className="rounded-lg border border-zinc-300 px-4 py-2.5 text-center text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            보조질문 만들기로 돌아가기 →
          </Link>
        )}
      </div>

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
