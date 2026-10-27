import type { MetadataRoute } from "next";

import { absoluteUrl, siteUrl } from "@/lib/site-url";

// robots.txt — remplace public/robots.txt : exclut l'espace équipe, l'API et
// les invitations privées (liens à jeton) et déclare le sitemap en URL absolue.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/api/", "/invitation/"],
      },
    ],
    ...(siteUrl() ? { sitemap: absoluteUrl("/sitemap.xml") } : {}),
  };
}
