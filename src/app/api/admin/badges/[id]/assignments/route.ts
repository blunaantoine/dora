// ---------------------------------------------------------------------------
// POST /api/admin/badges/[id]/assignments — attribution MANUELLE d'un badge
// à un profil publié (§12).
//
// Pré-requis :
//   - badge actif ;
//   - dossier PUBLISHED (statut PUBLISHED + publication à l'état PUBLISHED) :
//     la reconnaissance ne s'affiche que sur des fiches publiques ;
//   - justification OBLIGATOIRE (§12 : « attribuer ou retirer un badge avec
//     justification ») ;
//   - une attribution active par badge/personne (pas de doublon).
//
// Audit : BADGE_ASSIGNED. Permission : MANAGE_BADGES (ADMIN).
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, jsonOk, withApi, zodErrorToFields } from "@/lib/api";
import { guardAdminApi } from "@/lib/admin-guard";
import { ipFromHeaders, writeAudit } from "@/lib/audit";

const assignSchema = z
  .object({
    personId: z.string().trim().min(1, "Sélectionnez un dossier publié."),
    justification: z
      .string()
      .trim()
      .min(10, "La justification doit contenir au moins 10 caractères.")
      .max(600, "La justification ne peut pas dépasser 600 caractères."),
  })
  .strict();

export const POST = withApi<{ id: string }>(async (req: NextRequest, ctx) => {
  const session = await guardAdminApi(req, "MANAGE_BADGES");
  const ip = ipFromHeaders(req.headers);
  const { id } = await ctx.params;

  const body: unknown = await req.json().catch(() => null);
  const parsed = assignSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation("Attribution invalide.", zodErrorToFields(parsed.error));
  }
  const { personId, justification } = parsed.data;

  const badge = await db.badge.findUnique({
    where: { id },
    select: { id: true, name: true, isActive: true },
  });
  if (!badge) {
    throw ApiError.notFound("Badge introuvable.");
  }
  if (!badge.isActive) {
    throw ApiError.conflict("Ce badge est désactivé : réactivez-le avant d'attribuer.");
  }

  // Cible : uniquement un dossier actuellement publié (double condition,
  // même garde que la fiche publique).
  const person = await db.personRecord.findUnique({
    where: { id: personId },
    select: {
      id: true,
      publicName: true,
      status: true,
      publication: { select: { state: true, slug: true } },
    },
  });
  if (!person || person.status !== "PUBLISHED" || person.publication?.state !== "PUBLISHED") {
    throw ApiError.validation(
      "L'attribution se fait uniquement sur un dossier actuellement publié.",
      { personId: ["Sélectionnez un dossier au statut « Publié »."] },
    );
  }

  const alreadyActive = await db.badgeAssignment.findFirst({
    where: { badgeId: id, personId: person.id, removedAt: null },
    select: { id: true },
  });
  if (alreadyActive) {
    throw ApiError.conflict("Ce badge est déjà attribué (activement) à ce dossier.");
  }

  const created = await db.badgeAssignment.create({
    data: {
      badgeId: id,
      personId: person.id,
      awardedById: session.user.id,
      justification,
    },
    select: { id: true, badgeId: true, personId: true, awardedAt: true },
  });

  await writeAudit({
    actorId: session.user.id,
    actorLabel: session.user.email ?? session.user.name ?? "équipe",
    action: "BADGE_ASSIGNED",
    entityType: "BadgeAssignment",
    entityId: created.id,
    metadata: {
      badgeId: id,
      badgeNom: badge.name,
      personRecordId: person.id,
      slug: person.publication?.slug ?? null,
    },
    ip,
  });

  return jsonOk({ attribution: created }, 201);
});
