"use client";

import { useRef, useState } from "react";
import type { ClipboardEvent, DragEvent, MouseEvent } from "react";

// 학생이 직접 작성해야 하는 입력칸(질문/보조질문/답/출처/종합 글쓰기)에서 붙여넣기·
// 복사·잘라내기·드래그로 끌어다 놓기·우클릭 메뉴·마우스 중간 버튼(휠 클릭) 붙여넣기를
// 전부 막는 핸들러를 만들어주는 훅. AutoTextarea(textarea 전용)와 NoPasteInput(input
// 전용) 둘 다 이 훅 하나만 쓴다 - 예전엔 AutoTextarea 안에 로직이 박혀 있어서, "출처"/
// "교과서 연결 내용"처럼 input을 쓰는 자리는 전부 이 차단을 못 받고 있었다
// (2026-09-14, 실사용 중 붙여넣기가 뚫린다는 리포트로 발견).
// 교사 화면(TeacherFeedbackBox)이나 학년/반/번호/이름처럼 부정행위 우려가 없는 짧은
// 메타데이터 입력칸에는 이 훅을 쓰지 않는다.
const BLOCK_HINT_MS = 1800;

export function useBlockPaste() {
  const [blocked, setBlocked] = useState(false);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showBlockedHint() {
    setBlocked(true);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => setBlocked(false), BLOCK_HINT_MS);
  }

  function block(e: ClipboardEvent<HTMLElement> | DragEvent<HTMLElement> | MouseEvent<HTMLElement>) {
    e.preventDefault();
    showBlockedHint();
  }

  return {
    blocked,
    handlers: {
      onPaste: block,
      onCopy: block,
      onCut: block,
      onDrop: block,
      // drop 자체는 이미 막지만, 일부 브라우저는 dragover에서 막지 않으면 드롭 커서
      // 모양(허용됨 표시)이 그대로 보여 "될 것처럼" 보인다 - 실제 삽입은 안 되지만
      // 헷갈리지 않게 여기서도 막는다.
      onDragOver: block,
      onContextMenu: block,
      // 마우스 중간 버튼(휠 클릭)은 리눅스 계열에서 "primary selection" 붙여넣기로
      // 쓰인다 - Windows/Mac 크롬엔 해당 없지만 학교 크롬북 환경을 감안해 막는다.
      onMouseDown: (e: MouseEvent<HTMLElement>) => {
        if (e.button === 1) block(e);
      },
    },
  };
}
