// ---------------------------------------------------------------------------
// API de liste des dossiers (PersonRecord) — GET paginé.
// Permission : MANAGE_DOSSIERS ou REVIEW_DOSSIERS.
// Réponse volontairement allégée : uniquement les champs de liste — jamais les
// champs longs ni les données privées. Le nom de gestion n'est renvoyé qu'aux
// rôles disposant de MANAGE_DOSSIERS.
// ---------------------------------------------------------------------------

import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, jsonOk, withApi } from "@/lib/api";
import { guardAdminApi } from "@/lib/admin-guard";
import { hasPermission } from "@/lib/permissions";
import { DOSSIER_STATUSES, type DossierStatus } from "@/lib/constants";

const querySchema = z.object({
  status: z
    .string()
    .optional()
    .transform((raw) =>
      (raw ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s): s is DossierStatus => (DOSSIER_STATUSES as readonly string[]).includes(s)),
    ),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const GET = withApi(async (req) => {
  const session = await guardAdminApi(req);
  const canManage = hasPermission(session.user.role, "MANAGE_DOSSIERS");
  const canReview = hasPermission(session.user.role, "REVIEW_DOSSIERS");
  if (!canManage && !canReview) {
    throw ApiError.forbidden("Accès refusé : votre rôle ne permet pas de consulter les dossiers.");
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) {
    throw ApiError.badRequest("Paramètres de requête invalides.");
  }
  const { status, q, page, pageSize } = parsed.data;

  const where = {
    ...(status.length > 0 ? { status: { in: status } } : {}),
    ...(q
      ? {
          OR: [
            { publicName: { contains: q } },
            ...(canManage ? [{ managementName: { contains: q } }] : []),
          ],
        }
      : {}),
  };

  const [total, records] = await Promise.all([
    db.personRecord.count({ where }),
    db.personRecord.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        ...(canManage ? { managementName: true } : {}),
        publicName: true,
        status: true,
        isMinor: true,
        submittedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  return jsonOk({ items: records, total, page, pageSize });
});
