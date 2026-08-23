import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isTeacherEmail } from "@/lib/teacher-auth";
import { getAllInquiryRecords, getSubmissionsByEmail } from "@/lib/sheets";
import { generateInquiryPdf } from "@/lib/pdf";

// 파일명에 못 쓰는 문자만 걷어낸다 - 학년/반/번호/이름/단원명을 그대로 이어붙이면
// 단원명에 종종 섞이는 문자(예: "Ⅲ-3.")까지는 괜찮지만 슬래시 등은 파일 경로처럼
// 해석될 수 있어 막는다.
function sanitizeFilenamePart(s: string): string {
  return s.replace(/[/\\:*?"<>|]/g, "_").trim();
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const ts = searchParams.get("ts");
  const scopeParam = searchParams.get("scope");
  const scope = scopeParam === "simple" ? "simple" : "full";
  if (!ts) {
    return NextResponse.json({ error: "ts가 필요합니다." }, { status: 400 });
  }

  const records = await getAllInquiryRecords();
  const record = records.find((r) => r.mainQuestionTimestamp === ts);
  if (!record) {
    return NextResponse.json({ error: "해당 기록을 찾을 수 없습니다." }, { status: 404 });
  }

  // 본인이거나 교사만 - 남의 학생 기록을 timestamp만 알면 아무나 못 받게.
  const isOwner = record.email === session.user.email;
  if (!isOwner && !isTeacherEmail(session.user.email)) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  if (record.totalScore === "") {
    return NextResponse.json(
      { error: "종합 글쓰기가 완료된 기록만 다운로드할 수 있습니다." },
      { status: 400 }
    );
  }

  const rows = await getSubmissionsByEmail(record.email);
  const row = rows.find((r) => r.timestamp === ts);
  if (!row) {
    return NextResponse.json({ error: "해당 질문 제출을 찾을 수 없습니다." }, { status: 404 });
  }

  const pdfBuffer = await generateInquiryPdf(row, record, scope);

  const nameParts = [row.grade, row.ban, row.no, row.name, row.unit]
    .filter((p) => p !== "")
    .map(sanitizeFilenamePart);
  const filename = `${nameParts.join("-")}.pdf`;
  const encodedFilename = encodeURIComponent(filename);

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="report.pdf"; filename*=UTF-8''${encodedFilename}`,
    },
  });
}
