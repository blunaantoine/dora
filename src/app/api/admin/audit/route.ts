// ---------------------------------------------------------------------------
// API de consultation du journal d'audit — GET paginé.
// Permission : VIEW_AUDIT_LOG. Les métadonnées (techniques, potentiellement
// sensibles) ne sont JAMAIS renvoyées par cette route.
// ---------------------------------------------------------------------------

import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, jsonOk, withApi } from "@/lib/api";
import { guardAdminApi } from "@/lib/admin-guard";
import { AUDIT_ACTIONS, AUDIT_RESULTS } from "@/lib/constants";

const querySchema = z.object({
  action: z
    .string()
    .optional()
    .refine(
      (raw) => !raw || raw === "" || (AUDIT_ACTIONS as readonly string[]).includes(raw),
      "Action inconnue.",
    ),
  result: z
    .string()
    .optional()
    .refine(
      (raw) => !raw || raw === "" || (AUDIT_RESULTS as readonly string[]).includes(raw),
      "Résultat inconnu.",
    ),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const GET = withApi(async (req) => {
  await guardAdminApi(req, "VIEW_AUDIT_LOG");

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) {
    throw ApiError.badRequest("Paramètres de requête invalides.");
  }
  const { action, result, page, pageSize } = parsed.data;

  const where = {
    ...(action && action !== "" ? { action } : {}),
    ...(result && result !== "" ? { result } : {}),
  };

  const [total, entries] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      // metadata volontairement exclue.
      select: {
        id: true,
        actorId: true,
        actorLabel: true,
        actor: { select: { displayName: true } },
        action: true,
        entityType: true,
        entityId: true,
        result: true,
        ip: true,
        createdAt: true,
      },
    }),
  ]);

  return jsonOk({ items: entries, total, page, pageSize });
});
