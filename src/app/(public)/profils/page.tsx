import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Search, Users } from "lucide-react";

import { db } from "@/lib/db";
import { serializePublicCard, type PublicCardView } from "@/lib/public-profile";
import { ProfileCard } from "@/components/public/profile-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

// Annuaire des parcours publiés (§4.2) — Server Component : la liste reflète
// l'état réel de la base, rendu à la demande (une publication peut apparaître
// ou disparaître à tout moment). Recherche et filtres via formulaire GET
// natif : fonctionnent sans JavaScript (perf 3G, §19), seuls q, categorie et
// page transitent dans l'URL — aucune donnée privée.

export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;

export const metadata: Metadata = {
  title: "Annuaire des parcours",
  description:
    "Découvrez les profils publiés des femmes et des filles engagées : parcours, initiatives et contributions à leur communauté.",
  robots: { index: true, follow: true },
};

interface AnnuaireFilters {
  q: string;
  categorie: string;
  page: number;
}

function parseFilters(searchParams: Record<string, string | string[] | undefined>): AnnuaireFilters {
  const rawQ = searchParams.q;
  const rawCategorie = searchParams.categorie;
  const rawPage = searchParams.page;

  const q = (Array.isArray(rawQ) ? rawQ[0] : rawQ)?.trim().slice(0, 120) ?? "";
  const categorie = (Array.isArray(rawCategorie) ? rawCategorie[0] : rawCategorie)?.trim().slice(0, 80) ?? "";
  const parsedPage = Number.parseInt((Array.isArray(rawPage) ? rawPage[0] : rawPage) ?? "1", 10);

  return { q, categorie, page: Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1 };
}

/** Construit une URL de pagination en conservant q et categorie (et rien d'autre). */
function pageUrl(filters: AnnuaireFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.categorie) params.set("categorie", filters.categorie);
  params.set("page", String(page));
  return `/profils?${params.toString()}`;
}

export default async function ProfilsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseFilters(await searchParams);
  const hasFilters = filters.q !== "" || filters.categorie !== "";

  // Catégories actives uniquement (§4.3 : une catégorie désactivée disparaît
  // des filtres ; les profils déjà publiés restent visibles).
  const categories = await db.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { name: true, slug: true },
  });

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <header>
        <h1 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">
          Annuaire des parcours
        </h1>
        <div className="mt-4 h-1 w-14 rounded-full bg-gold" aria-hidden="true" />
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-foreground/85">
          Les profils présentés ici ont été identifiés, invités, examinés puis publiés avec le
          consentement des personnes concernées.
        </p>
      </header>

      {/* Filtres — formulaire GET natif : fonctionne sans JavaScript. */}
      <form
        method="get"
        action="/profils"
        role="search"
        aria-label="Rechercher et filtrer les profils"
        className="mt-8 grid gap-4 rounded-xl border border-border bg-card p-4 sm:p-5 sm:grid-cols-[1fr_auto_auto] sm:items-end"
      >
        <div className="grid gap-1.5">
          <Label htmlFor="q">Rechercher (nom ou mots-clés)</Label>
          <Input
            id="q"
            name="q"
            type="search"
            defaultValue={filters.q}
            maxLength={120}
            placeholder="Ex. : éducation, santé, un nom…"
            className="min-h-11"
          />
        </div>
        <div className="grid gap-1.5 sm:w-64">
          <Label htmlFor="categorie">Domaine d&apos;engagement</Label>
          <select
            id="categorie"
            name="categorie"
            defaultValue={filters.categorie}
            className="min-h-11 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <option value="">Tous les domaines</option>
            {categories.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" className="min-h-11 w-full sm:w-auto">
          <Search aria-hidden="true" />
          Filtrer
        </Button>
      </form>

      <section aria-label="Profils publiés" className="mt-8">
        {/* État de chargement (§16.3) : Suspense interne volontaire — une
            boundary loading.tsx avancerait le statut HTTP 200 du shell avant
            la résolution de notFound() et casserait la sémantique 404 requise
            par §4.5 sur /profils/[slug]. Le rendu reste un Server Component,
            lisible sans JavaScript. */}
        <Suspense
          fallback={<ProfilsSkeleton />}
          key={`${filters.q}|${filters.categorie}|${filters.page}`}
        >
          <ProfilsResults filters={filters} hasFilters={hasFilters} />
        </Suspense>
      </section>
    </div>
  );
}

async function ProfilsResults({
  filters,
  hasFilters,
}: {
  filters: AnnuaireFilters;
  hasFilters: boolean;
}) {
  // Prisma/SQLite : « contains » est insensible à la casse pour les caractères
  // non accentués (limite SQLite documentée — recherche ASCII-insensible).
  const where = {
    state: "PUBLISHED" as const,
    ...(hasFilters
      ? {
          person: {
            ...(filters.categorie ? { category: { is: { slug: filters.categorie } } } : {}),
            ...(filters.q
              ? {
                  OR: [
                    { publicName: { contains: filters.q } },
                    { shortPresentation: { contains: filters.q } },
                    { biography: { contains: filters.q } },
                  ],
                }
              : {}),
          },
        }
      : {}),
  };

  // Le total d'abord, pour borner la page demandée (anti-overshoot).
  const total = await db.profilePublication.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(filters.page, totalPages);

  const publications = await db.profilePublication.findMany({
    where,
    orderBy: { publishedAt: "desc" },
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      slug: true,
      state: true,
      approvedFields: true,
      publishedAt: true,
      person: {
        select: {
          publicName: true,
          isMinor: true,
          shortPresentation: true,
          country: true,
          category: { select: { name: true, slug: true, isActive: true } },
          photoAsset: {
            select: {
              id: true,
              kind: true,
              status: true,
              visibility: true,
              width: true,
              height: true,
              originalName: true,
            },
          },
          media: {
            where: { visibility: "PUBLIC", status: { in: ["READY", "VALIDATED"] } },
            orderBy: [{ kind: "asc" }, { uploadedAt: "asc" }],
            take: 1,
            select: {
              id: true,
              kind: true,
              status: true,
              visibility: true,
              width: true,
              height: true,
              originalName: true,
            },
          },
        },
      },
    },
  });

  const cards: PublicCardView[] = publications
    .map((publication) => serializePublicCard(publication.person, publication))
    .filter((card): card is PublicCardView => card !== null);

  if (total === 0) {
    return hasFilters ? (
      <div className="rounded-xl border border-dashed border-border bg-card/60 px-6 py-16 text-center">
        <Search aria-hidden="true" className="mx-auto size-10 text-muted-foreground/70" />
        <p className="mt-4 text-base font-medium text-foreground">
          Aucun profil ne correspond à votre recherche.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Essayez d&apos;élargir vos mots-clés ou de sélectionner un autre domaine.
        </p>
        <Button
          asChild
          variant="outline"
          className="mt-6 min-h-11 border-pine text-pine hover:bg-accent hover:text-pine"
        >
          <Link href="/profils">Réinitialiser les filtres</Link>
        </Button>
      </div>
    ) : (
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

  return (
    <>
      <p className="text-sm text-muted-foreground" role="status">
        {total} profil{total > 1 ? "s" : ""} — page {currentPage} sur {totalPages}
      </p>
      <ul className="mt-4 grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <li key={card.slug} className="h-full">
            <ProfileCard profile={card} />
          </li>
        ))}
      </ul>

      {totalPages > 1 ? (
        <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-3">
          {currentPage > 1 ? (
            <Button asChild variant="outline" size="sm" className="min-h-11">
              <Link href={pageUrl(filters, currentPage - 1)} rel="prev">
                Page précédente
              </Link>
            </Button>
          ) : null}
          <span className="text-sm text-muted-foreground" aria-current="page">
            Page {currentPage} / {totalPages}
          </span>
          {currentPage < totalPages ? (
            <Button asChild variant="outline" size="sm" className="min-h-11">
              <Link href={pageUrl(filters, currentPage + 1)} rel="next">
                Page suivante
              </Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}

function ProfilsSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Chargement des profils…</span>
      <Skeleton className="h-4 w-40" aria-hidden="true" />
      <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="overflow-hidden rounded-xl border border-border bg-card">
            <Skeleton className="h-40 w-full rounded-none" />
            <div className="space-y-3 p-5">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
