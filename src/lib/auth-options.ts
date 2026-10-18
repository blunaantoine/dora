// ---------------------------------------------------------------------------
// Configuration NextAuth v4 (stratégie JWT — décision D10).
//
// Sécurité mise en œuvre ici :
// - limitation des tentatives de connexion (5 / 15 min par IP + e-mail) ;
// - vérification du mot de passe en temps constant (scrypt) ;
// - vérification systématique du compte (actif) et de tokenVersion à chaque
//   usage de session : incrémenter tokenVersion en base révoque immédiatement
//   toutes les sessions JWT émises pour cet administrateur ;
// - journalisation des connexions et échecs (§5.6).
//
// NB : la validité cryptographique du JWT est vérifiée par le middleware ;
// la vérification base de données (actif + tokenVersion) a lieu dans le
// callback jwt, donc à chaque getServerSession (le middleware ne l'exécute pas).
// ---------------------------------------------------------------------------

import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import type { JWT } from "next-auth/jwt";

import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth-password";
import { loginRateLimit } from "@/lib/rate-limit";
import { writeAudit } from "@/lib/audit";
import { ADMIN_SESSION_CACHE_TTL_MS } from "@/lib/constants";

/** Erreur levée lorsque la limite de tentatives de connexion est atteinte. */
export class LoginRateLimitError extends Error {
  readonly retryAfterSec: number;
  constructor(retryAfterSec: number) {
    const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
    super(
      `Trop de tentatives de connexion. Pour des raisons de sécurité, merci de réessayer dans environ ${minutes} minute${minutes > 1 ? "s" : ""}.`,
    );
    this.name = "LoginRateLimitError";
    this.retryAfterSec = retryAfterSec;
  }
}

interface AdminLite {
  id: string;
  displayName: string;
  email: string;
  role: string;
  tokenVersion: number;
  isActive: boolean;
}

// --- Cache mémoire 30 s des administrateurs (callback jwt) ------------------

const adminCache = new Map<string, { admin: AdminLite | null; expiresAt: number }>();

function getCachedAdmin(id: string): AdminLite | null | undefined {
  const cached = adminCache.get(id);
  if (!cached) return undefined;
  if (Date.now() > cached.expiresAt) {
    adminCache.delete(id);
    return undefined;
  }
  return cached.admin;
}

function setCachedAdmin(id: string, admin: AdminLite | null): void {
  adminCache.set(id, { admin, expiresAt: Date.now() + ADMIN_SESSION_CACHE_TTL_MS });
}

async function loadActiveAdmin(id: string): Promise<AdminLite | null> {
  const cached = getCachedAdmin(id);
  if (cached !== undefined) return cached;
  const admin = await db.adminUser.findUnique({
    where: { id },
    select: { id: true, displayName: true, email: true, role: true, tokenVersion: true, isActive: true },
  });
  setCachedAdmin(id, admin);
  return admin;
}

// --- Utilitaires -------------------------------------------------------------

function extractIp(headers: Record<string, unknown> | undefined): string | null {
  if (!headers) return null;
  const forwarded = headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.length > 0) return realIp.trim();
  return null;
}

/**
 * Vérification préalable (optionnelle, côté page de connexion) : indique si une
 * tentative de connexion est encore permise pour ce couple IP/e-mail.
 * Permet d'afficher un message clair sans consommer une tentative inutile.
 */
export function isLoginAllowed(ip: string, email: string): { allowed: boolean; retryAfterSec: number } {
  const result = loginRateLimit(ip, email);
  return { allowed: result.allowed, retryAfterSec: result.retryAfterSec };
}

// --- Options NextAuth ----------------------------------------------------------

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/admin/connexion" },
  providers: [
    CredentialsProvider({
      name: "Compte administrateur",
      credentials: {
        email: { label: "Adresse e-mail", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials, req) {
        const ip = extractIp(req?.headers);
        const email = credentials?.email?.trim().toLowerCase() ?? "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";

        if (!email || !password) {
          await writeAudit({
            action: "LOGIN_FAILED",
            actorLabel: "inconnu",
            entityType: "AdminUser",
            result: "DENIED",
            metadata: { raison: "identifiants manquants" },
            ip,
          });
          return null;
        }

        // 1. Limitation des tentatives (5 / 15 min par IP + e-mail, clé hachée).
        const limit = loginRateLimit(ip ?? "unknown", email);
        if (!limit.allowed) {
          throw new LoginRateLimitError(limit.retryAfterSec);
        }

        // 2. Recherche du compte.
        const admin = await db.adminUser.findUnique({ where: { email } });

        if (!admin || !admin.isActive) {
          await writeAudit({
            action: "LOGIN_FAILED",
            actorLabel: "inconnu",
            entityType: "AdminUser",
            result: "DENIED",
            metadata: { email, raison: admin ? "compte désactivé" : "compte inexistant" },
            ip,
          });
          return null;
        }

        // 3. Vérification du mot de passe (temps constant).
        const passwordOk = await verifyPassword(password, admin.passwordHash);
        if (!passwordOk) {
          await writeAudit({
            actorId: admin.id,
            action: "LOGIN_FAILED",
            entityType: "AdminUser",
            entityId: admin.id,
            result: "DENIED",
            metadata: { raison: "mot de passe incorrect" },
            ip,
          });
          return null;
        }

        // 4. Succès : journalisation + horodatage de la dernière connexion.
        await writeAudit({
          actorId: admin.id,
          action: "LOGIN_SUCCESS",
          entityType: "AdminUser",
          entityId: admin.id,
          metadata: { email: admin.email },
          ip,
        });

        await db.adminUser
          .update({
            where: { id: admin.id },
            data: { lastLoginAt: new Date(), lastLoginIp: ip },
          })
          .catch((error: unknown) => {
            console.error("[auth] Échec de mise à jour de lastLoginAt :", error);
          });

        return {
          id: admin.id,
          name: admin.displayName,
          email: admin.email,
          role: admin.role,
          tokenVersion: admin.tokenVersion,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      // Connexion : on inscrit l'identité et la version de jeton dans le JWT.
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.tokenVersion = user.tokenVersion;
        return token;
      }

      // Appels suivants : re-vérification en base (cache 30 s).
      if (trigger !== "signIn" && (token.sub || token.id)) {
        const adminId = token.id ?? token.sub;
        if (typeof adminId === "string") {
          let admin: AdminLite | null = null;
          try {
            admin = await loadActiveAdmin(adminId);
          } catch (error) {
            console.error("[auth] Échec de relecture de l'administrateur :", error);
            throw new Error("session révoquée");
          }
          if (!admin || !admin.isActive || token.tokenVersion !== admin.tokenVersion) {
            throw new Error("session révoquée");
          }
          token.id = admin.id;
          token.role = admin.role;
          token.tokenVersion = admin.tokenVersion;
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id ?? token.sub ?? "") as string;
        session.user.role = (token.role ?? "") as string;
      }
      return session;
    },
  },
  events: {
    async signOut(message) {
      const token = "token" in message ? (message.token as JWT) : undefined;
      await writeAudit({
        actorId: typeof token?.sub === "string" ? token.sub : null,
        action: "LOGOUT",
        entityType: "AdminUser",
        entityId: typeof token?.sub === "string" ? token.sub : null,
      });
    },
  },
};

/** Session administrateur typée (null si non authentifié ou session révoquée). */
export interface AdminSession {
  user: { id: string; name?: string | null; email?: string | null; role: string };
}

/**
 * Récupère la session admin courante. En cas de session révoquée
 * (exception du callback jwt), retourne null plutôt que de lever.
 */
export async function getAdminSessionSafe(): Promise<AdminSession | null> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return null;
    return { user: { id: session.user.id, name: session.user.name, email: session.user.email, role: session.user.role } };
  } catch {
    // Session révoquée (tokenVersion modifiée, compte désactivé/supprimé).
    return null;
  }
}
