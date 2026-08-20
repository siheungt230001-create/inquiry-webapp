import Link from "next/link";

interface Crumb {
  label: string;
  href?: string; // 없으면 현재 단계(링크 아님)
}

export default function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-1.5 text-sm text-zinc-500">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-zinc-300">/</span>}
          {item.href ? (
            <Link href={item.href} className="hover:text-zinc-800 hover:underline">
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-zinc-900">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
