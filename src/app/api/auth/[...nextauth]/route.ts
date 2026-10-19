import NextAuth from "next-auth";

import { authOptions } from "@/lib/auth-options";

// NextAuth a besoin de Node (scrypt, Prisma).
export const runtime = "nodejs";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
