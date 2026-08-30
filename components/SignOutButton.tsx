"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="text-sm text-[var(--color-ink-soft)] hover:text-[var(--color-pink-deep)] underline underline-offset-2"
    >
      로그아웃
    </button>
  );
}
