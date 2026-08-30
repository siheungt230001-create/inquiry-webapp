import Link from "next/link";

export default function TeacherModeTabs({ active }: { active: "unit" | "all" | "live" }) {
  const tabClass = (isActive: boolean) =>
    `rounded-full px-3 py-1.5 text-xs font-semibold ${
      isActive
        ? "bg-[var(--color-lavender-deep)] text-white"
        : "bg-[var(--color-cream-200)] text-[var(--color-ink-soft)] hover:bg-[var(--color-lavender)]"
    }`;
  return (
    <div className="flex items-center gap-2">
      <Link href="/teacher" className={tabClass(active === "unit")}>
        단원별 보기
      </Link>
      <Link href="/teacher/all" className={tabClass(active === "all")}>
        전체 보기
      </Link>
      <Link href="/teacher/live" className={tabClass(active === "live")}>
        실시간 현황판
      </Link>
    </div>
  );
}
