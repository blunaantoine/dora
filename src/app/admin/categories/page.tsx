import type { Metadata } from "next";

import { getAdminSessionSafe } from "@/lib/auth-options";
import { hasPermission } from "@/lib/permissions";
import { AccessDenied } from "@/components/admin/access-denied";
import { CategoriesManager } from "@/components/admin/categories-manager";

// Gestion des catégories d'engagement (§4.3) : liste réelle, ajout,
// renommage, activation/désactivation (jamais de suppression).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Catégories d'engagement",
  robots: { index: false, follow: false },
};

export default async function CategoriesPage() {
  const session = await getAdminSessionSafe();
  const role = session?.user.role;

  if (!hasPermission(role, "MANAGE_CATEGORIES")) {
    return <AccessDenied role={role} />;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <header>
        <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">Catégories d&apos;engagement</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Les catégories structurent l&apos;annuaire et les propositions publiques. Une catégorie désactivée
          n&apos;efface jamais les anciennes données qui lui sont associées (§4.3) : les profils liés restent
          visibles, elle disparaît seulement des filtres et des futurs choix.
        </p>
      </header>

      <section aria-label="Liste des catégories" className="mt-8">
        <CategoriesManager />
      </section>
    </div>
  );
}
