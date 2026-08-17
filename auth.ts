import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";

// GOOGLE_CLIENT_ID/SECRET이 설정돼 있으면 실제 학교 Google 계정 로그인을 씁니다.
// 아직 Google Cloud 설정 전이라면(둘 중 하나라도 없으면) 이메일만 입력하는 간단 로그인으로
// 대체해서, OAuth 설정 없이도 앱 전체 흐름을 바로 테스트해볼 수 있게 합니다.
const hasGoogleOAuth = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
);
const isProduction = process.env.NODE_ENV === "production";
// 프로덕션에서는 OAuth 설정이 없어도 데모 로그인으로 새지 않게 fail-closed 처리합니다 -
// 안 그러면 배포 시 OAuth 설정을 깜빡했을 때 아무나 이메일만 입력해서 로그인할 수 있습니다
// (fail-open). 데모 로그인 fallback은 개발 환경(NODE_ENV=development)에서만 허용합니다.
const useRealGoogleLogin = hasGoogleOAuth || isProduction;

const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN; // 예: "schoolname.hs.kr" (선택)

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  providers: useRealGoogleLogin
    ? [
        Google({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          authorization: {
            params: {
              // 학교 G Suite/Workspace 도메인이면 hd 파라미터로 로그인 화면에서부터 좁혀줍니다.
              // (진짜 검증은 아래 signIn 콜백에서 한 번 더 합니다 - hd 파라미터는 우회 가능합니다.)
              hd: allowedDomain || undefined,
            },
          },
        }),
      ]
    : [
        Credentials({
          name: "데모 로그인 (이메일만 입력)",
          credentials: {
            email: { label: "이메일", type: "email" },
            name: { label: "이름", type: "text" },
          },
          async authorize(credentials) {
            const email = credentials?.email as string | undefined;
            if (!email) return null;
            return {
              id: email,
              email,
              name: (credentials?.name as string) || email.split("@")[0],
            };
          },
        }),
      ],
  pages: { signIn: "/login" },
  callbacks: {
    async signIn({ user }) {
      if (!useRealGoogleLogin) return true; // 데모 로그인은 그대로 통과
      if (!allowedDomain) return true; // 도메인 제한을 설정 안 했으면 통과
      return Boolean(user.email && user.email.endsWith("@" + allowedDomain));
    },
    async session({ session }) {
      return session;
    },
  },
});

export function isDemoLogin(): boolean {
  return !useRealGoogleLogin;
}

// 프로덕션인데 GOOGLE_CLIENT_ID/SECRET을 안 채운 상태 - 로그인 자체를 막고 안내만 보여줘야 함.
export function isOAuthMisconfigured(): boolean {
  return isProduction && !hasGoogleOAuth;
}
