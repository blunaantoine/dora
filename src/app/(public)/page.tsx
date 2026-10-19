import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  ClipboardCheck,
  Eye,
  HandHeart,
  Lightbulb,
  LockKeyhole,
  MailPlus,
  SearchCheck,
  ShieldCheck,
  Sprout,
  Users,
} from "lucide-react";

import { db } from "@/lib/db";
import { serializePublicCard, type PublicCardView } from "@/lib/public-profile";
import { ProfileCard } from "@/components/public/profile-card";
import { Button } from "@/components/ui/button";

// Slogan et contenus institutionnels — cahier des charges (slogan §0, mission
// §1.1, critères §13, démarche §3/§6/§8). Aucun chiffre ni témoignage inventé :
// la plateforme est en préparation et la base est vide.

const CRITERES = [
  {
    icon: ClipboardCheck,
    titre: "Résultats documentés",
    texte:
      "Les initiatives présentées s'appuient sur des réalisations concrètes, observables et décrites avec précision.",
  },
  {
    icon: Sprout,
    titre: "Continuité de l'engagement",
    texte:
      "La durée et la régularité de l'engagement comptent davantage qu'un coup d'éclat isolé.",
  },
  {
    icon: BadgeCheck,
    titre: "Pertinence de l'initiative",
    texte:
      "Chaque démarche répond à un besoin réel de la communauté et s'inscrit dans son contexte.",
  },
  {
    icon: Users,
    titre: "Contribution à la communauté",
    texte:
      "L'impact sur les personnes environnantes — éducatif, social, environnemental, culturel — est au cœur de la valorisation.",
  },
  {
    icon: SearchCheck,
    titre: "Qualité des éléments de preuve",
    texte:
      "Les informations sont vérifiables : pièces, témoignages et faits sont examinés par l'équipe avant toute publication.",
  },
  {
    icon: Lightbulb,
    titre: "Enseignements ou effets durables",
    texte:
      "Les parcours retenus transmettent des apprentissages dont d'autres peuvent s'inspirer durablement.",
  },
] as const;

const DEMARCHE = [
  {
    icon: Eye,
    etape: "1",
    titre: "Identification",
    texte:
      "L'équipe repère les parcours de femmes et de filles engagées, sur proposition du public ou par ses propres recherches.",
  },
  {
    icon: MailPlus,
    etape: "2",
    titre: "Invitation privée",
    texte:
      "La personne concernée reçoit une invitation personnelle et sécurisée. Aucun compte public à créer : elle garde la maîtrise de ses informations.",
  },
  {
    icon: SearchCheck,
    etape: "3",
    titre: "Examen par l'équipe",
    texte:
      "Les réponses, les initiatives et les éléments de preuve sont examinés avec soin ; des demandes de précisions peuvent être adressées.",
  },
  {
    icon: ShieldCheck,
    etape: "4",
    titre: "Publication validée",
    texte:
      "Un profil n'est publié qu'après validation administrative et consentement éclairé de la personne — jamais automatiquement.",
  },
] as const;

export default async function HomePage() {
  // §4.1 : sélection de profils récemment publiés — données réelles uniquement
  // (aucun profil fictif, aucun chiffre inventé). Sérialisation via le
  // sérialiseur public unique (champs approuvés, double garde mineures).
  const latestPublications = await db.profilePublication.findMany({
    where: { state: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take: 3,
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

  const latestProfiles: PublicCardView[] = latestPublications
    .map((publication) => serializePublicCard(publication.person, publication))
    .filter((card): card is PublicCardView => card !== null);

  return (
    <>
      {/* Hero — fond vert profond, texte ivoire, accents or (AA respecté :
          l'or n'est utilisé que sur fond vert, jamais pour du texte courant). */}
      <section className="relative overflow-hidden bg-pine text-[#F8F5EF]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 85% 15%, #D6B15E 0, transparent 42%), radial-gradient(circle at 8% 92%, #D6B15E 0, transparent 36%)",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full border border-gold/30 sm:size-96"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-16 size-64 rounded-full border border-gold/20 sm:size-80"
        />
        <div className="relative mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:py-28">
          <p className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-pine-deep/40 px-3 py-1 text-xs font-medium tracking-wide text-gold">
            <HandHeart aria-hidden="true" className="size-3.5" />
            Projet en préparation
          </p>
          <h1 className="mt-6 max-w-3xl font-display text-3xl leading-tight font-semibold text-balance sm:text-4xl lg:text-5xl">
            Celles qui font avancer le monde méritent d&apos;être connues.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-[#F8F5EF]/85 sm:text-lg">
            De nombreuses femmes et filles font progresser leurs communautés par des engagements
            éducatifs, sociaux, humanitaires, entrepreneuriaux, environnementaux, culturels ou
            citoyens. Leurs initiatives restent pourtant souvent peu visibles. Cette plateforme a
            pour vocation de documenter, valoriser et transmettre ces parcours — avec rigueur,
            consentement et protection des personnes.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              asChild
              size="lg"
              className="bg-gold text-pine-deep shadow-none transition-colors hover:bg-gold-soft focus-visible:ring-gold/50"
            >
              <Link href="/profils">
                Découvrir les parcours
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            {/* Proposition publique ouverte (§11) : formulaire réel sur
                /proposer — l'équipe examine chaque proposition (§11.2). */}
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border border-[#F8F5EF]/40 bg-transparent text-[#F8F5EF] shadow-none hover:bg-transparent hover:bg-[#F8F5EF]/10 hover:text-[#F8F5EF] focus-visible:ring-[#F8F5EF]/50"
            >
              <Link href="/proposer">Proposer une personne</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Notre mission */}
      <section aria-labelledby="mission" className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <h2 id="mission" className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
          Notre mission
        </h2>
        <div className="mt-4 h-1 w-14 rounded-full bg-gold" aria-hidden="true" />
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <p className="text-base leading-relaxed text-foreground/90 lg:col-span-2">
            Dépasser le simple répertoire de personnes : la plateforme doit devenir un espace de
            <strong className="font-semibold"> reconnaissance</strong>, de
            <strong className="font-semibold"> transmission d&apos;expériences </strong>
            et de <strong className="font-semibold">découverte de parcours inspirants</strong>.
            Chaque profil présenté ici a été identifié, invité et examiné par l&apos;équipe, puis
            publié avec le consentement de la personne concernée. La qualité et l&apos;impact
            d&apos;un engagement priment toujours sur la popularité en ligne.
          </p>
          <ul className="grid gap-3 text-sm text-foreground/85">
            <li className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
              <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-pine" />
              <span>
                Aucune information privée n&apos;apparaît dans les pages publiques ; les profils de
                mineures bénéficient de protections renforcées.
              </span>
            </li>
            <li className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
              <LockKeyhole aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-pine" />
              <span>
                Les informations fournies ne sont jamais publiées automatiquement : chaque
                publication est une décision validée.
              </span>
            </li>
            <li className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
              <HandHeart aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-pine" />
              <span>
                Les personnes concernées peuvent demander une correction ou le retrait de leurs
                informations à tout moment.
              </span>
            </li>
          </ul>
        </div>
      </section>

      {/* Critères de valorisation */}
      <section
        aria-labelledby="criteres"
        className="border-y border-border/70 bg-muted/45"
      >
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h2 id="criteres" className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
            Nos critères de valorisation
          </h2>
          <div className="mt-4 h-1 w-14 rounded-full bg-gold" aria-hidden="true" />
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-foreground/85">
            La valorisation ne repose ni sur les notes, ni sur la popularité, ni sur le nombre de
            vues. Elle s&apos;appuie sur des critères publics, explicables et vérifiables :
          </p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CRITERES.map((critere) => (
              <li
                key={critere.titre}
                className="rounded-xl border border-border bg-card p-5 shadow-xs transition-shadow hover:shadow-sm"
              >
                <critere.icon aria-hidden="true" className="size-6 text-pine" />
                <h3 className="mt-3 font-display text-base font-semibold text-foreground">
                  {critere.titre}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{critere.texte}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Notre démarche */}
      <section aria-labelledby="demarche" className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <h2 id="demarche" className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
          Notre démarche
        </h2>
        <div className="mt-4 h-1 w-14 rounded-full bg-gold" aria-hidden="true" />
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {DEMARCHE.map((etape) => (
            <li key={etape.etape} className="relative rounded-xl border border-border bg-card p-5">
              <span
                aria-hidden="true"
                className="flex size-8 items-center justify-center rounded-full bg-pine font-display text-sm font-semibold text-gold"
              >
                {etape.etape}
              </span>
              <h3 className="mt-3 font-display text-base font-semibold text-foreground">
                {etape.titre}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{etape.texte}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Derniers parcours publiés (§4.1) — données réelles ou état vide honnête. */}
      <section aria-labelledby="derniers-parcours" className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6 sm:pb-24">
        <h2 id="derniers-parcours" className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
          Derniers parcours publiés
        </h2>
        <div className="mt-4 h-1 w-14 rounded-full bg-gold" aria-hidden="true" />

        {latestProfiles.length > 0 ? (
          <>
            <ul className="mt-8 grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-3">
              {latestProfiles.map((profile) => (
                <li key={profile.slug} className="h-full">
                  <ProfileCard profile={profile} />
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <Button asChild variant="outline" className="min-h-11 border-pine text-pine hover:bg-accent hover:text-pine">
                <Link href="/profils">
                  Découvrir tous les parcours
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </>
        ) : (
          <div className="mt-8 rounded-xl border border-gold/50 bg-card p-6 sm:p-8">
            <p className="flex items-start gap-3 text-sm leading-relaxed text-foreground/85 sm:text-base">
              <Users aria-hidden="true" className="mt-1 size-5 shrink-0 text-pine" />
              Les premiers parcours seront publiés prochainement, à mesure que les dossiers auront
              été examinés et validés avec le consentement des personnes concernées.
            </p>
            <div className="mt-5">
              <Button asChild variant="outline" className="min-h-11 border-pine text-pine hover:bg-accent hover:text-pine">
                <Link href="/profils">
                  Découvrir les parcours
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
