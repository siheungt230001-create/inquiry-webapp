import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getStudentProfile } from "@/lib/sheets";

// components/SubmitForm.tsx가 마운트 시 불러와서 학년/반/번호/이름을 미리 채운다 -
// 저장/갱신은 app/api/submit/route.ts와 app/api/submit/edit/route.ts가 제출/수정
// 시점에 알아서 한다(이 라우트는 조회 전용).
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const profile = await getStudentProfile(session.user.email);
  return NextResponse.json({
    profile: profile
      ? { grade: profile.grade, ban: profile.ban, no: profile.no, name: profile.name }
      : null,
  });
}
