# 설정 안내서 — 실제 운영으로 전환하기

이 문서는 코드를 전혀 몰라도 따라 할 수 있게 순서대로 정리했습니다. 4단계이고,
전부 끝내면 `.env.local`(로컬 테스트용)과 Vercel 환경변수(실제 배포용)에 넣을
값 6개가 준비됩니다.

지금 쓰고 계신 Google Sheets(기존 Apps Script 버전의 그 스프레드시트)를 그대로
써도 됩니다 — 그러면 웹앱으로 들어온 제출과 Form으로 들어온 제출이 같은
`제출_판정_로그` 탭에 쌓이고, `우수질문`/`교사 대시보드` 메뉴도 그대로 계속
작동합니다. 두 시스템을 나란히 써보고 싶다고 하셨으니 이 방식을 추천합니다.

---

## 1단계 — Gemini API 키

이미 발급받으셨다면(기존 Apps Script의 Script Properties에 넣어둔 그 키) 그대로
재사용하면 됩니다. 처음이라면 `Gemini_API_키_발급_안내.md`를 참고하세요.

→ `.env.local`에 `GEMINI_API_KEY=발급받은키`

---

## 2단계 — Google 로그인 (OAuth)

학생·교사가 학교 Google 계정으로 로그인하게 하려면 필요합니다. (건너뛰면 "데모
로그인"으로 계속 동작하지만, 실제 운영에는 적합하지 않습니다 — 아무나 이메일만
입력해서 남의 이름으로 제출할 수 있기 때문입니다.)

1. https://console.cloud.google.com/ 접속 → 새 프로젝트 생성 (또는 기존 프로젝트 사용)
2. 왼쪽 메뉴 "API 및 서비스 > OAuth 동의 화면"
   - User Type: 학교 Google Workspace 계정이면 "내부(Internal)", 개인 계정이 섞여
     있으면 "외부(External)" 선택
   - 앱 이름, 지원 이메일만 입력하면 충분합니다 (범위·테스트 사용자는 기본값 유지)
3. 왼쪽 메뉴 "API 및 서비스 > 사용자 인증 정보 > + 사용자 인증 정보 만들기 > OAuth
   클라이언트 ID"
   - 애플리케이션 유형: "웹 애플리케이션"
   - 승인된 리디렉션 URI에 아래 두 개를 등록 (로컬 테스트용 + 배포용, 배포 주소는
     4단계에서 Vercel이 만들어준 뒤 다시 와서 추가하면 됩니다)
     - `http://localhost:3000/api/auth/callback/google`
     - `https://<나중에-정할-도메인>/api/auth/callback/google`
   - 생성 후 나오는 "클라이언트 ID"와 "클라이언트 보안비밀"을 복사

→ `.env.local`에
```
GOOGLE_CLIENT_ID=복사한 클라이언트 ID
GOOGLE_CLIENT_SECRET=복사한 클라이언트 보안비밀
AUTH_SECRET=아무 랜덤 문자열 (터미널에서 openssl rand -base64 32 실행해서 나온 값)
ALLOWED_EMAIL_DOMAIN=학교 도메인 (예: myschool.hs.kr, 없으면 비워두기)
```

---

## 3단계 — Google Sheets 연결 (서비스 계정)

웹앱 서버가 사람 로그인 없이도 스프레드시트를 읽고 쓸 수 있게 해주는 별도의
"로봇 계정"을 만드는 단계입니다.

1. 같은 Google Cloud 프로젝트에서 "API 및 서비스 > 라이브러리"로 이동 → "Google
   Sheets API" 검색 → 사용 설정
2. "API 및 서비스 > 사용자 인증 정보 > + 사용자 인증 정보 만들기 > 서비스 계정"
   - 이름은 아무거나 (예: inquiry-webapp-bot)
   - 역할 지정은 건너뛰어도 됩니다
3. 생성된 서비스 계정을 클릭 → "키" 탭 → "키 추가 > 새 키 만들기 > JSON" → 다운로드
   (JSON 파일 하나가 저장됩니다)
4. 다운로드한 JSON 파일 안의 `"client_email"` 값(예:
   `inquiry-webapp-bot@프로젝트명.iam.gserviceaccount.com`)을 복사
5. 기존에 쓰던 스프레드시트를 열고 "공유" 버튼 → 방금 복사한 이메일을 "편집자"로 추가

→ `.env.local`에
```
SPREADSHEET_ID=스프레드시트 URL의 /d/와 /edit 사이 긴 문자열
GOOGLE_SERVICE_ACCOUNT_KEY=다운로드한 JSON 파일 내용 전체를 한 줄로 붙여넣기
```
(JSON을 그대로 한 줄 문자열로 넣어도 되고, `base64 -i 파일.json`으로 인코딩해서
넣어도 됩니다 — 코드가 둘 다 자동으로 인식합니다.)

---

## 4단계 — Vercel에 배포

1. 이 프로젝트 폴더를 GitHub 저장소로 올립니다 (또는 Claude Code에서 이어서
   작업하신다면 그때 함께 올려도 됩니다).
2. https://vercel.com 에서 "New Project" → 방금 만든 GitHub 저장소 선택 → Import
3. "Environment Variables"에 위 1~3단계에서 모은 값 6개를 그대로 붙여넣기
   (`GEMINI_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET`,
   `ALLOWED_EMAIL_DOMAIN`, `SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_KEY`)
4. Deploy 클릭 → 배포가 끝나면 `https://프로젝트명.vercel.app` 같은 주소가 생깁니다
5. 2단계로 돌아가서 OAuth 클라이언트의 "승인된 리디렉션 URI"에
   `https://프로젝트명.vercel.app/api/auth/callback/google`을 추가하고 저장

이제 그 주소를 학생들에게 링크로 공유하면 됩니다.

---

## 확인 체크리스트

- [ ] `.env.local`로 로컬에서 `npm run dev` 실행 후 실제 Google 계정으로 로그인되는지
- [ ] 질문 제출 시 AI 피드백이 화면에 바로 뜨는지
- [ ] 스프레드시트의 `제출_판정_로그` 탭에 새 행이 추가되는지 (기존 Apps Script
      COL 구조와 동일한 위치에 값이 들어가는지)
- [ ] "내 제출 이력" 페이지에서 방금 제출한 내용이 보이는지
- [ ] 기존 `교사_대시보드`, `우수질문` 메뉴(Apps Script)가 웹앱으로 들어온
      제출까지 정상적으로 집계하는지

문제가 생기면 Vercel 프로젝트의 "Logs" 탭에서 에러 메시지를 확인하시거나, 이
세션으로 돌아와서 알려주세요.
