import type { Metadata } from "next";

import { getAdminSessionSafe } from "@/lib/auth-options";
import { hasPermission } from "@/lib/permissions";
import { AccessDenied } from "@/components/admin/access-denied";
import { TestimonialsManager } from "@/components/admin/testimonials-manager";

// Modération des témoignages (§9) : liste filtrable par statut, lecture,
// approbation / refus / archivage / suppression des coordonnées.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Témoignages",
  robots: { index: false, follow: false },
};

export default async function TemoignagesPage() {
  const session = await getAdminSessionSafe();
  const role = session?.user.role;

  if (!hasPermission(role, "MODERATE_TESTIMONIALS")) {
    return <AccessDenied role={role} />;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <header>
        <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
          Témoignages
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Propositions envoyées par les visiteurs sur les profils publiés (§9). Rien n&apos;est
          publié automatiquement : chaque témoignage est relu avant approbation. Les coordonnées
          transmises servent uniquement à la vérification — supprimez-les dès qu&apos;elles ne sont
          plus nécessaires.
        </p>
      </header>

      <section aria-label="Liste des témoignages" className="mt-8">
        <TestimonialsManager />
      </section>
    </div>
  );
}
