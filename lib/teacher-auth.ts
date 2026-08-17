// TEACHER_EMAILS 환경변수(콤마 구분)에 있는 이메일만 /teacher 접근 가능.
export function isTeacherEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.TEACHER_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}
