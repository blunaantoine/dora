// ---------------------------------------------------------------------------
// GET /api/admin/nominations — liste des propositions publiques (§11.2).
//
// Filtre ?statut=NEW|TO_REVIEW|POTENTIAL_DUPLICATE|TO_VERIFY|
//         ACCEPTED_FOR_CONTACT|REJECTED|ARCHIVED + compteurs par statut.
//
// Permission : MANAGE_NOMINATIONS (ADMIN, MODERATOR).
// Sérialiseur liste blanche : le contact du proposant (privé, §11.1 « traité
// de manière confidentielle ») ne sort QUE vers l'administration.
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, jsonOk, withApi } from "@/lib/api";
import { guardAdminApi } from "@/lib/admin-guard";
import { NOMINATION_STATUSES, type NominationStatus } from "@/lib/constants";

const querySchema = z.object({
  statut: z
    .string()
    .optional()
    .transform((raw) =>
      (raw ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s): s is NominationStatus =>
          (NOMINATION_STATUSES as readonly string[]).includes(s),
        ),
    ),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const GET = withApi(async (req: NextRequest) => {
  await guardAdminApi(req, "MANAGE_NOMINATIONS");

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) {
    throw ApiError.badRequest("Paramètres de requête invalides.");
  }
  const { statut, page, pageSize } = parsed.data;

  const where = statut.length > 0 ? { status: { in: statut } } : {};

  const [total, counts, items] = await Promise.all([
    db.nomination.count({ where }),
    db.nomination.groupBy({ by: ["status"], _count: { _all: true } }),
    db.nomination.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        nomineePublicName: true,
        presentation: true,
        reason: true,
        sourceUrl: true,
        proposerName: true,
        proposerContact: true, // administration uniquement
        goodFaith: true,
        status: true,
        adminNotes: true,
        decidedAt: true,
        createdAt: true,
        category: { select: { id: true, name: true, slug: true } },
        duplicateOf: { select: { id: true, publicName: true, managementName: true, status: true } },
        handledBy: { select: { displayName: true } },
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
      nomineePublicName: item.nomineePublicName,
      presentation: item.presentation,
      reason: item.reason,
      sourceUrl: item.sourceUrl,
      proposerName: item.proposerName,
      proposerContact: item.proposerContact,
      goodFaith: item.goodFaith,
      status: item.status,
      adminNotes: item.adminNotes,
      decidedAt: item.decidedAt,
      createdAt: item.createdAt,
      category: item.category,
      duplicateOf: item.duplicateOf,
      handledByName: item.handledBy?.displayName ?? null,
    })),
    total,
    page,
    pageSize,
    statusCounts,
  });
});
