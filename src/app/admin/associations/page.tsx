import type { Metadata } from "next";

import { getAdminSessionSafe } from "@/lib/auth-options";
import { hasPermission } from "@/lib/permissions";
import { AccessDenied } from "@/components/admin/access-denied";
import { AssociationsManager } from "@/components/admin/associations-manager";

// Gestion des associations et ONG partenaires (annuaire public
// /associations) : liste, ajout, édition, activation/désactivation — jamais
// de suppression (traçabilité, cf. catégories).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Associations et ONG",
  robots: { index: false, follow: false },
};

export default async function AssociationsAdminPage() {
  const session = await getAdminSessionSafe();
  const role = session?.user.role;

  if (!hasPermission(role, "MANAGE_PARTNERS")) {
    return <AccessDenied role={role} />;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header>
        <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
          Associations et ONG
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          L&apos;annuaire public <strong>/associations</strong> présente les organisations actives du Togo,
          classées par domaine d&apos;intervention. Chaque fiche indique si l&apos;on peut intégrer leur
          communauté — soyez précis et honnête sur les modalités d&apos;adhésion : c&apos;est ce qui rend
          l&apos;annuaire utile. Une organisation désactivée disparaît du site public sans jamais effacer
          l&apos;historique.
        </p>
      </header>

      <section aria-label="Liste des associations et ONG" className="mt-8">
        <AssociationsManager />
      </section>
    </div>
  );
}
