import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const authOptions: AuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    CredentialsProvider({
      id: "admin-login",
      name: "admin-login",
      credentials: {
        email: { label: "メールアドレス", type: "email" },
        password: { label: "パスワード", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const admin = await prisma.admin.findUnique({
          where: { email: credentials.email.trim().toLowerCase() },
        });
        if (!admin) return null;

        const valid = await bcrypt.compare(credentials.password, admin.passwordHash);
        if (!valid) return null;

        return {
          id: admin.id,
          name: admin.name,
          role: "ADMIN" as const,
        };
      },
    }),
    CredentialsProvider({
      id: "talent-login",
      name: "talent-login",
      credentials: {
        loginId: { label: "ログインID", type: "text" },
        password: { label: "パスワード", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.loginId || !credentials?.password) return null;

        const talent = await prisma.talent.findUnique({
          where: { loginId: credentials.loginId.trim() },
        });
        if (!talent) return null;

        const valid = await bcrypt.compare(credentials.password, talent.passwordHash);
        if (!valid) return null;

        return {
          id: talent.id,
          name: talent.name,
          role: "TALENT" as const,
          slug: talent.slug,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as { id: string }).id;
        token.role = (user as { role: "ADMIN" | "TALENT" }).role;
        if ((user as { slug?: string }).slug) {
          token.slug = (user as { slug?: string }).slug;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "ADMIN" | "TALENT";
        session.user.slug = token.slug as string | undefined;
      }
      return session;
    },
  },
};
