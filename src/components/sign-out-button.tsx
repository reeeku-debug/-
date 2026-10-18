"use client";

import { signOut } from "next-auth/react";

export function SignOutButton({ className, callbackUrl }: { className?: string; callbackUrl?: string }) {
  return (
    <button
      onClick={() => signOut({ callbackUrl: callbackUrl || "/" })}
      className={className || "text-sm text-gray-500 underline hover:text-gray-800"}
    >
      ログアウト
    </button>
  );
}
