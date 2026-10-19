// ---------------------------------------------------------------------------
// POST /api/public/nominations — proposition publique d'une nouvelle personne
// (§11.1, §11.2).
//
// Garde-fous :
//   - rate limit strict : publicSubmissionRateLimit (5/h/IP) ;
//   - honeypot « siteWeb » : rempli ⇒ 201 succès SILENCIEUX, rien n'est créé ;
//   - zod .strict() ; sourceUrl : URL http(s) facultative ;
//   - declaration (bonne foi) obligatoire ;
//   - catégorie validée contre les catégories ACTIVES (slug) ;
//   - détection de doublons SIMPLE (documentée) :
//       1. un PersonRecord dont publicName (ou givenName+familyName) est
//          « similaire » — comparaison insensible à la casse/accents en JS
//          (SQLite/Prisma ne supporte pas mode:"insensitive") ;
//       2. une Nomination créée depuis moins de 30 jours au même nom de
//          personne (normalisation identique).
//     En cas de doublon : statut POTENTIAL_DUPLICATE (+ duplicateOfPersonId
//     si un dossier correspond) — le visiteur reçoit exactement le MÊME
//     message de confirmation dans tous les cas (aucune fuite interne).
//   - la proposition n'est JAMAIS publique ; l'acceptation ne publie rien et
//     ne déclenche aucune invitation (§11.2).
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, jsonOk, withApi, zodErrorToFields } from "@/lib/api";
import { ipFromHeaders, writeAudit } from "@/lib/audit";
import { publicSubmissionRateLimit } from "@/lib/rate-limit";
import { honeypotFilled, nameContains, normalizeName, silentSuccessPayload } from "@/lib/public-submissions";

const nominationSchema = z
  .object({
    nomPersonne: z
      .string()
      .trim()
      .min(2, "Le nom de la personne doit contenir au moins 2 caractères.")
      .max(120, "Le nom de la personne ne peut pas dépasser 120 caractères."),
    domaine: z
      .string()
      .trim()
      .min(1, "Le domaine d'engagement est obligatoire.")
      .max(120),
    presentation: z
      .string()
      .trim()
      .min(30, "La présentation doit contenir au moins 30 caractères.")
      .max(3000, "La présentation ne peut pas dépasser 3000 caractères."),
    raison: z
      .string()
      .trim()
      .min(30, "La raison de la proposition doit contenir au moins 30 caractères.")
      .max(3000, "La raison ne peut pas dépasser 3000 caractères."),
    sourceUrl: z
      .url("Lien invalide : utilisez une adresse http(s) complète.")
      .max(500, "Le lien ne peut pas dépasser 500 caractères.")
      .refine((value) => value.startsWith("http://") || value.startsWith("https://"), {
        message: "Seuls les liens http(s) sont acceptés.",
      })
      .optional()
      .or(z.literal("").transform(() => undefined)),
    nomProposant: z
      .string()
      .trim()
      .max(120, "Le nom du proposant ne peut pas dépasser 120 caractères.")
      .optional()
      .transform((v) => (v && v.length > 0 ? v : undefined)),
    contactProposant: z
      .string()
      .trim()
      .max(200, "Le contact ne peut pas dépasser 200 caractères.")
      .optional()
      .transform((v) => (v && v.length > 0 ? v : undefined)),
    declaration: z.literal(true, {
      message: "La déclaration de bonne foi est obligatoire.",
    }),
    // Honeypot : champ invisible, doit rester vide.
    siteWeb: z.string().max(200).optional(),
  })
  .strict();

/** Fenêtre de détection de doublon sur les propositions récentes (§11.2). */
const DUPLICATE_WINDOW_DAYS = 30;

export const POST = withApi(async (req: NextRequest) => {
  const ip = ipFromHeaders(req.headers) ?? "unknown";

  const limit = publicSubmissionRateLimit(ip);
  if (!limit.allowed) {
    throw ApiError.rateLimited(
      "Trop de soumissions depuis cette connexion. Merci de réessayer plus tard.",
      limit.retryAfterSec,
    );
  }

  const body: unknown = await req.json().catch(() => null);
  const parsed = nominationSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(
      "Certaines informations de la proposition sont invalides.",
      zodErrorToFields(parsed.error),
    );
  }

  // Honeypot rempli : succès silencieux, aucune création.
  if (honeypotFilled(parsed.data.siteWeb)) {
    return jsonOk(silentSuccessPayload(), 201);
  }

  const { nomPersonne, domaine, presentation, raison, sourceUrl, nomProposant, contactProposant } =
    parsed.data;

  // Catégorie : slug d'une catégorie ACTIVE obligatoire (§4.3).
  const category = await db.category.findUnique({
    where: { slug: domaine },
    select: { id: true, name: true, isActive: true },
  });
  if (!category || !category.isActive) {
    throw ApiError.validation("Domaine d'engagement inconnu.", {
      domaine: ["Choisissez un domaine d'engagement dans la liste."],
    });
  }

  // --- Détection de doublons SIMPLE (voir en-tête) ---------------------------
  let duplicateOfPersonId: string | null = null;
  let isDuplicate = false;

  const candidatePersons = await db.personRecord.findMany({
    // Hors dossiers ARCHIVED : un dossier archivé ne constitue pas un doublon
    // bloquant (il n'est ni publié ni en cours).
    where: { status: { not: "ARCHIVED" } },
    select: { id: true, publicName: true, givenName: true, familyName: true },
  });
  for (const person of candidatePersons) {
    const matchesPublicName = nameContains(person.publicName, nomPersonne);
    const matchesGiven = nameContains(person.givenName, nomPersonne);
    const combined = person.givenName && person.familyName
      ? normalizeName(`${person.givenName} ${person.familyName}`)
      : "";
    const matchesCombined =
      combined.length > 0 && combined.includes(normalizeName(nomPersonne));
    if (matchesPublicName || matchesGiven || matchesCombined) {
      duplicateOfPersonId = person.id;
      isDuplicate = true;
      break;
    }
  }

  if (!isDuplicate) {
    const since = new Date(Date.now() - DUPLICATE_WINDOW_DAYS * 24 * 60 * 60_000);
    const recentNominations = await db.nomination.findMany({
      where: { createdAt: { gte: since } },
      select: { id: true, nomineePublicName: true },
    });
    const normalizedInput = normalizeName(nomPersonne);
    isDuplicate = recentNominations.some(
      (nomination) => normalizeName(nomination.nomineePublicName) === normalizedInput,
    );
  }

  const created = await db.nomination.create({
    data: {
      nomineePublicName: nomPersonne,
      categoryId: category.id,
      presentation,
      reason: raison,
      ...(sourceUrl ? { sourceUrl } : {}),
      ...(nomProposant ? { proposerName: nomProposant } : {}),
      ...(contactProposant ? { proposerContact: contactProposant } : {}),
      goodFaith: true,
      status: isDuplicate ? "POTENTIAL_DUPLICATE" : "NEW",
      duplicateOfPersonId,
    },
    select: { id: true, status: true },
  });

  await writeAudit({
    actorLabel: nomProposant ? "Visiteur (public, proposant nommé)" : "Visiteur (public)",
    action: "NOMINATION_SUBMITTED",
    entityType: "Nomination",
    entityId: created.id,
    metadata: {
      nominationId: created.id,
      statut: created.status,
      doublon: isDuplicate,
      // Volontairement SANS contactProposant (donnée privée, §15).
    },
    ip,
  });

  return jsonOk(
    {
      soumis: true,
      message:
        "Merci pour votre proposition. L'équipe va l'examiner : accepter une proposition ne publie jamais automatiquement une personne, elle vérifie d'abord son identité et la pertinence du dossier avant toute invitation.",
    },
    201,
  );
});
