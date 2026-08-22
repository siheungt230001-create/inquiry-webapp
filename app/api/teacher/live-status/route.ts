import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isTeacherEmail } from "@/lib/teacher-auth";
import { getAllSubmissions, getAllInquiryRecords } from "@/lib/sheets";
import {
  buildStudentLatest,
  buildInquiryRecordByMainTimestamp,
  buildLiveClassStatus,
} from "@/lib/aggregate";

// 실시간 현황판(app/teacher/live, components/LiveGrid.tsx) 폴링용 - 선택된 단원+반
// 학생 전원의 현재 단계와 마지막 활동 시각만 가볍게 반환한다.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.email || !isTeacherEmail(session.user.email)) {
    return NextResponse.json({ error: "교사만 사용할 수 있어요." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const unit = searchParams.get("unit") || "";
  const ban = searchParams.get("ban") || "";
  if (!unit || !ban) {
    return NextResponse.json({ error: "unit과 ban이 필요합니다." }, { status: 400 });
  }

  const rows = await getAllSubmissions();
  const unitRows = rows.filter((r) => r.unit === unit);
  const students = buildStudentLatest(unitRows).filter((s) => s.ban === ban);

  const records = await getAllInquiryRecords();
  const recordByMainTs = buildInquiryRecordByMainTimestamp(records);

  return NextResponse.json({ students: buildLiveClassStatus(students, recordByMainTs) });
}
