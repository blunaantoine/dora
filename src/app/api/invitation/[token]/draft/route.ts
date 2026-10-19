// ---------------------------------------------------------------------------
// PUT /api/invitation/[token]/draft — enregistrement du brouillon étape par
// étape (§7.1 : sauvegarde côté serveur dès que la connexion le permet).
//
// - Rate limité spécifiquement (invitationDraftRateLimit : 120/5 min/IP, car
//   la sauvegarde automatique est fréquente) ;
// - jeton validé, sinon 404 générique ; invitation inactive refusée ;
// - schéma zod STRICT par champ + liste blanche : parcours, initiatives,
//   motivations, présentation, localisation et contacts PRIVÉS (vers
//   PersonPrivateData) — jamais les champs système (statut, identité,
//   minorité, catégorie) ;
// - `initiatives` (si présent) remplace l'ensemble des initiatives du dossier
//   (sémantique idempotente, adaptée à la sauvegarde automatique) ;
// - met updatedAt à jour ; fait progresser le dossier vers IN_PROGRESS via la
//   machine à états (chaque transition auditée). La sauvegarde elle-même n'est
//   PAS journalisée (flux automatique — seules les transitions le sont).
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ApiError, jsonOk, withApi, zodErrorToFields } from "@/lib/api";
import { ipFromHeaders } from "@/lib/audit";
import { invitationDraftRateLimit } from "@/lib/rate-limit";
import { validateInvitationToken } from "@/lib/tokens";
import { DRAFT_FIELD_KEYS, draftSchema } from "@/lib/invitation-draft";
import { advanceDossierStatus } from "@/lib/dossier-status";
import type { DossierStatus } from "@/lib/constants";

const GENERIC_404 = "Lien invalide ou expiré.";

export const PUT = withApi<{ token: string }>(async (req: NextRequest, ctx) => {
  const { token } = await ctx.params;
  const ip = ipFromHeaders(req.headers) ?? "unknown";

  const limit = invitationDraftRateLimit(ip);
  if (!limit.allowed) {
    throw ApiError.rateLimited(
      "Trop d'enregistrements rapprochés. Merci de patienter quelques instants.",
      limit.retryAfterSec,
    );
  }

  const validation = await validateInvitationToken(token);
  if (validation.status !== "VALID" || !validation.invitation) {
    throw ApiError.notFound(GENERIC_404);
  }
  const person = validation.invitation.person;

  const body: unknown = await req.json().catch(() => null);
  const parsed = draftSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation("Certaines informations du formulaire sont invalides.", zodErrorToFields(parsed.error));
  }
  const { contacts, initiatives, ...textFields } = parsed.data;

  // 1. Champs texte (liste blanche, "" → null). Prisma ignore les mises à jour
  //    vides : si aucun champ texte n'est fourni, on « touche » l'enregistrement
  //    en réécrivant son statut courant afin de garantir la mise à jour d'updatedAt.
  const recordData: Record<string, string | null> = {};
  for (const key of DRAFT_FIELD_KEYS) {
    const value = textFields[key];
    if (value !== undefined) {
      recordData[key] = value === "" ? null : value;
    }
  }
  if (Object.keys(recordData).length === 0) {
    recordData.status = person.status;
  }

  const updated = await db.personRecord.update({
    where: { id: person.id },
    data: recordData,
    select: { id: true, status: true, updatedAt: true },
  });

  // 2. Coordonnées privées (upsert — champ à champ).
  if (contacts !== undefined) {
    const privateData: Record<string, string | null> = {};
    if (contacts.phone !== undefined) privateData.phone = contacts.phone === "" ? null : contacts.phone;
    if (contacts.email !== undefined) privateData.email = contacts.email === "" ? null : contacts.email;
    if (contacts.contactPreference !== undefined) {
      privateData.contactPreference = contacts.contactPreference === "" ? null : contacts.contactPreference;
    }
    if (Object.keys(privateData).length > 0) {
      await db.personPrivateData.upsert({
        where: { personId: person.id },
        create: { personId: person.id, ...privateData },
        update: privateData,
      });
    }
  }

  // 3. Initiatives : remplacement complet si la clé est présente.
  if (initiatives !== undefined) {
    const rows = initiatives.map((initiative, index) => ({
      personId: person.id,
      sortOrder: index,
      title: initiative.title,
      description: initiative.description ?? null,
      periodLabel: initiative.periodLabel ?? null,
      actionArea: initiative.actionArea ?? null,
      beneficiaries: initiative.beneficiaries ?? null,
      rolePlayed: initiative.rolePlayed ?? null,
      partners: initiative.partners ?? null,
      objectives: initiative.objectives ?? null,
      results: initiative.results ?? null,
      resultsType: initiative.resultsType ?? null,
      evidence: initiative.evidence ?? null,
      difficulties: initiative.difficulties ?? null,
      learnings: initiative.learnings ?? null,
      projectState: initiative.projectState ?? null,
    }));
    await db.$transaction(async (tx) => {
      await tx.initiative.deleteMany({ where: { personId: person.id } });
      if (rows.length > 0) {
        await tx.initiative.createMany({ data: rows });
      }
    });
  }

  // 4. Avancement du dossier vers « En cours de remplissage » via la machine
  //    à états (INVITATION_CREATED → INVITATION_SENT → IN_PROGRESS si besoin).
  const { status } = await advanceDossierStatus({
    personId: person.id,
    currentStatus: updated.status as DossierStatus,
    target: "IN_PROGRESS",
    actor: { actorLabel: "Participante (invitation)" },
  });

  return jsonOk({
    saved: true,
    statut: status,
    updatedAt: updated.updatedAt,
  });
});
