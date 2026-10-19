// ---------------------------------------------------------------------------
// PATCH /api/admin/invitations/[id] — actions administrateur sur une invitation
// (§6.2) :
//   - revoke : révocation immédiate (statut REVOKED + revokedAt) ;
//   - renew  : nouveau jeton + nouveau TTL (l'ancienne empreinte est remplacée
//     en base — le secret précédent devient définitivement inutilisable),
//     statut ACTIVE. Le nouveau jeton brut est renvoyé UNE SEULE FOIS.
//
// Chaque action est journalisée (INVITATION_REVOKED / INVITATION_RENEWED),
// métadonnées sans jeton ni empreinte. Permission : MANAGE_DOSSIERS.
// ---------------------------------------------------------------------------

import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, jsonOk, withApi, zodErrorToFields } from "@/lib/api";
import { guardAdminApi } from "@/lib/admin-guard";
import { ipFromHeaders, writeAudit } from "@/lib/audit";
import { getSetting } from "@/lib/settings";
import { createInvitationToken } from "@/lib/tokens";

const patchSchema = z.object({
  action: z.enum(["revoke", "renew"], { message: "Action attendue : revoke ou renew." }),
});

async function getInvitationTtlDays(): Promise<number> {
  const raw = await getSetting("INVITATION_TTL_DAYS");
  const days = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(days) || days < 1 || days > 365) return 30;
  return Math.floor(days);
}

function absoluteBaseUrl(req: Request): string {
  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || req.headers.get("host");
  const proto = forwardedProto || (host?.startsWith("localhost") || host?.startsWith("127.") ? "http" : "https");
  return host ? `${proto}://${host}` : "";
}

export const PATCH = withApi<{ id: string }>(async (req, ctx) => {
  const { id } = await ctx.params;
  const session = await guardAdminApi(req, "MANAGE_DOSSIERS");
  const ip = ipFromHeaders(req.headers);
  const actor = {
    actorId: session.user.id,
    actorLabel: session.user.email ?? session.user.name ?? undefined,
  };

  const body: unknown = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation("Requête invalide.", zodErrorToFields(parsed.error));
  }
  const { action } = parsed.data;

  const invitation = await db.invitation.findUnique({
    where: { id },
    select: { id: true, personId: true, status: true },
  });
  if (!invitation) {
    throw ApiError.notFound("Invitation introuvable.");
  }

  if (action === "revoke") {
    if (invitation.status !== "ACTIVE") {
      throw ApiError.conflict(
        invitation.status === "USED"
          ? "Cette invitation a déjà été utilisée : elle ne peut plus être révoquée."
          : "Cette invitation n'est plus active.",
      );
    }
    await db.invitation.update({
      where: { id },
      data: { status: "REVOKED", revokedAt: new Date(), revokedById: session.user.id },
    });
    await writeAudit({
      ...actor,
      action: "INVITATION_REVOKED",
      entityType: "Invitation",
      entityId: id,
      metadata: { invitationId: id, personRecordId: invitation.personId },
      ip,
    });
    return jsonOk({ invitation: { id, status: "REVOKED" as const } });
  }

  // action === "renew"
  if (invitation.status !== "ACTIVE") {
    throw ApiError.conflict(
      invitation.status === "USED"
        ? "Cette invitation a déjà été utilisée. Créez une nouvelle invitation si nécessaire."
        : "Seule une invitation active peut être renouvelée. Créez une nouvelle invitation.",
    );
  }

  const ttlDays = await getInvitationTtlDays();
  const { token, hash } = createInvitationToken();
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

  // L'ancienne empreinte est remplacée : le jeton précédent cesse d'être valide.
  const updated = await db.invitation.update({
    where: { id },
    data: { tokenHash: hash, expiresAt, status: "ACTIVE" },
    select: { id: true, personId: true, status: true, expiresAt: true },
  });

  await writeAudit({
    ...actor,
    action: "INVITATION_RENEWED",
    entityType: "Invitation",
    entityId: id,
    metadata: { invitationId: id, personRecordId: invitation.personId, ttlDays },
    ip,
  });

  return jsonOk({
    invitation: updated,
    token, // nouveau jeton brut : renvoyé UNE SEULE FOIS
    url: `/invitation/${token}`,
    urlAbsolue: `${absoluteBaseUrl(req)}/invitation/${token}`,
  });
});
