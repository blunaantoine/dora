// ---------------------------------------------------------------------------
// PATCH /api/admin/badges/[id] — édition d'une définition de badge (§12).
//
// Champs modifiables : name, description, criteria, icon, isActive.
// Renommer un badge ne casse rien : les attributions sont liées par id.
// Désactiver un badge masque ses attributions sur les fiches publiques
// (les données sont conservées, rien n'est supprimé).
//
// Audit : BADGE_UPDATED. Permission : MANAGE_BADGES (ADMIN).
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, jsonOk, withApi, zodErrorToFields } from "@/lib/api";
import { guardAdminApi } from "@/lib/admin-guard";
import { ipFromHeaders, writeAudit } from "@/lib/audit";
import { BADGE_ICON_NAMES } from "@/lib/badge-icons";

const patchSchema = z
  .object({
    name: z.string().trim().min(2, "Le nom du badge doit contenir au moins 2 caractères.").max(80).optional(),
    description: z.string().trim().min(5, "La description doit contenir au moins 5 caractères.").max(300).optional(),
    criteria: z.string().trim().min(5, "Les critères doivent contenir au moins 5 caractères.").max(600).optional(),
    icon: z
      .string()
      .trim()
      .refine(
        (value) => value.length === 0 || (BADGE_ICON_NAMES as readonly string[]).includes(value),
        { message: "Icône inconnue : choisissez une icône de la liste." },
      )
      .optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const PATCH = withApi<{ id: string }>(async (req: NextRequest, ctx) => {
  const session = await guardAdminApi(req, "MANAGE_BADGES");
  const ip = ipFromHeaders(req.headers);
  const { id } = await ctx.params;

  const body: unknown = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation("Certaines informations du badge sont invalides.", zodErrorToFields(parsed.error));
  }

  const badge = await db.badge.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!badge) {
    throw ApiError.notFound("Badge introuvable.");
  }

  const { name, description, criteria, icon, isActive } = parsed.data;

  if (name && name !== badge.name) {
    const clash = await db.badge.findFirst({ where: { name: { equals: name } }, select: { id: true } });
    if (clash && clash.id !== id) {
      throw ApiError.conflict("Un badge porte déjà ce nom.");
    }
  }

  const updated = await db.badge.update({
    where: { id },
    data: {
      ...(name ? { name } : {}),
      ...(description ? { description } : {}),
      ...(criteria ? { criteria } : {}),
      ...(icon !== undefined ? { icon: icon.length > 0 ? icon : null } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
    select: { id: true, name: true, description: true, criteria: true, icon: true, isActive: true },
  });

  await writeAudit({
    actorId: session.user.id,
    actorLabel: session.user.email ?? session.user.name ?? "équipe",
    action: "BADGE_UPDATED",
    entityType: "Badge",
    entityId: id,
    metadata: {
      fields: Object.keys(parsed.data),
      nom: updated.name,
      ...(isActive !== undefined ? { actif: updated.isActive } : {}),
    },
    ip,
  });

  return jsonOk({ badge: updated });
});
