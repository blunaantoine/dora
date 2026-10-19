// ---------------------------------------------------------------------------
// PATCH /api/admin/badges/assignments/[assignmentId] — retrait d'une
// attribution active de badge (§12).
//
// Retrait logique (jamais de suppression dure) : removedAt + justification
// OBLIGATOIRE. L'identité de l'administrateur ayant retiré le badge est
// tracée dans le journal d'audit (BADGE_REVOKED, actorId + actorLabel) — le
// schéma BadgeAssignment ne comporte volontairement pas de colonne
// removedById (Prisma inchangé), l'audit est la source de vérité.
//
// Audit : BADGE_REVOKED. Permission : MANAGE_BADGES (ADMIN).
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, jsonOk, withApi, zodErrorToFields } from "@/lib/api";
import { guardAdminApi } from "@/lib/admin-guard";
import { ipFromHeaders, writeAudit } from "@/lib/audit";

const revokeSchema = z
  .object({
    justification: z
      .string()
      .trim()
      .min(10, "La justification de retrait doit contenir au moins 10 caractères.")
      .max(600, "La justification ne peut pas dépasser 600 caractères."),
  })
  .strict();

export const PATCH = withApi<{ assignmentId: string }>(async (req: NextRequest, ctx) => {
  const session = await guardAdminApi(req, "MANAGE_BADGES");
  const ip = ipFromHeaders(req.headers);
  const { assignmentId } = await ctx.params;

  const body: unknown = await req.json().catch(() => null);
  const parsed = revokeSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation("Retrait invalide.", zodErrorToFields(parsed.error));
  }
  const { justification } = parsed.data;

  const assignment = await db.badgeAssignment.findUnique({
    where: { id: assignmentId },
    select: {
      id: true,
      removedAt: true,
      badge: { select: { id: true, name: true } },
      person: { select: { id: true, publicName: true, status: true } },
    },
  });
  if (!assignment) {
    throw ApiError.notFound("Attribution introuvable.");
  }
  if (assignment.removedAt) {
    throw ApiError.conflict("Ce badge a déjà été retiré.");
  }

  const updated = await db.badgeAssignment.update({
    where: { id: assignmentId },
    data: {
      removedAt: new Date(),
      removalJustification: justification,
    },
    select: { id: true, removedAt: true, removalJustification: true },
  });

  await writeAudit({
    actorId: session.user.id,
    actorLabel: session.user.email ?? session.user.name ?? "équipe",
    action: "BADGE_REVOKED",
    entityType: "BadgeAssignment",
    entityId: assignmentId,
    metadata: {
      badgeId: assignment.badge.id,
      badgeNom: assignment.badge.name,
      personRecordId: assignment.person.id,
      motif: justification,
    },
    ip,
  });

  return jsonOk({ attribution: updated });
});
