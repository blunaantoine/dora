import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Typographie des titres (identité éditoriale institutionnelle, §16).
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});

const siteName =
  process.env.SITE_NAME?.trim() ||
  "Plateforme de valorisation des femmes et des filles engagées";

export const metadata: Metadata = {
  // Base des URL canoniques et Open Graph (§4.5) : NEXTAUTH_URL si défini,
  // sinon Next.js retombe sur l'URL de déploiement — les URL relatives des
  // pages publiques (canonical, image OG) sont résolues en absolu.
  ...(process.env.NEXTAUTH_URL?.trim()
    ? { metadataBase: new URL(process.env.NEXTAUTH_URL.trim()) }
    : {}),
  title: {
    default: siteName,
    template: `%s — ${siteName}`,
  },
  description:
    "Dora — Distinguer, Oser, Reconnaître, Agir. Plateforme de valorisation des femmes et des filles engagées : documenter, reconnaître et transmettre les parcours qui font avancer les communautés. Les parcours des hommes engagés y sont également accueillis.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
