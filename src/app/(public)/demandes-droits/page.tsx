import type { Metadata } from "next";

import { RightsRequestForm } from "@/components/public/rights-request-form";

// Demandes de droits des personnes (§15.3) : accès, correction, limitation ou
// retrait de publication, effacement, retrait du consentement, signalement.
// Chaque demande est enregistrée, suivie et clôturée avec une trace de décision.
export const metadata: Metadata = {
  title: "Vos droits sur vos données",
  description:
    "Demandez l'accès, la correction, le retrait de publication ou l'effacement de vos données sur la plateforme.",
  robots: { index: true, follow: true },
};

export default async function DemandesDroitsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawProfil = Array.isArray(params.profil) ? params.profil[0] : params.profil;
  const initialSlug = rawProfil?.trim().slice(0, 120) || undefined;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
      <header>
        <h1 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">
          Vos droits sur vos données
        </h1>
        <div className="mt-4 h-1 w-14 rounded-full bg-gold" aria-hidden="true" />
      </header>

      <section aria-label="Formulaire de demande de droits" className="mt-8">
        <RightsRequestForm initialSlug={initialSlug} />
      </section>
    </div>
  );
}
