import Link from "next/link";
import { auth } from "@/auth";
import { getInquiryRecord, getSubmissionsByEmail, isDemoMode } from "@/lib/sheets";
import { inquiryStageOf } from "@/lib/aggregate";
import SignOutButton from "@/components/SignOutButton";

// 로그인 계정 기준으로 서버(시트)에서 "이어서 작성 중인 탐구"가 있는지 찾는다.
// sessionStorage와 달리 브라우저/기기와 무관하게 항상 같은 결과가 나와야 하므로,
// 링크를 타고 들어왔는지와 상관없이 루트 페이지에 새로 접속해도 여기서 바로 이어갈
// 수 있게 한다. 단계 판단은 교사 대시보드 진행 배지와 같은 기준(inquiryStageOf)을 쓴다.
async function findResumeLink(email: string) {
  const rows = await getSubmissionsByEmail(email);
  const latest = rows[0];
  if (!latest) return null;

  const record = await getInquiryRecord(email, latest.timestamp);
  const q = encodeURIComponent(latest.question);
  const ts = encodeURIComponent(latest.timestamp);
  const unit = encodeURIComponent(latest.unit);

  switch (inquiryStageOf(record ?? undefined)) {
    case "종합 글쓰기 완료":
      return null; // 이미 다 끝났으니 새로 이어 쓸 게 없다.
    case "종합 글쓰기 작성 중":
      return { href: `/submit/answer?ts=${ts}&q=${q}`, label: "종합 글쓰기 이어서 쓰기" };
    case "보조질문 답변 작성 중":
      return { href: `/submit/sub-answers?ts=${ts}&q=${q}&unit=${unit}`, label: "보조질문 답 이어서 쓰기" };
    default:
      return { href: `/submit/sub-questions?ts=${ts}&q=${q}&unit=${unit}`, label: "보조질문 이어서 만들기" };
  }
}

export default async function Home() {
  const session = await auth();
  const demo = isDemoMode();
  const resumeLink = session?.user?.email ? await findResumeLink(session.user.email) : null;

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md">
        {demo && (
          <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-xs text-amber-700">
            지금은 데모 모드로 동작 중입니다. 제출 내용은 Google Sheets가 아니라 이 서버의
            임시 파일에 저장돼요. 실제 운영하려면 SPREADSHEET_ID·서비스 계정 환경변수를
            설정하세요.
          </div>
        )}

        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm text-center">
          <h1 className="text-2xl font-semibold text-zinc-900">역사 탐구 질문 코치</h1>
          <p className="mt-2 text-sm text-zinc-500">
            질문을 다듬으면 탐구가 깊어져요. AI 코치와 함께 좋은 질문을 만들어 보세요.
          </p>

          {session ? (
            <div className="mt-6 flex flex-col gap-3">
              <p className="text-sm text-zinc-600">
                {session.user?.name || session.user?.email}님, 환영합니다.
              </p>
              {resumeLink && (
                <Link
                  href={resumeLink.href}
                  className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500"
                >
                  {resumeLink.label} →
                </Link>
              )}
              <Link
                href="/submit"
                className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700"
              >
                질문 제출하기
              </Link>
              <Link
                href="/history"
                className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                내 제출 이력 보기
              </Link>
              <div className="mt-2">
                <SignOutButton />
              </div>
            </div>
          ) : (
            <Link
              href="/login"
              className="mt-6 inline-block rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700"
            >
              로그인하고 시작하기
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
