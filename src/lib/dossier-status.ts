// ---------------------------------------------------------------------------
// Application de la machine à états des dossiers (§5.4) — les statuts sont des
// String en base, la source de vérité est DOSSIER_TRANSITIONS (constants.ts).
//
// Toute transition (manuelle ou automatique) passe obligatoirement par
// canTransition() et produit une entrée d'audit DOSSIER_STATUS_CHANGED avec
// {from, to} — sans jamais journaliser de contenu de dossier.
// ---------------------------------------------------------------------------

import { db } from "@/lib/db";
import {
  DOSSIER_TRANSITIONS,
  canTransition,
  type DossierStatus,
} from "@/lib/constants";
import { ApiError } from "@/lib/api";
import { writeAudit } from "@/lib/audit";

interface TransitionActor {
  actorId?: string | null;
  actorLabel?: string | null;
}

/** Applique une transition unique (déjà validée par canTransition) + audit. */
async function applyTransition(
  personId: string,
  from: DossierStatus,
  to: DossierStatus,
  actor: TransitionActor,
): Promise<void> {
  await db.personRecord.update({
    where: { id: personId },
    data: { status: to },
  });
  await writeAudit({
    actorId: actor.actorId ?? null,
    actorLabel: actor.actorLabel ?? null,
    action: "DOSSIER_STATUS_CHANGED",
    entityType: "PersonRecord",
    entityId: personId,
    metadata: { from, to },
  });
}

/**
 * Fait progresser un dossier vers un statut cible en ne parcourant QUE des
 * transitions autorisées (recherche de chemin dans la machine à états).
 * Utilisé pour l'avancement automatique lié au parcours invité
 * (création d'invitation, première sauvegarde, soumission).
 * Retourne le statut final (inchangé si aucun chemin autorisé n'existe).
 */
export async function advanceDossierStatus(params: {
  personId: string;
  currentStatus: DossierStatus;
  target: DossierStatus;
  actor: TransitionActor;
}): Promise<{ status: DossierStatus; transitionsApplied: number }> {
  const { personId, currentStatus, target, actor } = params;
  if (currentStatus === target) {
    return { status: currentStatus, transitionsApplied: 0 };
  }

  // Recherche en largeur d'un chemin de transitions autorisées.
  const queue: DossierStatus[][] = [[currentStatus]];
  const seen = new Set<DossierStatus>([currentStatus]);
  let path: DossierStatus[] | null = null;

  while (queue.length > 0) {
    const candidate = queue.shift()!;
    const last = candidate[candidate.length - 1];
    if (last === target) {
      path = candidate;
      break;
    }
    for (const next of DOSSIER_TRANSITIONS.get(last) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push([...candidate, next]);
      }
    }
  }

  if (!path || path.length < 2) {
    return { status: currentStatus, transitionsApplied: 0 };
  }

  let status = currentStatus;
  for (let index = 1; index < path.length; index += 1) {
    const to = path[index];
    if (!canTransition(status, to)) {
      // Ne devrait jamais arriver (chemin issu de la machine) — garde stricte.
      break;
    }
    await applyTransition(personId, status, to, actor);
    status = to;
  }
  return { status, transitionsApplied: path.length - 1 };
}

/**
 * Transition manuelle (PATCH admin) : un seul saut, refus 409 si la machine
 * à états l'interdit. Le refus est journalisé (result=DENIED).
 */
export async function manualDossierTransition(params: {
  personId: string;
  from: DossierStatus;
  to: DossierStatus;
  actor: TransitionActor;
}): Promise<void> {
  const { personId, from, to, actor } = params;
  if (!canTransition(from, to)) {
    await writeAudit({
      actorId: actor.actorId ?? null,
      actorLabel: actor.actorLabel ?? null,
      action: "DOSSIER_STATUS_CHANGED",
      entityType: "PersonRecord",
      entityId: personId,
      result: "DENIED",
      metadata: { from, to, raison: "transition non autorisée par la machine à états" },
    });
    throw ApiError.conflict(
      `Changement de statut impossible : la transition « ${from} → ${to} » n'est pas autorisée.`,
    );
  }
  await applyTransition(personId, from, to, actor);
}
