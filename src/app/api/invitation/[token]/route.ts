// ---------------------------------------------------------------------------
// GET /api/invitation/[token] — validation du lien privé (consommée par le
// formulaire invité, tâche 3-b).
//
// - Rate limité (invitationRateLimit : 20/h/IP) ;
// - jeton validé par empreinte (statut ACTIVE, non expiré, dossier non
//   verrouillé) — sinon 404 GÉNÉRIQUE sans raison (anti-énumération) ;
// - réponse minimale sans aucune donnée privée superflue : prénom, initiale du
//   nom, genre, minorité calculée, expiration, texte de consentement requis
//   (ADULT_CONSENT ou GUARDIAN_CONSENT selon §14).
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { jsonOk, withApi } from "@/lib/api";
import { guardInvitationApi } from "@/lib/invitation-guard";
import { ipFromHeaders, writeAudit } from "@/lib/audit";
import { CONSENT_CODE_MAJEURE, CONSENT_CODE_MINEURE } from "@/lib/constants";
import { computeEffectiveIsMinor, nameInitial } from "@/lib/person";
import { getActiveConsentText } from "@/lib/consent-texts";

export const GET = withApi<{ token: string }>(async (req: NextRequest, ctx) => {
  const { token } = await ctx.params;
  const { invitation } = await guardInvitationApi(req, token);
  const ip = ipFromHeaders(req.headers);

  const person = invitation.person;

  // Télémétrie d'accès (§6.4) — sans jeton.
  await db.invitation
    .update({
      where: { id: invitation.id },
      data: { accessCount: { increment: 1 }, lastAccessAt: new Date() },
    })
    .catch(() => undefined);

  await writeAudit({
    actorLabel: "Participante (invitation)",
    action: "INVITATION_ACCESSED",
    entityType: "Invitation",
    entityId: invitation.id,
    metadata: { invitationId: invitation.id, personRecordId: person.id },
    ip,
  });

  const estMineure = computeEffectiveIsMinor(person);
  const consentCode = estMineure ? CONSENT_CODE_MINEURE : CONSENT_CODE_MAJEURE;
  const consentText = await getActiveConsentText(consentCode);
  if (!consentText) {
    // Configuration incomplète : signalé côté serveur uniquement, la réponse
    // reste cohérente (consent: null) et ne divulgue rien.
    console.error(`[invitation] Texte de consentement actif introuvable pour le code ${consentCode}`);
  }

  return jsonOk({
    valid: true,
    dossier: {
      prenom: person.givenName ?? person.managementName,
      initialeNom: nameInitial(person.familyName, person.managementName),
      genre: person.gender,
      estMineure,
    },
    invitation: {
      expiresAt: invitation.expiresAt,
    },
    consent: consentText
      ? {
          code: consentText.code,
          version: consentText.version,
          titre: consentText.title,
          texte: consentText.body,
        }
      : null,
  });
});
