// ---------------------------------------------------------------------------
// Permissions par rôle — logique pure (la vérification des sessions est dans
// src/lib/auth-options.ts, l'application aux routes API dans 2-b).
// Source : cahier des charges §2.3 à §2.5.
// ---------------------------------------------------------------------------

import type { Role } from "@/lib/constants";

export const PERMISSIONS = [
  "MANAGE_ADMINS",
  "MANAGE_SETTINGS",
  "MANAGE_DOSSIERS",
  "CREATE_INVITATION",
  "REVOKE_INVITATION",
  "REVIEW_DOSSIERS",
  "PUBLISH_PROFILES",
  "MODERATE_TESTIMONIALS",
  "MANAGE_NOMINATIONS",
  "MANAGE_BADGES",
  "MANAGE_CATEGORIES",
  "VIEW_AUDIT_LOG",
  "HANDLE_RIGHTS_REQUESTS",
  "VIEW_STATS",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Matrice rôle → permissions. ADMIN a tout (matrice symétrique du CDC). */
export const PERMISSIONS_BY_ROLE: Readonly<Record<Role, readonly Permission[]>> = {
  ADMIN: PERMISSIONS,
  MODERATOR: ["MODERATE_TESTIMONIALS", "MANAGE_NOMINATIONS", "VIEW_STATS"],
  EDITOR: ["MANAGE_CATEGORIES", "VIEW_STATS"],
};

/**
 * Vérifie qu'un rôle détient une permission.
 * Tolérant : un rôle inconnu (ex. valeur corrompue en base ou dans le JWT)
 * ne détient rien.
 */
export function hasPermission(role: Role | string | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  const granted = PERMISSIONS_BY_ROLE[role as Role];
  if (!granted) return false;
  return granted.includes(permission);
}
