// ---------------------------------------------------------------------------
// Augmentation des types NextAuth v4 :
// - Session.user expose l'identifiant et le rôle de l'administrateur ;
// - JWT transporte role + tokenVersion (révocation de sessions — décision D10) ;
// - User (retour de authorize) transporte role + tokenVersion.
// ---------------------------------------------------------------------------

import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: string;
    tokenVersion: number;
  }

  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    tokenVersion?: number;
  }
}
