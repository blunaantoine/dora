import { Suspense } from "react";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { Skeleton } from "@/components/ui/skeleton";
import { ProfileCard, type PublicProfileData } from "@/components/public/profile-card";
import { Users } from "lucide-react";

// L'annuaire reflète l'état réel de la base : il doit toujours être rendu à
// la demande (jamais pré-rendu avec des données potentiellement périmées).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Annuaire des parcours",
  description:
    "Découvrez les profils publiés des femmes et des filles engagées : parcours, initiatives et contributions à leur communauté.",
  robots: { index: true, follow: true },
};

export default function AnnuairePage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <header>
        <h1 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">
          Annuaire des parcours
        </h1>
        <div className="mt-4 h-1 w-14 rounded-full bg-gold" aria-hidden="true" />
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-foreground/85">
          Les profils présentés ici ont été identifiés, invités, examinés puis publiés avec le
          consentement des personnes concernées. La recherche et le filtrage par domaine ou pays
          arriveront avec l&apos;enrichissement de l&apos;annuaire.
        </p>
      </header>

      <section aria-label="Profils publiés" className="mt-10">
        <Suspense fallback={<AnnuaireSkeleton />}>
          <PublishedProfiles />
        </Suspense>
      </section>
    </div>
  );
}

async function PublishedProfiles() {
  // Requête réelle : uniquement les publications à l'état PUBLISHED, avec les
  // seuls champs destinés au public (aucune donnée privée, aucun champ long).
  const publications = await db.profilePublication.findMany({
    where: { state: "PUBLISHED" },
    orderBy: [{ featured: "desc" }, { publishedAt: "desc" }],
    select: {
      personId: true,
      publishedAt: true,
      person: {
        select: {
          publicName: true,
          shortPresentation: true,
          country: true,
          region: true,
          city: true,
          updatedAt: true,
          category: { select: { name: true } },
        },
      },
    },
  });

  if (publications.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/60 px-6 py-16 text-center">
        <Users aria-hidden="true" className="mx-auto size-10 text-muted-foreground/70" />
        <p className="mt-4 text-base font-medium text-foreground">
          Aucun profil publié pour le moment — la plateforme prépare son lancement.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Revenez bientôt : les premiers parcours validés y seront publiés.
        </p>
      </div>
    );
  }

  const profiles: PublicProfileData[] = publications
    .filter((p) => p.person.publicName)
    .map((p) => ({
      id: p.personId,
      publicName: p.person.publicName ?? "",
      shortPresentation: p.person.shortPresentation,
      country: p.person.country,
      region: p.person.region,
      city: p.person.city,
      categoryName: p.person.category?.name ?? null,
      publishedAt: new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(
        p.publishedAt ?? p.person.updatedAt,
      ),
    }));

  return (
    <ul className="grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-3">
      {profiles.map((profile) => (
        <li key={profile.id} className="h-full">
          <ProfileCard profile={profile} />
        </li>
      ))}
    </ul>
  );
}

function AnnuaireSkeleton() {
  return (
    <div aria-hidden="true" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-4">
            <Skeleton className="size-12 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
          <Skeleton className="mt-4 h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-5/6" />
          <Skeleton className="mt-2 h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}
