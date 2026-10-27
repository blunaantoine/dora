// ---------------------------------------------------------------------------
// API admin « À l'honneur » — sélection éditoriale des 5 parcours mis en avant
// sur la bannière d'accueil (carrousel).
//
// CHOIX ÉDITORIAL, PAS UNE NOTATION : la plateforme n'a ni notes, ni
// popularité, ni nombre de vues (principe affiché publiquement). L'ordre est
// fixé par l'équipe : featuredRank 1..5 (1 = « Coup de cœur n°1 », badge or).
// ProfilePublication.featured reste le miroir booléen de featuredRank != null.
//
// GET  /api/admin/featured
//      { honored: [{id, slug, publicName, rank}], candidates: [{id, slug,
//      publicName, rank}] } — candidats = publications à l'état PUBLISHED
//      avec un nom public non vide.
//
// PUT  /api/admin/featured  { order: [publicationId, ...] } (0 à 5 ids uniques)
//      Réécriture autoritaire de la sélection : les publications non listées
//      sortent de l'honneur (featuredRank=null, featured=false), celles de la
//      liste reçoivent rank = index+1. Transaction + audit FEATURED_ORDER_UPDATED.
//
// Permission : PUBLISH_PROFILES (ADMIN) — même garde que la publication.
// ---------------------------------------------------------------------------

import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, jsonOk, withApi, zodErrorToFields } from "@/lib/api";
import { guardAdminApi } from "@/lib/admin-guard";
import { ipFromHeaders, writeAudit } from "@/lib/audit";

const FEATURED_MAX = 5;

const orderArraySchema = z
  .array(z.string().trim().min(1))
  .max(FEATURED_MAX, `Au maximum ${FEATURED_MAX} parcours à l'honneur.`)
  .refine((values) => new Set(values).size === values.length, {
    message: "Chaque parcours ne peut apparaître qu'une seule fois dans la sélection.",
  });

const putSchema = z.object({ order: orderArraySchema }).strict();

function serializeEntry(row: {
  id: string;
  slug: string;
  featuredRank: number | null;
  person: { publicName: string | null };
}) {
  return {
    id: row.id,
    slug: row.slug,
    publicName: row.person.publicName?.trim() ?? "",
    rank: row.featuredRank,
  };
}

// --- GET : sélection actuelle + candidats éligibles ---------------------------

export const GET = withApi(async (req) => {
  await guardAdminApi(req, "PUBLISH_PROFILES");

  const [honoredRows, candidateRows] = await Promise.all([
    db.profilePublication.findMany({
      where: { state: "PUBLISHED", featuredRank: { not: null } },
      orderBy: { featuredRank: "asc" },
      select: { id: true, slug: true, featuredRank: true, person: { select: { publicName: true } } },
    }),
    db.profilePublication.findMany({
      where: { state: "PUBLISHED", person: { publicName: { not: "" } } },
      orderBy: [{ featuredRank: "asc" }, { person: { publicName: "asc" } }],
      take: 200,
      select: { id: true, slug: true, featuredRank: true, person: { select: { publicName: true } } },
    }),
  ]);

  const candidates = candidateRows
    .map(serializeEntry)
    .filter((entry) => entry.publicName.length > 0);

  return jsonOk({
    max: FEATURED_MAX,
    honored: honoredRows.map(serializeEntry),
    candidates,
  });
});

// --- PUT : réécriture autoritaire de la sélection -----------------------------

export const PUT = withApi(async (req) => {
  const session = await guardAdminApi(req, "PUBLISH_PROFILES");
  const ip = ipFromHeaders(req.headers);
  const actor = {
    actorId: session.user.id,
    actorLabel: session.user.email ?? session.user.name ?? undefined,
  };

  const body: unknown = await req.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation("Sélection « À l'honneur » invalide.", zodErrorToFields(parsed.error));
  }
  const order = parsed.data.order;

  // Toutes les publications listées doivent être à l'état PUBLISHED.
  if (order.length > 0) {
    const rows = await db.profilePublication.findMany({
      where: { id: { in: order } },
      select: { id: true, slug: true, state: true, person: { select: { publicName: true } } },
    });
    if (rows.length !== order.length) {
      throw ApiError.conflict("Un des parcours sélectionnés est introuvable.");
    }
    const notPublished = rows.find((row) => row.state !== "PUBLISHED");
    if (notPublished) {
      throw ApiError.conflict(
        `Le parcours « ${notPublished.person.publicName ?? notPublished.slug} » n'est pas publié : seul un profil publié peut figurer à l'honneur.`,
      );
    }
  }

  const assigned = order.map((id, index) => ({ id, rank: index + 1 }));

  await db.$transaction(async (tx) => {
    // 1) Sortie de l'honneur pour tout ce qui n'est pas (ou plus) sélectionné.
    await tx.profilePublication.updateMany({
      where: { featuredRank: { not: null } },
      data: { featuredRank: null, featured: false },
    });
    // 2) Attribution des rangs 1..n dans l'ordre transmis.
    for (const entry of assigned) {
      await tx.profilePublication.update({
        where: { id: entry.id },
        data: { featuredRank: entry.rank, featured: true },
      });
    }
  });

  await writeAudit({
    ...actor,
    action: "FEATURED_ORDER_UPDATED",
    entityType: "ProfilePublication",
    entityId: null,
    metadata: { order: assigned },
    ip,
  });

  return jsonOk({
    honored: assigned,
    note: "Sélection « À l'honneur » enregistrée — choix éditorial de l'équipe (aucune notation).",
  });
});
