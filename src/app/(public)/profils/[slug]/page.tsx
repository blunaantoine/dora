import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  approvedFieldsOf,
  seoDescriptionFrom,
  serializePublicProfile,
} from "@/lib/public-profile";
import { MINOR_BIOGRAPHY_PUBLIC_MAX_LENGTH } from "@/lib/public-fields";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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

const GENERIC_404 = { title: "Profil introuvable", description: "Ce profil n'est pas disponible." };

async function loadPublishedProfile(slug: string) {
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
    url: `/profils/${view.slug}`,
    ...(view.photo ? { image: view.photo.url } : {}),
  };

  return (
    <article className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      {/* Bandeau de protection des mineures (§14) — avant tout contenu. */}
      {view.isMinor ? (
        <div
          role="note"
          className="mb-8 flex items-start gap-2.5 rounded-lg border border-gold/60 bg-gold/15 px-4 py-3 text-sm text-pine"
        >
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>
            <strong className="font-semibold">Profil protégé</strong> — publication limitée : les
            informations de localisation précise sont masquées et la biographie est tronquée (
            {MINOR_BIOGRAPHY_PUBLIC_MAX_LENGTH.toLocaleString("fr-FR")}{" "}
            caractères au maximum).
          </p>
        </div>
      ) : null}

      {/* En-tête : photo de couverture autorisée + identité publique. */}
      <header>
        {view.photo ? (
          <img
            src={view.photo.url}
            alt={view.photo.alt}
            width={view.photo.width ?? 800}
            height={view.photo.height ?? 450}
            loading="eager"
            decoding="async"
            className="max-h-96 w-full rounded-xl border border-border object-cover"
          />
        ) : null}

        <h1 className="mt-6 font-display text-3xl font-semibold text-balance text-foreground sm:text-4xl">
          {view.publicName}
        </h1>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {view.category ? (
            <Badge className="bg-pine text-[#F8F5EF] hover:bg-pine">
              <span aria-hidden="true" className="mr-1.5 size-1.5 rounded-full bg-gold" />
              {view.category.name}
            </Badge>
          ) : null}
          {view.location ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin aria-hidden="true" className="size-4" />
              {view.location}
            </span>
          ) : null}
        </div>

        {view.shortPresentation ? (
          <p className="mt-5 max-w-3xl text-lg leading-relaxed text-foreground/90">
            {view.shortPresentation}
          </p>
        ) : null}
      </header>

      {/* Biographie — paragraphe par double saut de ligne. */}
      {view.biographyParagraphs ? (
        <section aria-label="Biographie" className="mt-10">
          <h2 className="font-display text-xl font-semibold text-foreground sm:text-2xl">
            Biographie
          </h2>
          <div className="mt-4 h-1 w-14 rounded-full bg-gold" aria-hidden="true" />
          <div className="mt-4 space-y-4">
            {view.biographyParagraphs.map((paragraph, index) => (
              <p key={index} className="text-base leading-relaxed text-foreground/90">
                {paragraph}
              </p>
            ))}
          </div>
        </section>
      ) : null}

      {/* Sections textuelles — uniquement champs approuvés et non vides. */}
      {view.sections.length > 0 ? (
        <div className="mt-10 space-y-10">
          {view.sections.map((section) => (
            <section key={section.key} aria-label={section.label}>
              <h2 className="font-display text-xl font-semibold text-foreground sm:text-2xl">
                {section.label}
              </h2>
              <div className="mt-4 h-1 w-14 rounded-full bg-gold" aria-hidden="true" />
              <p className="mt-4 whitespace-pre-line text-base leading-relaxed text-foreground/90">
                {section.value}
              </p>
            </section>
          ))}
        </div>
      ) : null}

      {/* Initiatives — uniquement si le champ « initiatives » est approuvé. */}
      {view.initiatives.length > 0 ? (
        <section aria-label="Initiatives menées" className="mt-10">
          <h2 className="font-display text-xl font-semibold text-foreground sm:text-2xl">
            Initiatives menées
          </h2>
          <div className="mt-4 h-1 w-14 rounded-full bg-gold" aria-hidden="true" />
          <ul className="mt-4 grid list-none gap-4 p-0">
            {view.initiatives.map((initiative) => (
              <li key={initiative.id} className="rounded-xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-display text-lg font-semibold text-foreground">
                    {initiative.title}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {initiative.projectState ? (
                      <span className="rounded-full bg-secondary px-2.5 py-0.5 font-medium text-secondary-foreground">
                        {initiative.projectState}
                      </span>
                    ) : null}
                    {initiative.periodLabel ? <span>{initiative.periodLabel}</span> : null}
                  </div>
                </div>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  {initiative.actionArea ? (
                    <div>
                      <dt className="font-medium text-foreground">Domaine</dt>
                      <dd className="text-muted-foreground">{initiative.actionArea}</dd>
                    </div>
                  ) : null}
                  {initiative.rolePlayed ? (
                    <div>
                      <dt className="font-medium text-foreground">Rôle</dt>
                      <dd className="text-muted-foreground">{initiative.rolePlayed}</dd>
                    </div>
                  ) : null}
                  {initiative.beneficiaries ? (
                    <div>
                      <dt className="font-medium text-foreground">Bénéficiaires</dt>
                      <dd className="text-muted-foreground">{initiative.beneficiaries}</dd>
                    </div>
                  ) : null}
                  {initiative.partners ? (
                    <div>
                      <dt className="font-medium text-foreground">Partenaires</dt>
                      <dd className="text-muted-foreground">{initiative.partners}</dd>
                    </div>
                  ) : null}
                </dl>
                {initiative.description ? (
                  <p className="mt-3 text-sm leading-relaxed text-foreground/90">
                    {initiative.description}
                  </p>
                ) : null}
                {initiative.objectives ? (
                  <p className="mt-3 text-sm leading-relaxed text-foreground/90">
                    <span className="font-medium text-foreground">Objectifs : </span>
                    {initiative.objectives}
                  </p>
                ) : null}
                {initiative.results ? (
                  <p className="mt-3 text-sm leading-relaxed text-foreground/90">
                    <span className="font-medium text-foreground">
                      {initiative.resultsType ?? "Résultats"} :{" "}
                    </span>
                    {initiative.results}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Témoignages (§9) — uniquement les APPROVED, servis par la même
          requête (aucun appel public supplémentaire, rien avant modération).
          État vide honnête : jamais de faux témoignage. */}
      <section aria-label="Témoignages" className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold text-foreground sm:text-2xl">
            Témoignages
          </h2>
          <TestimonialForm slug={view.slug} personName={view.publicName} />
        </div>
        <div className="mt-4 h-1 w-14 rounded-full bg-gold" aria-hidden="true" />

        {approvedTestimonials.length > 0 ? (
          <ul className="mt-4 grid list-none gap-4 p-0">
            {approvedTestimonials.map((testimonial) => (
              <li key={testimonial.id} className="rounded-xl border border-border bg-card p-5">
                <blockquote className="text-base leading-relaxed text-foreground/90">
                  <p className="whitespace-pre-line">{testimonial.content}</p>
                </blockquote>
                <footer className="mt-3 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{testimonial.authorDisplayName}</span>
                  {testimonial.relation ? <span> — {testimonial.relation}</span> : null}
                  {testimonial.dateISO ? (
                    <span> · {frDate.format(new Date(testimonial.dateISO))}</span>
                  ) : null}
                </footer>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 flex items-start gap-2.5 rounded-lg border border-dashed border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
            <MessageSquareHeart aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              Aucun témoignage approuvé pour le moment. Les témoignages proposés par les visiteurs
              sont relus par l&apos;équipe avant publication.
            </span>
          </p>
        )}
      </section>

      {/* Reconnaissances (§12) — badges actifs uniquement, avec mention
          discrète : reconnaissance de la plateforme, distincte d'une
          certification officielle. */}
      {publicBadges.length > 0 ? (
        <section aria-label="Reconnaissances" className="mt-10">
          <h2 className="font-display text-xl font-semibold text-foreground sm:text-2xl">
            Reconnaissances
          </h2>
          <div className="mt-4 h-1 w-14 rounded-full bg-gold" aria-hidden="true" />
          <ul className="mt-4 grid list-none gap-4 p-0 sm:grid-cols-2">
            {publicBadges.map((badge) => (
              <li key={badge.id} className="rounded-xl border border-gold/50 bg-card p-5">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex size-10 shrink-0 items-center justify-center rounded-full border border-gold/60 bg-gold/15 text-pine"
                  >
                    <BadgeIcon name={badge.icon} className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-display text-base font-semibold text-foreground">
                      {badge.name}
                    </h3>
                    {badge.dateISO ? (
                      <p className="text-xs text-muted-foreground">
                        Attribué le {frDate.format(new Date(badge.dateISO))}
                      </p>
                    ) : null}
                  </div>
                </div>
                {badge.description ? (
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {badge.description}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Reconnaissance de la plateforme Dora, distincte d&apos;une certification officielle.
          </p>
        </section>
      ) : null}

      <Separator className="my-10" />

      {/* Pied de fiche : date de publication réelle, signalement, partage. */}
      <footer className="grid gap-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {view.publishedAtISO ? `Publié le ${frDate.format(new Date(view.publishedAtISO))}` : null}
          </p>
          <ShareButton url={`/profils/${view.slug}`} title={view.publicName} />
        </div>
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Flag aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            Une erreur à signaler, une correction à demander, ou un retrait de publication ?{" "}
            <Link
              href={`/demandes-droits?profil=${view.slug}`}
              className="font-medium text-pine underline decoration-gold underline-offset-4 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              Signaler ou demander une correction
            </Link>
          </span>
        </p>
      </footer>

      {/* Données structurées — JSON échappé (aucune donnée privée). */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </article>
  );
}
