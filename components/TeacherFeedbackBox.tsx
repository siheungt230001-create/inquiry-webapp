"use client";

import { useState } from "react";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

// 교사 대시보드의 제출 건 카드(QuestionRecordCard) 안에서 쓰는 피드백 입력창.
// AI가 자동으로 매기는 comment(글쓰기 총평)와 별개인 teacherFeedback 필드를 저장한다.
export default function TeacherFeedbackBox({
  email,
  timestamp,
  initialFeedback,
}: {
  email: string;
  timestamp: string;
  initialFeedback: string;
}) {
  const [value, setValue] = useState(initialFeedback);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const res = await fetchWithTimeout("/api/teacher/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, timestamp, teacherFeedback: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "저장에 실패했습니다.");
      setSaved(true);
    } catch (err) {
      setError((err as Error).message || "저장이 지연되고 있어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <p className="text-xs font-medium text-zinc-500">선생님 피드백</p>
      <textarea
        className="mt-1 w-full rounded-lg border border-[var(--color-cream-200)] bg-white px-3 py-2 text-sm text-zinc-800 focus:border-[var(--color-lavender-deep)] focus:outline-none"
        rows={3}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        placeholder="학생에게 남길 피드백을 입력하세요"
      />
      <div className="mt-1.5 flex items-center gap-2">
        <button type="button" onClick={handleSave} disabled={saving} className="btn-secondary !px-3 !py-1 !text-xs">
          {saving ? "저장 중..." : "저장"}
        </button>
        {saved && <span className="text-xs text-emerald-600">저장됨</span>}
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    </div>
  );
}
