"use client";

import { useEffect, useRef } from "react";
import type { TextareaHTMLAttributes } from "react";

// 글자 수에 맞춰 높이가 자동으로 늘어나는 textarea. 내용이 길어져도 내부
// 스크롤바로 숨겨지지 않고 칸 자체가 커진다. className에 min-h-[...]를
// 그대로 써도 된다 - 자동 계산된 높이가 그보다 작으면 min-height가 이긴다.
export default function AutoTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function resize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  useEffect(() => {
    if (ref.current) resize(ref.current);
  }, [props.value]);

  const { className, style, onInput, ...rest } = props;

  return (
    <textarea
      {...rest}
      ref={ref}
      className={className}
      style={{ overflow: "hidden", resize: "none", ...style }}
      onInput={(e) => {
        resize(e.currentTarget);
        onInput?.(e);
      }}
    />
  );
}
