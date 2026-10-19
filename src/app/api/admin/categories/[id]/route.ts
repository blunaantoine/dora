// ---------------------------------------------------------------------------
// PATCH /api/admin/categories/[id] — renommage, description, activation.
//
// - Désactiver (isActive:false) n'efface RIEN et ne masque aucune personne :
//   la catégorie reste liée aux dossiers ; elle disparaît seulement des
//   filtres/choix futurs (§4.3 : « Une catégorie désactivée ne doit pas
//   effacer les anciennes données qui lui sont associées »).
// - Le slug n'est PAS régénéré au renommage : il sert d'identifiant stable
//   (filtres publics futurs) — seul le nom affiché change.
// - DELETE interdit : la suppression n'existe pas pour les catégories
//   (réponse 405 avec explication — la désactivation seule est prévue).
//
// Permission : MANAGE_CATEGORIES (ADMIN et EDITOR).
// ---------------------------------------------------------------------------

import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, jsonOk, withApi, zodErrorToFields } from "@/lib/api";
import { guardAdminApi } from "@/lib/admin-guard";
import { ipFromHeaders, writeAudit } from "@/lib/audit";

const patchSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Le nom de la catégorie doit contenir au moins 2 caractères.")
      .max(80, "80 caractères maximum.")
      .optional(),
    description: z.string().trim().max(300, "300 caractères maximum.").nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const PATCH = withApi<{ id: string }>(async (req, ctx) => {
  const { id } = await ctx.params;
  const session = await guardAdminApi(req, "MANAGE_CATEGORIES");
  const ip = ipFromHeaders(req.headers);

  const existing = await db.category.findUnique({ where: { id }, select: { id: true, name: true, slug: true } });
  if (!existing) {
    throw ApiError.notFound("Catégorie introuvable.");
  }

  const body: unknown = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation("Certaines informations sont invalides.", zodErrorToFields(parsed.error));
  }
  const { name, description, isActive } = parsed.data;

  if (name === undefined && description === undefined && isActive === undefined) {
    throw ApiError.badRequest("Aucune modification fournie (name, description ou isActive attendu).");
  }

  if (name !== undefined && name !== existing.name) {
    const duplicate = await db.category.findFirst({
      where: { name: { equals: name }, id: { not: id } },
      select: { id: true },
    });
    if (duplicate) {
      throw ApiError.conflict(`Une catégorie nommée « ${name} » existe déjà.`);
    }
  }

  const updated = await db.category.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description: description === "" ? null : description } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      isActive: true,
      sortOrder: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { persons: true } },
    },
  });

  await writeAudit({
    actorId: session.user.id,
    actorLabel: session.user.email ?? session.user.name ?? undefined,
    action: "CATEGORY_UPDATED",
    entityType: "Category",
    entityId: id,
    metadata: {
      fields: [
        ...(name !== undefined ? ["name"] : []),
        ...(description !== undefined ? ["description"] : []),
        ...(isActive !== undefined ? ["isActive"] : []),
      ],
      ...(isActive !== undefined ? { isActive } : {}),
    },
    ip,
  });

  return jsonOk({
    category: {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      description: updated.description,
      isActive: updated.isActive,
      sortOrder: updated.sortOrder,
      personsCount: updated._count.persons,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
});

export async function DELETE(): Promise<Response> {
  return Response.json(
    {
      ok: false,
      error: {
        code: "METHOD_NOT_ALLOWED",
        message:
          "La suppression d'une catégorie n'est pas autorisée. Désactivez-la plutôt : les profils déjà liés restent intacts et visibles, la catégorie disparaît seulement des filtres.",
      },
    },
    { status: 405, headers: { Allow: "GET, POST, PATCH" } },
  );
}
