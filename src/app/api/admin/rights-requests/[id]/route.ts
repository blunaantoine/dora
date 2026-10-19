// ---------------------------------------------------------------------------
// PATCH /api/admin/rights-requests/[id] — traitement d'une demande de droits
// (§15.3) avec trace de décision.
//
// Actions :
//   - start        : RECEIVED → IN_PROGRESS (prise en charge) ;
//   - decide       : IN_PROGRESS → DECIDED, décision motivée obligatoire
//                    (10 caractères minimum) ;
//   - close        : DECIDED → CLOSED (clôture avec trace) ;
//   - execute_unpublish : lors de la décision (type UNPUBLISH / CONSENT_WITHDRAWAL
//                    / ERASE), exécute la dépublication immédiate du profil
//                    rattaché (§8.5 « dépublier rapidement ») : publication
//                    UNPUBLISHED + transition PUBLISHED → UNPUBLISHING, puis
//                    décision enregistrée.
//
// Audit : RIGHTS_REQUEST_STATUS_CHANGED, RIGHTS_REQUEST_DECIDED (décision
// tronquée, jamais de contact personnel). Permission : MANAGE_DOSSIERS.
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, jsonOk, withApi, zodErrorToFields } from "@/lib/api";
import { guardAdminApi } from "@/lib/admin-guard";
import { ipFromHeaders, writeAudit } from "@/lib/audit";
import { canTransition } from "@/lib/constants";

const schema = z
  .object({
    action: z.enum(["start", "decide", "close", "execute_unpublish"]),
    decision: z
      .string()
      .trim()
      .min(10, "Décrivez la décision (10 caractères au moins).")
      .max(2000, "2000 caractères maximum.")
      .optional(),
  })
  .strict();

export const PATCH = withApi<{ id: string }>(async (req: NextRequest, ctx) => {
  const session = await guardAdminApi(req, "MANAGE_DOSSIERS");
  const ip = ipFromHeaders(req.headers);
  const { id } = await ctx.params;

  const body: unknown = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation("Action invalide.", zodErrorToFields(parsed.error));
  }
  const { action, decision } = parsed.data;

  const request = await db.rightsRequest.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      status: true,
      decision: true,
      personId: true,
      person: { select: { id: true, publicName: true, managementName: true } },
    },
  });
  if (!request) {
    throw ApiError.notFound("Demande introuvable.");
  }

  const nextStatus = action === "start" ? "IN_PROGRESS" : action === "close" ? "CLOSED" : "DECIDED";
  if (request.status === nextStatus) {
    throw ApiError.conflict("Cette demande est déjà dans cet état.");
  }
  if (action === "close" && request.status !== "DECIDED") {
    throw ApiError.conflict("Seule une demande ayant fait l'objet d'une décision peut être clôturée.");
  }
  if (action === "decide" || action === "execute_unpublish") {
    if (!decision || decision.length < 10) {
      throw ApiError.validation("Une décision motivée est obligatoire.", {
        decision: ["Décrivez la décision (10 caractères au moins)."],
      });
    }
  }

  // Exécution de la dépublication (retrait simplifié §14/§8.5).
  if (action === "execute_unpublish") {
    if (!request.personId) {
      throw ApiError.conflict(
        "Cette demande n'est rattachée à aucun profil publié : aucun retrait automatique possible.",
      );
    }
    const publication = await db.profilePublication.findFirst({
      where: { personId: request.personId, state: "PUBLISHED" },
      select: { id: true, person: { select: { status: true } } },
    });
    if (!publication || publication.person.status !== "PUBLISHED") {
      throw ApiError.conflict("Le profil rattaché n'est pas publié : rien à retirer.");
    }
    const dossierStatus = publication.person.status;
    if (!canTransition(dossierStatus, "UNPUBLISHING")) {
      throw ApiError.conflict("Transition de dépublication non permise depuis l'état actuel du dossier.");
    }
    await db.$transaction([
      db.profilePublication.update({
        where: { id: publication.id },
        data: { state: "UNPUBLISHED", unpublishedAt: new Date() },
      }),
      db.personRecord.update({
        where: { id: request.personId },
        data: { status: "UNPUBLISHING" },
      }),
    ]);
    await writeAudit({
      actorId: session.user.id,
      actorLabel: session.user.email ?? undefined,
      action: "PROFILE_UNPUBLISHED",
      entityType: "ProfilePublication",
      entityId: publication.id,
      result: "SUCCESS",
      metadata: { motif: "Exécution d'une demande de droits", droitsRequestId: request.id },
      ip,
    });
  }

  const updated = await db.rightsRequest.update({
    where: { id: request.id },
    data: {
      status: nextStatus,
      ...(decision ? { decision } : {}),
      ...(nextStatus === "DECIDED" ? { decidedAt: new Date() } : {}),
      ...(nextStatus === "CLOSED" ? { closedAt: new Date() } : {}),
    },
    select: { id: true, status: true, decision: true, decidedAt: true, closedAt: true },
  });

  await writeAudit({
    actorId: session.user.id,
    actorLabel: session.user.email ?? undefined,
    action: action === "decide" || action === "execute_unpublish" ? "RIGHTS_REQUEST_DECIDED" : "RIGHTS_REQUEST_STATUS_CHANGED",
    entityType: "RightsRequest",
    entityId: request.id,
    result: "SUCCESS",
    metadata: {
      from: request.status,
      to: nextStatus,
      ...(action === "execute_unpublish" ? { depublicationExecutee: true } : {}),
    },
    ip,
  });

  return jsonOk({
    request: updated,
    message:
      nextStatus === "DECIDED" && action === "execute_unpublish"
        ? "Dépublication exécutée et décision enregistrée."
        : "Demande mise à jour.",
  });
});
