// ---------------------------------------------------------------------------
// PATCH /api/admin/clarifications/[id] — suivi d'une demande de clarification
// (§8.2).
//
// {markAnswered: true} :
//   - la demande passe à ANSWERED (answeredAt horodaté) ;
//   - si le dossier est au statut CLARIFICATION_REQUESTED, il passe à
//     CLARIFICATION_RECEIVED via la machine à états (canTransition, audit
//     DOSSIER_STATUS_CHANGED {from,to}) ;
//   - si le dossier a déjà bougé (autre statut), la réponse est simplement
//     enregistrée — l'administrateur repositionne le dossier lui-même ;
//   - une demande déjà répondue → 409 (aucune double réponse).
//   Audit : CLARIFICATION_ANSWERED.
//
// Permission : MANAGE_DOSSIERS.
// ---------------------------------------------------------------------------

import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, jsonOk, withApi, zodErrorToFields } from "@/lib/api";
import { guardAdminApi } from "@/lib/admin-guard";
import { ipFromHeaders, writeAudit } from "@/lib/audit";
import { canTransition, type DossierStatus } from "@/lib/constants";

const patchSchema = z
  .object({
    markAnswered: z.literal(true, {
      message: "Seule l'action markAnswered:true est prise en charge.",
    }),
  })
  .strict();

export const PATCH = withApi<{ id: string }>(async (req, ctx) => {
  const { id } = await ctx.params;
  const session = await guardAdminApi(req, "MANAGE_DOSSIERS");
  const ip = ipFromHeaders(req.headers);
  const actor = {
    actorId: session.user.id,
    actorLabel: session.user.email ?? session.user.name ?? undefined,
  };

  const request = await db.clarificationRequest.findUnique({
    where: { id },
    select: {
      id: true,
      personId: true,
      status: true,
      answeredAt: true,
      person: { select: { id: true, status: true } },
    },
  });
  if (!request) {
    throw ApiError.notFound("Demande de clarification introuvable.");
  }

  const body: unknown = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation("Requête invalide.", zodErrorToFields(parsed.error));
  }

  if (request.answeredAt || request.status === "ANSWERED") {
    throw ApiError.conflict("Cette demande de clarification a déjà été marquée comme répondue.");
  }

  const dossierStatus = request.person.status as DossierStatus;
  // Machine à états : la transition n'est appliquée QUE si le dossier est
  // encore dans l'attente d'un complément (CLARIFICATION_REQUESTED).
  const shouldTransition =
    dossierStatus === "CLARIFICATION_REQUESTED" && canTransition(dossierStatus, "CLARIFICATION_RECEIVED");

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.clarificationRequest.update({
      where: { id },
      data: { status: "ANSWERED", answeredAt: new Date() },
      select: { id: true, status: true, answeredAt: true, personId: true },
    });
    if (shouldTransition) {
      await tx.personRecord.update({
        where: { id: request.personId, status: "CLARIFICATION_REQUESTED" },
        data: { status: "CLARIFICATION_RECEIVED" },
      });
    }
    return row;
  });

  await writeAudit({
    ...actor,
    action: "CLARIFICATION_ANSWERED",
    entityType: "ClarificationRequest",
    entityId: id,
    metadata: { personId: request.personId, ...(shouldTransition ? { dossierTransition: "CLARIFICATION_REQUESTED → CLARIFICATION_RECEIVED" } : { dossierStatus }) },
    ip,
  });
  if (shouldTransition) {
    await writeAudit({
      ...actor,
      action: "DOSSIER_STATUS_CHANGED",
      entityType: "PersonRecord",
      entityId: request.personId,
      metadata: { from: "CLARIFICATION_REQUESTED", to: "CLARIFICATION_RECEIVED" },
      ip,
    });
  }

  return jsonOk({
    clarification: {
      id: updated.id,
      status: updated.status,
      answeredAt: updated.answeredAt ? updated.answeredAt.toISOString() : null,
    },
    dossierStatus: shouldTransition ? "CLARIFICATION_RECEIVED" : dossierStatus,
  });
});
