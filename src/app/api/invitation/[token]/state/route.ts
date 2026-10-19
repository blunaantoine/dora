// ---------------------------------------------------------------------------
// GET /api/invitation/[token]/state — état du brouillon du dossier pour reprise
// du formulaire (§7.1 : reprise après fermeture du navigateur).
//
// - Rate limité (invitationRateLimit) ; 404 générique si jeton invalide ;
// - renvoie les champs remplis du dossier (liste blanche), les coordonnées
//   privées saisies par la participante, les initiatives, l'état du
//   consentement et la liste des médias existants (id, type, statut, taille —
//   AUCUNE URL, AUCUN chemin de stockage).
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ApiError, jsonOk, withApi } from "@/lib/api";
import { guardInvitationApi } from "@/lib/invitation-guard";
import { CONSENT_CODE_MAJEURE, CONSENT_CODE_MINEURE } from "@/lib/constants";
import { computeEffectiveIsMinor } from "@/lib/person";
import { serializeDraftRecord } from "@/lib/invitation-draft";

export const GET = withApi<{ token: string }>(async (req: NextRequest, ctx) => {
  const { token } = await ctx.params;
  const { invitation } = await guardInvitationApi(req, token);

  const person = await db.personRecord.findUnique({
    where: { id: invitation.person.id },
    select: {
      ...{
        publicName: true,
        shortPresentation: true,
        biography: true,
        country: true,
        region: true,
        city: true,
        languages: true,
        storyJourney: true,
        engagementMotivation: true,
        keyEvent: true,
        difficultiesEncountered: true,
        lessonsLearned: true,
        inspirationSource: true,
        education: true,
        professionalExperience: true,
        responsibilities: true,
        organizations: true,
        skills: true,
        distinctions: true,
        visionCommunity: true,
        futureGoals: true,
        projectsToDevelop: true,
        supportNeeded: true,
        messageToYouth: true,
      },
      status: true,
      privateData: {
        select: { phone: true, email: true, contactPreference: true },
      },
      initiatives: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          title: true,
          description: true,
          periodLabel: true,
          actionArea: true,
          beneficiaries: true,
          rolePlayed: true,
          partners: true,
          objectives: true,
          results: true,
          resultsType: true,
          evidence: true,
          difficulties: true,
          learnings: true,
          projectState: true,
        },
      },
      media: {
        where: { status: { not: "DELETED" } },
        orderBy: { uploadedAt: "asc" },
        select: {
          id: true,
          kind: true,
          status: true,
          sizeBytes: true,
          uploadedAt: true,
        },
      },
      consents: {
        orderBy: { acceptedAt: "desc" },
        select: { acceptedAt: true, consentText: { select: { code: true, version: true } } },
      },
    },
  });

  if (!person) {
    throw ApiError.notFound("Lien invalide ou expiré.");
  }

  const estMineure = computeEffectiveIsMinor(invitation.person);
  const requiredCode = estMineure ? CONSENT_CODE_MINEURE : CONSENT_CODE_MAJEURE;
  const activeConsent = person.consents.find(
    (entry) => entry.consentText.code === requiredCode,
  );

  return jsonOk({
    dossier: {
      ...serializeDraftRecord(person),
      statut: person.status,
      estMineure,
    },
    contacts: person.privateData
      ? {
          phone: person.privateData.phone ?? null,
          email: person.privateData.email ?? null,
          contactPreference: person.privateData.contactPreference ?? null,
        }
      : { phone: null, email: null, contactPreference: null },
    initiatives: person.initiatives,
    media: person.media,
    consent: activeConsent
      ? {
          accepte: true,
          code: activeConsent.consentText.code,
          version: activeConsent.consentText.version,
          acceptedAt: activeConsent.acceptedAt,
        }
      : { accepte: false },
    invitation: { expiresAt: invitation.expiresAt },
  });
});
