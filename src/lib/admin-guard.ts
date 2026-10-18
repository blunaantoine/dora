// ---------------------------------------------------------------------------
// Garde des routes API d'administration (2-b) : limitation de débit, session,
// permission. Nouveau fichier — aucun fichier src/lib/* de la tâche 2-a
// n'est modifié.
// ---------------------------------------------------------------------------

import type { NextRequest } from "next/server";
import { ApiError } from "@/lib/api";
import { getAdminSessionSafe, type AdminSession } from "@/lib/auth-options";
import { hasPermission, type Permission } from "@/lib/permissions";
import { adminApiRateLimit } from "@/lib/rate-limit";
import { ipFromHeaders, writeAudit } from "@/lib/audit";

/** Applique le rate limit admin + vérifie la session (+ permission si fournie). */
export async function guardAdminApi(
  req: NextRequest,
  permission?: Permission,
): Promise<AdminSession> {
  const ip = ipFromHeaders(req.headers) ?? "unknown";

  const limit = adminApiRateLimit(ip);
  if (!limit.allowed) {
    throw ApiError.rateLimited(
      "Trop de requêtes vers l'API d'administration. Merci de patienter une minute.",
      limit.retryAfterSec,
    );
  }

  const session = await getAdminSessionSafe();
  if (!session) {
    throw ApiError.unauthorized("Session absente ou révoquée. Merci de vous reconnecter.");
  }

  if (permission && !hasPermission(session.user.role, permission)) {
    throw ApiError.forbidden(
      "Accès refusé : votre rôle ne permet pas cette opération.",
    );
  }

  return session;
}

/**
 * Journalise un refus (403) sur une mutation : writeAudit result=DENIED.
 * Ne lève jamais (writeAudit est déjà protégé).
 */
export async function auditDeniedMutation(options: {
  session: AdminSession;
  action: string;
  entityType: string;
  entityId?: string | null;
  raison: string;
}): Promise<void> {
  await writeAudit({
    actorId: options.session.user.id,
    actorLabel: options.session.user.email ?? options.session.user.name ?? undefined,
    action: options.action,
    entityType: options.entityType,
    entityId: options.entityId ?? null,
    result: "DENIED",
    metadata: { raison: options.raison },
  });
}
