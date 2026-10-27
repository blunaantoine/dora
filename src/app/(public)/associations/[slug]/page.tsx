import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Globe,
  Lock,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";

import { db } from "@/lib/db";

// Fiche d'une association / ONG (§ annuaire partenaires) — Server Component.
// La fiche répond à une seule question pour le visiteur : « puis-je intégrer
// leur communauté ? » — encart d'adhésion explicite (ouverte / fermée) avec
// les modalités concrètes transmises par l'organisation.

export const dynamic = "force-dynamic";

async function getOrganization(slug: string) {
  return db.partnerOrganization.findFirst({
    where: { slug, isActive: true },
    include: {
      domains: {
        orderBy: { sortOrder: "asc" },
        select: { name: true, slug: true },
      },
    },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const org = await getOrganization(slug).catch(() => null);
  if (!org) return { title: "Organisation introuvable" };
  return {
    title: `${org.name}${org.acronym ? ` (${org.acronym})` : ""} — Association / ONG`,
    description: org.mission.slice(0, 300),
    robots: { index: true, follow: true },
  };
}

function ContactItem({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Mail;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <p className="flex items-start gap-2.5 text-[15px] text-foreground/85">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[#173D32]/70" />
      <span>
        <span className="sr-only">{label} : </span>
        {children}
      </span>
    </p>
  );
}

export default async function AssociationDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getOrganization(slug);
  if (!org) notFound();

  const localisation = [org.city, org.region].filter(Boolean).join(", ") || "Togo";

  return (
    <article className="bg-[#F8F5EF]/60">
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        {/* Retour à l'annuaire */}
        <Link
          href="/associations"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-[15px] font-medium text-foreground/80 transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Retour à l&apos;annuaire des associations
        </Link>

        {/* En-tête de la fiche */}
        <header className="mt-5 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Association · ONG — Togo
          </p>
          <h1 className="mt-2 font-display text-2xl font-semibold leading-tight text-balance text-foreground sm:text-3xl">
            {org.name}
            {org.acronym ? <span className="text-muted-foreground"> · {org.acronym}</span> : null}
          </h1>

          <p className="mt-3 flex items-center gap-1.5 text-[15px] text-muted-foreground">
            <MapPin aria-hidden="true" className="size-4 shrink-0" />
            {localisation}
          </p>

          <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Domaines d'intervention">
            {org.domains.map((domain) => (
              <li key={domain.slug}>
                <Link
                  href={`/associations?domaine=${domain.slug}`}
                  className="inline-flex min-h-8 items-center rounded-full border border-[#D9D2BF] bg-background px-2.5 py-0.5 text-xs font-medium text-foreground/80 transition-colors hover:border-pine hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {domain.name}
                </Link>
              </li>
            ))}
          </ul>
        </header>

        {/* Mission */}
        <section aria-labelledby="mission-org" className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <h2 id="mission-org" className="font-display text-xl font-semibold text-[#173D32]">
            Sa mission
          </h2>
          <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-foreground/90">
            {org.mission}
          </p>
        </section>

        {/* Encart adhésion — la réponse à la question du visiteur */}
        <section
          aria-labelledby="adhesion-org"
          className={`mt-6 rounded-2xl border p-6 shadow-sm sm:p-8 ${
            org.membershipOpen
              ? "border-[#2E6B4F]/35 bg-[#EAF3EC]"
              : "border-border bg-card"
          }`}
        >
          <h2 id="adhesion-org" className="flex items-center gap-2.5 font-display text-xl font-semibold text-[#173D32]">
            {org.membershipOpen ? (
              <>
                <CheckCircle2 aria-hidden="true" className="size-5 shrink-0 text-[#2E6B4F]" />
                Oui, il est possible d&apos;intégrer leur communauté
              </>
            ) : (
              <>
                <Lock aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
                Impossible d&apos;intégrer leur communauté pour le moment
              </>
            )}
          </h2>

          <p
            className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
              org.membershipOpen
                ? "border-[#2E6B4F]/30 bg-card text-[#2E6B4F]"
                : "border-border bg-muted text-muted-foreground"
            }`}
          >
            <span
              aria-hidden="true"
              className={`size-1.5 rounded-full ${
                org.membershipOpen ? "bg-[#2E6B4F]" : "bg-muted-foreground/60"
              }`}
            />
            Adhésion {org.membershipOpen ? "ouverte" : "fermée"}
          </p>

          {org.membershipInfo ? (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-foreground">Modalités transmises par l&apos;organisation</h3>
              <p className="mt-1.5 whitespace-pre-line text-[15px] leading-relaxed text-foreground/90">
                {org.membershipInfo}
              </p>
            </div>
          ) : (
            <p className="mt-4 text-[15px] leading-relaxed text-foreground/80">
              {org.membershipOpen
                ? "L'organisation n'a pas encore détaillé ses modalités d'adhésion : contactez-la directement pour connaître la marche à suivre."
                : "Cette organisation n'accepte pas de nouvelles adhésions actuellement. Ses coordonnées restent disponibles ci-dessous si vous souhaitez lui écrire."}
            </p>
          )}
        </section>

        {/* Coordonnées */}
        <section aria-labelledby="contact-org" className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <h2 id="contact-org" className="font-display text-xl font-semibold text-[#173D32]">
            La contacter
          </h2>
          <div className="mt-4 space-y-2.5">
            {org.website ? (
              <ContactItem icon={Globe} label="Site web">
                <a
                  href={org.website}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="break-all underline underline-offset-4 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {org.website.replace(/^https?:\/\//, "")}
                </a>
              </ContactItem>
            ) : null}
            {org.email ? (
              <ContactItem icon={Mail} label="Adresse e-mail">
                <a
                  href={`mailto:${org.email}`}
                  className="break-all underline underline-offset-4 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {org.email}
                </a>
              </ContactItem>
            ) : null}
            {org.phone ? (
              <ContactItem icon={Phone} label="Téléphone">
                <a
                  href={`tel:${org.phone.replace(/\s/g, "")}`}
                  className="underline underline-offset-4 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {org.phone}
                </a>
              </ContactItem>
            ) : null}
            <ContactItem icon={MapPin} label="Localisation">
              {localisation}
            </ContactItem>
          </div>

          <p className="mt-5 rounded-xl border border-[#D9D2BF] bg-background p-3.5 text-sm leading-relaxed text-muted-foreground">
            Dora ne sert d&apos;intermédiaire que pour les parcours des personnes engagées : pour
            rejoindre une organisation, contactez-la directement via les coordonnées ci-dessus.
          </p>
        </section>
      </div>
    </article>
  );
}
