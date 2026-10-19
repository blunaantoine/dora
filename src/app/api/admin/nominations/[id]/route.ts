// ---------------------------------------------------------------------------
// PATCH /api/admin/nominations/[id] — traitement d'une proposition (§11.2).
//
// Actions (zod .strict()) :
//   - to_review  → TO_REVIEW (« À examiner ») ;
//   - to_verify  → TO_VERIFY (« À vérifier ») ;
//   - duplicate  → POTENTIAL_DUPLICATE (note interne facultative) ;
//   - accept     → ACCEPTED_FOR_CONTACT + création d'un PersonRecord DRAFT
//                  PRÉ-REMPLI (givenName/familyName si le nom est parsable,
//                  categoryId, note interne = raison) — JAMAIS de publication,
//                  JAMAIS d'invitation automatique (§11.2 : l'équipe vérifie
//                  l'identité avant toute invitation ; la suite est manuelle) ;
//   - reject     → REJECTED (motif interne facultatif → adminNotes) ;
//   - archive    → ARCHIVED.
//
// Chaque changement est journalisé NOMINATION_STATUS_CHANGED {from, to} ;
// l'acceptation journalise en plus DOSSIER_CREATED pour le dossier créé.
//
// Permission : MANAGE_NOMINATIONS (ADMIN, MODERATOR).
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, jsonOk, withApi, zodErrorToFields } from "@/lib/api";
import { guardAdminApi } from "@/lib/admin-guard";
import { ipFromHeaders, writeAudit } from "@/lib/audit";
import { splitPublicName } from "@/lib/public-submissions";

const actionSchema = z
  .object({
    action: z.enum(["to_review", "to_verify", "duplicate", "accept", "reject", "archive"]),
    note: z
      .string()
      .trim()
      .max(500, "La note ne peut pas dépasser 500 caractères.")
      .optional(),
  })
  .strict();

export const PATCH = withApi<{ id: string }>(async (req: NextRequest, ctx) => {
  const session = await guardAdminApi(req, "MANAGE_NOMINATIONS");
  const ip = ipFromHeaders(req.headers);
  const { id } = await ctx.params;

  const body: unknown = await req.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation("Action invalide.", zodErrorToFields(parsed.error));
  }
  const { action, note } = parsed.data;

  const nomination = await db.nomination.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      nomineePublicName: true,
      reason: true,
      presentation: true,
      sourceUrl: true,
      categoryId: true,
      category: { select: { name: true } },
      duplicateOfPersonId: true,
    },
  });
  if (!nomination) {
    throw ApiError.notFound("Proposition introuvable.");
  }

  const from = nomination.status;
  const now = new Date();
  const actorLabel = session.user.email ?? session.user.name ?? "équipe";

  // États finaux : plus aucune action possible (archivée ou refusée).
  if (from === "REJECTED" || from === "ARCHIVED") {
    throw ApiError.conflict(
      "Cette proposition a été clôturée (refusée ou archivée) et ne peut plus être modifiée.",
    );
  }

  const nextStatus =
    action === "to_review"
      ? "TO_REVIEW"
      : action === "to_verify"
        ? "TO_VERIFY"
        : action === "duplicate"
          ? "POTENTIAL_DUPLICATE"
          : action === "accept"
            ? "ACCEPTED_FOR_CONTACT"
            : action === "reject"
              ? "REJECTED"
              : "ARCHIVED";

  // --- ACCEPTATION : création du dossier DRAFT pré-rempli, en une transaction
  if (action === "accept") {
    if (from === "ACCEPTED_FOR_CONTACT") {
      throw ApiError.conflict("Cette proposition a déjà été acceptée pour prise de contact.");
    }

    const parsedName = splitPublicName(nomination.nomineePublicName);
    const internalNotes = [
      `Proposition publique ${nomination.id} (statut : acceptée pour prise de contact).`,
      `Raison de la proposition : ${nomination.reason}`,
      `Présentation transmise : ${nomination.presentation}`,
      nomination.sourceUrl ? `Source publique indiquée : ${nomination.sourceUrl}` : null,
      note ? `Note de l'équipe : ${note}` : null,
      "Aucune publication ni invitation automatique : identité et pertinence à vérifier avant toute invitation (§11.2).",
    ]
      .filter((part): part is string => Boolean(part))
      .join("\n\n")
      .slice(0, 4000);

    const result = await db.$transaction(async (tx) => {
      const person = await tx.personRecord.create({
        data: {
          status: "DRAFT",
          managementName: nomination.nomineePublicName,
          givenName: parsedName.givenName,
          familyName: parsedName.familyName,
          // genre/birthYear inconnus : complétés lors de la prise de contact.
          ...(nomination.categoryId ? { categoryId: nomination.categoryId } : {}),
          privateData: {
            create: { internalNotes },
          },
        },
        select: { id: true, status: true, managementName: true },
      });

      const updated = await tx.nomination.update({
        where: { id: nomination.id },
        data: {
          status: "ACCEPTED_FOR_CONTACT",
          handledById: session.user.id,
          decidedAt: now,
          ...(note ? { adminNotes: note } : {}),
        },
        select: { id: true, status: true, adminNotes: true, decidedAt: true },
      });

      return { person, updated };
    });

    await writeAudit({
      actorId: session.user.id,
      actorLabel,
      action: "NOMINATION_STATUS_CHANGED",
      entityType: "Nomination",
      entityId: nomination.id,
      metadata: { from, to: "ACCEPTED_FOR_CONTACT", personRecordId: result.person.id },
      ip,
    });
    await writeAudit({
      actorId: session.user.id,
      actorLabel,
      action: "DOSSIER_CREATED",
      entityType: "PersonRecord",
      entityId: result.person.id,
      metadata: {
        personRecordId: result.person.id,
        source: "nomination",
        nominationId: nomination.id,
        // Le dossier reste en DRAFT : aucune publication, aucune invitation.
        statut: result.person.status,
      },
      ip,
    });

    return jsonOk({
      nomination: result.updated,
      dossierCree: {
        id: result.person.id,
        managementName: result.person.managementName,
        status: result.person.status,
      },
    });
  }

  // --- Autres actions : simple changement de statut --------------------------
  const updated = await db.nomination.update({
    where: { id: nomination.id },
    data: {
      status: nextStatus,
      handledById: session.user.id,
      decidedAt: now,
      ...(note ? { adminNotes: note } : {}),
    },
    select: { id: true, status: true, adminNotes: true, decidedAt: true },
  });

  await writeAudit({
    actorId: session.user.id,
    actorLabel,
    action: "NOMINATION_STATUS_CHANGED",
    entityType: "Nomination",
    entityId: nomination.id,
    metadata: {
      from,
      to: nextStatus,
      ...(note ? { note } : {}),
    },
    ip,
  });

  return jsonOk({ nomination: updated });
});
