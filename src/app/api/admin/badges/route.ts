// ---------------------------------------------------------------------------
// GET  /api/admin/badges — définitions de badges (§12) + attributions actives.
// POST /api/admin/badges — création manuelle d'un badge.
//
// §12 : la gestion est MANUELLE — aucun badge n'est semé par défaut, aucune
// attribution automatique. Un badge comprend : nom, description, icône
// (sous-ensemble lucide sûr, fallback Award), critères d'attribution.
//
// Permission : MANAGE_BADGES (ADMIN — matrice §2.3 ; les badges sont une
// reconnaissance officielle de la plateforme, réservée à l'administrateur
// principal).
// Sérialiseur liste blanche.
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, jsonOk, withApi, zodErrorToFields } from "@/lib/api";
import { guardAdminApi } from "@/lib/admin-guard";
import { ipFromHeaders, writeAudit } from "@/lib/audit";
import { BADGE_ICON_NAMES } from "@/lib/badge-icons";

// --- GET ---------------------------------------------------------------------

export const GET = withApi(async (req: NextRequest) => {
  await guardAdminApi(req, "MANAGE_BADGES");

  const badges = await db.badge.findMany({
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      criteria: true,
      icon: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      assignments: {
        where: { removedAt: null },
        orderBy: { awardedAt: "desc" },
        select: {
          id: true,
          justification: true,
          awardedAt: true,
          awardedBy: { select: { displayName: true } },
          person: {
            select: {
              id: true,
              publicName: true,
              managementName: true,
              status: true,
              publication: { select: { slug: true, state: true } },
            },
          },
        },
      },
    },
  });

  return jsonOk({
    badges: badges.map((badge) => ({
      id: badge.id,
      name: badge.name,
      description: badge.description,
      criteria: badge.criteria,
      icon: badge.icon,
      isActive: badge.isActive,
      createdAt: badge.createdAt,
      updatedAt: badge.updatedAt,
      activeAssignments: badge.assignments.map((assignment) => ({
        id: assignment.id,
        justification: assignment.justification,
        awardedAt: assignment.awardedAt,
        awardedByName: assignment.awardedBy.displayName,
        person: {
          id: assignment.person.id,
          publicName: assignment.person.publicName,
          managementName: assignment.person.managementName,
          status: assignment.person.status,
          slug:
            assignment.person.publication?.state === "PUBLISHED"
              ? assignment.person.publication.slug
              : null,
        },
      })),
    })),
  });
});

// --- POST : création ---------------------------------------------------------

const createSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Le nom du badge doit contenir au moins 2 caractères.")
      .max(80, "Le nom du badge ne peut pas dépasser 80 caractères."),
    description: z
      .string()
      .trim()
      .min(5, "La description doit contenir au moins 5 caractères.")
      .max(300, "La description ne peut pas dépasser 300 caractères."),
    criteria: z
      .string()
      .trim()
      .min(5, "Les critères d'attribution doivent contenir au moins 5 caractères.")
      .max(600, "Les critères ne peuvent pas dépasser 600 caractères."),
    icon: z
      .string()
      .trim()
      .refine(
        (value) => value.length === 0 || (BADGE_ICON_NAMES as readonly string[]).includes(value),
        { message: "Icône inconnue : choisissez une icône de la liste." },
      )
      .optional(),
  })
  .strict();

export const POST = withApi(async (req: NextRequest) => {
  const session = await guardAdminApi(req, "MANAGE_BADGES");
  const ip = ipFromHeaders(req.headers);

  const body: unknown = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation("Certaines informations du badge sont invalides.", zodErrorToFields(parsed.error));
  }

  const { name, description, criteria, icon } = parsed.data;

  const existing = await db.badge.findFirst({
    where: { name: { equals: name } },
    select: { id: true },
  });
  if (existing) {
    throw ApiError.conflict("Un badge porte déjà ce nom.");
  }

  const created = await db.badge.create({
    data: {
      name,
      description,
      criteria,
      ...(icon && icon.length > 0 ? { icon } : {}),
    },
    select: { id: true, name: true, description: true, criteria: true, icon: true, isActive: true },
  });

  await writeAudit({
    actorId: session.user.id,
    actorLabel: session.user.email ?? session.user.name ?? "équipe",
    action: "BADGE_CREATED",
    entityType: "Badge",
    entityId: created.id,
    metadata: { badgeId: created.id, nom: created.name, icone: created.icon ?? null },
    ip,
  });

  return jsonOk({ badge: created }, 201);
});
