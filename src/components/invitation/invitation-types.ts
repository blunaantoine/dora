// ---------------------------------------------------------------------------
// Types et helpers partagés du formulaire d'invitation (§7) — consommés par
// les composants clients de src/components/invitation/.
// Les clés et limites proviennent du contrat réel : src/lib/invitation-draft.ts
// et src/lib/constants.ts (aucun champ inventé).
// ---------------------------------------------------------------------------

import type { DraftTextFieldKey } from "@/lib/invitation-draft";

/** Réponse de GET /api/invitation/[token] (validation + notice de consentement). */
export interface InvitationIntroData {
  dossier: {
    prenom: string;
    initialeNom: string;
    genre: string;
    estMineure: boolean;
  };
  invitation: { expiresAt: string };
  consent: { code: string; version: number; titre: string; texte: string } | null;
}

export interface MediaItem {
  id: string;
  kind: string;
  status: string;
  sizeBytes: number;
  uploadedAt: string;
  width?: number | null;
  height?: number | null;
}

/** Réponse de GET /api/invitation/[token]/state (reprise de brouillon, §7.1). */
export interface InvitationStateData {
  dossier: Record<DraftTextFieldKey, string | null> & {
    statut: string;
    estMineure: boolean;
  };
  contacts: { phone: string | null; email: string | null; contactPreference: string | null };
  initiatives: Array<{
    id: string;
    title: string;
    description: string | null;
    periodLabel: string | null;
    actionArea: string | null;
    beneficiaries: string | null;
    rolePlayed: string | null;
    partners: string | null;
    objectives: string | null;
    results: string | null;
    resultsType: string | null;
    evidence: string | null;
    difficulties: string | null;
    learnings: string | null;
    projectState: string | null;
  }>;
  media: MediaItem[];
  consent: { accepte: boolean; code?: string; version?: number; acceptedAt?: string };
  invitation: { expiresAt: string };
}

/** Valeurs locales (chaînes vides autorisées — converties en null à l'envoi). */
export type TextFieldValues = Record<DraftTextFieldKey, string>;

export interface ContactValues {
  phone: string;
  email: string;
  contactPreference: string;
}

export interface InitiativeValues {
  uid: string;
  title: string;
  description: string;
  periodLabel: string;
  actionArea: string;
  beneficiaries: string;
  rolePlayed: string;
  partners: string;
  objectives: string;
  results: string;
  resultsType: string; // "" | OBSERVED | ESTIMATED | GOAL
  evidence: string;
  difficulties: string;
  learnings: string;
  projectState: string; // "" | PLANNED | ONGOING | COMPLETED
}

export interface FormValues {
  fields: TextFieldValues;
  contacts: ContactValues;
  initiatives: InitiativeValues[];
  media: MediaItem[];
}

/** Les 9 étapes du formulaire (§7.2 à §7.10). */
export const FORM_STEPS = [
  { key: "consentement", label: "Consentement" },
  { key: "presentation", label: "Identité et présentation" },
  { key: "parcours", label: "Parcours personnel" },
  { key: "carriere", label: "Parcours scolaire et professionnel" },
  { key: "initiatives", label: "Engagement et initiatives" },
  { key: "vision", label: "Vision et projets futurs" },
  { key: "medias", label: "Médias et justificatifs" },
  { key: "publication", label: "Choix de publication" },
  { key: "soumission", label: "Vérification et soumission" },
] as const;

/** Étapes dont les champs sont enregistrés via PUT /draft (les autres naviguent). */
export const SAVABLE_STEPS: readonly number[] = [1, 2, 3, 4, 5];

/** Convertit "" en null (contrat serveur : chaîne vide → null). */
export function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

const frDateLong = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });
const frDateTime = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

/** « 12 mars 2025 » */
export function formatFrDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return frDateLong.format(date);
}

/** « 12 mars 2025 à 14:30 » */
export function formatFrDateTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return frDateTime.format(date);
}

/** Taille lisible : « 34 Ko » / « 1,2 Mo ». */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 Ko";
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

/** Réduit Record<string, string[]> (erreurs API) en Record<string, string>. */
export function flattenFields(fields?: Record<string, string[]>): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fields) return out;
  for (const [key, messages] of Object.entries(fields)) {
    if (messages && messages.length > 0 && key !== "retryAfterSec") {
      out[key] = messages[0];
    }
  }
  return out;
}
