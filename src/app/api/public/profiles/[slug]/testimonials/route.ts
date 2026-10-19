// ---------------------------------------------------------------------------
// POST /api/public/profiles/[slug]/testimonials — proposition de témoignage
// par un visiteur (§9.1).
//
// Garde-fous :
//   - profil PUBLISHED obligatoire (state PUBLISHED + statut PUBLISHED),
//     sinon 404 générique anti-énumération (rien ne transpire) ;
//   - fonctionnalité interruptible : setting TESTIMONIALS_ENABLED=false
//     ⇒ 404 (le formulaire public n'est pas non plus affiché) ;
//   - rate limit strict : publicSubmissionRateLimit (5/h/IP) ;
//   - honeypot « siteWeb » : rempli ⇒ 201 OK de succès SILENCIEUX, rien
//     n'est créé (rejet indistinguable d'un succès pour un robot) ;
//   - zod .strict() : aucun champ superflu accepté ;
//   - statut initial PENDING : JAMAIS affiché avant approbation (§9.1) ;
//   - IP stockée uniquement en empreinte SHA-256 (détection de soumissions
//     répétées §9.3 — jamais une preuve d'identité) ;
//   - audit TESTIMONIAL_SUBMITTED sans les coordonnées (contact absent des
//     métadonnées, jamais dans le HTML public).
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, jsonOk, withApi, zodErrorToFields } from "@/lib/api";
import { ipFromHeaders, writeAudit } from "@/lib/audit";
import { publicSubmissionRateLimit } from "@/lib/rate-limit";
import { getSetting } from "@/lib/settings";
import { honeypotFilled, ipHashOf, silentSuccessPayload } from "@/lib/public-submissions";

const testimonialSchema = z
  .object({
    nomPublic: z
      .string()
      .trim()
      .min(2, "Le nom public (ou pseudonyme) doit contenir au moins 2 caractères.")
      .max(80, "Le nom public ne peut pas dépasser 80 caractères."),
    contenu: z
      .string()
      .trim()
      .min(30, "Le témoignage doit contenir au moins 30 caractères.")
      .max(2000, "Le témoignage ne peut pas dépasser 2000 caractères."),
    relation: z
      .string()
      .trim()
      .max(120, "La relation ne peut pas dépasser 120 caractères.")
      .optional()
      .transform((v) => (v && v.length > 0 ? v : undefined)),
    contact: z
      .string()
      .trim()
      .max(200, "Le contact ne peut pas dépasser 200 caractères.")
      .optional()
      .transform((v) => (v && v.length > 0 ? v : undefined)),
    declaration: z.literal(true, {
      message: "L'acceptation des règles de publication est obligatoire.",
    }),
    // Honeypot : champ invisible, doit rester vide.
    siteWeb: z.string().max(200).optional(),
  })
  .strict();

export const POST = withApi<{ slug: string }>(async (req: NextRequest, ctx) => {
  const { slug } = await ctx.params;
  const ip = ipFromHeaders(req.headers) ?? "unknown";

  const limit = publicSubmissionRateLimit(ip);
  if (!limit.allowed) {
    throw ApiError.rateLimited(
      "Trop de soumissions depuis cette connexion. Merci de réessayer plus tard.",
      limit.retryAfterSec,
    );
  }

  const body: unknown = await req.json().catch(() => null);
  const parsed = testimonialSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(
      "Certaines informations du témoignage sont invalides.",
      zodErrorToFields(parsed.error),
    );
  }

  // Honeypot rempli : réponse de succès silencieuse, AUCUNE création,
  // AUCUNE information sur le mécanisme (même message, même statut).
  if (honeypotFilled(parsed.data.siteWeb)) {
    return jsonOk(silentSuccessPayload(), 201);
  }

  const enabled = await getSetting("TESTIMONIALS_ENABLED");
  if (enabled === false) {
    throw ApiError.notFound("Ressource introuvable.");
  }

  // Seule cible valable : un profil actuellement publié (double condition,
  // comme la fiche publique). Sinon 404 générique, sans détail.
  const publication = await db.profilePublication.findUnique({
    where: { slug },
    select: {
      id: true,
      state: true,
      person: { select: { id: true, status: true } },
    },
  });
  if (
    !publication ||
    publication.state !== "PUBLISHED" ||
    publication.person.status !== "PUBLISHED"
  ) {
    throw ApiError.notFound("Ressource introuvable.");
  }

  const created = await db.testimonial.create({
    data: {
      personId: publication.person.id,
      authorDisplayName: parsed.data.nomPublic,
      authorContact: parsed.data.contact ?? null, // privé, jamais publié
      relation: parsed.data.relation ?? null,
      content: parsed.data.contenu,
      status: "PENDING",
      ipHash: ipHashOf(ip),
    },
    select: { id: true, status: true },
  });

  await writeAudit({
    actorLabel: "Visiteur (public)",
    action: "TESTIMONIAL_SUBMITTED",
    entityType: "Testimonial",
    entityId: created.id,
    metadata: {
      testimonialId: created.id,
      personRecordId: publication.person.id,
      statut: created.status,
      // Volontairement SANS authorContact (donnée privée, §15).
    },
    ip,
  });

  return jsonOk(
    {
      soumis: true,
      message:
        "Merci pour votre témoignage. Il sera relu par l'équipe avant toute publication.",
    },
    201,
  );
});
