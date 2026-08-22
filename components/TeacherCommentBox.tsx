"use client";

import { useState } from "react";

// 학생 질문 카드 안에 교사가 직접 남기는 메모 - 학생에게는 노출 안 되는 교사 전용
// 코멘트. 저장 버튼을 눌러야 저장된다(자동저장 아님). 학생 입력창(AutoTextarea)과
// 달리 붙여넣기 제한 없음 - 교사 화면이라 그대로 둔다.
export default function TeacherCommentBox({
  email,
  timestamp,
  initialComment,
}: {
  email: string;
  timestamp: string;
  initialComment: string;
}) {
  const [comment, setComment] = useState(initialComment);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/teacher/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, timestamp, comment }),
      });
      if (res.ok) setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
      <textarea
        value={comment}
        onChange={(e) => {
          setComment(e.target.value);
          setSaved(false);
        }}
        placeholder="이 학생에게 남길 메모 (학생에게는 안 보여요)"
        rows={2}
        className="w-full resize-none rounded-md border border-zinc-200 px-2 py-1.5 text-sm text-zinc-800 focus:border-indigo-300 focus:outline-none"
      />
      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
        {saved && <span className="text-xs text-emerald-600">저장됨</span>}
      </div>
    </div>
  );
}
