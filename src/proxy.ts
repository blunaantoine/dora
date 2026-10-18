// ---------------------------------------------------------------------------
// Proxy Next.js 16 (remplace le fichier src/middleware.ts, déprécié) :
// - /admin/* et /api/admin/* : JWT NextAuth obligatoire (sinon redirection ou
//   401 JSON). La vérification approfondie (compte actif, tokenVersion) est
//   faite par le callback jwt au moment de getServerSession (voir auth-options) ;
// - /invitation/* : en-têtes anti-référencement et anti-indexation ;
// - en-têtes de sécurité communs sur toutes les réponses (complétés par
//   next.config.ts pour les routes hors proxy).
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const COMMON_SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

const INVITATION_SECURITY_HEADERS: Record<string, string> = {
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

function withSecurityHeaders(response: NextResponse, invitation: boolean): NextResponse {
  for (const [key, value] of Object.entries(COMMON_SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  if (invitation) {
    for (const [key, value] of Object.entries(INVITATION_SECURITY_HEADERS)) {
      response.headers.set(key, value);
    }
  }
  return response;
}

function unauthorizedJson(): NextResponse {
  const response = NextResponse.json(
    { ok: false, error: { code: "UNAUTHORIZED", message: "Authentification requise." } },
    { status: 401 },
  );
  for (const [key, value] of Object.entries(COMMON_SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isApi = pathname.startsWith("/api/");
  const isInvitationArea =
    pathname.startsWith("/invitation") || pathname.startsWith("/api/invitation");
  const isAdminArea = pathname.startsWith("/admin") || pathname.startsWith("/api/admin");

  // Zone invitation : pas de garde JWT (le jeton est vérifié par empreinte côté
  // API) ; on applique simplement les en-têtes spécifiques.
  if (!isAdminArea) {
    return withSecurityHeaders(NextResponse.next(), isInvitationArea);
  }

  // Page de connexion administrateur : accessible sans session.
  if (pathname === "/admin/connexion") {
    return withSecurityHeaders(NextResponse.next(), false);
  }

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  if (token) {
    return withSecurityHeaders(NextResponse.next(), false);
  }

  // Non authentifié : 401 JSON pour l'API, redirection pour les pages.
  if (isApi) {
    return unauthorizedJson();
  }

  const loginUrl = new URL("/admin/connexion", request.url);
  loginUrl.searchParams.set("from", pathname);
  const redirect = NextResponse.redirect(loginUrl, 302);
  return withSecurityHeaders(redirect, false);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/invitation/:path*", "/api/invitation/:path*"],
};
