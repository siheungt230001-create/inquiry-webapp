"use client";

import { useEffect, useRef, useState } from "react";
import type { ClipboardEvent, DragEvent, MouseEvent, TextareaHTMLAttributes } from "react";

// 글자 수에 맞춰 높이가 자동으로 늘어나는 textarea. 내용이 길어져도 내부
// 스크롤바로 숨겨지지 않고 칸 자체가 커진다. className에 min-h-[...]를
// 그대로 써도 된다 - 자동 계산된 높이가 그보다 작으면 min-height가 이긴다.
//
// 학생이 직접 작성하는 화면(질문/보조질문/종합 글쓰기)에서만 쓰는 컴포넌트라 -
// 붙여넣기/복사/잘라내기/드래그로 끌어다 놓기/우클릭 메뉴를 여기서 전부 막는다.
// 교사 화면은 이 컴포넌트를 안 쓰므로 영향 없다.
const BLOCK_HINT_MS = 1800;

export default function AutoTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [blocked, setBlocked] = useState(false);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function resize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  useEffect(() => {
    if (ref.current) resize(ref.current);
  }, [props.value]);

  useEffect(() => {
    return () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    };
  }, []);

  function showBlockedHint() {
    setBlocked(true);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => setBlocked(false), BLOCK_HINT_MS);
  }

  function block(e: ClipboardEvent<HTMLTextAreaElement> | DragEvent<HTMLTextAreaElement> | MouseEvent<HTMLTextAreaElement>) {
    e.preventDefault();
    showBlockedHint();
  }

  const { className, style, onInput, ...rest } = props;

  return (
    <div className="relative">
      <textarea
        {...rest}
        ref={ref}
        className={className}
        style={{ overflow: "hidden", resize: "none", ...style }}
        onInput={(e) => {
          resize(e.currentTarget);
          onInput?.(e);
        }}
        onPaste={block}
        onCopy={block}
        onCut={block}
        onDrop={block}
        onContextMenu={block}
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
