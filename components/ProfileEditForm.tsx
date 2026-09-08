"use client";

import { useEffect, useState } from "react";
import { validateProfileNumbers } from "@/lib/constants";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { ProfileFields, type ProfileFieldsValue } from "./ProfileFields";

const EMPTY: ProfileFieldsValue = { grade: "", ban: "", no: "", name: "" };

function formatConfirmMessage(p: ProfileFieldsValue): string {
  const parts = [`학년 ${p.grade}`];
  if (p.ban.trim()) parts.push(`${p.ban}반`);
  if (p.no.trim()) parts.push(`${p.no}번`);
  if (p.name.trim()) parts.push(p.name);
  return `${parts.join(" / ")}(으)로 저장할까요?`;
}

// 학생이 가입 때 잘못 입력한 학년/반/번호/이름을 스스로 고치는 화면(app/profile) -
// 첫 제출 화면(SubmitForm)과 같은 ProfileFields UI를 그대로 재사용한다. 저장 전에는
// 항상 한 번 더 확인 카드를 보여주고("예, 저장할게요" 눌러야 실제로 반영), 이미
// 제출된 과거 기록은 이 화면에서 손대지 않는다(app/api/profile POST 참고).
export default function ProfileEditForm() {
  const [profile, setProfile] = useState<ProfileFieldsValue>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [pendingSave, setPendingSave] = useState<ProfileFieldsValue | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        if (data.profile) setProfile(data.profile);
        setLoaded(true);
      })
      .catch(() => {
        setLoadError("불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        setLoaded(true);
      });
  }, []);

  function update(next: Partial<ProfileFieldsValue>) {
    setProfile((prev) => ({ ...prev, ...next }));
    setSaved(false);
  }

  function handleReview(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    const error = validateProfileNumbers(profile.grade, profile.ban, profile.no);
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError(null);
    setPendingSave(profile);
  }

  async function handleConfirm() {
    if (!pendingSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetchWithTimeout("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pendingSave),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error || "저장에 실패했습니다.");
        return;
      }
      setSaved(true);
      setPendingSave(null);
    } catch {
      // 학교 전체가 몰려 저장이 오래 걸리거나(타임아웃) 네트워크가 끊긴 경우 - 서버가
      // 그새 저장을 마쳤을 수도 있으니 "실패"라고 단정하지 않고 다시 시도를 안내한다.
      setSaveError("저장이 지연되고 있어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return (
      <div className="card p-6 text-center text-sm text-[var(--color-ink-muted)]">불러오는 중...</div>
    );
  }
  if (loadError) {
    return <div className="card p-6 text-center text-sm text-red-700">{loadError}</div>;
  }

  if (pendingSave) {
    return (
      <div className="card flex flex-col gap-4 p-6">
        <p className="text-sm font-medium text-[var(--color-ink)]">{formatConfirmMessage(pendingSave)}</p>
        {saveError && (
          <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {saveError}
          </p>
        )}
        <div className="flex gap-2">
          <button onClick={handleConfirm} disabled={saving} className="btn-primary flex-1">
            {saving ? "저장하는 중..." : "예, 저장할게요"}
          </button>
          <button
            onClick={() => setPendingSave(null)}
            disabled={saving}
            className="btn-secondary flex-1"
          >
            다시 확인할게요
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleReview} className="card flex flex-col gap-4 p-6">
      <ProfileFields value={profile} onChange={update} />

      {validationError && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {validationError}
        </p>
      )}

      {saved && (
        <p className="rounded-lg bg-[var(--color-mint)]/40 border border-[var(--color-mint)] px-3 py-2 text-sm text-[var(--color-mint-deep)]">
          저장됐어요. 이미 제출한 기록은 그대로 남고, 다음 제출부터 새 정보가 반영돼요.
        </p>
      )}

      <button type="submit" className="btn-primary">
        저장하기
      </button>
    </form>
  );
}
