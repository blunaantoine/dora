// ---------------------------------------------------------------------------
// API admin des dossiers (PersonRecord).
//
// GET  /api/admin/dossiers            : liste paginée (filtre statut, recherche
//                                       q sur noms/prénoms, tri updatedAt desc).
// POST /api/admin/dossiers            : création manuelle d'un dossier par
//                                       l'administrateur (statut initial DRAFT).
//
// Permission GET  : MANAGE_DOSSIERS ou REVIEW_DOSSIERS.
// Permission POST : MANAGE_DOSSIERS (ADMIN et EDITOR — pas MODERATOR).
// Toutes les réponses sont en liste blanche : jamais de spread, jamais de
// donnée privée superflue.
// ---------------------------------------------------------------------------

import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, jsonOk, withApi, zodErrorToFields } from "@/lib/api";
import { guardAdminApi } from "@/lib/admin-guard";
import { hasPermission } from "@/lib/permissions";
import { writeAudit, ipFromHeaders } from "@/lib/audit";
import {
  DOSSIER_STATUSES,
  GENDER_VALUES,
  type DossierStatus,
} from "@/lib/constants";
import { computeIsMinorFromDate, computeIsMinorFromYear } from "@/lib/person";

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
            { givenName: { contains: q } },
            { familyName: { contains: q } },
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
        ...(canManage
          ? { managementName: true, givenName: true, familyName: true, gender: true }
          : {}),
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

// --- POST : création manuelle d'un dossier ----------------------------------

const createSchema = z.object({
  nom: z.string().trim().min(1, "Le nom est obligatoire.").max(100),
  prenom: z.string().trim().min(1, "Le prénom est obligatoire.").max(100),
  genre: z.enum(GENDER_VALUES, { message: "Genre attendu : FEMME ou FILLE." }),
  dateNaissance: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format attendu : AAAA-MM-JJ.")
    .optional(),
  anneeNaissance: z.coerce.number().int().min(1900).max(new Date().getFullYear()).optional(),
  contacts: z
    .object({
      phone: z.string().trim().max(40).nullable().optional(),
      email: z.email("Adresse e-mail invalide.").max(200).nullable().optional(),
      contactPreference: z.string().trim().max(60).nullable().optional(),
    })
    .optional(),
  categoryId: z.string().trim().min(1).max(64).nullable().optional(),
}).refine(
  (value) => Boolean(value.dateNaissance) !== Boolean(value.anneeNaissance),
  {
    message: "Renseignez soit la date de naissance, soit l'année de naissance (une seule).",
    path: ["dateNaissance"],
  },
);

export const POST = withApi(async (req) => {
  const session = await guardAdminApi(req, "MANAGE_DOSSIERS");
  const ip = ipFromHeaders(req.headers);

  const body: unknown = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation("Certaines informations du dossier sont invalides.", zodErrorToFields(parsed.error));
  }

  const { nom, prenom, genre, dateNaissance, anneeNaissance, contacts, categoryId } = parsed.data;

  // Catégorie : doit exister si fournie.
  if (categoryId) {
    const category = await db.category.findUnique({ where: { id: categoryId }, select: { id: true } });
    if (!category) {
      throw ApiError.validation("Catégorie introuvable.", { categoryId: ["Catégorie introuvable."] });
    }
  }

  // Naissance : seule l'ANNÉE est conservée (minimisation §14 — la date de
  // naissance complète n'est jamais stockée). La minorité est calculée une
  // fois ici : exacte si la date est fournie, conservatrice sinon.
  let birthYear: number;
  let isMinor: boolean;
  if (dateNaissance) {
    const birthDate = new Date(`${dateNaissance}T00:00:00Z`);
    if (Number.isNaN(birthDate.getTime()) || birthDate.getUTCFullYear() < 1900 || birthDate.getTime() > Date.now()) {
      throw ApiError.validation("Date de naissance invalide.", {
        dateNaissance: ["Date de naissance invalide."],
      });
    }
    birthYear = birthDate.getUTCFullYear();
    isMinor = computeIsMinorFromDate(birthDate);
  } else if (typeof anneeNaissance === "number") {
    birthYear = anneeNaissance;
    isMinor = computeIsMinorFromYear(anneeNaissance);
  } else {
    throw ApiError.validation(
      "Renseignez soit la date de naissance, soit l'année de naissance.",
      { dateNaissance: ["Renseignez soit la date de naissance, soit l'année de naissance."] },
    );
  }

  const created = await db.personRecord.create({
    data: {
      status: "DRAFT",
      managementName: `${prenom} ${nom}`.trim(),
      givenName: prenom,
      familyName: nom,
      gender: genre,
      birthYear,
      isMinor,
      ...(categoryId ? { categoryId } : {}),
      ...(contacts && (contacts.phone || contacts.email || contacts.contactPreference)
        ? {
            privateData: {
              create: {
                ...(contacts.phone ? { phone: contacts.phone } : {}),
                ...(contacts.email ? { email: contacts.email } : {}),
                ...(contacts.contactPreference ? { contactPreference: contacts.contactPreference } : {}),
              },
            },
          }
        : {}),
    },
    select: {
      id: true,
      status: true,
      managementName: true,
      givenName: true,
      familyName: true,
      gender: true,
      birthYear: true,
      isMinor: true,
      categoryId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  await writeAudit({
    actorId: session.user.id,
    actorLabel: session.user.email ?? session.user.name ?? undefined,
    action: "DOSSIER_CREATED",
    entityType: "PersonRecord",
    entityId: created.id,
    metadata: { personRecordId: created.id, isMinor },
    ip,
  });

  return jsonOk({ dossier: created }, 201);
});
