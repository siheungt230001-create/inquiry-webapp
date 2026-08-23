# 역사 탐구 질문 코치 — 웹앱

`apps_script_자동화.gs`(Google Form/Sheets/Apps Script 버전)와 채점 로직·프롬프트·루브릭이
완전히 동일한 웹앱 버전입니다. Next.js(App Router) + Google Sheets(데이터 저장) +
Google 로그인 + Gemini API로 만들어졌습니다.

기존 Apps Script 시트를 그대로 이어서 쓰려면 `SETUP.md`, 다른 학교/교사가
완전히 새 사본으로 쓰려면 `INSTALL_GUIDE.md`를 보세요. 아래는 빠른 시작만
정리한 것입니다.

## 지금 바로 체험해보기 (설정 없이)

Google Cloud 설정을 전혀 하지 않아도 "데모 모드"로 전체 흐름을 체험할 수 있습니다.

```bash
npm install
npm run dev
```

`http://localhost:3000` 접속 → 이메일만 입력해서 로그인 → 질문 제출 → (Gemini API 키가
없으면 채점 단계에서 안내 메시지가 뜹니다. `.env.local`에 `GEMINI_API_KEY`만 넣으면 실제
AI 채점까지 끝까지 체험할 수 있어요.) 데모 모드에서는 제출 데이터가 Google Sheets가 아니라
`data/demo-store.json`에 저장됩니다.

## 실제 운영으로 전환하기

`SETUP.md`를 따라 아래 4가지를 준비하면, 코드 수정 없이 환경변수만 채워서 실제 운영
모드로 자동 전환됩니다.

1. Gemini API 키 (`GEMINI_API_KEY`)
2. Google OAuth 클라이언트 (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) — 학교 Google
   계정으로 로그인하게 하려면 필요합니다.
3. 서비스 계정 + 스프레드시트 (`SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_KEY`) — 기존
   Apps Script 버전과 같은 스프레드시트를 그대로 써도 됩니다.
4. (선택) `ALLOWED_EMAIL_DOMAIN` — 학교 도메인으로 로그인 제한.

## 프로젝트 구조

```
app/
  page.tsx            홈 (로그인 상태에 따라 분기)
  login/page.tsx       로그인
  submit/page.tsx       질문 제출 페이지 (+ components/SubmitForm.tsx)
  history/page.tsx      나의 제출 이력 (student_dashboard.gs에 대응)
  api/units/route.ts     단원 목록 조회
  api/submit/route.ts    제출 → AI 채점 → Sheets 기록
lib/
  rubric.ts    buildPrompt(), RESPONSE_SCHEMA — apps_script_자동화.gs의 buildPrompt_()와 동일
  gemini.ts    callGemini() — MODEL_CANDIDATES 폴백 로직 포함, callGemini_()와 동일
  sheets.ts    Google Sheets 읽기/쓰기 (자격증명 없으면 로컬 JSON으로 자동 대체)
  auth.ts      (프로젝트 루트의 auth.ts) NextAuth 설정
  constants.ts 제출 회차·자가평가 레벨 목록
scripts/selftest.ts   AI 채점 엔진 자체 테스트 (실제 API 키 없이 실행 가능)
```

## 스크립트

```bash
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드 (타입 체크 포함)
npm run lint     # ESLint
npx tsx scripts/selftest.ts   # 채점 엔진 자체 테스트
```
