import Link from "next/link";
import Image from "next/image";
import { ShieldCheck, LockKeyhole, RotateCcw } from "lucide-react";

const siteName =
  process.env.SITE_NAME?.trim() ||
  "Plateforme de valorisation des femmes et des filles engagées";

const focusRing =
  "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";

const navLinkBase = `min-h-11 items-center rounded-lg px-3 text-[15px] font-medium text-foreground/85 transition-colors hover:bg-accent hover:text-accent-foreground ${focusRing}`;

const footerLink = `rounded-sm text-[15px] text-[#F8F5EF]/85 underline-offset-4 transition-colors hover:text-[#F8F5EF] hover:underline focus-visible:ring-[3px] focus-visible:ring-gold/60 focus-visible:outline-none`;

const FOOTER_COLUMNS = [
  {
    titre: "Découvrir",
    liens: [
      { href: "/profils", label: "Annuaire des parcours" },
      { href: "/associations", label: "Associations et ONG" },
      { href: "/#demarche", label: "Notre démarche" },
      { href: "/#criteres", label: "Nos critères" },
    ],
  },
  {
    titre: "Participer",
    liens: [
      { href: "/proposer", label: "Proposer une personne" },
      { href: "/contact", label: "Contact" },
      { href: "/admin/connexion", label: "Espace équipe" },
    ],
  },
  {
    titre: "Vos données",
    liens: [
      { href: "/demandes-droits", label: "Vos droits sur vos données" },
      { href: "/confidentialite", label: "Confidentialité" },
      { href: "/mentions-legales", label: "Mentions légales" },
    ],
  },
] as const;

export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const year = new Date().getFullYear();

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#contenu"
        className="sr-only z-50 rounded-md bg-pine px-4 py-2 text-[#F8F5EF] focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Aller au contenu
      </a>

      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className={`flex shrink-0 items-center rounded-md ${focusRing}`}
            aria-label={`${siteName} — Dignité, Optimisme, Résilience, Action — retour à l'accueil`}
          >
            <Image
              src="/logo-dora.png"
              alt=""
              aria-hidden="true"
              width={1522}
              height={503}
              priority
              className="h-9 w-auto sm:h-10"
            />
          </Link>
          <nav aria-label="Navigation principale" className="flex items-center gap-1">
            <Link href="/profils" className={`${navLinkBase} inline-flex`}>
              Les parcours
            </Link>
            <Link href="/associations" className={`${navLinkBase} inline-flex`}>
              Associations
            </Link>
            <Link href="/#demarche" className={`${navLinkBase} hidden md:inline-flex`}>
              Notre démarche
            </Link>
            <Link href="/#criteres" className={`${navLinkBase} hidden md:inline-flex`}>
              Nos critères
            </Link>
            <Link
              href="/proposer"
              className={`ml-1 inline-flex min-h-11 items-center rounded-full bg-pine px-4 text-[15px] font-semibold text-[#F8F5EF] transition-colors hover:bg-pine-soft sm:px-5 ${focusRing}`}
            >
              <span className="sm:hidden">Proposer</span>
              <span className="hidden sm:inline">Proposer une personne</span>
            </Link>
          </nav>
        </div>
      </header>

      <main id="contenu" className="flex-1">
        {children}
      </main>

      <footer className="mt-auto bg-pine-deep pb-[env(safe-area-inset-bottom)] text-[#F8F5EF]">
        {/* Garanties rappelées en pied de page : la confiance est le cœur de Dora. */}
        <div className="border-b border-[#F8F5EF]/10">
          <ul className="mx-auto flex w-full max-w-6xl flex-wrap justify-between gap-x-10 gap-y-3 px-4 py-5 text-sm sm:px-6">
            <li className="flex items-center gap-2.5">
              <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-gold" />
              Aucune donnée privée sur les pages publiques
            </li>
            <li className="flex items-center gap-2.5">
              <LockKeyhole aria-hidden="true" className="size-4 shrink-0 text-gold" />
              Jamais de publication automatique
            </li>
            <li className="flex items-center gap-2.5">
              <RotateCcw aria-hidden="true" className="size-4 shrink-0 text-gold" />
              Retrait possible à tout moment
            </li>
          </ul>
        </div>

        <div className="mx-auto w-full max-w-6xl px-4 pt-14 pb-8 sm:px-6">
          <div className="flex flex-wrap justify-between gap-12">
            <div className="max-w-xs">
              <Image
                src="/logo-dora-blanc.png"
                alt={siteName}
                width={1522}
                height={505}
                className="h-11 w-auto"
              />
              <p className="mt-4 text-sm leading-relaxed text-[#F8F5EF]/75">
                Parce que chaque activiste est un don pour sa communauté.
              </p>
            </div>
            <div className="flex flex-wrap gap-x-16 gap-y-10">
              {FOOTER_COLUMNS.map((colonne) => (
                <nav key={colonne.titre} aria-label={colonne.titre}>
                  <p className="text-xs font-semibold tracking-[0.1em] text-gold uppercase">
                    {colonne.titre}
                  </p>
                  <ul className="mt-4 flex flex-col gap-2.5">
                    {colonne.liens.map((lien) => (
                      <li key={lien.href}>
                        <Link href={lien.href} className={footerLink}>
                          {lien.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              ))}
            </div>
          </div>
          <p className="mt-12 border-t border-[#F8F5EF]/15 pt-5 text-xs text-[#F8F5EF]/70">
            © {year} — {siteName} — Dignité · Optimisme · Résilience · Action
          </p>
        </div>
      </footer>
    </div>
  );
}
