// URL publique du site (NEXTAUTH_URL) — utilisée là où une URL ABSOLUE est
// exigée : sitemap.xml (le protocole Sitemaps refuse les URL relatives),
// robots.txt (directive Sitemap) et données structurées JSON-LD.

export function siteUrl(): string | null {
  const raw = process.env.NEXTAUTH_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/** Préfixe un chemin par l'origine publique ; renvoie le chemin tel quel si elle est inconnue. */
export function absoluteUrl(path: string): string {
  const origin = siteUrl();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return origin ? `${origin}${normalized}` : normalized;
}
