import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUnits } from "@/lib/sheets";
import { toUserErrorMessage } from "@/lib/errorMessage";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  try {
    const units = await getUnits();
    return NextResponse.json({ units: units.map((u) => u.title) });
  } catch (err) {
    return NextResponse.json({ error: toUserErrorMessage(err, "units") }, { status: 502 });
  }
}
