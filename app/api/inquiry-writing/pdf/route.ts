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

// ponytail: @react-pdf/renderer 렌더링이 실측 65~130초 걸리고, 실제 프로덕션에서는
// 10분 넘게 끝나지 않은 사례까지 확인됐다 - 그동안 Node 이벤트 루프를 완전히 막아
// 같은 인스턴스에 몰린 다른 요청까지 응답이 안 나가는 것도 직접 확인했다.
// generateInquiryPdf에는 취소 수단이 없어서(Promise.race로 "기다리는 것"만
// 그만둘 수 있지, 실제로 돌고 있는 렌더링 자체는 멈출 방법이 없다) 타임아웃을
// 걸어도 서버가 그 시간만큼 실제로 자유로워지는 건 아니다 - 그래서 아래 lock은
// (race 결과가 아니라) 진짜 렌더링 Promise가 실제로 끝날 때만 풀리게 했다.
// 그래야 타임아웃으로 응답을 먼저 돌려준 뒤에도 그 위에 새 렌더링이 계속
// 쌓이는 걸 막을 수 있다. 다만 이 lock은 이 서버리스 인스턴스 안에서만 유효하다
// (Fluid Compute가 요청이 몰리면 새 인스턴스를 띄울 수 있어서 완전한 보장은
// 아니다) - 근본 해결(워커 스레드/큐 분리, 또는 인쇄 방식 확정) 전까지 임시 조치.
const PDF_RESPONSE_TIMEOUT_MS = 90_000;
let renderInFlight = false;

function withResponseTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${ms}ms 안에 응답을 만들지 못했습니다.`)),
      ms
    );
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
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

  if (renderInFlight) {
    return NextResponse.json(
      { error: "다른 PDF를 만들고 있어요. 잠시 후 다시 시도해주세요." },
      { status: 503 }
    );
  }
  renderInFlight = true;
  // 실제 렌더링 Promise. 타임아웃으로 먼저 응답을 돌려줘도 이 Promise 자체는
  // 계속 실행되므로, lock은 반드시 이 Promise가 끝날 때 풀어야 한다(race 쪽이
  // 아니라).
  const renderPromise = generateInquiryPdf(row, record, scope);
  renderPromise
    .finally(() => {
      renderInFlight = false;
    })
    // 실제 에러 처리는 아래 withResponseTimeout 쪽에서 이미 하므로, 여기서는
    // "처리 안 된 rejection" 경고만 안 뜨게 조용히 삼킨다.
    .catch(() => {});

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await withResponseTimeout(renderPromise, PDF_RESPONSE_TIMEOUT_MS);
  } catch {
    return NextResponse.json(
      { error: "PDF를 만드는 데 시간이 너무 오래 걸려요. 잠시 후 다시 시도해주세요." },
      { status: 504 }
    );
  }

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
