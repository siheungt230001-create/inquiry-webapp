"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { classLabel, inquiryStageBadgeClass } from "@/lib/aggregate";
import type { LiveStudentStatus } from "@/lib/aggregate";

const POLL_MS = 12000;
const STUCK_MS = 5 * 60 * 1000;

function timeAgoLabel(iso: string, now: number): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  return `${Math.floor(minutes / 60)}시간 전`;
}

// 프로젝터로 띄워놓고 수업 중 계속 보는 반 전체 현황판 - 12초마다 폴링해서 갱신하고,
// 종합 글쓰기를 아직 안 끝냈는데 5분 넘게 활동이 없는 학생은 테두리를 강조색으로
// 표시한다. 카드를 클릭하면 /teacher의 학생별 상세 카드로 이동한다(student 쿼리로
// 해당 학생 카드를 열어서 앵커 이동).
export default function LiveGrid({
  unit,
  grade,
  ban,
  initialStudents,
}: {
  unit: string;
  grade: string;
  ban: string;
  initialStudents: LiveStudentStatus[];
}) {
  const [students, setStudents] = useState(initialStudents);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const res = await fetch(
          `/api/teacher/live-status?unit=${encodeURIComponent(unit)}&grade=${encodeURIComponent(
            grade
          )}&ban=${encodeURIComponent(ban)}`
        );
        if (res.ok && !cancelled) {
          const data = await res.json();
          setStudents(data.students);
        }
      } catch {
        // 폴링 실패는 다음 주기에 재시도 - 화면을 계속 켜두는 용도라 에러를 띄우지 않는다.
      }
      if (!cancelled) setNow(Date.now());
    }
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [unit, grade, ban]);

  if (students.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-200 bg-white px-4 py-6 text-center text-sm text-zinc-400">
        데이터 없음
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-4">
      {students.map((s) => {
        const stuck =
          now !== null &&
          s.stage !== "종합 글쓰기 완료" &&
          now - new Date(s.lastActivity).getTime() >= STUCK_MS;
        return (
          <Link
            key={s.email}
            href={`/teacher?unit=${encodeURIComponent(unit)}&grade=${encodeURIComponent(
              s.grade
            )}&ban=${encodeURIComponent(ban)}&student=${encodeURIComponent(s.email)}#${encodeURIComponent(s.email)}`}
            className={`rounded-2xl border-2 bg-white p-5 shadow-sm transition hover:border-indigo-300 ${
              stuck ? "border-rose-400" : "border-zinc-200"
            }`}
          >
            <div className="text-2xl font-bold text-zinc-900">
              {classLabel(s.grade, s.ban)} {s.no}번
            </div>
            <div className="mt-0.5 truncate text-lg text-zinc-600">{s.name}</div>
            <span
              className={`mt-3 inline-block rounded-full px-3 py-1.5 text-sm font-semibold text-white ${inquiryStageBadgeClass(
                s.stage
              )}`}
            >
              {s.stage}
            </span>
            <div className="mt-2 text-sm text-zinc-400">
              {now === null ? "" : timeAgoLabel(s.lastActivity, now)}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
