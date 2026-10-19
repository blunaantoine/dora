// ---------------------------------------------------------------------------
// API d'administration d'un compte équipe — GET (détail) et PATCH
// (activation/désactivation, changement de rôle). Permission : MANAGE_ADMINS.
// Protections serveur obligatoires :
//   - impossible de modifier son propre compte (403 explicite) ;
//   - impossible de désactiver le dernier administrateur actif (403 explicite) ;
//   - toute mutation est journalisée (writeAudit), y compris les refus (DENIED).
// ---------------------------------------------------------------------------

import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, jsonOk, withApi, zodErrorToFields } from "@/lib/api";
import { auditDeniedMutation, guardAdminApi } from "@/lib/admin-guard";
import { writeAudit, ipFromHeaders } from "@/lib/audit";
import { ROLES } from "@/lib/constants";

const DETAIL_SELECT = {
  id: true,
  displayName: true,
  email: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  lastLoginIp: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const GET = withApi<{ id: string }>(async (req, ctx) => {
  await guardAdminApi(req, "MANAGE_ADMINS");
  const { id } = await ctx.params;

  const user = await db.adminUser.findUnique({ where: { id }, select: DETAIL_SELECT });
  if (!user) {
    throw ApiError.notFound("Ce compte n'existe pas.");
  }
  return jsonOk(user);
});

const patchSchema = z
  .object({
    isActive: z.boolean().optional(),
    role: z.enum(ROLES).optional(),
  })
  .refine((data) => data.isActive !== undefined || data.role !== undefined, {
    message: "Aucune modification demandée.",
  });

export const PATCH = withApi<{ id: string }>(async (req, ctx) => {
  const session = await guardAdminApi(req, "MANAGE_ADMINS");
  const ip = ipFromHeaders(req.headers);
  const { id } = await ctx.params;

  const raw = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.validation(
      "Aucune modification valide n'a été fournie.",
      zodErrorToFields(parsed.error),
    );
  }

  const target = await db.adminUser.findUnique({ where: { id } });
  if (!target) {
    throw ApiError.notFound("Ce compte n'existe pas.");
  }

  const touchesRole = parsed.data.role !== undefined && parsed.data.role !== target.role;
  const touchesActive = parsed.data.isActive !== undefined && parsed.data.isActive !== target.isActive;

  // Protection 1 : jamais de modification de son propre compte.
  if (id === session.user.id && (touchesRole || touchesActive)) {
    await auditDeniedMutation({
      session,
      action: parsed.data.role !== undefined ? "ROLE_CHANGED" : "ADMIN_DEACTIVATED",
      entityType: "AdminUser",
      entityId: id,
      raison: "tentative de modification de son propre compte",
    });
    throw ApiError.forbidden("Vous ne pouvez pas modifier votre propre compte.");
  }

  // Protection 2 : le dernier administrateur actif ne peut pas être désactivé
  // (ni rétrogradé s'il est le seul administrateur actif).
  if (target.role === "ADMIN" && target.isActive) {
    const otherActiveAdmins = await db.adminUser.count({
      where: { role: "ADMIN", isActive: true, id: { not: target.id } },
    });

    if (otherActiveAdmins === 0) {
      if (parsed.data.isActive === false) {
        await auditDeniedMutation({
          session,
          action: "ADMIN_DEACTIVATED",
          entityType: "AdminUser",
          entityId: target.id,
          raison: "tentative de désactivation du dernier administrateur actif",
        });
        throw ApiError.forbidden(
          "Impossible de désactiver le dernier compte administrateur actif. Créez ou réactivez d'abord un autre compte administrateur.",
        );
      }
      if (parsed.data.role !== undefined && parsed.data.role !== "ADMIN") {
        await auditDeniedMutation({
          session,
          action: "ROLE_CHANGED",
          entityType: "AdminUser",
          entityId: target.id,
          raison: "tentative de rétrogradation du dernier administrateur actif",
        });
        throw ApiError.forbidden(
          "Impossible de retirer le rôle d'administrateur au dernier compte administrateur actif. Créez ou réactivez d'abord un autre compte administrateur.",
        );
      }
    }
  }

  // Rien à modifier réellement → réponse idempotente sans journal de mutation.
  if (!touchesRole && !touchesActive) {
    const current = await db.adminUser.findUnique({ where: { id }, select: DETAIL_SELECT });
    return jsonOk(current);
  }

  const updated = await db.adminUser.update({
    where: { id },
    data: {
      ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
      ...(touchesRole ? { role: parsed.data.role } : {}),
      // Révocation immédiate des sessions JWT existantes en cas de changement
      // de rôle ou de désactivation (décision D10).
      ...(touchesRole || (touchesActive && parsed.data.isActive === false)
        ? { tokenVersion: { increment: 1 } }
        : {}),
    },
    select: DETAIL_SELECT,
  });

  if (touchesRole) {
    await writeAudit({
      actorId: session.user.id,
      actorLabel: session.user.email ?? session.user.name ?? undefined,
      action: "ROLE_CHANGED",
      entityType: "AdminUser",
      entityId: target.id,
      metadata: { email: target.email, ancienRole: target.role, nouveauRole: parsed.data.role },
      ip,
    });
  }
  if (touchesActive) {
    await writeAudit({
      actorId: session.user.id,
      actorLabel: session.user.email ?? session.user.name ?? undefined,
      action: parsed.data.isActive === false ? "ADMIN_DEACTIVATED" : "ADMIN_REACTIVATED",
      entityType: "AdminUser",
      entityId: target.id,
      metadata: { email: target.email },
      ip,
    });
  }

  return jsonOk(updated);
});
