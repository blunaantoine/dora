// ---------------------------------------------------------------------------
// Journal d'audit (§5.6) : chaque entrée contient l'acteur, l'action, la cible,
// le résultat et des métadonnées NON sensibles. N'échoue jamais de manière
// bloquante : une erreur d'écriture d'audit ne doit jamais interrompre une
// opération métier, elle est consignée côté serveur uniquement.
// ---------------------------------------------------------------------------

import { db } from "@/lib/db";
import { AUDIT_METADATA_MAX_LENGTH } from "@/lib/constants";

/** Clés jamais autorisées dans les métadonnées (mots de passe, jetons, secrets). */
const FORBIDDEN_METADATA_KEYS = new Set([
  "password",
  "newpassword",
  "currentpassword",
  "passwordhash",
  "token",
  "tokenhash",
  "accesstoken",
  "refreshtoken",
  "secret",
  "secrettoken",
  "authorization",
  "cookie",
  "cookies",
  "apikey",
  "api_key",
  "clientsecret",
]);

const MAX_STRING_LENGTH = 500;

interface SanitizedString {
  redacted: boolean;
  value: string;
}

function redactString(value: string): string {
  return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…[tronqué]` : value;
}

/**
 * Retire récursivement les champs interdits (mots de passe, jetons, secrets)
 * et tronque les chaînes longues. Retourne du JSON sérialisé ou undefined.
 */
export function sanitizeMetadata(metadata: unknown): string | undefined {
  if (metadata === undefined || metadata === null) return undefined;

  const walk = (value: unknown, depth: number): unknown => {
    if (depth > 6) return "[profondeur limitée]";
    if (typeof value === "string") return redactString(value);
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (value === null || value === undefined) return null;
    if (Array.isArray(value)) return value.slice(0, 50).map((item) => walk(item, depth + 1));
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "object") {
      const source = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(source)) {
        if (FORBIDDEN_METADATA_KEYS.has(key.toLowerCase())) {
          out[key] = "[supprimé — donnée sensible]";
          continue;
        }
        out[key] = walk(val, depth + 1);
      }
      return out;
    }
    return String(value);
  };

  try {
    const cleaned = walk(metadata, 0);
    const serialized = JSON.stringify(cleaned);
    if (!serialized || serialized === "{}" || serialized === "[]") return undefined;
    return serialized.length > AUDIT_METADATA_MAX_LENGTH
      ? `${serialized.slice(0, AUDIT_METADATA_MAX_LENGTH)}…[tronqué]`
      : serialized;
  } catch (error) {
    console.error("[audit] Échec de sérialisation des métadonnées :", error);
    return undefined;
  }
}

export interface AuditEntry {
  /** Identifiant de l'administrateur acteur (si authentifié). */
  actorId?: string | null;
  /** Libellé d'acteur non authentifié (ex. "visiteur", "invitation:a1b2…"). */
  actorLabel?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  result?: "SUCCESS" | "DENIED" | "ERROR";
  metadata?: unknown;
  ip?: string | null;
}

/**
 * Écrit une entrée d'audit. Ne lève JAMAIS d'exception :
 * en cas d'échec, l'erreur est consignée dans la console serveur.
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        actorLabel: entry.actorLabel ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        result: entry.result ?? "SUCCESS",
        metadata: sanitizeMetadata(entry.metadata) ?? null,
        ip: entry.ip ?? null,
      },
    });
  } catch (error) {
    console.error(
      `[audit] Échec d'enregistrement de l'entrée d'audit (action=${entry.action}, entityType=${entry.entityType}) :`,
      error,
    );
  }
}

/**
 * Extrait l'adresse IP d'une requête en tenant compte du proxy Caddy
 * (x-forwarded-for, premier élément de la liste).
 */
export function ipFromHeaders(headers: Headers | { get(name: string): string | null }): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip");
  return realIp?.trim() || null;
}
