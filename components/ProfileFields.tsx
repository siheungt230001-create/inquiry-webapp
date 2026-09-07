import type { ReactNode } from "react";
import { GRADE_RANGE, BAN_RANGE, NO_RANGE } from "@/lib/constants";

export interface ProfileFieldsValue {
  grade: string;
  ban: string;
  no: string;
  name: string;
}

// components/SubmitForm.tsx, components/EditQuestionForm.tsx, components/ProfileEditForm.tsx
// 세 화면이 전부 이 라벨+입력칸 배치를 그대로 공유한다.
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-[var(--color-ink-soft)]">{label}</span>
      {children}
    </label>
  );
}

// 학년/반/번호/이름 입력 4칸 - 첫 제출(SubmitForm), 제출 수정(EditQuestionForm), 내 정보만
// 수정(ProfileEditForm) 세 화면이 같은 UI를 공유한다. 여기서 한 번만 바꾸면 세 화면 모두
// 반영되므로, 화면마다 따로 두던 검증 규칙이 서로 어긋나는 일이 없다.
export function ProfileFields({
  value,
  onChange,
}: {
  value: ProfileFieldsValue;
  onChange: (next: Partial<ProfileFieldsValue>) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-3">
      <Field label="학년">
        <input
          value={value.grade}
          onChange={(e) => onChange({ grade: e.target.value })}
          className="input"
          placeholder={`${GRADE_RANGE.min}~${GRADE_RANGE.max}`}
          inputMode="numeric"
          required
        />
      </Field>
      <Field label="반">
        <input
          value={value.ban}
          onChange={(e) => onChange({ ban: e.target.value })}
          className="input"
          placeholder={`${BAN_RANGE.min}~${BAN_RANGE.max}`}
          inputMode="numeric"
        />
      </Field>
      <Field label="번호">
        <input
          value={value.no}
          onChange={(e) => onChange({ no: e.target.value })}
          className="input"
          placeholder={`${NO_RANGE.min}~${NO_RANGE.max}`}
          inputMode="numeric"
        />
      </Field>
      <Field label="이름">
        <input
          value={value.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="input"
          placeholder="이름"
        />
      </Field>
    </div>
  );
}
