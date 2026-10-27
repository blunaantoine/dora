// ---------------------------------------------------------------------------
// API admin de publication d'un profil (§8.4, §8.5).
//
// GET    /api/admin/dossiers/[id]/publication
//        État actuel : publication (si elle existe), pré-requis cochés, slug
//        réel ou prévisionnel, URL publique prévisionnelle /profils/<slug>.
//
// POST   /api/admin/dossiers/[id]/publication
//        {approvedFields[], seoTitle?, seoDescription?, featured?}
//        Publication explicite. Pré-requis VÉRIFIÉS sinon 409 :
//          • statut APPROVED (transition APPROVED → PUBLISHED via canTransition) ;
//          • consentement en base (ConsentRecord) ;
//          • publicName non vide ;
//          • au moins un champ approuvé (liste blanche public-fields.ts).
//        Règle mineures (§4.4/§14) : city et region refusées pour un dossier
//        isMinor (message explicite). Slug généré depuis publicName (accents
//        retirés, tirets, unicité par suffixe court). Audit PROFILE_PUBLISHED.
//
// PATCH  /api/admin/dossiers/[id]/publication
//        Édition (dossier PUBLISHED uniquement) : approvedFields, SEO, mise en
//        avant. Audit PROFILE_PUBLICATION_UPDATED.
//
// DELETE /api/admin/dossiers/[id]/publication  {motif?}
//        Dépublication explicite (motif journalisé) : publication
//        state=UNPUBLISHED + unpublishedAt, transition PUBLISHED →
//        UNPUBLISHING dans la même transaction ; le statut ARCHIVED est
//        ensuite atteignable via PATCH /api/admin/dossiers/[id].
//        Audit PROFILE_UNPUBLISHED.
//
// Permission : PUBLISH_PROFILES (ADMIN).
// ---------------------------------------------------------------------------

import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, jsonOk, withApi, zodErrorToFields } from "@/lib/api";
import { guardAdminApi } from "@/lib/admin-guard";
import { ipFromHeaders, writeAudit } from "@/lib/audit";
import { canTransition, type DossierStatus } from "@/lib/constants";
import {
  MINOR_FORBIDDEN_FIELDS,
  PUBLIC_FIELD_LABELS,
  isPublicField,
  type PublicField,
} from "@/lib/public-fields";
import { generateUniquePublicationSlug, slugify } from "@/lib/slug";

// --- Validation commune des champs approuvés ---------------------------------

const approvedFieldsSchema = z
  .array(
    z
      .string()
      .trim()
      .refine((value) => isPublicField(value), "Champ public inconnu (liste blanche uniquement)."),
  )
  .min(1, "Sélectionnez au moins un champ à publier.")
  .max(26, "26 champs maximum.")
  .transform((values) => Array.from(new Set(values)) as PublicField[]);

const seoTitleSchema = z.string().trim().max(70, "70 caractères maximum (bonne pratique SEO).").nullable();
const seoDescriptionSchema = z
  .string()
  .trim()
  .max(160, "160 caractères maximum (bonne pratique SEO).")
  .nullable();

/**
 * Applique la règle des mineures (§4.4 : éviter la localisation précise) :
 * city et region ne peuvent pas être approuvées pour un dossier isMinor.
 * Retourne un objet {fields} d'erreurs zod-compatible si la règle est violée.
 */
function checkMinorFields(fields: readonly string[], isMinor: boolean): Record<string, string[]> | null {
  if (!isMinor) return null;
  const forbidden = fields.filter((field) => MINOR_FORBIDDEN_FIELDS.includes(field as PublicField));
  if (forbidden.length === 0) return null;
  const errors: Record<string, string[]> = {};
  for (const field of forbidden) {
    errors[field] = [
      `Pour une personne mineure, « ${PUBLIC_FIELD_LABELS[field as PublicField]} » ne peut pas être publié : la localisation précise est exclue (protection renforcée).`,
    ];
  }
  return errors;
}

// --- Schémas -----------------------------------------------------------------

const publishSchema = z
  .object({
    approvedFields: approvedFieldsSchema,
    seoTitle: seoTitleSchema.optional(),
    seoDescription: seoDescriptionSchema.optional(),
    featured: z.boolean().optional(),
  })
  .strict();

const updatePublicationSchema = z
  .object({
    approvedFields: approvedFieldsSchema.optional(),
    seoTitle: seoTitleSchema.optional(),
    seoDescription: seoDescriptionSchema.optional(),
    featured: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.approvedFields !== undefined ||
      value.seoTitle !== undefined ||
      value.seoDescription !== undefined ||
      value.featured !== undefined,
    { message: "Aucune modification fournie." },
  );

const unpublishSchema = z
  .object({
    motif: z.string().trim().min(5, "Décrivez brièvement le motif (5 caractères au moins).").max(500).optional(),
  })
  .strict();

// --- Sérialisation liste blanche ---------------------------------------------

function parseApprovedFields(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    // valeur corrompue → liste vide
  }
  return [];
}

function serializePublication(row: {
  id: string;
  personId: string;
  slug: string;
  state: string;
  approvedFields: string;
  featured: boolean;
  featuredRank: number | null;
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: Date | null;
  unpublishedAt: Date | null;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    personId: row.personId,
    slug: row.slug,
    state: row.state,
    approvedFields: parseApprovedFields(row.approvedFields),
    featured: row.featured,
    featuredRank: row.featuredRank,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    unpublishedAt: row.unpublishedAt ? row.unpublishedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

// --- GET : état actuel --------------------------------------------------------

export const GET = withApi<{ id: string }>(async (req, ctx) => {
  const { id } = await ctx.params;
  await guardAdminApi(req, "PUBLISH_PROFILES");

  const dossier = await db.personRecord.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      publicName: true,
      isMinor: true,
      publication: {
        select: {
          id: true,
          personId: true,
          slug: true,
          state: true,
          approvedFields: true,
          featured: true,
          featuredRank: true,
          seoTitle: true,
          seoDescription: true,
          publishedAt: true,
          unpublishedAt: true,
          updatedAt: true,
        },
      },
      consents: { select: { id: true, consentTextId: true }, take: 1 },
    },
  });
  if (!dossier) {
    throw ApiError.notFound("Dossier introuvable.");
  }

  const publication = dossier.publication ? serializePublication(dossier.publication) : null;
  const consentOk = dossier.consents.length > 0;
  const publicNameOk = Boolean(dossier.publicName && dossier.publicName.trim().length > 0);

  // Slug : réel si la publication existe, sinon prévisionnel (dérivé du nom
  // public — l'unicité finale est garantie à la publication).
  const slug = publication?.slug ?? (slugify(dossier.publicName ?? "") || null);

  return jsonOk({
    dossier: {
      id: dossier.id,
      status: dossier.status,
      publicName: dossier.publicName,
      isMinor: dossier.isMinor,
    },
    publication,
    prerequisites: {
      statusOk: dossier.status === "APPROVED",
      consentOk,
      publicNameOk,
      fieldsOk: (publication?.approvedFields.length ?? 0) > 0,
    },
    slug,
    previewUrl: slug ? `/profils/${slug}` : null,
  });
});

// --- POST : publication explicite --------------------------------------------

export const POST = withApi<{ id: string }>(async (req, ctx) => {
  const { id } = await ctx.params;
  const session = await guardAdminApi(req, "PUBLISH_PROFILES");
  const ip = ipFromHeaders(req.headers);
  const actor = {
    actorId: session.user.id,
    actorLabel: session.user.email ?? session.user.name ?? undefined,
  };

  const dossier = await db.personRecord.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      publicName: true,
      isMinor: true,
      consents: { select: { id: true }, take: 1 },
      publication: { select: { id: true, slug: true } },
    },
  });
  if (!dossier) {
    throw ApiError.notFound("Dossier introuvable.");
  }

  const body: unknown = await req.json().catch(() => null);
  const parsed = publishSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation("Certaines informations sont invalides.", zodErrorToFields(parsed.error));
  }
  const { approvedFields, seoTitle, seoDescription, featured } = parsed.data;

  // Pré-requis §8.4 — vérifiés côté serveur, messages français explicites.
  const fromStatus = dossier.status as DossierStatus;
  if (fromStatus !== "APPROVED") {
    throw ApiError.conflict(
      `La publication exige un dossier « Approuvé ». Ce dossier est actuellement « ${fromStatus} » : finalisez d'abord l'examen.`,
    );
  }
  if (dossier.consents.length === 0) {
    throw ApiError.conflict(
      "La publication exige un consentement enregistré (ConsentRecord). Ce dossier n'a aucun consentement en base.",
    );
  }
  if (!dossier.publicName || dossier.publicName.trim().length === 0) {
    throw ApiError.conflict(
      "La publication exige un nom public non vide. Renseignez d'abord le nom public du dossier.",
    );
  }

  // Règles mineures : city/region interdites (§4.4).
  const minorErrors = checkMinorFields(approvedFields, dossier.isMinor);
  if (minorErrors) {
    throw ApiError.validation(
      "Règles de protection des mineures : certains champs sélectionnés ne peuvent pas être publiés.",
      minorErrors,
    );
  }

  // Slug : existant conservé (stabilité des liens), sinon généré depuis le
  // nom public avec unicité garantie (suffixe court si nécessaire).
  const slug = dossier.publication?.slug ?? (await generateUniquePublicationSlug(dossier.publicName));

  const now = new Date();

  // Publication + transition dans une seule transaction.
  await db.$transaction(async (tx) => {
    if (dossier.publication) {
      // republication après dépublication : la ligne existe, on la réactive
      // (slug conservé pour ne pas casser les liens existants).
      await tx.profilePublication.update({
        where: { personId: id },
        data: {
          state: "PUBLISHED",
          approvedFields: JSON.stringify(approvedFields),
          // Republication sans `featured` fourni : l'état « À l'honneur »
          // existant (featured + featuredRank) est PRÉSERVÉ — la sélection
          // éditoriale ne doit pas être effacée par une republication.
          ...(featured !== undefined
            ? { featured, ...(featured === false ? { featuredRank: null } : {}) }
            : {}),
          ...(seoTitle !== undefined ? { seoTitle: seoTitle === "" ? null : seoTitle } : {}),
          ...(seoDescription !== undefined ? { seoDescription: seoDescription === "" ? null : seoDescription } : {}),
          publishedAt: now,
          unpublishedAt: null,
        },
      });
    } else {
      await tx.profilePublication.create({
        data: {
          personId: id,
          slug,
          state: "PUBLISHED",
          approvedFields: JSON.stringify(approvedFields),
          featured: featured ?? false,
          ...(seoTitle !== undefined && seoTitle !== "" ? { seoTitle } : {}),
          ...(seoDescription !== undefined && seoDescription !== "" ? { seoDescription } : {}),
          publishedAt: now,
        },
      });
    }

    // Machine à états : APPROVED → PUBLISHED (canTransition revalidé).
    if (!canTransition(fromStatus, "PUBLISHED")) {
      throw ApiError.conflict(
        "Transition interdite par la machine à états : le dossier ne peut pas passer à « Publié » depuis son statut actuel.",
      );
    }
    await tx.personRecord.update({
      where: { id, status: fromStatus },
      data: { status: "PUBLISHED" },
    });
  });

  await writeAudit({
    ...actor,
    action: "PROFILE_PUBLISHED",
    entityType: "PersonRecord",
    entityId: id,
    metadata: { slug, approvedFields, from: fromStatus, to: "PUBLISHED" },
    ip,
  });
  await writeAudit({
    ...actor,
    action: "DOSSIER_STATUS_CHANGED",
    entityType: "PersonRecord",
    entityId: id,
    metadata: { from: fromStatus, to: "PUBLISHED" },
    ip,
  });

  return jsonOk({
    publication: {
      slug,
      state: "PUBLISHED",
      approvedFields,
      featured: featured ?? false,
      publishedAt: now.toISOString(),
      publicUrl: `/profils/${slug}`,
    },
    dossierStatus: "PUBLISHED",
  }, 201);
});

// --- PATCH : édition (dossier PUBLISHED uniquement) ---------------------------

export const PATCH = withApi<{ id: string }>(async (req, ctx) => {
  const { id } = await ctx.params;
  const session = await guardAdminApi(req, "PUBLISH_PROFILES");
  const ip = ipFromHeaders(req.headers);
  const actor = {
    actorId: session.user.id,
    actorLabel: session.user.email ?? session.user.name ?? undefined,
  };

  const dossier = await db.personRecord.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      isMinor: true,
      publication: { select: { id: true, state: true, slug: true } },
    },
  });
  if (!dossier) {
    throw ApiError.notFound("Dossier introuvable.");
  }
  if (dossier.status !== "PUBLISHED" || dossier.publication?.state !== "PUBLISHED") {
    throw ApiError.conflict(
      "L'édition de la publication n'est possible que pour un profil actuellement publié.",
    );
  }

  const body: unknown = await req.json().catch(() => null);
  const parsed = updatePublicationSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation("Certaines informations sont invalides.", zodErrorToFields(parsed.error));
  }
  const { approvedFields, seoTitle, seoDescription, featured } = parsed.data;

  if (approvedFields !== undefined) {
    const minorErrors = checkMinorFields(approvedFields, dossier.isMinor);
    if (minorErrors) {
      throw ApiError.validation(
        "Règles de protection des mineures : certains champs sélectionnés ne peuvent pas être publiés.",
        minorErrors,
      );
    }
  }

  const touched: string[] = [];
  const data: Record<string, unknown> = {};
  if (approvedFields !== undefined) {
    data.approvedFields = JSON.stringify(approvedFields);
    touched.push("approvedFields");
  }
  if (seoTitle !== undefined) {
    data.seoTitle = seoTitle === "" ? null : seoTitle;
    touched.push("seoTitle");
  }
  if (seoDescription !== undefined) {
    data.seoDescription = seoDescription === "" ? null : seoDescription;
    touched.push("seoDescription");
  }
  if (featured !== undefined) {
    data.featured = featured;
    // Cohérence « À l'honneur » : retirer la mise en avant sort aussi du
    // carrousel ; l'activer sans rang reste possible (le rang se règle dans
    // l'espace « À l'honneur »).
    if (!featured) data.featuredRank = null;
    touched.push("featured");
  }

  const updated = await db.profilePublication.update({
    where: { personId: id },
    data,
    select: {
      id: true,
      personId: true,
      slug: true,
      state: true,
      approvedFields: true,
      featured: true,
      featuredRank: true,
      seoTitle: true,
      seoDescription: true,
      publishedAt: true,
      unpublishedAt: true,
      updatedAt: true,
    },
  });

  await writeAudit({
    ...actor,
    action: "PROFILE_PUBLICATION_UPDATED",
    entityType: "ProfilePublication",
    entityId: updated.id,
    metadata: { personId: id, fields: touched },
    ip,
  });

  return jsonOk({ publication: serializePublication(updated) });
});

// --- DELETE : dépublication explicite (§8.5) ---------------------------------

export const DELETE = withApi<{ id: string }>(async (req, ctx) => {
  const { id } = await ctx.params;
  const session = await guardAdminApi(req, "PUBLISH_PROFILES");
  const ip = ipFromHeaders(req.headers);
  const actor = {
    actorId: session.user.id,
    actorLabel: session.user.email ?? session.user.name ?? undefined,
  };

  const dossier = await db.personRecord.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      publication: { select: { id: true, state: true, slug: true } },
    },
  });
  if (!dossier) {
    throw ApiError.notFound("Dossier introuvable.");
  }
  if (dossier.status !== "PUBLISHED" || dossier.publication?.state !== "PUBLISHED") {
    throw ApiError.conflict("Seul un profil actuellement publié peut être dépublié.");
  }

  // Corps optionnel : {motif}. (DELETE avec corps JSON — toléré, jamais requis.)
  const rawBody: unknown = await req.json().catch(() => null);
  let motif: string | undefined;
  if (rawBody !== null && rawBody !== undefined) {
    const parsed = unpublishSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw ApiError.validation("Requête de dépublication invalide.", zodErrorToFields(parsed.error));
    }
    motif = parsed.data.motif;
  }

  const fromStatus = dossier.status as DossierStatus;
  if (!canTransition(fromStatus, "UNPUBLISHING")) {
    await writeAudit({
      ...actor,
      action: "PROFILE_UNPUBLISHED",
      entityType: "PersonRecord",
      entityId: id,
      result: "DENIED",
      metadata: { raison: "transition PUBLISHED → UNPUBLISHING interdite" },
      ip,
    });
    throw ApiError.conflict(
      "Dépublication impossible : la transition « Publié → Dépublication en cours » n'est pas autorisée par la machine à états.",
    );
  }

  const now = new Date();

  // Dépublication + transition dans la MÊME transaction (§8.5 : le profil
  // cesse d'être visible immédiatement et l'état reste cohérent).
  await db.$transaction(async (tx) => {
    await tx.profilePublication.update({
      where: { personId: id },
      data: { state: "UNPUBLISHED", unpublishedAt: now },
    });
    await tx.personRecord.update({
      where: { id, status: fromStatus },
      data: { status: "UNPUBLISHING" },
    });
  });

  await writeAudit({
    ...actor,
    action: "PROFILE_UNPUBLISHED",
    entityType: "PersonRecord",
    entityId: id,
    metadata: { slug: dossier.publication.slug, motif: motif ?? "dépublication explicite par l'administration", from: fromStatus, to: "UNPUBLISHING" },
    ip,
  });
  await writeAudit({
    ...actor,
    action: "DOSSIER_STATUS_CHANGED",
    entityType: "PersonRecord",
    entityId: id,
    metadata: { from: fromStatus, to: "UNPUBLISHING" },
    ip,
  });

  return jsonOk({
    publication: {
      slug: dossier.publication.slug,
      state: "UNPUBLISHED",
      unpublishedAt: now.toISOString(),
    },
    dossierStatus: "UNPUBLISHING",
    note: "Le profil n'est plus visible publiquement. Le dossier peut être archivé (PATCH statut ARCHIVED) ou repositionné.",
  });
});
