import { signIn, isDemoLogin, isOAuthMisconfigured } from "@/auth";

export default function LoginPage() {
  const demo = isDemoLogin();
  const misconfigured = isOAuthMisconfigured();

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-zinc-900">역사 탐구 질문 코치</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {misconfigured
            ? "로그인을 준비하는 중이에요. 잠시 후 다시 시도해 주세요."
            : demo
            ? "지금은 데모 모드입니다. 이메일만 입력하면 바로 체험할 수 있어요."
            : "학교 Google 계정으로 로그인해 주세요."}
        </p>

        {misconfigured ? (
          <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-700">
            ⚠️ 설정 미완료: 서버에 Google 로그인(GOOGLE_CLIENT_ID/SECRET)이 아직 연결되지
            않았어요. 관리자에게 문의해 주세요.
          </p>
        ) : demo ? (
          <form
            action={async (formData) => {
              "use server";
              await signIn("credentials", {
                email: formData.get("email"),
                name: formData.get("name"),
                redirectTo: "/",
              });
            }}
            className="mt-6 flex flex-col gap-3"
          >
            <input
              name="name"
              placeholder="이름 (선택)"
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
            />
            <input
              name="email"
              type="email"
              required
              placeholder="이메일 (예: student1@test.com)"
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
            />
            <button
              type="submit"
              className="mt-1 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              데모로 시작하기
            </button>
            <p className="mt-2 text-xs text-amber-600">
              ⚠️ 데모 로그인입니다. 실제 배포 시 .env에 GOOGLE_CLIENT_ID/SECRET을 설정하면
              이 화면 대신 진짜 Google 로그인으로 자동 전환됩니다.
            </p>
          </form>
        ) : (
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/" });
            }}
            className="mt-6"
          >
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Google 계정으로 로그인
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
