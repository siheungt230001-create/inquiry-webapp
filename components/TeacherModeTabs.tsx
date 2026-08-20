import Link from "next/link";

export default function TeacherModeTabs({ active }: { active: "unit" | "all" }) {
  const tabClass = (isActive: boolean) =>
    `rounded-lg px-3 py-1.5 text-xs font-medium ${
      isActive ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
    }`;
  return (
    <div className="flex items-center gap-2">
      <Link href="/teacher" className={tabClass(active === "unit")}>
        단원별 보기
      </Link>
      <Link href="/teacher/all" className={tabClass(active === "all")}>
        전체 보기
      </Link>
    </div>
  );
}
