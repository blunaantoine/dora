import type { Metadata } from "next";

import { getAdminSessionSafe } from "@/lib/auth-options";
import { hasPermission } from "@/lib/permissions";
import { AccessDenied } from "@/components/admin/access-denied";
import { PropositionsManager } from "@/components/admin/propositions-manager";

// Traitement des propositions publiques (§11) : file de modération des
// personnes proposées par les visiteurs. L'acceptation crée un dossier de
// travail (brouillon) — jamais de publication ni d'invitation automatique.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Propositions",
  robots: { index: false, follow: false },
};

export default async function PropositionsPage() {
  const session = await getAdminSessionSafe();
  const role = session?.user.role;

  if (!hasPermission(role, "MANAGE_NOMINATIONS")) {
    return <AccessDenied role={role} />;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <header>
        <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
          Propositions de personnes
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Personnes proposées par les visiteurs via la page publique « Proposer une personne »
          (§11). Vérifiez l&apos;identité, la pertinence et les conditions avant toute invitation :
          accepter une proposition ne publie rien et n&apos;envoie rien — elle crée seulement un
          dossier de travail. Le contact du proposant est confidentiel et réservé à l&apos;équipe.
        </p>
      </header>

      <section aria-label="Liste des propositions" className="mt-8">
        <PropositionsManager />
      </section>
    </div>
  );
}
