"use client";

import { useEffect, useRef } from "react";

// 입력할 때마다 서버로 저장 요청을 보내면 시트 API를 과하게 두드리게 되니, 타이핑이
// 잠깐 멈췄을 때만(delayMs 후) effect를 한 번 실행한다. SubAnswersForm/AnswerForm이
// 답변·종합 글쓰기 초안을 서버에 자동 저장할 때 같이 쓴다.
export function useDebouncedEffect(effect: () => void, deps: unknown[], delayMs: number) {
  const effectRef = useRef(effect);
  effectRef.current = effect;

  useEffect(() => {
    const timer = setTimeout(() => effectRef.current(), delayMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
