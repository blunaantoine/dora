// ---------------------------------------------------------------------------
// Jetons d'invitation privée (§6) — sécurité :
//   - génération CSPRNG (node:crypto randomBytes(32) = 256 bits d'entropie) ;
//   - encodage base64url (~43 caractères, sans `+`, `/` ni `=`, sûr dans une URL) ;
//   - en base, SEULE l'empreinte SHA-256 (hex) est stockée : le jeton brut
//     n'apparaît ni dans la base, ni dans les réponses multiples, ni dans les
//     journaux (le filtre de sanitizeMetadata supprime de toute façon les clés
//     token/tokenHash) ;
//   - le lookup se fait uniquement par empreinte : impossible de retrouver un
//     jeton depuis la base (anti-exfiltration).
// ---------------------------------------------------------------------------

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { DOSSIER_FORM_OPEN_STATUSES, type DossierStatus } from "@/lib/constants";

/** Nombre d'octets d'entropie du jeton (§6.1 : au moins 256 bits). */
const TOKEN_BYTES = 32;

/** Génère un jeton CSPRNG encodé en base64url (~43 caractères). */
export function generateInvitationToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** Empreinte SHA-256 hexadécimale d'un jeton (valeur seule stockée en base). */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Génère un couple jeton brut + empreinte (la brut n'est montrée qu'une fois). */
export function createInvitationToken(): { token: string; hash: string } {
  const token = generateInvitationToken();
  return { token, hash: hashToken(token) };
}

/**
 * Comparaison en temps constant de deux empreintes (évite les attaques temporelles).
 */
export function hashesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Recherche d'une invitation par empreinte de jeton (requête Prisma sur
 * Invitation.tokenHash). Retourne l'invitation avec son dossier associé, ou null.
 */
export async function lookupInvitationByToken(hash: string) {
  if (!/^[0-9a-f]{64}$/i.test(hash)) return null; // empreinte invalide → aucune recherche
  return db.invitation.findUnique({
    where: { tokenHash: hash.toLowerCase() },
    include: {
      person: {
        select: {
          id: true,
          status: true,
          givenName: true,
          familyName: true,
          managementName: true,
          publicName: true,
          gender: true,
          birthYear: true,
          isMinor: true,
        },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Validation d'un jeton entrant (API publique + page serveur)
// ---------------------------------------------------------------------------

export type InvitationTokenStatus =
  | "VALID"
  | "UNKNOWN"
  | "REVOKED"
  | "USED"
  | "EXPIRED"
  | "DOSSIER_LOCKED";

export interface InvitationValidation {
  status: InvitationTokenStatus;
  invitation: Awaited<ReturnType<typeof lookupInvitationByToken>> | null;
}

/**
 * Valide un jeton d'invitation : empreinte connue, statut ACTIVE, non expiré,
 * dossier non verrouillé (statuts DOSSIER_FORM_OPEN_STATUSES).
 *
 * Renvoie toujours un objet diagnostic interne — l'API publique ne doit
 * JAMAIS exposer la raison précise (404 générique anti-énumération, §6.2) :
 * seul `status === "VALID"` autorise l'accès.
 */
export async function validateInvitationToken(token: string): Promise<InvitationValidation> {
  const hash = hashToken(token);
  const invitation = await lookupInvitationByToken(hash);

  if (!invitation) return { status: "UNKNOWN", invitation: null };
  if (invitation.status === "REVOKED") return { status: "REVOKED", invitation };
  if (invitation.status === "USED") return { status: "USED", invitation };
  if (invitation.expiresAt.getTime() <= Date.now()) return { status: "EXPIRED", invitation };

  const personStatus = invitation.person.status as DossierStatus;
  if (!(DOSSIER_FORM_OPEN_STATUSES as readonly string[]).includes(personStatus)) {
    return { status: "DOSSIER_LOCKED", invitation };
  }

  return { status: "VALID", invitation };
}

/** Le jeton donne-t-il accès au formulaire (toutes conditions réunies) ? */
export function isInvitationUsable(validation: InvitationValidation): boolean {
  return validation.status === "VALID";
}

/**
 * Marque une invitation comme utilisée (soumission du dossier) si ce n'est
 * pas déjà fait. Retourne true si la mise à jour a eu lieu.
 */
export async function markInvitationUsed(invitationId: string): Promise<boolean> {
  const existing = await db.invitation.findUnique({
    where: { id: invitationId },
    select: { status: true, usedAt: true },
  });
  if (!existing || existing.status === "USED") return false;
  await db.invitation.update({
    where: { id: invitationId },
    data: { status: "USED", usedAt: new Date() },
  });
  return true;
}
