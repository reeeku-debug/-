import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      role: "ADMIN" | "TALENT";
      slug?: string;
    };
  }

  interface User {
    id: string;
    role: "ADMIN" | "TALENT";
    slug?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "ADMIN" | "TALENT";
    slug?: string;
  }
}
