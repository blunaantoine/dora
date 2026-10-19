// ---------------------------------------------------------------------------
// POST /api/public/rights-requests — demande de droits d'une personne (§15.3).
//
// Procédure : accès, correction, limitation/retrait de publication, effacement,
// retrait du consentement, signalement d'erreur. Enregistrée, suivie et
// clôturée avec une trace de décision (§15.3 : « Les demandes doivent être
// enregistrées, suivies et clôturées avec une trace de décision »).
//
// Protections :
//   - rate limit strict (publicSubmissionRateLimit) ;
//   - honeypot « siteWeb » : rempli ⇒ 201 silencieux, rien n'est créé ;
//   - zod .strict() ; profil identifié par slug de publication PUBLISHED ou
//     par nom indiqué librement (la personne peut ne pas connaître l'URL) ;
//   - aucune donnée sensible collectée ; contact facultatif, privé.
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, jsonOk, withApi, zodErrorToFields } from "@/lib/api";
import { ipFromHeaders, writeAudit } from "@/lib/audit";
import { publicSubmissionRateLimit } from "@/lib/rate-limit";
import { honeypotFilled, silentSuccessPayload } from "@/lib/public-submissions";
import { RIGHTS_REQUEST_TYPES } from "@/lib/constants";

const schema = z
  .object({
    slug: z.string().trim().max(120).optional(),
    nomProfil: z.string().trim().max(150).optional(),
    type: z.enum(RIGHTS_REQUEST_TYPES, { message: "Choisissez le type de demande." }),
    requesterName: z
      .string()
      .trim()
      .min(2, "Indiquez votre nom (2 caractères au moins).")
      .max(120, "120 caractères maximum."),
    requesterContact: z
      .string()
      .trim()
      .max(200, "200 caractères maximum.")
      .optional()
      .transform((v) => (v && v.length > 0 ? v : undefined)),
    description: z
      .string()
      .trim()
      .min(20, "Décrivez votre demande (20 caractères au moins).")
      .max(3000, "3000 caractères maximum."),
    declaration: z.literal(true, {
      message: "La déclaration de bonne foi est obligatoire.",
    }),
    // Honeypot : champ invisible, doit rester vide.
    siteWeb: z.string().max(200).optional(),
  })
  .strict()
  .refine(
    (value) => Boolean(value.slug?.trim()) || Boolean(value.nomProfil?.trim()),
    { message: "Indiquez la fiche concernée (lien ou nom).", path: ["nomProfil"] },
  );

export const POST = withApi(async (req: NextRequest) => {
  const ip = ipFromHeaders(req.headers) ?? "unknown";

  const limit = publicSubmissionRateLimit(ip);
  if (!limit.allowed) {
    throw ApiError.rateLimited(
      "Trop de soumissions depuis cette connexion. Merci de réessayer plus tard.",
      limit.retryAfterSec ?? 3600,
    );
  }

  const body: unknown = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(
      "Certaines informations de la demande sont invalides.",
      zodErrorToFields(parsed.error),
    );
  }
  const data = parsed.data;

  // Honeypot rempli : succès silencieux, aucune création (§9.3/§11.2).
  if (honeypotFilled(data.siteWeb)) {
    return jsonOk(silentSuccessPayload(), 201);
  }

  // Lien avec le profil publié si le slug est fourni et valide.
  let personId: string | null = null;
  if (data.slug) {
    const publication = await db.profilePublication.findFirst({
      where: { slug: data.slug, state: "PUBLISHED" },
      select: { personId: true },
    });
    // Slug inconnu ou profil non publié : on enregistre quand même la demande
    // (rattachée par le nom libre) — jamais de révélation d'existence.
    personId = publication?.personId ?? null;
  }

  const created = await db.rightsRequest.create({
    data: {
      type: data.type,
      personId,
      requesterName: data.requesterName,
      requesterContact: data.requesterContact ?? null,
      description: data.description,
      status: "RECEIVED",
    },
    select: { id: true, type: true, status: true, createdAt: true },
  });

  await writeAudit({
    actorLabel: "Personne concernée (formulaire droits)",
    action: "RIGHTS_REQUEST_SUBMITTED",
    entityType: "RightsRequest",
    entityId: created.id,
    result: "SUCCESS",
    metadata: { type: created.type, ratachee: personId !== null },
    ip,
  });

  return jsonOk(
    {
      soumis: true,
      message:
        "Votre demande est enregistrée. L'équipe va la traiter ; elle peut vous contacter via le moyen indiqué si nécessaire.",
    },
    201,
  );
});
