// ---------------------------------------------------------------------------
// GET /api/admin/testimonials — liste des témoignages pour la modération (§9.2).
//
// Filtre ?statut=PENDING|IN_REVIEW|APPROVED|REJECTED|REPORTED|ARCHIVED (liste
// blanche TESTIMONIAL_STATUSES) + compteurs par statut pour la navigation.
//
// Permission : MODERATE_TESTIMONIALS (ADMIN, MODERATOR).
// Sérialiseur liste blanche : les coordonnées (authorContact) ne sortent QUE
// vers l'administration — jamais vers le public (§9.1 : conservé séparément).
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, jsonOk, withApi } from "@/lib/api";
import { guardAdminApi } from "@/lib/admin-guard";
import { TESTIMONIAL_STATUSES, type TestimonialStatus } from "@/lib/constants";

const querySchema = z.object({
  statut: z
    .string()
    .optional()
    .transform((raw) =>
      (raw ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s): s is TestimonialStatus =>
          (TESTIMONIAL_STATUSES as readonly string[]).includes(s),
        ),
    ),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const GET = withApi(async (req: NextRequest) => {
  await guardAdminApi(req, "MODERATE_TESTIMONIALS");

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) {
    throw ApiError.badRequest("Paramètres de requête invalides.");
  }
  const { statut, page, pageSize } = parsed.data;

  const where = statut.length > 0 ? { status: { in: statut } } : {};

  const [total, counts, items] = await Promise.all([
    db.testimonial.count({ where }),
    db.testimonial.groupBy({ by: ["status"], _count: { _all: true } }),
    db.testimonial.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        personId: true,
        authorDisplayName: true,
        authorContact: true, // administration uniquement (vérification §9.1)
        relation: true,
        content: true,
        status: true,
        moderatorNote: true,
        decidedById: true,
        decidedBy: { select: { displayName: true } },
        decidedAt: true,
        createdAt: true,
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
    }),
  ]);

  const statusCounts: Record<string, number> = {};
  for (const group of counts) {
    statusCounts[group.status] = group._count._all;
  }

  return jsonOk({
    items: items.map((item) => ({
      id: item.id,
      personId: item.personId,
      person: {
        id: item.person.id,
        publicName: item.person.publicName,
        managementName: item.person.managementName,
        status: item.person.status,
        slug: item.person.publication?.state === "PUBLISHED" ? item.person.publication.slug : null,
      },
      authorDisplayName: item.authorDisplayName,
      authorContact: item.authorContact,
      relation: item.relation,
      content: item.content,
      status: item.status,
      moderatorNote: item.moderatorNote,
      decidedByName: item.decidedBy?.displayName ?? null,
      decidedAt: item.decidedAt,
      createdAt: item.createdAt,
    })),
    total,
    page,
    pageSize,
    statusCounts,
  });
});
