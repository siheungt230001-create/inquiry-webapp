"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="text-sm text-zinc-500 hover:text-zinc-800 underline underline-offset-2"
    >
      로그아웃
    </button>
  );
}
