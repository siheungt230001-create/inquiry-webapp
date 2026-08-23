import path from "path";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  renderToBuffer,
} from "@react-pdf/renderer";
import { CRITERIA_ACCENTS, ESSAY_ACCENTS } from "./badge";
import type { InquiryRecord, InquirySubQuestion, SubmissionRow } from "./types";

// 한글이 안 나오는 기본 폰트(Helvetica 등)라 반드시 한글 지원 폰트를 등록해야 한다.
// 로컬 파일을 쓰는 이유: 매 요청마다 외부 URL에서 폰트를 받아오면(@react-pdf/renderer가
// src로 URL도 받긴 함) 느리고 그 서비스가 잠깐이라도 죽으면 PDF 생성 자체가 막힌다.
// 이 파일을 쓰는 라우트(app/api/inquiry-writing/pdf)는 next.config.ts의
// outputFileTracingIncludes로 이 폴더를 서버리스 번들에 강제 포함시켜뒀다.
let fontsRegistered = false;
function ensureFontsRegistered() {
  if (fontsRegistered) return;
  const fontsDir = path.join(process.cwd(), "assets", "fonts");
  Font.register({
    family: "NotoSansKR",
    fonts: [
      { src: path.join(fontsDir, "NotoSansKR-Regular.woff"), fontWeight: 400 },
      { src: path.join(fontsDir, "NotoSansKR-Bold.woff"), fontWeight: 700 },
    ],
  });
  fontsRegistered = true;
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "NotoSansKR",
    fontSize: 10,
    padding: 36,
    color: "#18181b",
  },
  unit: { fontSize: 9, color: "#71717a", marginBottom: 4 },
  profile: { fontSize: 9, color: "#71717a", marginBottom: 10 },
  question: { fontSize: 14, fontWeight: 700, marginBottom: 14, lineHeight: 1.4 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    marginTop: 16,
    marginBottom: 6,
    color: "#3f3f46",
  },
  criteriaRow: { flexDirection: "row", gap: 6, marginBottom: 4 },
  criteriaTile: {
    flex: 1,
    borderTopWidth: 2,
    backgroundColor: "#fafafa",
    padding: 6,
    textAlign: "center",
  },
  criteriaLabel: { fontSize: 7.5, color: "#71717a", marginBottom: 2 },
  criteriaValue: { fontSize: 10, fontWeight: 700 },
  subQItem: {
    backgroundColor: "#fafafa",
    borderRadius: 4,
    padding: 8,
    marginBottom: 6,
  },
  subQLabel: { fontSize: 8, color: "#a1a1aa", marginBottom: 2 },
  subQQuestion: { fontSize: 10, marginBottom: 3, lineHeight: 1.4 },
  subQAnswer: { fontSize: 9.5, color: "#3f3f46", lineHeight: 1.4 },
  subQSource: { fontSize: 8, color: "#a1a1aa", marginTop: 3 },
  essayBlock: {
    backgroundColor: "#fafafa",
    borderRadius: 4,
    padding: 8,
    marginBottom: 6,
  },
  essayHeaderRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  essayLabel: { fontSize: 9, fontWeight: 700, color: "#3f3f46" },
  essayScore: { fontSize: 8, color: "#a1a1aa" },
  essayText: { fontSize: 9.5, lineHeight: 1.5 },
  totalScore: {
    fontSize: 11,
    fontWeight: 700,
    marginTop: 10,
    marginBottom: 6,
  },
  comment: {
    backgroundColor: "#eef2ff",
    borderRadius: 4,
    padding: 8,
    marginTop: 8,
  },
  commentLabel: { fontSize: 8, fontWeight: 700, color: "#4338ca", marginBottom: 2 },
  commentText: { fontSize: 9, color: "#3730a3", lineHeight: 1.4 },
});

function parseSubQuestions(json: string): InquirySubQuestion[] {
  try {
    return JSON.parse(json || "[]");
  } catch {
    return [];
  }
}

function EssayScoreTiles({ record }: { record: InquiryRecord }) {
  const values = [record.introScore, record.bodyScore, record.conclusionScore, record.factScore];
  return (
    <View style={styles.criteriaRow}>
      {ESSAY_ACCENTS.map((c, i) => (
        <View key={c.label} style={[styles.criteriaTile, { borderTopColor: c.color }]}>
          <Text style={styles.criteriaLabel}>{c.label}</Text>
          <Text style={styles.criteriaValue}>
            {values[i] === "" ? "-" : values[i]} / {c.max}
          </Text>
        </View>
      ))}
    </View>
  );
}

function CriteriaScores({ row }: { row: SubmissionRow }) {
  const values = [row.fact, row.causal, row.compare, row.sentence, row.integration];
  return (
    <View style={styles.criteriaRow}>
      {CRITERIA_ACCENTS.map((c, i) => (
        <View key={c.label} style={[styles.criteriaTile, { borderTopColor: c.color }]}>
          <Text style={styles.criteriaLabel}>{c.label}</Text>
          <Text style={styles.criteriaValue}>{values[i] === "" ? "-" : values[i]}</Text>
        </View>
      ))}
    </View>
  );
}

function EssayBlock({
  label,
  text,
  score,
  max,
}: {
  label: string;
  text: string;
  score: number | "";
  max: number;
}) {
  return (
    <View style={styles.essayBlock}>
      <View style={styles.essayHeaderRow}>
        <Text style={styles.essayLabel}>{label}</Text>
        {score !== "" && (
          <Text style={styles.essayScore}>
            {score} / {max}점
          </Text>
        )}
      </View>
      <Text style={styles.essayText}>{text || "(작성 안 함)"}</Text>
    </View>
  );
}

// scope="full": 질문/세부점수/보조질문+답변+출처/종합 글쓰기 전체(점수 포함)/AI 코멘트 전부.
// scope="simple": 학년/반/번호/이름 + 질문 원문 + 종합 글쓰기(서론/본론/결론) 텍스트만 -
// 점수·AI 코멘트·보조질문은 뺀 깔끔한 버전.
export async function generateInquiryPdf(
  row: SubmissionRow,
  record: InquiryRecord,
  scope: "full" | "simple"
): Promise<Buffer> {
  ensureFontsRegistered();
  const subQuestions = parseSubQuestions(record.subQuestionsJson);
  const isLegacyScoring = record.factScore === "";
  const bodyMax = isLegacyScoring ? 3 : 2.5;

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.unit}>{row.unit}</Text>
        <Text style={styles.profile}>
          {row.grade}학년 {row.ban}반 {row.no}번 · {row.name}
        </Text>
        <Text style={styles.question}>{row.question}</Text>

        {scope === "full" && (
          <>
            <Text style={styles.sectionTitle}>세부 점수</Text>
            <CriteriaScores row={row} />

            <Text style={styles.sectionTitle}>보조질문</Text>
            {subQuestions.length === 0 ? (
              <Text style={styles.subQAnswer}>작성한 보조질문이 없어요</Text>
            ) : (
              subQuestions.map((s, i) => (
                <View key={i} style={styles.subQItem}>
                  <Text style={styles.subQLabel}>[{s.label}]</Text>
                  <Text style={styles.subQQuestion}>{s.question}</Text>
                  <Text style={styles.subQAnswer}>{s.answer || "(답을 안 씀)"}</Text>
                  {s.source && <Text style={styles.subQSource}>출처: {s.source}</Text>}
                </View>
              ))
            )}
          </>
        )}

        <Text style={styles.sectionTitle}>종합 글쓰기</Text>
        {scope === "full" && (
          <>
            <Text style={styles.totalScore}>총점 {record.totalScore} / 5.0점</Text>
            {!isLegacyScoring && <EssayScoreTiles record={record} />}
          </>
        )}
        <EssayBlock
          label="서론"
          text={record.intro}
          score={scope === "full" ? record.introScore : ""}
          max={1}
        />
        <EssayBlock
          label="본론"
          text={record.body}
          score={scope === "full" ? record.bodyScore : ""}
          max={bodyMax}
        />
        <EssayBlock
          label="결론"
          text={record.conclusion}
          score={scope === "full" ? record.conclusionScore : ""}
          max={1}
        />

        {scope === "full" && record.comment && (
          <View style={styles.comment}>
            <Text style={styles.commentLabel}>AI 피드백</Text>
            <Text style={styles.commentText}>{record.comment}</Text>
          </View>
        )}
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
