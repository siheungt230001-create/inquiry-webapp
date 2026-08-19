import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { computeFinalStatus } from "@/lib/rubric";
import { getSubmissionsByEmail, updateSubmissionApproval } from "@/lib/sheets";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { timestamp } = (await request.json()) || {};
  if (!timestamp) {
    return NextResponse.json({ error: "timestamp가 필요합니다." }, { status: 400 });
  }

  const email = session.user.email;
  const rows = await getSubmissionsByEmail(email);
  const row = rows.find((r) => r.timestamp === timestamp);
  if (!row || row.status !== "완료" || row.aiScore === "") {
    return NextResponse.json(
      { error: "채점이 완료된 제출을 찾을 수 없습니다." },
      { status: 400 }
    );
  }

  const approval = computeFinalStatus(row.aiScore);
  const ok = await updateSubmissionApproval(email, timestamp, approval);
  if (!ok) {
    return NextResponse.json({ error: "제출 확정에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ approval });
}
