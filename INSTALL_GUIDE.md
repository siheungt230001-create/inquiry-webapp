# 설치 가이드 — 다른 학교에서 이 프로그램 복사해서 쓰기

이 문서는 코드를 몰라도 따라 할 수 있게 순서대로 정리했습니다. 다른 선생님이
이 프로그램을 자기 학교/학급용으로 완전히 독립된 사본으로 쓰고 싶을 때
필요한 내용입니다(같은 구글 시트를 같이 쓰는 게 아니라, 완전히 새 시트·새
배포를 만드는 경우).

전부 무료로 가능합니다 (Google Cloud, Gemini API, GitHub, Vercel 모두 무료
티어로 충분합니다). 처음부터 끝까지 30분~1시간 정도 걸립니다.

**먼저 설정 없이 체험해보고 싶다면**: 아래 과정 전부 건너뛰고 그냥
`npm install && npm run dev`로 실행하면 "데모 모드"로 전체 흐름을 체험할 수
있습니다. 이때는 실제 구글 시트 대신 로컬 파일(`data/demo-store.json`)에
저장됩니다. 실제로 학생들에게 배포하려면 아래 순서를 따라가세요.

---

## 1. 필요한 계정/서비스 목록

| 계정/서비스 | 용도 | 필수 여부 |
|---|---|---|
| Google 계정 | 아래 모든 구글 서비스의 기반 | 필수 |
| Google Cloud 프로젝트 | OAuth 로그인 설정 + 시트 접근용 "서비스 계정" 발급 | 필수 |
| Gemini API 키 (Google AI Studio) | 학생 질문/글 AI 채점 | 필수 |
| GitHub 계정 | 이 코드를 내 계정으로 복사(fork)해서 Vercel과 연결 | 필수 |
| Vercel 계정 | 실제로 인터넷에 배포하는 곳(무료) | 필수 |
| Upstash QStash 계정 | 학생들이 한꺼번에 몰릴 때 채점 요청을 줄 세워주는 큐 | 선택 (아래 설명) |

**QStash가 왜 선택인지**: Gemini 무료 API는 "분당 15회"까지만 채점 요청을
받아줍니다. 학급 인원이 한 번에 15명 넘게 동시 제출하지 않는다면 QStash 없이도
잘 동작합니다(그 자리에서 바로 채점). 나중에 필요해지면 언제든 환경변수 3개만
추가하면 켜집니다 — 처음엔 건너뛰어도 됩니다.

---

## 2. 환경변수 전체 목록과 발급 방법

아래 값들을 `.env.local` 파일(로컬 테스트용)과 Vercel의 "Environment
Variables"(실제 배포용)에 똑같이 넣어야 합니다. 파일 형식은 `.env.example`을
복사해서(`cp .env.example .env.local`) `키=값` 한 줄씩 채우면 됩니다.

### 필수

| 환경변수 | 설명 | 어디서 발급받나 |
|---|---|---|
| `GOOGLE_CLIENT_ID` | 구글 로그인용 OAuth 클라이언트 ID | Google Cloud Console (아래 2-1 참고) |
| `GOOGLE_CLIENT_SECRET` | 위 클라이언트의 비밀키 | 위와 동일 |
| `AUTH_SECRET` | 로그인 세션 암호화용 랜덤 문자열(아무 의미 없는 랜덤 값이면 됨) | 터미널에서 `openssl rand -base64 32` (Mac/Linux) 또는 `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` (Windows 포함 어디서나) 실행한 결과 복사 |
| `GEMINI_API_KEY` | AI 채점용 API 키 | https://aistudio.google.com/apikey (Google 계정으로 로그인 → "Get API key" → "Create API key") |
| `SPREADSHEET_ID` | 데이터를 저장할 구글 시트의 ID | 시트 URL에서 `/d/`와 `/edit` 사이의 긴 문자열 |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | 웹앱 서버가 사람 로그인 없이 시트를 읽고 쓸 수 있게 하는 "로봇 계정" 키(JSON) | Google Cloud Console (아래 2-2 참고) |
| `TEACHER_EMAILS` | 교사 대시보드(`/teacher`)에 들어갈 수 있는 이메일 목록, 콤마로 구분 | 직접 입력 (예: `teacher1@school.kr,teacher2@school.kr`) |
| `APP_URL` | 배포된 사이트의 정확한 주소 | Vercel이 배포 후 알려주는 주소 (예: `https://내프로젝트.vercel.app`) — **QStash를 쓰지 않아도 채점 콜백 안정성을 위해 꼭 넣는 걸 권장** |

### 선택

| 환경변수 | 설명 | 어디서 발급받나 |
|---|---|---|
| `ALLOWED_EMAIL_DOMAIN` | 이 도메인 계정만 로그인 허용(예: `myschool.hs.kr`). 비워두면 아무 구글 계정이나 로그인 가능 | 직접 입력 |
| `QSTASH_TOKEN` | 채점 요청을 큐에 넣을 때 쓰는 토큰 | Upstash 콘솔 → QStash 탭 (아래 2-3 참고) |
| `QSTASH_CURRENT_SIGNING_KEY` | QStash가 보낸 콜백이 진짜인지 검증하는 키 | 위와 동일 |
| `QSTASH_NEXT_SIGNING_KEY` | 위 키를 교체할 때를 대비한 보조 키 | 위와 동일 |

**⚠️ 중요 (실제로 겪었던 사고)**: `APP_URL`을 안 채우면, 배포 URL이 바뀔 때마다
(또는 QStash를 켰을 때) 채점 콜백이 Vercel의 배포 보호 기능에 막혀서 "제출이
접수됐어요..." 화면에서 영원히 안 넘어가는 문제가 생길 수 있습니다. 배포 후
Vercel이 알려주는 정확한 프로덕션 주소를 `APP_URL`에 꼭 넣어주세요.

### 2-1. Google Cloud — OAuth 로그인 설정

1. https://console.cloud.google.com/ 접속 → 새 프로젝트 생성
2. 왼쪽 메뉴 "API 및 서비스 > OAuth 동의 화면"
   - User Type: 학교 Google Workspace 계정만 쓸 거면 "내부(Internal)", 개인
     계정도 섞여 있으면 "외부(External)"
   - 앱 이름, 지원 이메일만 채우면 됩니다
3. "API 및 서비스 > 사용자 인증 정보 > + 사용자 인증 정보 만들기 > OAuth
   클라이언트 ID"
   - 애플리케이션 유형: "웹 애플리케이션"
   - "승인된 리디렉션 URI"에 우선 아래 로컬 테스트용 주소만 등록해둡니다
     (배포 주소는 5단계에서 Vercel 배포 후 다시 와서 추가합니다)
     - `http://localhost:3000/api/auth/callback/google`
   - 생성 후 나오는 "클라이언트 ID"와 "클라이언트 보안비밀"을 복사해서
     `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`에 넣습니다

### 2-2. Google Cloud — 시트 연동용 서비스 계정

1. 같은 Google Cloud 프로젝트에서 "API 및 서비스 > 라이브러리" → "Google
   Sheets API" 검색 → 사용 설정
2. "API 및 서비스 > 사용자 인증 정보 > + 사용자 인증 정보 만들기 > 서비스 계정"
   - 이름은 아무거나 (예: `inquiry-webapp-bot`), 역할 지정은 건너뛰어도 됩니다
3. 생성된 서비스 계정 클릭 → "키" 탭 → "키 추가 > 새 키 만들기 > JSON" → 다운로드
4. 다운로드한 JSON 파일 내용 전체를 그대로 복사해서 `GOOGLE_SERVICE_ACCOUNT_KEY`에
   붙여넣습니다 (한 줄로 이어붙여도 되고, `base64 -i 파일.json`으로 인코딩해서
   넣어도 됩니다 — 코드가 둘 다 자동으로 인식합니다)
5. JSON 파일 안의 `"client_email"` 값(예:
   `inquiry-webapp-bot@프로젝트명.iam.gserviceaccount.com`)을 복사해두세요 —
   3단계(시트 만들기)에서 이 계정을 시트 편집자로 추가해야 합니다

### 2-3. (선택) Upstash QStash

1. https://console.upstash.com/ 에서 회원가입(무료)
2. 왼쪽 메뉴 "QStash" 선택
3. "Request Builder" 옆이나 대시보드 상단에서 `QSTASH_TOKEN`,
   `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` 세 값을 그대로
   복사해서 넣으면 됩니다 (Upstash 콘솔에서 미리 발급되어 있는 값입니다 -
   별도로 "엔드포인트 등록" 같은 걸 할 필요는 없습니다)

---

## 3. 구글 시트 구조 (새 시트 템플릿)

1. 새 Google Sheets 문서를 만들고, 탭을 정확히 아래 4개 이름으로 만듭니다
   (이름이 코드와 정확히 일치해야 합니다 — 오타 주의).
2. 시트 "공유" 버튼 → 2-2에서 복사해둔 서비스 계정 이메일을 "편집자"로 추가.
3. 시트 URL의 `/d/`와 `/edit` 사이 문자열을 `SPREADSHEET_ID`에 넣습니다.

각 탭은 **1행을 헤더(제목)로 비워두고, 2행부터 데이터가 쌓입니다.** 헤더 텍스트
자체는 코드가 안 읽습니다(사람이 보기 편하라고 있는 것) — 대신 **컬럼 순서가
아래와 정확히 같아야 합니다.** 순서가 하나라도 어긋나면 엉뚱한 칸에 값이
들어갑니다.

### 탭 1: `단원_자료`

학생이 제출할 때 고르는 "단원" 목록과, AI가 채점할 때 참고하는 교과서 본문입니다.

| 컬럼 | 내용 |
|---|---|
| A | 단원명 (학생이 드롭다운에서 고르는 값과 정확히 같은 문자열) |
| B | 그라운딩 텍스트 (그 단원의 교과서 본문/핵심 내용 — AI가 사실 확인할 때 이 내용을 기준으로 판단합니다) |

C열 이후는 자유롭게 메모용으로 쓰셔도 됩니다(코드가 안 읽음). 이 탭에 최소
1개 이상의 단원 행이 있어야 학생이 질문을 제출할 수 있습니다.

### 탭 2: `제출_판정_로그`

학생이 제출한 "탐구 질문"과 AI 채점 결과가 쌓이는 메인 탭입니다. **2행부터,
아래 순서 그대로** 컬럼을 만드세요.

```
A: timestamp (제출 시각, 자동)
B: email (제출자 구글 계정, 자동)
C: ban (반)
D: no (번호)
E: name (이름)
F: unit (단원명)
G: round (제출 회차, 자동 계산)
H: question (학생이 쓴 탐구 질문)
I: selfLevel (학생 자가평가 레벨)
J: textbookLink (교과서 어느 부분과 연결되는지)
K: doubt (Gemini 답변 중 납득 안 된 부분, 선택 입력)
L: status (처리중 | 완료 | 오류: ...)
M: aiLevel (AI가 판정한 레벨)
N: aiScore (AI 총점)
O: fact (사실 정확성 세부 점수)
P: causal (인과·분석 깊이)
Q: compare (비교·평가 요소)
R: sentence (문장 명료성)
S: integration (자료 통합 깊이)
T: approval (승인 | 재제출 | 제출완료(미승인))
U: mismatch (자가평가-AI판정 불일치 메모, 자동)
V: feedback (AI 피드백 텍스트)
W: processedAt (채점 완료 시각, 자동)
X: abuseFlag (짧은 시간 재제출 등 어뷰징 의심 표시, 자동)
Y: levelTrack (레벨 분석용 - L1~L4, 자동)
Z: levelBand (레벨 분석용 - 낮음/높음, 자동)
AA: grade (학년)
```

빈 시트라면 1행에 위 이름들(timestamp, email, ban...)을 그대로 헤더로
적어두면 나중에 시트를 열어봤을 때 알아보기 편합니다.

### 탭 3: `탐구_글쓰기_기록`

보조질문 → 종합 글쓰기(서론/본론/결론) 단계의 기록입니다.

```
A: timestamp (이 기록의 고유 키, 자동)
B: email
C: ban
D: no
E: name
F: unit
G: mainQuestionTimestamp (제출_판정_로그의 timestamp와 연결되는 값)
H: mainQuestion (원래 제출한 탐구 질문)
I: subQuestionsJson (보조질문+답변+출처를 JSON 문자열로 통째로 저장)
J: intro (서론)
K: body (본론)
L: conclusion (결론)
M: introScore (서론 점수, 0~1)
N: bodyScore (본론 점수, 0~2.5)
O: conclusionScore (결론 점수, 0~1)
P: totalScore (총점, 자동 합산)
Q: comment (AI가 감점 이유를 설명하는 코멘트)
R: factScore (사실정확성 점수, 0 또는 0.5)
```

### 탭 4: `학생_프로필`

학생이 재로그인했을 때 학년/반/번호/이름을 자동으로 채워주기 위한 탭입니다.
학생이 직접 뭘 입력하는 탭이 아니라, 제출/수정할 때마다 앱이 자동으로 갱신합니다
— 빈 탭으로 만들어두면 됩니다.

```
A: email
B: grade
C: ban
D: no
E: name
F: updatedAt
```

---

## 4. 교사 이메일 등록 (누가 `/teacher` 대시보드에 들어갈 수 있는지)

1단계에서 만든 `TEACHER_EMAILS` 환경변수에, 교사 대시보드
(`/teacher`, `/teacher/all`, `/teacher/live`)에 들어갈 수 있는 구글 이메일을
콤마로 구분해서 넣으면 됩니다.

```
TEACHER_EMAILS=teacher1@school.kr,teacher2@school.kr
```

- 여기 없는 이메일로 로그인한 사람은(학생 포함) `/teacher` 계열 페이지에
  접근할 수 없고, 본인이 제출한 것만 보이는 `/history` 화면으로만 다닙니다.
- 이 환경변수만 바꾸면 되고, 코드를 수정할 필요는 없습니다. 교사가
  바뀌거나 추가되면 Vercel의 Environment Variables에서 이 값만 고치고
  재배포(Redeploy)하면 됩니다.
- 대소문자는 구분하지 않습니다.

---

## 5. GitHub 복사 → Vercel 배포 순서

1. 이 저장소(GitHub repo)를 본인 GitHub 계정으로 **Fork**합니다 (GitHub
   저장소 페이지 우측 상단 "Fork" 버튼).
2. https://vercel.com 접속 → GitHub 계정으로 로그인/가입
3. "Add New... > Project" → 방금 Fork한 저장소 선택 → "Import"
4. "Environment Variables" 항목에서 2단계에서 모은 값들을 전부 입력합니다
   (필수 8개: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET`,
   `GEMINI_API_KEY`, `SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_KEY`,
   `TEACHER_EMAILS`, 그리고 `APP_URL`은 일단 비워두거나 임시값을 넣습니다 —
   배포 후 실제 주소를 알아야 정확히 채울 수 있습니다)
5. "Deploy" 클릭 → 몇 분 후 배포가 끝나면 `https://프로젝트명.vercel.app`
   같은 주소가 생깁니다
6. **이 주소를 그대로 `APP_URL`에 넣고 재배포**합니다 (Vercel 프로젝트 >
   Settings > Environment Variables에서 수정 → Deployments 탭에서 최신
   배포 우측 "..." > Redeploy)
7. 2-1단계로 돌아가서, Google Cloud Console의 OAuth 클라이언트 "승인된
   리디렉션 URI"에 아래를 추가하고 저장합니다.
   ```
   https://프로젝트명.vercel.app/api/auth/callback/google
   ```

이제 그 주소를 학생들에게 공유하면 됩니다.

---

## 6. 배포 후 확인 체크리스트

- [ ] 배포된 주소에 접속했을 때 로그인 화면이 뜨는지 (데모 로그인 화면이
      아니라 실제 구글 로그인 버튼이 떠야 정상 — 데모 로그인이 보인다면
      `GOOGLE_CLIENT_ID`/`SECRET`이 제대로 안 들어간 것입니다)
- [ ] 학교 구글 계정으로 로그인이 되는지 (`ALLOWED_EMAIL_DOMAIN`을
      설정했다면 그 도메인 계정으로)
- [ ] 질문 제출 화면에서 단원 드롭다운에 `단원_자료` 탭에 넣은 단원명이
      뜨는지
- [ ] 질문을 하나 제출했을 때 AI 피드백이 화면에 뜨고, 몇 초~몇 분 안에
      "완료" 상태로 넘어가는지 (계속 "처리중"에 멈춰 있으면 `APP_URL`이
      정확한지, QStash를 켰다면 서명 키가 맞는지 확인)
- [ ] `제출_판정_로그` 탭에 새 행이 정확한 컬럼 위치에 쌓이는지
- [ ] "내 제출 이력" 페이지(`/history`)에서 방금 제출한 내용이 보이는지
- [ ] `TEACHER_EMAILS`에 등록한 이메일로 로그인했을 때 `/teacher`
      대시보드에 들어가고, 다른 이메일로는 못 들어가는지
- [ ] 보조질문 → 종합 글쓰기까지 끝내면 `탐구_글쓰기_기록` 탭에도 행이
      쌓이는지
- [ ] 종합 글쓰기 완료된 기록에서 "PDF 다운로드" 눌렀을 때 인쇄 미리보기
      페이지가 새 탭으로 뜨는지

문제가 생기면 Vercel 프로젝트의 "Logs" 탭에서 에러 메시지를 먼저 확인하세요.
대부분 환경변수 하나가 빠졌거나, 시트 탭 이름/컬럼 순서가 어긋난 경우입니다.
