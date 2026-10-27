// ---------------------------------------------------------------------------
// Page admin « À l'honneur » — sélection éditoriale des parcours affichés en
// carrousel sur la bannière d'accueil (au plus 5, ordre 1..5 fixé par
// l'équipe). CHOIX ÉDITORIAL — pas une notation : la plateforme n'a ni notes,
// ni popularité, ni nombre de vues (principe affiché publiquement).
//
// Permission requise : PUBLISH_PROFILES (sinon redirection vers le tableau de
// bord — même règle que la publication de profils).
// ---------------------------------------------------------------------------

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminSessionSafe } from "@/lib/auth-options";
import { hasPermission } from "@/lib/permissions";
import { FeaturedManager, type FeaturedManagerEntry } from "@/components/admin/featured-manager";

export const metadata = { title: "À l'honneur — Espace équipe" };

export default async function HonoredAdminPage() {
  const session = await getAdminSessionSafe();
  if (!session) {
    redirect("/admin/connexion");
  }
  if (!hasPermission(session.user.role, "PUBLISH_PROFILES")) {
    redirect("/admin");
  }

  const [honoredRows, candidateRows] = await Promise.all([
    db.profilePublication.findMany({
      where: { state: "PUBLISHED", featuredRank: { not: null } },
      orderBy: { featuredRank: "asc" },
      select: { id: true, slug: true, featuredRank: true, person: { select: { publicName: true } } },
    }),
    db.profilePublication.findMany({
      where: { state: "PUBLISHED", person: { publicName: { not: "" } } },
      orderBy: [{ featuredRank: "asc" }, { person: { publicName: "asc" } }],
      take: 200,
      select: { id: true, slug: true, featuredRank: true, person: { select: { publicName: true } } },
    }),
  ]);

  const toEntry = (row: {
    id: string;
    slug: string;
    person: { publicName: string | null };
  }): FeaturedManagerEntry => ({
    id: row.id,
    slug: row.slug,
    publicName: row.person.publicName?.trim() ?? "",
  });

  const initialHonored = honoredRows.map(toEntry).filter((entry) => entry.publicName.length > 0);
  const candidates = candidateRows.map(toEntry).filter((entry) => entry.publicName.length > 0);

  return (
    <div className="mx-auto w-full max-w-3xl grid gap-6">
      <header>
        <h1 className="font-display text-2xl font-semibold text-foreground">À l&apos;honneur</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Les parcours présentés en carrousel sur la bannière d&apos;accueil — au plus cinq,
          dans l&apos;ordre choisi par l&apos;équipe.
        </p>
      </header>

      <FeaturedManager max={5} initialHonored={initialHonored} candidates={candidates} />
    </div>
  );
}
