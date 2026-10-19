// ---------------------------------------------------------------------------
// PATCH /api/admin/testimonials/[id] — actions de modération (§9.2).
//
// Actions (zod .strict()) :
//   - approve      → statut APPROVED (publication sur la fiche publique) ;
//   - reject       → statut REJECTED, motif OBLIGATOIRE (moderatorNote) ;
//   - archive      → statut ARCHIVED (sort de la file, invisible publiquement) ;
//   - clearContact → vide authorContact en base (suppression des coordonnées,
//                    §9.2 « supprimer les coordonnées personnelles »).
//
// Le refus d'un témoignage le rend immédiatement invisible sur la fiche
// publique (seuls les APPROVED sont servis au public — défense à la source).
// Toute décision est journalisée : TESTIMONIAL_APPROVED / TESTIMONIAL_REJECTED
// {motif} / TESTIMONIAL_ARCHIVED / TESTIMONIAL_CONTACT_REMOVED.
//
// Permission : MODERATE_TESTIMONIALS (ADMIN, MODERATOR).
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, jsonOk, withApi, zodErrorToFields } from "@/lib/api";
import { guardAdminApi } from "@/lib/admin-guard";
import { ipFromHeaders, writeAudit } from "@/lib/audit";

const actionSchema = z
  .object({
    action: z.enum(["approve", "reject", "archive", "clearContact"]),
    motif: z.string().trim().max(500, "Le motif ne peut pas dépasser 500 caractères.").optional(),
  })
  .refine((value) => value.action !== "reject" || Boolean(value.motif && value.motif.length > 0), {
    message: "Un motif est obligatoire pour refuser un témoignage.",
    path: ["motif"],
  });

export const PATCH = withApi<{ id: string }>(async (req: NextRequest, ctx) => {
  const session = await guardAdminApi(req, "MODERATE_TESTIMONIALS");
  const ip = ipFromHeaders(req.headers);
  const { id } = await ctx.params;

  const body: unknown = await req.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation("Action invalide.", zodErrorToFields(parsed.error));
  }
  const { action, motif } = parsed.data;

  const testimonial = await db.testimonial.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      authorDisplayName: true,
      authorContact: true,
      person: { select: { id: true, publicName: true } },
    },
  });
  if (!testimonial) {
    throw ApiError.notFound("Témoignage introuvable.");
  }

  const now = new Date();
  const actorLabel = session.user.email ?? session.user.name ?? "équipe";

  // --- Suppression des coordonnées (sans changer le statut) ------------------
  if (action === "clearContact") {
    if (!testimonial.authorContact) {
      throw ApiError.conflict("Aucune coordonnée n'est enregistrée pour ce témoignage.");
    }
    const updated = await db.testimonial.update({
      where: { id: testimonial.id },
      data: { authorContact: null },
      select: { id: true, status: true, authorContact: true },
    });
    await writeAudit({
      actorId: session.user.id,
      actorLabel,
      action: "TESTIMONIAL_CONTACT_REMOVED",
      entityType: "Testimonial",
      entityId: testimonial.id,
      metadata: {
        personRecordId: testimonial.person.id,
        statut: updated.status,
      },
      ip,
    });
    return jsonOk({ testimonial: updated });
  }

  // --- Transitions de statut (garde simple : jamais depuis un état final) ----
  const forbiddenFrom = new Set(["APPROVED", "REJECTED", "ARCHIVED"]);
  if (action === "approve" && forbiddenFrom.has(testimonial.status)) {
    throw ApiError.conflict(
      "Ce témoignage a déjà été traité (approuvé, refusé ou archivé) et ne peut plus être approuvé.",
    );
  }
  if ((action === "reject" || action === "archive") && testimonial.status === "ARCHIVED") {
    throw ApiError.conflict("Ce témoignage est déjà archivé.");
  }

  const nextStatus =
    action === "approve" ? "APPROVED" : action === "reject" ? "REJECTED" : "ARCHIVED";

  const updated = await db.testimonial.update({
    where: { id: testimonial.id },
    data: {
      status: nextStatus,
      // Refus : motif obligatoire (garanti par le schéma). Autres actions :
      // la note existante n'est pas touchée (undefined = inchangé).
      ...(action === "reject" ? { moderatorNote: motif ?? null } : {}),
      decidedById: session.user.id,
      decidedAt: now,
    },
    select: { id: true, status: true, moderatorNote: true, decidedAt: true },
  });

  const auditAction =
    nextStatus === "APPROVED"
      ? "TESTIMONIAL_APPROVED"
      : nextStatus === "REJECTED"
        ? "TESTIMONIAL_REJECTED"
        : "TESTIMONIAL_ARCHIVED";

  await writeAudit({
    actorId: session.user.id,
    actorLabel,
    action: auditAction,
    entityType: "Testimonial",
    entityId: testimonial.id,
    metadata: {
      from: testimonial.status,
      to: nextStatus,
      personRecordId: testimonial.person.id,
      // motif uniquement pour un refus (décision interne, §9.2) ;
      // jamais le contenu ni les coordonnées du témoignage.
      ...(nextStatus === "REJECTED" && motif ? { motif } : {}),
    },
    ip,
  });

  return jsonOk({ testimonial: updated });
});
