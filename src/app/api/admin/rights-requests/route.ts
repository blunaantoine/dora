// ---------------------------------------------------------------------------
// GET /api/admin/rights-requests — suivi des demandes de droits (§15.3).
//
// « Les demandes doivent être enregistrées, suivies et clôturées avec une
// trace de décision. » Liste filtrable par statut avec compteurs.
// Permission : MANAGE_DOSSIERS (ADMIN, EDITOR).
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, jsonOk, withApi } from "@/lib/api";
import { guardAdminApi } from "@/lib/admin-guard";
import { RIGHTS_REQUEST_STATUSES, type RightsRequestStatus } from "@/lib/constants";

const querySchema = z.object({
  statut: z
    .string()
    .optional()
    .transform((raw) =>
      (raw ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s): s is RightsRequestStatus =>
          (RIGHTS_REQUEST_STATUSES as readonly string[]).includes(s),
        ),
    ),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const GET = withApi(async (req: NextRequest) => {
  await guardAdminApi(req, "MANAGE_DOSSIERS");

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) {
    throw ApiError.badRequest("Paramètres de requête invalides.");
  }
  const { statut, page, pageSize } = parsed.data;

  const where = statut.length > 0 ? { status: { in: statut } } : {};

  const [total, counts, items] = await Promise.all([
    db.rightsRequest.count({ where }),
    db.rightsRequest.groupBy({ by: ["status"], _count: { _all: true } }),
    db.rightsRequest.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        type: true,
        requesterName: true,
        requesterContact: true, // administration uniquement (minimisation §15.2)
        description: true,
        status: true,
        decision: true,
        decidedAt: true,
        closedAt: true,
        createdAt: true,
        person: {
          select: {
            id: true,
            publicName: true,
            managementName: true,
            status: true,
            isMinor: true,
          },
        },
        decidedBy: { select: { displayName: true } },
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
      type: item.type,
      requesterName: item.requesterName,
      requesterContact: item.requesterContact,
      description: item.description,
      status: item.status,
      decision: item.decision,
      decidedAt: item.decidedAt,
      closedAt: item.closedAt,
      createdAt: item.createdAt,
      person: item.person
        ? {
            id: item.person.id,
            nom: item.person.publicName ?? item.person.managementName,
            status: item.person.status,
            isMinor: item.person.isMinor,
          }
        : null,
      decidedByName: item.decidedBy?.displayName ?? null,
    })),
    total,
    page,
    pageSize,
    statusCounts,
  });
});
