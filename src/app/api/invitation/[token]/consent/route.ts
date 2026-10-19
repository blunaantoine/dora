// ---------------------------------------------------------------------------
// POST /api/invitation/[token]/consent — enregistrement du consentement (§7.2,
// §14). Le dossier n'est PAS soumis ici : la soumission finale est une étape
// séparée (POST /submit).
//
// - Rate limité (invitationRateLimit) ; jeton validé sinon 404 générique ;
// - code de consentement attendu selon la minorité : ADULT_CONSENT (personne
//   majeure) ou GUARDIAN_CONSENT (mineure — nom du tuteur légal requis) ;
// - ConsentRecord versionné (textVersion = version active du ConsentText),
//   avec IP de preuve ; upsert sur le couple (dossier, texte) ;
// - pour une mineure : nom du représentant légal stocké en données privées
//   (PersonPrivateData.guardianName + guardianConsentAt) ;
// - audit CONSENT_RECORDED côté serveur, sans jeton ni empreinte.
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, jsonOk, withApi, zodErrorToFields } from "@/lib/api";
import { guardInvitationApi } from "@/lib/invitation-guard";
import { ipFromHeaders, writeAudit } from "@/lib/audit";
import { CONSENT_CODE_MAJEURE, CONSENT_CODE_MINEURE, type DossierStatus } from "@/lib/constants";
import { computeEffectiveIsMinor } from "@/lib/person";
import { getActiveConsentText } from "@/lib/consent-texts";
import { advanceDossierStatus } from "@/lib/dossier-status";

// `accepte` (sans accent) ou `accepté` (conforme au CDC) sont acceptés.
const rawSchema = z.object({
  consentCode: z.string().trim().min(1).max(40),
  accepte: z.boolean(),
  nomTuteur: z.string().trim().max(150).optional(),
  relationTuteur: z.string().trim().max(100).optional(),
});

export const POST = withApi<{ token: string }>(async (req: NextRequest, ctx) => {
  const { token } = await ctx.params;
  const { invitation } = await guardInvitationApi(req, token);
  const ip = ipFromHeaders(req.headers);

  const rawBody: unknown = await req.json().catch(() => null);
  const normalized =
    rawBody && typeof rawBody === "object"
      ? {
          consentCode: (rawBody as Record<string, unknown>).consentCode,
          accepte:
            (rawBody as Record<string, unknown>).accepte ??
            (rawBody as Record<string, unknown>)["accepté"],
          nomTuteur:
            (rawBody as Record<string, unknown>).nomTuteur,
          relationTuteur:
            (rawBody as Record<string, unknown>).relationTuteur,
        }
      : null;
  const parsed = rawSchema.safeParse(normalized);
  if (!parsed.success) {
    throw ApiError.validation("Consentement invalide.", zodErrorToFields(parsed.error));
  }
  const { consentCode, nomTuteur, relationTuteur } = parsed.data;

  const person = invitation.person;
  const estMineure = computeEffectiveIsMinor(person);
  const expectedCode = estMineure ? CONSENT_CODE_MINEURE : CONSENT_CODE_MAJEURE;

  if (parsed.data.accepte !== true) {
    throw ApiError.validation(
      "Le consentement doit être expressément accepté pour continuer.",
      { accepte: ["Le consentement doit être expressément accepté pour continuer."] },
    );
  }
  if (consentCode !== expectedCode) {
    throw ApiError.validation("Code de consentement inattendu.", {
      consentCode: ["Code de consentement inattendu."],
    });
  }
  if (estMineure && (!nomTuteur || nomTuteur.length < 2)) {
    throw ApiError.validation(
      "Le nom du représentant légal est requis pour une personne mineure.",
      { nomTuteur: ["Le nom du représentant légal est requis pour une personne mineure."] },
    );
  }

  const consentText = await getActiveConsentText(expectedCode);
  if (!consentText) {
    throw new ApiError(
      503,
      "CONSENT_TEXT_UNAVAILABLE",
      "Le texte de consentement n'est pas encore disponible. Merci de réessayer plus tard.",
    );
  }

  const demonstration = JSON.stringify({
    ...(relationTuteur ? { relationTuteur } : {}),
    invitationId: invitation.id,
  });

  // Upsert versionné : le couple (dossier, texte actif) fait foi ; la date et
  // l'IP sont mises à jour à chaque (re)acceptation. Une nouvelle version du
  // texte conduira naturellement à un nouvel enregistrement (nouveau texte).
  const existingRecord = await db.consentRecord.findFirst({
    where: { personId: person.id, consentTextId: consentText.id },
    select: { id: true },
  });
  const consentRecord = existingRecord
    ? await db.consentRecord.update({
        where: { id: existingRecord.id },
        data: { acceptedAt: new Date(), method: "FORM", ip, demonstration },
        select: { id: true, acceptedAt: true, consentTextId: true },
      })
    : await db.consentRecord.create({
        data: {
          personId: person.id,
          consentTextId: consentText.id,
          acceptedAt: new Date(),
          method: "FORM",
          ip,
          demonstration,
        },
        select: { id: true, acceptedAt: true, consentTextId: true },
      });

  if (estMineure && nomTuteur) {
    await db.personPrivateData.upsert({
      where: { personId: person.id },
      create: { personId: person.id, guardianName: nomTuteur, guardianConsentAt: consentRecord.acceptedAt },
      update: { guardianName: nomTuteur, guardianConsentAt: consentRecord.acceptedAt },
    });
  }

  // Avancement : DRAFT → INVITATION_CREATED (sans effet si déjà au-delà).
  await advanceDossierStatus({
    personId: person.id,
    currentStatus: person.status as DossierStatus,
    target: "INVITATION_CREATED",
    actor: { actorLabel: "Participante (invitation)" },
  });

  await writeAudit({
    actorLabel: "Participante (invitation)",
    action: "CONSENT_RECORDED",
    entityType: "PersonRecord",
    entityId: person.id,
    metadata: {
      personRecordId: person.id,
      invitationId: invitation.id,
      consentCode: expectedCode,
      version: consentText.version,
      estMineure,
    },
    ip,
  });

  return jsonOk({
    consent: {
      code: expectedCode,
      version: consentText.version,
      acceptedAt: consentRecord.acceptedAt,
    },
    dossier: { estMineure },
  });
});
