import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { absoluteUrl } from "@/lib/site-url";
import {
  approvedFieldsOf,
  seoDescriptionFrom,
  serializePublicProfile,
} from "@/lib/public-profile";
import { MINOR_BIOGRAPHY_PUBLIC_MAX_LENGTH } from "@/lib/public-fields";
import { ShareButton } from "@/components/public/share-button";
import { TestimonialForm } from "@/components/public/testimonial-form";
import { BadgeIcon } from "@/components/public/badge-icon";
import { Flag, MapPin, MessageSquareHeart, ShieldCheck } from "lucide-react";

// Fiche publique individuelle (§4.4) — Server Component rendu à la demande :
// une publication peut être dépubliée à tout moment, jamais servie depuis un
// cache périmé. SEO/OG (§4.5) via generateMetadata ; JSON-LD Person minimal
// (nom public, description, URL — aucune donnée privée, aucune date de
// naissance). Toutes les données affichées proviennent du sérialiseur
// src/lib/public-profile.ts (liste blanche + double garde mineures §14).

export const dynamic = "force-dynamic";

async function loadPublishedProfileUncached(slug: string) {
  const publication = await db.profilePublication.findUnique({
    where: { slug },
    select: {
      slug: true,
      state: true,
      approvedFields: true,
      featured: true,
      publishedAt: true,
      seoTitle: true,
      seoDescription: true,
      person: {
        select: {
          id: true,
          status: true,
          publicName: true,
          isMinor: true,
          shortPresentation: true,
          biography: true,
          country: true,
          region: true,
          city: true,
          languages: true,
          storyJourney: true,
          engagementMotivation: true,
          keyEvent: true,
          difficultiesEncountered: true,
          lessonsLearned: true,
          inspirationSource: true,
          education: true,
          professionalExperience: true,
          responsibilities: true,
          organizations: true,
          skills: true,
          distinctions: true,
          visionCommunity: true,
          futureGoals: true,
          projectsToDevelop: true,
          supportNeeded: true,
          messageToYouth: true,
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
          initiatives: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              title: true,
              description: true,
              periodLabel: true,
              actionArea: true,
              beneficiaries: true,
              rolePlayed: true,
              partners: true,
              objectives: true,
              results: true,
              resultsType: true,
              projectState: true,
            },
          },
          // Témoignages publics (§9) : SEULS les APPROVED sont lus — un
          // témoignage en attente, refusé, signalé ou archivé n'est jamais
          // renvoyé (défense à la source, §9.1 « ne pas publier
          // automatiquement »). Les coordonnées (authorContact) ne sont
          // volontairement PAS sélectionnées.
          testimonials: {
            where: { status: "APPROVED" },
            orderBy: [{ decidedAt: "desc" }, { createdAt: "desc" }],
            take: 30,
            select: {
              id: true,
              authorDisplayName: true,
              relation: true,
              content: true,
              decidedAt: true,
              createdAt: true,
            },
          },
          // Reconnaissances (§12) : attributions ACTIVES de badges actifs.
          badges: {
            where: { removedAt: null, badge: { isActive: true } },
            orderBy: { awardedAt: "desc" },
            select: {
              id: true,
              awardedAt: true,
              badge: { select: { name: true, description: true, icon: true } },
            },
          },
        },
      },
    },
  });

  // Garde forte : publication ACTIVE + dossier PUBLISHED (§4.5 : une page
  // dépubliée cesse d'être accessible, 404 générique anti-énumération).
  if (!publication || publication.state !== "PUBLISHED" || publication.person.status !== "PUBLISHED") {
    return null;
  }

  return { publication, person: publication.person };
}

// Mémoïsé par requête : generateMetadata et la page partagent une seule lecture.
const loadPublishedProfile = cache(loadPublishedProfileUncached);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const loaded = await loadPublishedProfile(slug);

  // 404 générée dès la phase métadonnées : elle est résolue AVANT le premier
  // flush du shell (boundary loading) — le statut HTTP 404 est donc correct
  // (§4.5 : une page dépubliée ne doit pas rester accessible « comme si elle
  // était active », anti-énumération).
  if (!loaded) {
    notFound();
  }

  const { publication, person } = loaded;
  const title = publication.seoTitle?.trim() || person.publicName?.trim() || "Profil";
  const description =
    publication.seoDescription?.trim() ||
    seoDescriptionFrom(person.shortPresentation, person.biography) ||
    `Découvrez le parcours d'engagement de ${title}.`;

  // Image de partage : uniquement la photo autorisée (champ mainPhoto approuvé
  // + média public). La route de servage revalide elle-même chaque accès.
  const approved = new Set(approvedFieldsOf(publication.approvedFields));
  const photo =
    approved.has("mainPhoto")
      ? (person.media.find((m) => m.id === person.photoAsset?.id) ?? person.media[0] ?? null)
      : null;

  return {
    title,
    description,
    alternates: { canonical: `/profils/${slug}` },
    // Profil publié : indexable (§4.5). metadataBase est défini dans le layout
    // racine depuis NEXTAUTH_URL — les URL relatives sont résolues en absolu.
    robots: { index: true, follow: true },
    openGraph: {
      type: "profile",
      title,
      description,
      url: `/profils/${slug}`,
      ...(photo ? { images: [{ url: `/api/public/media/${photo.id}` }] } : {}),
    },
  };
}

const frDate = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

export default async function ProfilPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const loaded = await loadPublishedProfile(slug);
  if (!loaded) {
    notFound();
  }

  const { publication, person } = loaded;
  const view = serializePublicProfile(person, publication);
  if (!view) {
    notFound();
  }

  // Témoignages publics (§9) : la requête ne renvoie QUE les APPROVED ;
  // coordonnées jamais sélectionnées (elle n'existent pas côté public).
  const approvedTestimonials = person.testimonials.map((testimonial) => ({
    id: testimonial.id,
    authorDisplayName: testimonial.authorDisplayName,
    relation: testimonial.relation,
    content: testimonial.content,
    dateISO: (testimonial.decidedAt ?? testimonial.createdAt).toISOString(),
  }));

  // Reconnaissances publiques (§12) : attributions actives de badges actifs.
  const publicBadges = person.badges.map((assignment) => ({
    id: assignment.id,
    name: assignment.badge.name,
    description: assignment.badge.description,
    icon: assignment.badge.icon,
    dateISO: assignment.awardedAt.toISOString(),
  }));

  // Compteur de vues (donnée interne d'aide à la gestion — jamais affichée
  // publiquement, la valorisation ne repose pas sur la popularité §4.1/§10).
  await db.personRecord.update({
    where: { id: person.id },
    data: { viewCount: { increment: 1 } },
    select: { id: true },
  });

  const seoDescription =
    publication.seoDescription?.trim() ||
    seoDescriptionFrom(person.shortPresentation, person.biography) ||
    `Découvrez le parcours d'engagement de ${view.publicName}.`;

  // Données structurées minimales (§20 : uniquement le contenu réel) — nom
  // public, description, URL canonique et image autorisée. Aucune donnée
  // privée, aucune date de naissance.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: view.publicName,
    description: seoDescription,
    url: absoluteUrl(`/profils/${view.slug}`),
    ...(view.photo ? { image: absoluteUrl(view.photo.url) } : {}),
  };

  const H2 = "font-display text-2xl font-semibold text-foreground sm:text-3xl";
  const initial = view.publicName.trim().charAt(0).toUpperCase() || "•";

  return (
    <article>
      {/* En-tête : bandeau vert, photo autorisée (ou initiale) + identité publique. */}
      <header className="bg-pine text-[#F8F5EF]">
        <div className="mx-auto w-full max-w-6xl px-4 pt-6 pb-12 sm:px-6 sm:pb-14">
          <nav aria-label="Fil d'Ariane" className="text-sm text-[#F8F5EF]/75">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li>
                <Link
                  href="/profils"
                  className="rounded-sm text-[#F8F5EF] underline underline-offset-4 hover:text-gold-soft focus-visible:ring-[3px] focus-visible:ring-gold/60 focus-visible:outline-none"
                >
                  Les parcours
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="truncate">
                {view.publicName}
              </li>
            </ol>
          </nav>

          {/* Bandeau de protection des mineures (§14) — avant tout contenu. */}
          {view.isMinor ? (
            <div
              role="note"
              className="mt-6 flex items-start gap-2.5 rounded-lg border border-gold/60 bg-pine-deep/60 px-4 py-3 text-sm text-[#F8F5EF]"
            >
              <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-gold" />
              <p>
                <strong className="font-semibold">Profil protégé</strong> — publication limitée :
                les informations de localisation précise sont masquées et la biographie est tronquée
                ({MINOR_BIOGRAPHY_PUBLIC_MAX_LENGTH.toLocaleString("fr-FR")} caractères au maximum).
              </p>
            </div>
          ) : null}

          <div className="mt-8 flex flex-col gap-8 sm:flex-row sm:items-center sm:gap-10">
            {view.photo ? (
              <img
                src={view.photo.url}
                alt={view.photo.alt}
                width={view.photo.width ?? 400}
                height={view.photo.height ?? 480}
                loading="eager"
                decoding="async"
                className="aspect-[5/6] w-40 shrink-0 rounded-2xl border border-gold/40 object-cover sm:w-52"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex aspect-[5/6] w-40 shrink-0 items-center justify-center rounded-2xl border border-gold/40 bg-pine-soft font-display text-7xl font-semibold text-gold-soft sm:w-52"
              >
                {initial}
              </span>
            )}
            <div className="min-w-0">
              {view.category ? (
                <p className="inline-flex items-center gap-2 rounded-full bg-gold/15 px-3.5 py-1.5 text-sm font-medium text-gold-soft">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-gold" />
                  {view.category.name}
                </p>
              ) : null}
              <h1 className="mt-4 font-display text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-5xl">
                {view.publicName}
              </h1>
              {view.shortPresentation ? (
                <p className="mt-4 max-w-2xl text-lg leading-relaxed text-[#F8F5EF]/88">
                  {view.shortPresentation}
                </p>
              ) : null}
              <p className="mt-5 flex flex-wrap gap-x-6 gap-y-1.5 text-[15px] text-[#F8F5EF]/80">
                {view.location ? (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin aria-hidden="true" className="size-4" />
                    {view.location}
                  </span>
                ) : null}
                {view.publishedAtISO ? (
                  <span>Publié le {frDate.format(new Date(view.publishedAtISO))}</span>
                ) : null}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-12 sm:px-6 sm:py-16 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-14">
          {/* Biographie — paragraphe par double saut de ligne. */}
          {view.biographyParagraphs ? (
            <section aria-labelledby="biographie">
              <h2 id="biographie" className={H2}>
                Biographie
              </h2>
              <div className="mt-5 max-w-[68ch] space-y-4">
                {view.biographyParagraphs.map((paragraph, index) => (
                  <p key={index} className="text-[17px] leading-relaxed text-foreground/90">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ) : null}

          {/* Sections textuelles — uniquement champs approuvés et non vides. */}
          {view.sections.map((section) => (
            <section key={section.key} aria-labelledby={`section-${section.key}`}>
              <h2 id={`section-${section.key}`} className={H2}>
                {section.label}
              </h2>
              <p className="mt-5 max-w-[68ch] whitespace-pre-line text-[17px] leading-relaxed text-foreground/90">
                {section.value}
              </p>
            </section>
          ))}

          {/* Initiatives — uniquement si le champ « initiatives » est approuvé. */}
          {view.initiatives.length > 0 ? (
            <section aria-labelledby="initiatives">
              <h2 id="initiatives" className={H2}>
                Initiatives menées
              </h2>
              <ul className="mt-6 grid list-none gap-4 p-0">
                {view.initiatives.map((initiative) => (
                  <li key={initiative.id} className="rounded-2xl border border-border bg-card p-6">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="font-display text-xl font-semibold text-foreground">
                        {initiative.title}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        {initiative.projectState ? (
                          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                            {initiative.projectState}
                          </span>
                        ) : null}
                        {initiative.periodLabel ? <span>{initiative.periodLabel}</span> : null}
                      </div>
                    </div>
                    {initiative.description ? (
                      <p className="mt-3 text-[15px] leading-relaxed text-foreground/90">
                        {initiative.description}
                      </p>
                    ) : null}
                    {initiative.objectives ? (
                      <p className="mt-3 text-[15px] leading-relaxed text-foreground/90">
                        <span className="font-medium text-foreground">Objectifs : </span>
                        {initiative.objectives}
                      </p>
                    ) : null}
                    {initiative.results ? (
                      <p className="mt-3 text-[15px] leading-relaxed text-foreground/90">
                        <span className="font-medium text-foreground">
                          {initiative.resultsType ?? "Résultats"} :{" "}
                        </span>
                        {initiative.results}
                      </p>
                    ) : null}
                    {initiative.actionArea ||
                    initiative.rolePlayed ||
                    initiative.beneficiaries ||
                    initiative.partners ? (
                      <dl className="mt-5 grid gap-4 border-t border-border/70 pt-5 text-sm sm:grid-cols-2">
                        {initiative.actionArea ? (
                          <div>
                            <dt className="font-semibold text-muted-foreground">Domaine</dt>
                            <dd className="mt-0.5 text-foreground">{initiative.actionArea}</dd>
                          </div>
                        ) : null}
                        {initiative.rolePlayed ? (
                          <div>
                            <dt className="font-semibold text-muted-foreground">Rôle</dt>
                            <dd className="mt-0.5 text-foreground">{initiative.rolePlayed}</dd>
                          </div>
                        ) : null}
                        {initiative.beneficiaries ? (
                          <div>
                            <dt className="font-semibold text-muted-foreground">Bénéficiaires</dt>
                            <dd className="mt-0.5 text-foreground">{initiative.beneficiaries}</dd>
                          </div>
                        ) : null}
                        {initiative.partners ? (
                          <div>
                            <dt className="font-semibold text-muted-foreground">Partenaires</dt>
                            <dd className="mt-0.5 text-foreground">{initiative.partners}</dd>
                          </div>
                        ) : null}
                      </dl>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Témoignages (§9) — uniquement les APPROVED. État vide honnête. */}
          <section aria-labelledby="temoignages">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="temoignages" className={H2}>
                Témoignages
              </h2>
              <TestimonialForm slug={view.slug} personName={view.publicName} />
            </div>

            {approvedTestimonials.length > 0 ? (
              <ul className="mt-6 grid list-none gap-4 p-0 md:grid-cols-2">
                {approvedTestimonials.map((testimonial) => (
                  <li key={testimonial.id}>
                    <figure className="h-full rounded-2xl border border-border bg-card p-6">
                      <blockquote className="text-base leading-relaxed text-foreground/90">
                        <p className="whitespace-pre-line">« {testimonial.content} »</p>
                      </blockquote>
                      <figcaption className="mt-4 text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {testimonial.authorDisplayName}
                        </span>
                        {testimonial.relation ? <span> — {testimonial.relation}</span> : null}
                        {testimonial.dateISO ? (
                          <span> · {frDate.format(new Date(testimonial.dateISO))}</span>
                        ) : null}
                      </figcaption>
                    </figure>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-6 flex items-start gap-2.5 rounded-xl border border-dashed border-[#CFC7B2] bg-card/60 px-4 py-3.5 text-sm text-muted-foreground">
                <MessageSquareHeart aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>
                  Aucun témoignage approuvé pour le moment. Les témoignages proposés par les
                  visiteurs sont relus par l&apos;équipe avant publication.
                </span>
              </p>
            )}
          </section>
        </div>

        {/* Colonne latérale : reconnaissances, partage, signalement. */}
        <aside aria-label="En bref" className="flex flex-col gap-5 lg:sticky lg:top-24 lg:w-80 lg:shrink-0">
          {publicBadges.length > 0 ? (
            <section aria-labelledby="reconnaissances" className="rounded-2xl border border-border bg-card p-6">
              <h2
                id="reconnaissances"
                className="text-xs font-semibold tracking-[0.12em] text-[#7A5E22] uppercase"
              >
                Reconnaissances
              </h2>
              <ul className="mt-4 grid list-none gap-4 p-0">
                {publicBadges.map((badge) => (
                  <li key={badge.id} className="flex gap-3">
                    <span
                      aria-hidden="true"
                      className="flex size-11 shrink-0 items-center justify-center rounded-full bg-pine text-gold"
                    >
                      <BadgeIcon name={badge.icon} className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[15px] font-semibold text-foreground">{badge.name}</h3>
                      {badge.description ? (
                        <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                          {badge.description}
                        </p>
                      ) : null}
                      {badge.dateISO ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Attribué le {frDate.format(new Date(badge.dateISO))}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-muted-foreground">
                Reconnaissance de la plateforme Dora, distincte d&apos;une certification officielle.
              </p>
            </section>
          ) : null}

          <section aria-label="Partager et signaler" className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
            <ShareButton url={`/profils/${view.slug}`} title={view.publicName} />
            <p className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
              <Flag aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>
                Profil publié avec le consentement de la personne. Une erreur, une correction ou un
                retrait ?{" "}
                <Link
                  href={`/demandes-droits?profil=${view.slug}`}
                  className="font-medium text-pine underline decoration-gold underline-offset-4 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  Signaler ou demander une correction
                </Link>
              </span>
            </p>
          </section>
        </aside>
      </div>

      {/* Données structurées — JSON échappé (aucune donnée privée). */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </article>
  );
}
