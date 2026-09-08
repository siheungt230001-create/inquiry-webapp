"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// /history는 서버 컴포넌트라 한 번 그려지면 그대로 멈춰 있다 - "대기중"이거나 Sheets API
// 429 같은 일시적 오류로 멈춘 건이 있으면, 백그라운드(QStash 재시도)에서 채점이 끝나도
// 학생이 직접 새로고침해야만 결과가 보였다. 대기중/오류 건이 있는 동안만 몇 초마다
// router.refresh()로 서버 데이터를 다시 읽어와서, 끝나면 자동으로 화면이 바뀌게 한다.
export default function HistoryAutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(interval);
  }, [active, router]);

  return null;
}
