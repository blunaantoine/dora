import type { Metadata } from "next";
import Link from "next/link";
import { HandHeart, MapPin, Search } from "lucide-react";

import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Annuaire des associations et ONG du Togo — Server Component : la liste
// reflète l'état réel de la base. Tri par domaine d'intervention, filtres via
// formulaire GET natif (fonctionne sans JavaScript, perf 3G) : seuls q et
// domaine transitent dans l'URL — aucune donnée privée.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Associations et ONG du Togo",
  description:
    "Annuaire des associations et ONG actives au Togo, classées par domaine d'intervention. Pour chacune : sa mission et la possibilité d'intégrer sa communauté.",
  robots: { index: true, follow: true },
};

function parseFilters(searchParams: Record<string, string | string[] | undefined>) {
  const rawQ = searchParams.q;
  const rawDomaine = searchParams.domaine;
  const q = (Array.isArray(rawQ) ? rawQ[0] : rawQ)?.trim().slice(0, 120) ?? "";
  const domaine = (Array.isArray(rawDomaine) ? rawDomaine[0] : rawDomaine)?.trim().slice(0, 80) ?? "";
  return { q, domaine };
}

/** Pastille d'adhésion affichée sur la carte. */
function MembershipBadge({ open }: { open: boolean }) {
  return open ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#2E6B4F]/30 bg-[#EAF3EC] px-2.5 py-1 text-xs font-semibold text-[#2E6B4F]">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-[#2E6B4F]" />
      Adhésion ouverte
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-muted-foreground/60" />
      Adhésion fermée
    </span>
  );
}

interface PartnerCardData {
  id: string;
  name: string;
  acronym: string | null;
  slug: string;
  mission: string;
  city: string | null;
  region: string | null;
  membershipOpen: boolean;
  domainNames: string[];
}

function PartnerCard({ org }: { org: PartnerCardData }) {
  return (
    <article className="flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-display text-lg font-semibold leading-snug text-foreground">
          {org.name}
          {org.acronym ? <span className="text-muted-foreground"> · {org.acronym}</span> : null}
        </h3>
        <MembershipBadge open={org.membershipOpen} />
      </div>

      <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
        <MapPin aria-hidden="true" className="size-4 shrink-0" />
        {[org.city, org.region].filter(Boolean).join(", ") || "Togo"}
      </p>

      <p className="mt-3 line-clamp-3 text-[15px] leading-relaxed text-foreground/85">{org.mission}</p>

      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Domaines d'intervention">
        {org.domainNames.map((domain) => (
          <li
            key={domain}
            className="rounded-full border border-[#D9D2BF] bg-background px-2.5 py-0.5 text-xs font-medium text-foreground/80"
          >
            {domain}
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-4">
        <Link
          href={`/associations/${org.slug}`}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-[15px] font-semibold text-[#173D32] underline-offset-4 transition-colors hover:text-[#22503F] hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Voir la fiche et les modalités
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}

export default async function AssociationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseFilters(await searchParams);

  // Domaines actifs pour les filtres : uniquement les catégories qui
  // comptent au moins une organisation active.
  const domains = await db.category.findMany({
    where: { isActive: true, partnerOrganizations: { some: { isActive: true } } },
    orderBy: { sortOrder: "asc" },
    select: { name: true, slug: true },
  });

  const activeOrgs = await db.partnerOrganization.findMany({
    where: {
      isActive: true,
      ...(filters.q
        ? {
            OR: [
              { name: { contains: filters.q } },
              { acronym: { contains: filters.q } },
              { mission: { contains: filters.q } },
              { city: { contains: filters.q } },
              { region: { contains: filters.q } },
            ],
          }
        : {}),
      ...(filters.domaine ? { domains: { some: { slug: filters.domaine } } } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      acronym: true,
      slug: true,
      mission: true,
      city: true,
      region: true,
      membershipOpen: true,
      domains: { orderBy: { sortOrder: "asc" }, select: { name: true } },
    },
  });

  // Tri par domaine d'intervention : sans filtre, les fiches sont regroupées
  // sous le titre de leur domaine principal (premier domaine actif de la
  // fiche, dans l'ordre officiel des catégories) ; avec un filtre, une liste
  // simple.
  const cards: PartnerCardData[] = activeOrgs.map((org) => ({
    id: org.id,
    name: org.name,
    acronym: org.acronym,
    slug: org.slug,
    mission: org.mission,
    city: org.city,
    region: org.region,
    membershipOpen: org.membershipOpen,
    domainNames: org.domains.map((d) => d.name),
  }));

  const groups: Array<{ domainName: string; orgs: PartnerCardData[] }> = [];
  if (!filters.domaine) {
    const byMainDomain = new Map<string, PartnerCardData[]>();
    for (const org of cards) {
      const key = org.domainNames[0] ?? "Autres domaines";
      const list = byMainDomain.get(key);
      if (list) list.push(org);
      else byMainDomain.set(key, [org]);
    }
    // L'ordre des groupes suit l'ordre officiel des catégories ; les
    // domaines hors liste officielle passent à la fin.
    for (const domain of domains) {
      const list = byMainDomain.get(domain.name);
      if (list) {
        groups.push({ domainName: domain.name, orgs: list });
        byMainDomain.delete(domain.name);
      }
    }
    for (const [domainName, orgs] of byMainDomain) {
      groups.push({ domainName, orgs });
    }
  }

  const chipBase =
    "inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";
  const chipOn = `${chipBase} border-pine bg-pine text-[#F8F5EF]`;
  const chipOff = `${chipBase} border-[#D9D2BF] bg-card text-foreground hover:border-pine hover:bg-accent`;

  const total = cards.length;
  const openCount = cards.filter((o) => o.membershipOpen).length;

  return (
    <>
      {/* Bandeau d'introduction */}
      <section className="border-b border-border/70 bg-pine text-[#F8F5EF]">
        <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <p className="inline-flex items-center gap-2 rounded-full border border-[#F8F5EF]/25 bg-[#F8F5EF]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em]">
            <HandHeart aria-hidden="true" className="size-4" />
            Cartographie de l&apos;engagement
          </p>
          <h1 className="mt-5 max-w-3xl font-display text-3xl font-semibold leading-tight text-balance sm:text-4xl lg:text-5xl">
            Associations et ONG du Togo
          </h1>
          <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-[#F8F5EF]/85 sm:text-base">
            Des organisations qui font vivre les communautés, classées par domaine d&apos;intervention.
            Chaque fiche indique clairement s&apos;il est possible d&apos;intégrer leur communauté, et comment.
          </p>
          <p className="mt-4 text-sm text-[#F8F5EF]/70" aria-live="polite">
            {total} organisation{total > 1 ? "s" : ""} référencée{total > 1 ? "s" : ""} — dont{" "}
            {openCount} à adhésion ouverte.
          </p>
        </div>
      </section>

      {/* Filtres : recherche + domaines (formulaire GET natif) */}
      <section aria-label="Filtres de l'annuaire" className="border-b border-border/70 bg-background">
        <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6">
          <form method="get" action="/associations" role="search" className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <Label htmlFor="recherche-association" className="sr-only">
                Rechercher une association ou une ONG
              </Label>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="recherche-association"
                  name="q"
                  type="search"
                  defaultValue={filters.q}
                  placeholder="Rechercher par nom, sigle, ville ou mission…"
                  className="min-h-11 pl-9"
                  maxLength={120}
                />
              </div>
            </div>
            {filters.domaine ? <input type="hidden" name="domaine" value={filters.domaine} /> : null}
            <Button type="submit" className="min-h-11 bg-pine text-[#F8F5EF] hover:bg-pine-soft">
              Rechercher
            </Button>
          </form>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer par domaine d'intervention">
            <Link
              href={filters.q ? `/associations?q=${encodeURIComponent(filters.q)}` : "/associations"}
              className={filters.domaine === "" ? chipOn : chipOff}
              aria-current={filters.domaine === "" ? "true" : undefined}
            >
              Tous les domaines
            </Link>
            {domains.map((domain) => {
              const params = new URLSearchParams();
              if (filters.q) params.set("q", filters.q);
              params.set("domaine", domain.slug);
              const on = filters.domaine === domain.slug;
              return (
                <Link
                  key={domain.slug}
                  href={`/associations?${params.toString()}`}
                  className={on ? chipOn : chipOff}
                  aria-current={on ? "true" : undefined}
                >
                  {domain.name}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Résultats */}
      <section aria-label="Organisations" className="bg-[#F8F5EF]/60">
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          {total === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
              <HandHeart aria-hidden="true" className="mx-auto size-10 text-muted-foreground/50" />
              <h2 className="mt-4 font-display text-xl font-semibold">Aucune organisation trouvée</h2>
              <p className="mx-auto mt-2 max-w-md text-[15px] text-muted-foreground">
                Aucune association ne correspond à cette recherche. Essayez un autre mot-clé ou
                revenez à tous les domaines.
              </p>
              <Button asChild variant="outline" className="mt-5 min-h-11 border-[#D9D2BF]">
                <Link href="/associations">Voir tout l&apos;annuaire</Link>
              </Button>
            </div>
          ) : filters.domaine ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {cards.map((org) => (
                <PartnerCard key={org.id} org={org} />
              ))}
            </div>
          ) : (
            <div className="space-y-12">
              {groups.map((group) => (
                <div key={group.domainName}>
                  <h2 className="font-display text-xl font-semibold text-[#173D32] sm:text-2xl">
                    {group.domainName}
                    <span className="ml-2 align-middle text-sm font-normal text-muted-foreground">
                      ({group.orgs.length})
                    </span>
                  </h2>
                  <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {group.orgs.map((org) => (
                      <PartnerCard key={org.id} org={org} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
