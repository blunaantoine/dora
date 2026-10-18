// ---------------------------------------------------------------------------
// API d'administration des comptes équipe — GET (liste) et POST (création).
// Permission requise : MANAGE_ADMINS. Le hash du mot de passe n'est JAMAIS
// renvoyé ; les métadonnées d'audit ne contiennent jamais le mot de passe.
// ---------------------------------------------------------------------------

import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, jsonOk, withApi, zodErrorToFields } from "@/lib/api";
import { guardAdminApi } from "@/lib/admin-guard";
import { hashPassword, validatePasswordStrength } from "@/lib/auth-password";
import { writeAudit, ipFromHeaders } from "@/lib/audit";
import { ROLES } from "@/lib/constants";

const LIST_SELECT = {
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

export const GET = withApi(async (req) => {
  await guardAdminApi(req, "MANAGE_ADMINS");

  const users = await db.adminUser.findMany({
    orderBy: { createdAt: "asc" },
    select: LIST_SELECT,
  });

  return jsonOk({ items: users, total: users.length });
});

const createSchema = z.object({
  displayName: z.string().trim().min(2, "Le nom d'affichage doit contenir au moins 2 caractères.").max(80),
  email: z.email("Adresse e-mail invalide.").transform((v) => v.trim().toLowerCase()),
  password: z.string().min(1, "Le mot de passe est obligatoire."),
  role: z.enum(ROLES),
});

export const POST = withApi(async (req) => {
  const session = await guardAdminApi(req, "MANAGE_ADMINS");
  const ip = ipFromHeaders(req.headers);

  const raw = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.validation(
      "Certaines informations du compte sont invalides.",
      zodErrorToFields(parsed.error),
    );
  }
  const { displayName, email, password, role } = parsed.data;

  // Politique de mot de passe (≥ 12 caractères, ≥ 1 lettre, ≥ 1 chiffre).
  const strength = validatePasswordStrength(password);
  if (!strength.ok) {
    throw ApiError.validation("Le mot de passe ne respecte pas la politique de sécurité.", {
      password: strength.errors,
    });
  }

  // Unicité de l'adresse e-mail.
  const existing = await db.adminUser.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    throw ApiError.conflict("Un compte existe déjà avec cette adresse e-mail.");
  }

  const passwordHash = await hashPassword(password);

  const created = await db.adminUser.create({
    data: { displayName, email, passwordHash, role, isActive: true },
    select: LIST_SELECT,
  });

  await writeAudit({
    actorId: session.user.id,
    actorLabel: session.user.email ?? session.user.name ?? undefined,
    action: "ADMIN_CREATED",
    entityType: "AdminUser",
    entityId: created.id,
    metadata: { email: created.email, role: created.role },
    ip,
  });

  return jsonOk(created, 201);
});
