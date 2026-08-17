# Claude Code로 이어서 작업하기 — 핸드오프 노트

이 파일은 Claude Code(obra/superpowers, ui-ux-pro-max 등 스킬 설치됨)가 지금까지의
맥락을 빠르게 파악하고 바로 이어서 작업할 수 있도록 정리한 문서입니다. 아래
"Claude Code에 붙여넣을 첫 메시지"를 그대로 복사해서 쓰시면 됩니다.

---

## 지금까지 만든 것 (완료)

`inquiry-webapp/` — Next.js 웹앱. `apps_script_자동화.gs`(Google Form/Sheets/Apps
Script 버전)의 채점 로직을 그대로 옮겼고, 로컬에서 실제 Google 계정 로그인 +
실제 Gemini API 채점 + 실제 Google Sheets 연결까지 전부 검증 완료된 상태입니다.

- `lib/rubric.ts`, `lib/gemini.ts` — `buildPrompt_()`, `RESPONSE_SCHEMA`,
  `MODEL_CANDIDATES` 폴백 로직을 그대로 포팅함
- `lib/sheets.ts` — Google Sheets 읽기/쓰기 (서비스 계정). 자격증명 없으면 로컬
  JSON으로 자동 대체하는 데모 모드 지원
- `auth.ts` — Google 로그인 (학교 도메인 제한 지원), 자격증명 없으면 데모 로그인
- `app/submit/page.tsx` + `components/SubmitForm.tsx` — 학생 질문 제출 + 실시간
  AI 피드백 표시
- `app/history/page.tsx` — 학생 본인 제출 이력 (`student_dashboard.gs` 대응)
- 실제 운영 스프레드시트(`제출_판정_로그` 탭)에 웹앱 제출 건이 정상적으로
  쌓이는 것까지 확인함 — Form 제출과 웹앱 제출이 같은 시트에 함께 쌓입니다.

## 아직 안 만든 것 (다음 작업)

기존 Apps Script 버전에는 있지만 웹앱에는 아직 없는 기능 2개입니다. 참고할 원본
로직은 `reference/` 폴더에 그대로 넣어뒀습니다.

### 1. 교사 대시보드 페이지 (`reference/teacher_dashboard.gs`의 `refreshTeacherDashboard()` 참고)

Apps Script 버전은 버튼을 누르면 아래 3개 표를 계산해서 시트에 다시 씁니다.
웹앱에서는 이걸 실시간으로 보여주는 `/teacher` 페이지로 만들면 됩니다.

- **학생별 최신 상태**: 이메일별로 가장 최근 제출 1건만 골라서 반·번호 순 정렬
  (이름, 반, 번호, 단원, 레벨, 점수, 승인여부, 총 제출횟수)
- **반별 현황**: 반 번호별로 총 제출 수, 승인 수, 승인율, 평균 점수
- **표본 검토 대상**: `self_assessment_mismatch`가 있거나(자가평가 불일치)
  `abuseFlag`가 있는(60초 안에 재제출 등 남용의심) 행만 모아서 리스트

**⚠️ 접근 제어가 필요합니다** — 지금 웹앱은 로그인한 사람 누구나 자기 정보만
보게 되어 있는데(`/history`), 교사 대시보드는 전체 학생 데이터를 다 보여주니까
교사만 접근 가능해야 합니다. `.env.local`에 `TEACHER_EMAILS=선생님이메일1,이메일2`
같은 환경변수를 만들어서, 세션 이메일이 그 목록에 없으면 `/teacher`에서
쫓아내는 방식을 추천합니다.

### 2. 우수질문 내보내기 (`reference/export_approved_questions.gs` 참고)

Apps Script 버전은 승인(4.0점 이상)된 질문만 모아서 (a) 학생 공유용 익명 Google
Doc, 또는 (b) 교사용 시트 탭 두 가지로 내보냅니다.

**결정할 점 (선생님과 상의해서 정하세요)**: 웹앱에서도 실제 Google Doc을
만들게 할지, 아니면 그냥 웹 페이지 안에서 목록을 예쁘게 보여주고 "복사"나
"인쇄"만 되게 할지. 전자는 Google Docs API 권한(서비스 계정에 Drive/Docs 접근
범위 추가)이 더 필요해서 설정이 늘어나고, 후자는 지금 있는 Sheets 권한만으로
충분히 구현 가능합니다. 처음엔 후자(웹 페이지로 목록만 보여주기)로 만들고,
정말 Doc 파일이 필요하다고 하시면 그때 확장하는 걸 추천합니다.

### 3. 디자인 다듬기 (ui-ux-pro-max)

지금 화면은 최소한의 Tailwind 스타일만 입혀놓은 상태입니다(기능 검증이
목적이었어서요). ui-ux-pro-max 스킬로 전체적인 톤앤매너, 색상, 타이포그래피,
모바일 반응형(학생들이 폰으로 접속할 가능성이 큼)을 다듬어주면 좋습니다.

---

## Claude Code에 붙여넣을 첫 메시지 (그대로 복사해서 쓰세요)

```
이 프로젝트(inquiry-webapp)는 중학교 역사 탐구 질문 AI 피드백 웹앱이야.
HANDOFF.md를 먼저 읽고 지금까지 뭐가 됐고 뭐가 안 됐는지 파악해줘.

오늘 할 일은 두 가지야:
1. reference/teacher_dashboard.gs의 refreshTeacherDashboard() 로직을 참고해서
   /teacher 페이지를 만들어줘. 학생별 최신 상태 / 반별 현황 / 표본 검토 대상
   3개 표를 보여주면 돼. TEACHER_EMAILS 환경변수로 접근 제어도 넣어줘.
2. reference/export_approved_questions.gs의 getApprovedRows_() 로직을 참고해서
   우수질문(승인된 질문) 목록을 웹 페이지에서 보여주는 기능을 만들어줘. 처음엔
   Google Doc을 만드는 대신 그냥 웹 페이지 안에 예쁘게 목록만 보여줘도 돼.

두 페이지 다 만들고 나면 ui-ux-pro-max로 전체 디자인(특히 학생들이 폰으로
접속할 걸 감안한 모바일 화면)을 다듬어줘. superpowers 방법론대로 계획 →
구현 → 확인 순서로 진행해줘.
```

---

## 참고 — 지금 로컬에서 돌리고 계신 `.env.local` 값 그대로 쓰시면 됩니다

이미 `AUTH_SECRET`, `GEMINI_API_KEY`, `SPREADSHEET_ID`,
`GOOGLE_SERVICE_ACCOUNT_KEY`를 다 채우고 실제 Sheets 연결까지 확인하셨으니,
Claude Code에서도 같은 폴더(`inquiry-webapp`)를 열어서 작업하시면 그 설정을
그대로 이어서 씁니다. 새로 뭘 더 설정하실 필요는 없고, 위에 언급한
`TEACHER_EMAILS`만 하나 추가하시면 됩니다.
