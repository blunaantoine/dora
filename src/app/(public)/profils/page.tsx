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

  const chipBase =
    "inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";
  const chipOn = `${chipBase} border-pine bg-pine text-[#F8F5EF]`;
  const chipOff = `${chipBase} border-[#D9D2BF] bg-card text-foreground hover:border-pine hover:bg-accent`;
  const chipHref = (slug: string) => {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (slug) params.set("categorie", slug);
    const query = params.toString();
    return query ? `/profils?${query}` : "/profils";
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <header>
        <p className="text-xs font-semibold tracking-[0.12em] text-[#7A5E22] uppercase">Annuaire</p>
        <h1 className="mt-2.5 font-display text-4xl leading-tight font-semibold tracking-tight text-foreground sm:text-5xl">
          Les parcours
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-foreground/80 sm:text-lg">
          Les profils présentés ici ont été identifiés, invités, examinés puis publiés avec le
          consentement des personnes concernées.
        </p>
      </header>

      {/* Recherche — formulaire GET natif : fonctionne sans JavaScript. Le
          domaine choisi via les puces ci-dessous est conservé (champ caché). */}
      <form
        method="get"
        action="/profils"
        role="search"
        aria-label="Rechercher des profils"
        className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="grid flex-1 gap-1.5">
          <Label htmlFor="q">Rechercher un nom ou un mot-clé</Label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="q"
              name="q"
              type="search"
              defaultValue={filters.q}
              maxLength={120}
              placeholder="Ex. : éducation, santé, un nom…"
              className="min-h-12 rounded-xl bg-card pl-11 text-base"
            />
          </div>
        </div>
        {filters.categorie ? <input type="hidden" name="categorie" value={filters.categorie} /> : null}
        <Button type="submit" className="min-h-12 rounded-xl px-6 text-base">
          Rechercher
        </Button>
      </form>

      {/* Filtre par domaine — liens simples (sans JavaScript, adaptés à la 3G). */}
      <nav aria-label="Filtrer par domaine" className="-mx-4 mt-5 sm:mx-0">
        {/* Mobile : une ligne qui défile horizontalement ; dès sm : puces sur plusieurs lignes. */}
        <ul className="flex gap-2 overflow-x-auto px-4 pb-2 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          <li>
            <Link
              href={chipHref("")}
              aria-current={filters.categorie === "" ? "page" : undefined}
              className={filters.categorie === "" ? chipOn : chipOff}
            >
              Tous les domaines
            </Link>
          </li>
          {categories.map((category) => (
            <li key={category.slug}>
              <Link
                href={chipHref(category.slug)}
                aria-current={filters.categorie === category.slug ? "page" : undefined}
                className={filters.categorie === category.slug ? chipOn : chipOff}
              >
                {category.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-label="Profils publiés" className="mt-10 border-t border-border/70 pt-8">
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
      <ul className="mt-5 grid list-none gap-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
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

      <div className="mt-14 flex flex-col gap-5 rounded-2xl border border-dashed border-[#CFC7B2] bg-card p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <h2 className="font-display text-xl font-semibold text-foreground">
            Vous ne trouvez pas la personne que vous cherchez ?
          </h2>
          <p className="mt-1.5 text-[15px] text-muted-foreground">
            Elle n&apos;a peut-être pas encore été invitée. Proposez son parcours à l&apos;équipe.
          </p>
        </div>
        <Button asChild variant="outline" className="min-h-11 shrink-0 rounded-full border-pine px-5 text-pine hover:bg-accent hover:text-pine">
          <Link href="/proposer">Proposer une personne</Link>
        </Button>
      </div>
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
