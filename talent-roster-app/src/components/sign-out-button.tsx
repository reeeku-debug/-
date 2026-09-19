"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton({ className }: { className?: string }) {
  return (
    <button type="button" onClick={() => signOut({ callbackUrl: "/login" })} className={className}>
      ログアウト
    </button>
  );
}
