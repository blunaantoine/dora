import Link from "next/link";

const siteName =
  process.env.SITE_NAME?.trim() ||
  "Plateforme de valorisation des femmes et des filles engagées";

// Layout des pages d'authentification : fond vert profond, contenu centré,
// retour discret vers l'accueil. Pas de footer public ni de navigation.
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="relative flex min-h-screen flex-col bg-pine text-[#F8F5EF]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 90% 10%, #D6B15E 0, transparent 38%), radial-gradient(circle at 6% 94%, #D6B15E 0, transparent 30%)",
        }}
      />
      <header className="relative z-10 flex h-16 items-center px-4 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2.5 rounded-md px-2 py-1 text-sm text-[#F8F5EF]/80 underline-offset-4 transition-colors hover:text-[#F8F5EF] hover:underline focus-visible:ring-[3px] focus-visible:ring-gold/50 focus-visible:outline-none"
        >
          <span aria-hidden="true" className="text-gold" >
            ←
          </span>
          Retour à l&apos;accueil
        </Link>
      </header>
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-16 sm:px-6">
        {children}
      </main>
      <p className="relative z-10 pb-6 text-center text-xs text-[#F8F5EF]/60">
        {siteName} — Espace réservé à l&apos;équipe
      </p>
    </div>
  );
}
