import Link from "next/link";
import Image from "next/image";

const siteName =
  process.env.SITE_NAME?.trim() ||
  "Plateforme de valorisation des femmes et des filles engagées";

export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const year = new Date().getFullYear();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            href="/"
            className="flex min-w-0 items-center gap-2.5 rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            aria-label={`${siteName} — Dignité, Optimisme, Résilience, Action — retour à l'accueil`}
          >
            <Image
              src="/logo-dora-symbole-160.png"
              alt=""
              aria-hidden="true"
              width={40}
              height={40}
              priority
              className="size-10 shrink-0"
            />
            <span className="min-w-0">
              <span className="block truncate font-display text-base leading-tight font-semibold text-foreground sm:text-lg">
                {siteName}
              </span>
              <span className="hidden text-[11px] leading-tight tracking-wide text-muted-foreground md:block">
                Dignité · Optimisme · Résilience · Action
              </span>
            </span>
          </Link>
          <nav aria-label="Navigation principale" className="flex items-center gap-1 sm:gap-2">
            <Link
              href="/"
              className="rounded-md px-3 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              Accueil
            </Link>
            <Link
              href="/profils"
              className="rounded-md px-3 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              Annuaire
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-auto border-t border-border/70 bg-background pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-sm">
              <p className="font-display text-base font-semibold text-foreground">{siteName}</p>
              <p className="mt-1 text-xs font-medium tracking-wide text-gold">
                Dignité · Optimisme · Résilience · Action
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Un espace de reconnaissance, de transmission d&apos;expériences et de découverte de
                parcours inspirants.
              </p>
            </div>
            <nav aria-label="Liens de pied de page">
              <ul className="flex flex-col gap-2 text-sm sm:items-end">
                <li>
                  <Link
                    href="/"
                    className="rounded-sm text-foreground/80 underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    Accueil
                  </Link>
                </li>
                <li>
                  <Link
                    href="/profils"
                    className="rounded-sm text-foreground/80 underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    Annuaire des parcours
                  </Link>
                </li>
                <li>
                  <Link
                    href="/proposer"
                    className="rounded-sm text-foreground/80 underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    Proposer une personne
                  </Link>
                </li>
                <li>
                  <Link
                    href="/contact"
                    className="rounded-sm text-foreground/80 underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    Contact
                  </Link>
                </li>
                <li>
                  <Link
                    href="/mentions-legales"
                    className="rounded-sm text-foreground/80 underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    Mentions légales
                  </Link>
                </li>
                <li>
                  <Link
                    href="/confidentialite"
                    className="rounded-sm text-foreground/80 underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    Confidentialité
                  </Link>
                </li>
                <li>
                  <Link
                    href="/demandes-droits"
                    className="rounded-sm text-foreground/80 underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    Vos droits sur vos données
                  </Link>
                </li>
                <li>
                  <Link
                    href="/admin/connexion"
                    className="rounded-sm text-foreground/80 underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    Espace équipe
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
          <p className="mt-8 border-t border-border/60 pt-4 text-xs text-muted-foreground">
            © {year} — {siteName} — Projet en préparation.
          </p>
        </div>
      </footer>
    </div>
  );
}
