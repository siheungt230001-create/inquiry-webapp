import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUnits } from "@/lib/sheets";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const units = await getUnits();
  return NextResponse.json({ units: units.map((u) => u.title) });
}
