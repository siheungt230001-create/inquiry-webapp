"use client";

import { useEffect, useRef } from "react";
import type { TextareaHTMLAttributes } from "react";
import { useBlockPaste } from "@/lib/useBlockPaste";

// 글자 수에 맞춰 높이가 자동으로 늘어나는 textarea. 내용이 길어져도 내부
// 스크롤바로 숨겨지지 않고 칸 자체가 커진다. className에 min-h-[...]를
// 그대로 써도 된다 - 자동 계산된 높이가 그보다 작으면 min-height가 이긴다.
//
// 학생이 직접 작성하는 화면(질문/보조질문/종합 글쓰기)에서만 쓰는 컴포넌트라 -
// 붙여넣기 차단은 useBlockPaste 훅(lib/useBlockPaste.ts)이 전담한다. input을 쓰는
// 자리(출처, 교과서 연결 내용 등)는 NoPasteInput이 같은 훅을 쓴다 - 붙여넣기 차단
// 로직을 여기 하나에만 박아두면, 그 로직을 안 상속받는 새 input이 계속 생겼다
// (2026-09-14, 실사용 중 붙여넣기가 뚫린다는 리포트로 발견). 교사 화면은 이 컴포넌트를
// 안 쓰므로 영향 없다.
export default function AutoTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const { blocked, handlers } = useBlockPaste();

  function resize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  useEffect(() => {
    if (ref.current) resize(ref.current);
  }, [props.value]);

  const { className, style, onInput, ...rest } = props;

  return (
    <div className="relative">
      <textarea
        {...rest}
        {...handlers}
        ref={ref}
        className={className}
        style={{ overflow: "hidden", resize: "none", ...style }}
        onInput={(e) => {
          resize(e.currentTarget);
          onInput?.(e);
        }}
      />
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
