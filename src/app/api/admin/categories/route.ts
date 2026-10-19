// ---------------------------------------------------------------------------
// API admin des catégories d'engagement (§4.3).
//
// GET   /api/admin/categories
//       Liste triée (sortOrder puis nom), avec pour chaque catégorie :
//       publishedCount (dossiers au statut PUBLISHED) et personsCount
//       (dossiers liés, tous statuts — utile pour confirmer une désactivation).
//
// POST  /api/admin/categories {name, description?}
//       Création ; slug généré automatiquement depuis le nom (unicité garantie).
//
// Permission : MANAGE_CATEGORIES (ADMIN et EDITOR — voir permissions.ts).
// Aucune suppression : une catégorie se désactive (PATCH isActive:false),
// jamais elle n'efface les données liées (§4.3).
// ---------------------------------------------------------------------------

import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, jsonOk, withApi, zodErrorToFields } from "@/lib/api";
import { guardAdminApi } from "@/lib/admin-guard";
import { ipFromHeaders, writeAudit } from "@/lib/audit";
import { generateUniqueCategorySlug } from "@/lib/slug";

const createSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Le nom de la catégorie doit contenir au moins 2 caractères.")
      .max(80, "80 caractères maximum."),
    description: z.string().trim().max(300, "300 caractères maximum.").optional(),
  })
  .strict();

/** Sérialiseur liste blanche d'une catégorie. */
function serializeCategory(
  category: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    isActive: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  },
  publishedCount: number,
  personsCount: number,
) {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    isActive: category.isActive,
    sortOrder: category.sortOrder,
    publishedCount,
    personsCount,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

export const GET = withApi(async (req) => {
  await guardAdminApi(req, "MANAGE_CATEGORIES");

  const categories = await db.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      isActive: true,
      sortOrder: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          persons: { where: { status: "PUBLISHED" } },
        },
      },
    },
  });

  // Nombre total de dossiers liés (tous statuts) pour l'alerte de désactivation.
  const linkedCounts = await db.personRecord.groupBy({
    by: ["categoryId"],
    where: { categoryId: { not: null } },
    _count: { _all: true },
  });
  const linkedByCategory = new Map<string, number>();
  for (const row of linkedCounts) {
    if (row.categoryId) linkedByCategory.set(row.categoryId, row._count._all);
  }

  return jsonOk({
    categories: categories.map((category) =>
      serializeCategory(
        {
          id: category.id,
          name: category.name,
          slug: category.slug,
          description: category.description,
          isActive: category.isActive,
          sortOrder: category.sortOrder,
          createdAt: category.createdAt,
          updatedAt: category.updatedAt,
        },
        category._count.persons,
        linkedByCategory.get(category.id) ?? 0,
      ),
    ),
  });
});

export const POST = withApi(async (req) => {
  const session = await guardAdminApi(req, "MANAGE_CATEGORIES");
  const ip = ipFromHeaders(req.headers);

  const body: unknown = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation("Certaines informations sont invalides.", zodErrorToFields(parsed.error));
  }
  const { name, description } = parsed.data;

  // Unicité du nom (insensible à la casse) pour éviter les doublons visuels.
  const duplicate = await db.category.findFirst({
    where: { name: { equals: name } },
    select: { id: true, name: true },
  });
  if (duplicate) {
    throw ApiError.conflict(
      `Une catégorie nommée « ${duplicate.name} » existe déjà. Vous pouvez la renommer ou la réactiver.`,
    );
  }

  const slug = await generateUniqueCategorySlug(name);

  // sortOrder : après la dernière catégorie existante.
  const last = await db.category.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const sortOrder = (last?.sortOrder ?? 0) + 1;

  const created = await db.category.create({
    data: {
      name,
      slug,
      ...(description !== undefined && description !== "" ? { description } : {}),
      sortOrder,
      isActive: true,
    },
  });

  await writeAudit({
    actorId: session.user.id,
    actorLabel: session.user.email ?? session.user.name ?? undefined,
    action: "CATEGORY_CREATED",
    entityType: "Category",
    entityId: created.id,
    metadata: { name: created.name },
    ip,
  });

  return jsonOk({ category: serializeCategory(created, 0, 0) }, 201);
});
