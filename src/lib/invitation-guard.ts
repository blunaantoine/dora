// ---------------------------------------------------------------------------
// Garde des routes API publiques d'invitation (§6.4) :
//   - limitation des tentatives répétées (20/h/IP — profils « invitation ») ;
//   - validation complète du jeton (empreinte, statut ACTIVE, non expiré,
//     dossier non verrouillé) ;
//   - échec → 404 GÉNÉRIQUE sans jamais préciser la raison (anti-énumération :
//     un attaquant ne doit pas pouvoir distinguer jeton inconnu, révoqué,
//     expiré ou dossier verrouillé).
// ---------------------------------------------------------------------------

import type { NextRequest } from "next/server";
import { ApiError } from "@/lib/api";
import { ipFromHeaders } from "@/lib/audit";
import { invitationRateLimit } from "@/lib/rate-limit";
import { validateInvitationToken } from "@/lib/tokens";

export interface GuardedInvitation {
  token: string;
  tokenHash: string;
  invitation: NonNullable<Awaited<ReturnType<typeof validateInvitationToken>>["invitation"]>;
}

/** Message 404 générique — volontairement identique quelle que soit la cause. */
export const INVITATION_GENERIC_404 = "Lien invalide ou expiré.";

export async function guardInvitationApi(req: NextRequest, token: string): Promise<GuardedInvitation> {
  const ip = ipFromHeaders(req.headers) ?? "unknown";

  const limit = invitationRateLimit(ip);
  if (!limit.allowed) {
    throw ApiError.rateLimited(
      "Trop de tentatives. Merci de patienter avant de réessayer.",
      limit.retryAfterSec,
    );
  }

  const validation = await validateInvitationToken(token);
  if (validation.status !== "VALID" || !validation.invitation) {
    // 404 générique : aucune indication sur la cause exacte (§6.2).
    throw ApiError.notFound(INVITATION_GENERIC_404);
  }

  return {
    token,
    tokenHash: validation.invitation.tokenHash,
    invitation: validation.invitation,
  };
}
