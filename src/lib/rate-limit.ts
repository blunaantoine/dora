// ---------------------------------------------------------------------------
// Limitation de débit en mémoire (anti-spam sans service tiers — décision D5).
// Fenêtre glissante par clé ; les entrées vides sont purgées périodiquement.
// Adapté au déploiement mono-processus (Next.js standalone) documenté au CDC §17.
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();

const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanupAt = Date.now();

function purgeStale(now: number): void {
  lastCleanupAt = now;
  for (const [key, bucket] of buckets) {
    if (bucket.timestamps.length === 0) {
      buckets.delete(key);
      continue;
    }
    // Purge conservatrice : supprime seulement si la plus ancienne trace est
    // plus vieille que la plus grande fenêtre utilisée (15 min).
    if (now - bucket.timestamps[0] > 15 * 60_000) {
      buckets.delete(key);
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Secondes à attendre avant un nouvel essai (0 si autorisé). */
  retryAfterSec: number;
}

/** Fenêtre glissante : `limit` événements par `windowMs` pour `key`. */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  if (now - lastCleanupAt >= CLEANUP_INTERVAL_MS) {
    purgeStale(now);
  }

  const bucket = buckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);

  if (bucket.timestamps.length >= limit) {
    buckets.set(key, bucket);
    const oldest = bucket.timestamps[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  return { allowed: true, remaining: limit - bucket.timestamps.length, retryAfterSec: 0 };
}

// ---------------------------------------------------------------------------
// Profils prêts à l'emploi
// ---------------------------------------------------------------------------

const LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60_000; // 15 minutes
const INVITATION_ATTEMPTS = 20;
const INVITATION_WINDOW_MS = 60 * 60_000; // 1 heure
const INVITATION_DRAFT_ATTEMPTS = 120;
const INVITATION_DRAFT_WINDOW_MS = 5 * 60_000; // 5 minutes (sauvegarde automatique §7.1)
const ADMIN_API_ATTEMPTS = 120;
const ADMIN_API_WINDOW_MS = 60_000; // 1 minute

/**
 * Connexion administrateur : 5 tentatives / 15 min par IP + e-mail.
 * La clé est hachée (SHA-256) pour ne pas conserver IP ni e-mail en clair
 * dans un état global mémoire.
 */
export function loginRateLimit(ip: string, email: string): RateLimitResult {
  const key = createHashKey(`login:${ip}:${email.trim().toLowerCase()}`);
  return rateLimit(key, LOGIN_ATTEMPTS, LOGIN_WINDOW_MS);
}

/** Endpoints d'invitation (accès au lien privé) : 20 accès / heure par IP. */
export function invitationRateLimit(ip: string): RateLimitResult {
  return rateLimit(`invitation:${ip}`, INVITATION_ATTEMPTS, INVITATION_WINDOW_MS);
}

/**
 * Sauvegarde du brouillon invité : 120 requêtes / 5 min par IP. Fenêtre plus
 * souple que invitationRateLimit car le formulaire (§7.1) sauvegarde
 * automatiquement et périodiquement — une limite horaire stricte casserait
 * la reprise et la sauvegarde automatique.
 */
export function invitationDraftRateLimit(ip: string): RateLimitResult {
  return rateLimit(`invitation-draft:${ip}`, INVITATION_DRAFT_ATTEMPTS, INVITATION_DRAFT_WINDOW_MS);
}

/** API d'administration : 120 requêtes / minute par IP. */
export function adminApiRateLimit(ip: string): RateLimitResult {
  return rateLimit(`admin-api:${ip}`, ADMIN_API_ATTEMPTS, ADMIN_API_WINDOW_MS);
}

const PUBLIC_SUBMISSION_ATTEMPTS = 5;
const PUBLIC_SUBMISSION_WINDOW_MS = 60 * 60_000; // 1 heure

/**
 * Soumissions publiques (§9.3, §11.2) — témoignages et propositions de
 * personnes : 5 / heure / IP. La clé est hachée (SHA-256) : aucune IP en clair
 * dans l'état global mémoire. Ce plafond est volontairement STRICT : les
 * formulaires concernés sont des envois uniques (pas de sauvegarde
 * automatique), contrairement au brouillon d'invitation.
 * NB : ce n'est pas une preuve d'identité (§9.3) — un simple signal anti-abus.
 */
export function publicSubmissionRateLimit(ip: string): RateLimitResult {
  return rateLimit(createHashKey(`public-submission:${ip}`), PUBLIC_SUBMISSION_ATTEMPTS, PUBLIC_SUBMISSION_WINDOW_MS);
}

function createHashKey(raw: string): string {
  return `h:${createHash("sha256").update(raw).digest("hex")}`;
}
