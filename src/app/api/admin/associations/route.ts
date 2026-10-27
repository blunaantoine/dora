// ---------------------------------------------------------------------------
// API admin des associations et ONG partenaires (annuaire /associations).
//
// GET   /api/admin/associations
//       Liste complète (actives ET désactivées) avec leurs domaines.
//
// POST  /api/admin/associations
//       Création : { name, acronym?, mission, domainSlugs[], city?, region?,
//       website?, email?, phone?, membershipOpen, membershipInfo? }
//       Slug généré automatiquement depuis le nom (unicité garantie).
//
// PATCH /api/admin/associations?id=…
//       Édition des mêmes champs + activation / désactivation (isActive).
//       Aucune suppression : une organisation se désactive, jamais elle
//       n'efface l'historique (traçabilité, cf. catégories).
//
// Permission : MANAGE_PARTNERS (ADMIN et EDITOR — voir permissions.ts).
// ---------------------------------------------------------------------------

import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, jsonOk, withApi, zodErrorToFields } from "@/lib/api";
import { guardAdminApi } from "@/lib/admin-guard";
import { ipFromHeaders, writeAudit } from "@/lib/audit";
import { generateUniquePartnerSlug } from "@/lib/slug";

const httpUrlSchema = z
  .string()
  .trim()
  .url("L'adresse du site web doit être une URL valide.")
  .max(200)
  .refine((value) => value.startsWith("http://") || value.startsWith("https://"), {
    message: "L'adresse du site web doit commencer par http:// ou https://.",
  });

const organizationFields = {
  name: z
    .string()
    .trim()
    .min(2, "Le nom doit contenir au moins 2 caractères.")
    .max(120, "120 caractères maximum."),
  acronym: z.string().trim().max(20, "20 caractères maximum.").optional().or(z.literal("")),
  mission: z
    .string()
    .trim()
    .min(20, "La mission doit contenir au moins 20 caractères.")
    .max(1500, "1500 caractères maximum."),
  domainSlugs: z
    .array(z.string().trim().min(1).max(80))
    .min(1, "Sélectionnez au moins un domaine d'intervention.")
    .max(4, "4 domaines maximum."),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  region: z.string().trim().max(80).optional().or(z.literal("")),
  website: httpUrlSchema.optional().or(z.literal("")),
  email: z.string().trim().email("Adresse e-mail invalide.").max(160).optional().or(z.literal("")),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[+0-9 ().-]+$/, "Le numéro ne peut contenir que des chiffres et + ( ) . -")
    .optional()
    .or(z.literal("")),
  membershipOpen: z.boolean(),
  membershipInfo: z.string().trim().max(1000, "1000 caractères maximum.").optional().or(z.literal("")),
};

const createSchema = z.object(organizationFields).strict();

const updateSchema = z
  .object({ ...organizationFields, isActive: z.boolean() })
  .strict();

/** Champs optionnels : chaîne vide → null. */
function optional(value: string | undefined): string | null {
  return value && value !== "" ? value : null;
}

/** Valide que tous les slugs de domaine existent et sont actifs. */
async function resolveDomains(slugs: string[]) {
  const unique = [...new Set(slugs)];
  const found = await db.category.findMany({
    where: { slug: { in: unique }, isActive: true },
    select: { id: true, slug: true, name: true },
  });
  if (found.length !== unique.length) {
    throw ApiError.validation("Certaines informations sont invalides.", {
      domainSlugs: ["Un ou plusieurs domaines sélectionnés n'existent pas ou ne sont plus actifs."],
    });
  }
  return found;
}

function serialize(org: {
  id: string;
  name: string;
  acronym: string | null;
  slug: string;
  mission: string;
  city: string | null;
  region: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  membershipOpen: boolean;
  membershipInfo: string | null;
  isActive: boolean;
  sortOrder: number;
  domains: { slug: string; name: string }[];
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: org.id,
    name: org.name,
    acronym: org.acronym,
    slug: org.slug,
    mission: org.mission,
    city: org.city,
    region: org.region,
    website: org.website,
    email: org.email,
    phone: org.phone,
    membershipOpen: org.membershipOpen,
    membershipInfo: org.membershipInfo,
    isActive: org.isActive,
    sortOrder: org.sortOrder,
    domains: org.domains.map((d) => ({ slug: d.slug, name: d.name })),
    createdAt: org.createdAt.toISOString(),
    updatedAt: org.updatedAt.toISOString(),
  };
}

const SELECT_BASE = {
  id: true,
  name: true,
  acronym: true,
  slug: true,
  mission: true,
  city: true,
  region: true,
  website: true,
  email: true,
  phone: true,
  membershipOpen: true,
  membershipInfo: true,
  isActive: true,
  sortOrder: true,
  domains: { orderBy: { sortOrder: "asc" as const }, select: { slug: true, name: true } },
  createdAt: true,
  updatedAt: true,
} as const;

export const GET = withApi(async (req) => {
  await guardAdminApi(req, "MANAGE_PARTNERS");

  const organizations = await db.partnerOrganization.findMany({
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: SELECT_BASE,
  });

  return jsonOk({ organizations: organizations.map(serialize) });
});

export const POST = withApi(async (req) => {
  const session = await guardAdminApi(req, "MANAGE_PARTNERS");
  const ip = ipFromHeaders(req.headers);

  const body: unknown = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation("Certaines informations sont invalides.", zodErrorToFields(parsed.error));
  }
  const data = parsed.data;

  // Unicité du nom (exact) — l'annuaire est public, les doublons brouillent la lecture.
  const duplicate = await db.partnerOrganization.findFirst({
    where: { name: { equals: data.name } },
    select: { id: true, name: true },
  });
  if (duplicate) {
    throw ApiError.conflict(`Une organisation nommée « ${duplicate.name} » existe déjà.`);
  }

  const domains = await resolveDomains(data.domainSlugs);
  const slug = await generateUniquePartnerSlug(data.name);

  // sortOrder : après la dernière organisation existante.
  const last = await db.partnerOrganization.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const created = await db.partnerOrganization.create({
    data: {
      name: data.name,
      acronym: optional(data.acronym),
      slug,
      mission: data.mission,
      city: optional(data.city),
      region: optional(data.region),
      website: optional(data.website),
      email: optional(data.email),
      phone: optional(data.phone),
      membershipOpen: data.membershipOpen,
      membershipInfo: optional(data.membershipInfo),
      isActive: true,
      sortOrder: (last?.sortOrder ?? 0) + 1,
      domains: { connect: domains.map((d) => ({ id: d.id })) },
    },
    select: SELECT_BASE,
  });

  await writeAudit({
    actorId: session.user.id,
    actorLabel: session.user.email ?? session.user.name ?? undefined,
    action: "PARTNER_CREATED",
    entityType: "PartnerOrganization",
    entityId: created.id,
    metadata: { name: created.name, membershipOpen: created.membershipOpen },
    ip,
  });

  return jsonOk({ organization: serialize(created) }, 201);
});

export const PATCH = withApi(async (req) => {
  const session = await guardAdminApi(req, "MANAGE_PARTNERS");
  const ip = ipFromHeaders(req.headers);

  const id = new URL(req.url).searchParams.get("id")?.trim() ?? "";
  if (!id) {
    throw ApiError.validation("Identifiant manquant.", { id: ["Indiquez l'organisation à modifier."] });
  }

  const body: unknown = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation("Certaines informations sont invalides.", zodErrorToFields(parsed.error));
  }
  const data = parsed.data;

  const existing = await db.partnerOrganization.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!existing) throw ApiError.notFound("Organisation introuvable.");

  // Unicité du nom, en excluant l'organisation modifiée.
  const duplicate = await db.partnerOrganization.findFirst({
    where: { name: { equals: data.name }, id: { not: id } },
    select: { id: true, name: true },
  });
  if (duplicate) {
    throw ApiError.conflict(`Une autre organisation est déjà nommée « ${duplicate.name} ».`);
  }

  const domains = await resolveDomains(data.domainSlugs);

  const updated = await db.partnerOrganization.update({
    where: { id },
    data: {
      name: data.name,
      acronym: optional(data.acronym),
      mission: data.mission,
      city: optional(data.city),
      region: optional(data.region),
      website: optional(data.website),
      email: optional(data.email),
      phone: optional(data.phone),
      membershipOpen: data.membershipOpen,
      membershipInfo: optional(data.membershipInfo),
      isActive: data.isActive,
      domains: { set: domains.map((d) => ({ id: d.id })) },
    },
    select: SELECT_BASE,
  });

  await writeAudit({
    actorId: session.user.id,
    actorLabel: session.user.email ?? session.user.name ?? undefined,
    action: "PARTNER_UPDATED",
    entityType: "PartnerOrganization",
    entityId: updated.id,
    metadata: {
      name: updated.name,
      isActive: updated.isActive,
      membershipOpen: updated.membershipOpen,
    },
    ip,
  });

  return jsonOk({ organization: serialize(updated) });
});
