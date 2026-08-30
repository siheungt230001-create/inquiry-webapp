import Link from "next/link";

interface Crumb {
  label: string;
  href?: string; // 없으면 현재 단계(링크 아님)
}

export default function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-1.5 text-sm text-[var(--color-ink-soft)]">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-[var(--color-ink-muted)]">/</span>}
          {item.href ? (
            <Link href={item.href} className="hover:text-[var(--color-pink-deep)] hover:underline">
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-[var(--color-ink)]">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
