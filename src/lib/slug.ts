// ---------------------------------------------------------------------------
// Génération de slugs lisibles et sûrs en URL (§8.4 : URL publique unique
// /profils/<slug>) :
//   - minuscules, accents retirés (NFD), séparateurs réduits à des tirets ;
//   - unicité garantie : le suffixe -2, -3… est essayé, puis un suffixe
//     aléatoire court (base36) si nécessaire.
// ---------------------------------------------------------------------------

import { db } from "@/lib/db";

/**
 * Transforme un texte en slug : « École N'Djaména — 2024 » → "ecole-ndjamena-2024".
 * Retourne une chaîne vide si aucun caractère exploitable n'existe.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // signes diacritiques
    .replace(/[''`]/g, " ") // apostrophes → espace (évite "l-heros")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/** Suffixe aléatoire court (base36, ~4 caractères) pour lever les collisions. */
function shortRandomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

/** Longueur maximale d'un slug en base (colonne slug String). */
const SLUG_MAX_LENGTH = 80;

/**
 * Génère un slug unique pour la table ProfilePublication à partir de
 * `publicName` : essaie la base seule, puis les suffixes -2 … -20, puis un
 * suffixe aléatoire court. Le slug retourné est garanti absent de la base
 * (colonne unique) au moment de la vérification.
 */
export async function generateUniquePublicationSlug(publicName: string): Promise<string> {
  const base = slugify(publicName) || "profil";

  const existing = await db.profilePublication.findMany({
    where: { slug: { startsWith: base.slice(0, SLUG_MAX_LENGTH) } },
    select: { slug: true },
  });
  const taken = new Set(existing.map((row) => row.slug));

  if (!taken.has(base)) return base;

  for (let i = 2; i <= 20; i += 1) {
    const candidate = `${base}-${i}`.slice(0, SLUG_MAX_LENGTH);
    if (!taken.has(candidate)) return candidate;
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = `${base.slice(0, SLUG_MAX_LENGTH - 5)}-${shortRandomSuffix()}`;
    if (!taken.has(candidate)) return candidate;
  }

  // Impossible en pratique (10 tentatives aléatoires) — garde stricte.
  throw new Error("Impossible de générer un slug unique.");
}

/**
 * Génère un slug unique pour la table Category (même algorithme, autre table).
 */
export async function generateUniqueCategorySlug(name: string): Promise<string> {
  const base = slugify(name) || "categorie";

  const existing = await db.category.findMany({
    where: { slug: { startsWith: base.slice(0, SLUG_MAX_LENGTH) } },
    select: { slug: true },
  });
  const taken = new Set(existing.map((row) => row.slug));

  if (!taken.has(base)) return base;

  for (let i = 2; i <= 20; i += 1) {
    const candidate = `${base}-${i}`.slice(0, SLUG_MAX_LENGTH);
    if (!taken.has(candidate)) return candidate;
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = `${base.slice(0, SLUG_MAX_LENGTH - 5)}-${shortRandomSuffix()}`;
    if (!taken.has(candidate)) return candidate;
  }

  throw new Error("Impossible de générer un slug unique.");
}
