// ---------------------------------------------------------------------------
// Utilitaires des soumissions PUBLIQUES (§9 témoignages, §11 propositions) —
// tâche 5-a. Aucune donnée de contact du proposant n'est jamais renvoyée au
// public ; ces helpers servent uniquement côté serveur.
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";

/**
 * Honeypot anti-spam (décision D5) : champ « siteWeb » présent dans le HTML
 * mais invisible pour un humain (aria-hidden + off-screen). Un remplissage
 * non vide signale un robot : la requête aboutit avec une réponse de SUCCÈS
 * identique (200 OK) mais RIEN n'est créé — rejet silencieux, aucune
 * information utile retournée aux bots.
 */
export function honeypotFilled(raw: unknown): boolean {
  return typeof raw === "string" && raw.trim().length > 0;
}

/**
 * Réponse de succès « silencieuse » pour un envoi rejeté par le honeypot :
 * forme strictement identique à une vraie soumission (statut, enveloppe JSON,
 * message) pour ne pas aider les robots à sonder les défenses.
 */
export function silentSuccessPayload(): {
  soumis: true;
  message: string;
} {
  return {
    soumis: true,
    message:
      "Merci, votre contribution a bien été transmise. Elle sera relue par l'équipe avant toute publication.",
  };
}

/** Normalise un nom pour la comparaison : minuscules, accents retirés, espaces réduits. */
export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Contenance insensible (SQLite/Prisma ne supporte pas mode:"insensitive"). */
export function nameContains(haystack: string | null | undefined, needle: string): boolean {
  if (!haystack) return false;
  const h = normalizeName(haystack);
  const n = normalizeName(needle);
  return h.length > 0 && n.length > 0 && h.includes(n);
}

export interface SplitNameResult {
  givenName: string | null;
  familyName: string | null;
}

/**
 * Découpage heuristique d'un nom public « Prénom Nom » (§11.2 : le dossier
 * DRAFT pré-rempli est toujours relu par l'équipe). Premier segment = prénom,
 * reste = nom. Un seul mot → prénom seul.
 */
export function splitPublicName(raw: string): SplitNameResult {
  const parts = raw.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return { givenName: null, familyName: null };
  if (parts.length === 1) return { givenName: parts[0]!, familyName: null };
  return {
    givenName: parts[0]!,
    familyName: parts.slice(1).join(" "),
  };
}

/** Empreinte IP (SHA-256) pour la détection de soumissions répétées (§9.3) — l'IP brute n'est jamais stockée. */
export function ipHashOf(ip: string): string {
  return createHash("sha256").update(`dora-ip:${ip}`).digest("hex");
}
