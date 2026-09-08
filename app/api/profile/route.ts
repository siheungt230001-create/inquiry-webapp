import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { appendProfileChangeLog, getStudentProfile, upsertStudentProfile } from "@/lib/sheets";
import { validateProfileNumbers } from "@/lib/constants";
import { toUserErrorMessage } from "@/lib/errorMessage";

// components/SubmitForm.tsx가 마운트 시 불러와서 학년/반/번호/이름을 미리 채운다 -
// 저장/갱신은 app/api/submit/route.ts와 app/api/submit/edit/route.ts가 제출/수정
// 시점에 알아서 한다(이 라우트는 조회 전용).
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  try {
    const profile = await getStudentProfile(session.user.email);
    return NextResponse.json({
      profile: profile
        ? { grade: profile.grade, ban: profile.ban, no: profile.no, name: profile.name }
        : null,
    });
  } catch (err) {
    return NextResponse.json({ error: toUserErrorMessage(err, "profile/get") }, { status: 502 });
  }
}

// "내 정보 수정" 화면(components/ProfileEditForm.tsx) 전용 - 학생이 잘못 입력한
// 학년/반/번호/이름을 스스로 고친다. 프로필(학생_프로필)만 갱신하고, 이미 제출된
// 과거 기록(제출_판정_로그/탐구_글쓰기_기록)은 절대 건드리지 않는다 - 그 기록들은
// 각자 제출 당시의 grade/ban/no/name을 그대로 갖고 있어야 하는 스냅샷이라서다.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await request.json();
  const { grade = "", ban = "", no = "", name = "" } = body || {};
  const error = validateProfileNumbers(String(grade), String(ban), String(no));
  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  const email = session.user.email;
  try {
    const before = await getStudentProfile(email);
    const beforeFields = {
      grade: before?.grade ?? "",
      ban: before?.ban ?? "",
      no: before?.no ?? "",
      name: before?.name ?? "",
    };
    const afterFields = { grade: String(grade), ban: String(ban), no: String(no), name: String(name) };

    await upsertStudentProfile({ email, ...afterFields });
    // 감사 로그는 부가 기능이다 - 실패해도 방금 저장된 프로필 갱신 자체는 되돌리지 않는다.
    await appendProfileChangeLog(email, beforeFields, afterFields).catch(() => {});

    return NextResponse.json({ profile: afterFields });
  } catch (err) {
    return NextResponse.json({ error: toUserErrorMessage(err, "profile/post") }, { status: 502 });
  }
}
