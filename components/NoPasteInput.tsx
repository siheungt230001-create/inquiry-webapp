"use client";

import type { InputHTMLAttributes } from "react";
import { useBlockPaste } from "@/lib/useBlockPaste";

// AutoTextarea(textarea 전용)와 같은 붙여넣기 차단을 <input>에 적용하는 버전 -
// "출처", "교과서 연결 내용"처럼 짧은 한 줄 입력칸도 학생이 직접 타이핑해야 하는
// 자리라 AutoTextarea와 같은 정책이 적용돼야 한다(2026-09-14, 이 두 자리가 일반
// <input>으로 남아 있어 붙여넣기가 뚫리던 버그로 발견). 붙여넣기 차단 로직 자체는
// useBlockPaste 훅 하나로 공유하므로, 앞으로 학생이 직접 입력하는 새 한 줄 칸이
// 생기면 이 컴포넌트를 그대로 쓰면 된다.
export default function NoPasteInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { blocked, handlers } = useBlockPaste();
  const { className, ...rest } = props;

  return (
    <div className="relative">
      <input {...rest} {...handlers} className={className} />
      <div
        className={`pointer-events-none absolute -top-2 left-2 -translate-y-full rounded-md bg-zinc-900 px-2.5 py-1 text-xs whitespace-nowrap text-white shadow-sm transition-opacity duration-300 ${
          blocked ? "opacity-100" : "opacity-0"
        }`}
      >
        복사·붙여넣기는 사용할 수 없어요. 직접 입력해주세요
      </div>
    </div>
  );
}
