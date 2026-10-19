// ---------------------------------------------------------------------------
// POST /api/invitation/[token]/submit — soumission finale du dossier (§7.10).
//
// - Rate limité (invitationRateLimit) ;
// - le dossier passe au statut SUBMITTED via la machine à états (409 si la
//   transition est impossible) ; submittedAt est enregistré ;
// - l'invitation est marquée USED (usedAt) : le lien cesse d'être valide ;
// - le consentement requis (ADULT_CONSENT / GUARDIAN_CONSENT) doit être
//   enregistré avant la soumission (400 sinon) ;
// - quasi-idempotent : nouvelle soumission → 409 (le dossier est déjà soumis) ;
// - audit DOSSIER_SUBMITTED côté serveur, sans jeton ni empreinte.
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ApiError, jsonOk, withApi } from "@/lib/api";
import { ipFromHeaders, writeAudit } from "@/lib/audit";
import { invitationRateLimit } from "@/lib/rate-limit";
import { validateInvitationToken, markInvitationUsed } from "@/lib/tokens";
import { CONSENT_CODE_MAJEURE, CONSENT_CODE_MINEURE } from "@/lib/constants";
import { computeEffectiveIsMinor } from "@/lib/person";
import { advanceDossierStatus } from "@/lib/dossier-status";
import type { DossierStatus } from "@/lib/constants";

const GENERIC_404 = "Lien invalide ou expiré.";

export const POST = withApi<{ token: string }>(async (req: NextRequest, ctx) => {
  const { token } = await ctx.params;
  const ip = ipFromHeaders(req.headers) ?? "unknown";

  const limit = invitationRateLimit(ip);
  if (!limit.allowed) {
    throw ApiError.rateLimited(
      "Trop de tentatives. Merci de patienter avant de réessayer.",
      limit.retryAfterSec,
    );
  }

  const validation = await validateInvitationToken(token);

  if (validation.status === "USED") {
    throw ApiError.conflict("Ce dossier a déjà été soumis. Aucune nouvelle soumission n'est possible.");
  }
  if (validation.status !== "VALID" || !validation.invitation) {
    // Révoqué, expiré, dossier verrouillé ou jeton inconnu : 404 générique.
    throw ApiError.notFound(GENERIC_404);
  }

  const invitation = validation.invitation;
  const person = invitation.person;
  const estMineure = computeEffectiveIsMinor(person);
  const requiredCode = estMineure ? CONSENT_CODE_MINEURE : CONSENT_CODE_MAJEURE;

  // Le consentement de l'étape 1 doit être enregistré avant la soumission.
  const consent = await db.consentRecord.findFirst({
    where: {
      personId: person.id,
      consentText: { code: requiredCode, isActive: true },
    },
    select: { id: true },
  });
  if (!consent) {
    throw ApiError.validation("Le consentement doit être enregistré avant de soumettre le dossier.", {
      consent: ["Le consentement doit être enregistré avant de soumettre le dossier."],
    });
  }

  // Soumission : passage à SUBMITTED via la machine à états uniquement.
  const { status } = await advanceDossierStatus({
    personId: person.id,
    currentStatus: person.status as DossierStatus,
    target: "SUBMITTED",
    actor: { actorLabel: "Participante (invitation)" },
  });

  if (status !== "SUBMITTED") {
    throw ApiError.conflict(
      "La soumission n'est pas possible dans l'état actuel du dossier. Merci de contacter l'équipe.",
    );
  }

  const submittedAt = new Date();
  await db.personRecord.update({
    where: { id: person.id },
    data: { submittedAt },
  });

  await markInvitationUsed(invitation.id);

  await writeAudit({
    actorLabel: "Participante (invitation)",
    action: "DOSSIER_SUBMITTED",
    entityType: "PersonRecord",
    entityId: person.id,
    metadata: { personRecordId: person.id, invitationId: invitation.id },
    ip,
  });

  return jsonOk({
    soumis: true,
    statut: status,
    submittedAt,
    message:
      "Votre dossier a bien été soumis. L'équipe va l'examiner ; vous serez contactée en cas de besoin.",
  });
});
