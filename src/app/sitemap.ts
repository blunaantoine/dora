// ---------------------------------------------------------------------------
// Sitemap (§20 — SEO de base) : pages statiques indexables + profils publiés.
// Les profils non publiés n'y figurent jamais ; les pages /invitation/* et
// /admin/* sont exclues (noindex).
// ---------------------------------------------------------------------------

import type { MetadataRoute } from "next";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: "/", changeFrequency: "weekly", priority: 1 },
    { url: "/profils", changeFrequency: "daily", priority: 0.9 },
    { url: "/proposer", changeFrequency: "monthly", priority: 0.6 },
    { url: "/demandes-droits", changeFrequency: "yearly", priority: 0.4 },
    { url: "/contact", changeFrequency: "yearly", priority: 0.4 },
    { url: "/mentions-legales", changeFrequency: "yearly", priority: 0.2 },
    { url: "/confidentialite", changeFrequency: "yearly", priority: 0.4 },
  ];

  try {
    const publications = await db.profilePublication.findMany({
      where: { state: "PUBLISHED", person: { status: "PUBLISHED" } },
      orderBy: { publishedAt: "desc" },
      select: {
        slug: true,
        updatedAt: true,
        publishedAt: true,
      },
      take: 500,
    });

    const profileEntries: MetadataRoute.Sitemap = publications.map((publication) => ({
      url: `/profils/${publication.slug}`,
      lastModified: publication.updatedAt ?? publication.publishedAt ?? undefined,
      changeFrequency: "monthly",
      priority: 0.8,
    }));

    return [...staticEntries, ...profileEntries];
  } catch (error) {
    // En cas d'indisponibilité de la base, le sitemap reste exploitable avec
    // les pages statiques (jamais d'erreur 500 sur /sitemap.xml).
    console.error("[sitemap] lecture des profils publiés impossible :", error);
    return staticEntries;
  }
}
