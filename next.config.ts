import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  typescript: {
    // Décision D6 (worklog) : les erreurs TypeScript doivent bloquer le build.
    ignoreBuildErrors: false,
  },
  async headers() {
    return [
      {
        // En-têtes de sécurité communs à l'ensemble du site (le middleware
        // les redouble sur les zones admin/invitation).
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // Zone d'invitation privée : pas de fuite du lien par Referer,
        // pas d'indexation.
        source: "/invitation/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
