import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  BadgeCheck,
  ClipboardCheck,
  Eye,
  HandHeart,
  Lightbulb,
  MailPlus,
  SearchCheck,
  ShieldCheck,
  Sprout,
  Users,
} from "lucide-react";

import { db } from "@/lib/db";
import { serializePublicCard, type PublicCardView } from "@/lib/public-profile";
import { ProfileCard } from "@/components/public/profile-card";
import {
  HonoredCarousel,
  type HonoredCarouselItem,
} from "@/components/public/honored-carousel";
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
      "L'équipe repère les parcours de femmes et de filles engagées — ainsi que ceux des hommes qui s'engagent à leurs côtés — sur proposition du public ou par ses propres recherches.",
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


// Rendu à la demande : sans cela, Next.js pré-rend l'accueil au build et fige
// le Top 5, les derniers parcours et les domaines jusqu'au build suivant.
export const dynamic = "force-dynamic";

const EYEBROW = "text-xs font-semibold tracking-[0.12em] text-[#7A5E22] uppercase";
const H2 =
  "mt-2.5 font-display text-3xl leading-tight font-semibold tracking-tight text-foreground sm:text-4xl";

const ACRONYME = [
  {
    initiale: "D",
    mot: "Dignité",
    texte: "Consentement libre et éclairé, maîtrise de ses informations à tout moment.",
  },
  {
    initiale: "O",
    mot: "Optimisme",
    texte: "Des exemples concrets qui donnent envie de s'engager à son tour.",
  },
  {
    initiale: "R",
    mot: "Résilience",
    texte: "La durée de l'engagement prime sur l'éclat d'un instant.",
  },
  {
    initiale: "A",
    mot: "Action",
    texte: "Des réalisations observables, au service de vrais besoins.",
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

  // « Top 5 des parcours » (maquette client, à l'identique) : cinq parcours
  // choisis par l'équipe, ordre fixé dans l'espace admin (featuredRank 1..5).
  // CHOIX ÉDITORIAL — pas une notation : la valorisation ne repose ni sur les
  // notes, ni sur la popularité, ni sur le nombre de vues. Le sérialiseur
  // public unique garantit champs approuvés et double garde mineures.
  const honoredPublications = await db.profilePublication.findMany({
    where: { state: "PUBLISHED", featuredRank: { not: null } },
    orderBy: { featuredRank: "asc" },
    take: 5,
    select: {
      slug: true,
      state: true,
      approvedFields: true,
      featured: true,
      featuredRank: true,
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

  const honoredItems: HonoredCarouselItem[] = honoredPublications
    .map((publication) => {
      const card = serializePublicCard(publication.person, publication);
      if (!card) return null;
      return {
        slug: card.slug,
        publicName: card.publicName,
        categoryName: card.categoryName,
        rank: publication.featuredRank ?? 0,
        photo: card.photo
          ? {
              url: card.photo.url,
              alt: card.photo.alt,
              width: card.photo.width,
              height: card.photo.height,
            }
          : null,
      } satisfies HonoredCarouselItem;
    })
    .filter((item): item is HonoredCarouselItem => item !== null)
    .sort((a, b) => a.rank - b.rank);

  // Domaines d'engagement actifs — porte d'entrée vers l'annuaire filtré.
  const categories = await db.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { name: true, slug: true },
  });

  return (
    <>
      {/* Hero — fond vert profond, texte ivoire, accents or (AA respecté :
          l'or n'est utilisé que sur fond vert, jamais pour du texte courant). */}
      <section className="bg-pine text-[#F8F5EF]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:flex-row lg:items-center lg:gap-16 lg:py-24">
          <div className="min-w-0 flex-1">
            <p className="inline-flex items-center gap-2 rounded-full border border-gold/45 px-3.5 py-1.5 text-xs font-medium tracking-wide text-gold">
              <HandHeart aria-hidden="true" className="size-3.5" />
              Projet en préparation
            </p>
            <h1 className="mt-6 max-w-2xl font-display text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Celles qui font avancer le monde méritent d&apos;être connues.
            </h1>
            <p className="mt-6 max-w-xl text-lg font-medium leading-snug text-gold sm:text-xl">
              Parce que chaque activiste est un don pour sa communauté.
            </p>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-[#F8F5EF]/85 sm:text-lg">
              Dora documente et met en lumière les parcours de femmes et de filles engagées — avec
              leur consentement, et sous leur contrôle. Les hommes qui s&apos;engagent à leurs
              côtés y sont aussi accueillis.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                asChild
                size="lg"
                className="min-h-12 rounded-full bg-gold px-7 text-base text-pine-deep shadow-none transition-colors hover:bg-gold-soft focus-visible:ring-gold/50"
              >
                <Link href="/profils">
                  Découvrir les parcours
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="min-h-12 rounded-full border border-[#F8F5EF]/45 bg-transparent px-7 text-base text-[#F8F5EF] shadow-none hover:bg-[#F8F5EF]/10 hover:text-[#F8F5EF] focus-visible:ring-[#F8F5EF]/50"
              >
                <Link href="/proposer">Proposer une personne</Link>
              </Button>
            </div>
          </div>
          {honoredItems.length > 0 ? (
            // Carrousel « Top 5 des parcours » (choix éditorial, featuredRank) :
            // à droite du bandeau, sous le texte sur mobile.
            <div className="w-full shrink-0 lg:w-[380px] xl:w-[420px]">
              <HonoredCarousel items={honoredItems} />
            </div>
          ) : (
            // État vide honnête : logo tant qu'aucun Top 5 n'est sélectionné.
            <Image
              src="/logo-dora-blanc.png"
              alt="Logo Dora : deux silhouettes enlacées, une main protectrice au cœur"
              width={1522}
              height={505}
              priority
              className="hidden h-auto w-[300px] shrink-0 self-center lg:block xl:w-[360px]"
            />
          )}
        </div>
      </section>

      {/* L'acronyme DORA — bande claire pleine largeur sous le bandeau. */}
      <section aria-labelledby="acronyme" className="border-b border-border/70 bg-card">
        <h2 id="acronyme" className="sr-only">
          Dora, lettre par lettre
        </h2>
        <ul className="mx-auto grid w-full max-w-6xl gap-x-8 px-4 py-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          {ACRONYME.map((lettre) => (
            <li key={lettre.mot} className="flex items-baseline gap-4 py-5">
              <span
                aria-hidden="true"
                className="font-display text-4xl leading-none font-semibold text-[#9A7628]"
              >
                {lettre.initiale}
              </span>
              <span>
                <strong className="block font-display text-lg font-semibold text-foreground">
                  {lettre.mot}
                </strong>
                <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                  {lettre.texte}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Explorer par domaine — liens directs vers l'annuaire filtré. */}
      {categories.length > 0 ? (
        <section aria-labelledby="domaines" className="mx-auto w-full max-w-6xl px-4 pt-16 sm:px-6 sm:pt-24">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className={EYEBROW}>Explorer par domaine</p>
              <h2 id="domaines" className={H2}>
                Des engagements dans tous les domaines
              </h2>
            </div>
            <Link
              href="/profils"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-[15px] font-semibold text-pine underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              Voir l&apos;annuaire complet
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
          <ul className="mt-8 flex flex-wrap gap-2.5">
            {categories.map((categorie) => (
              <li key={categorie.slug}>
                <Link
                  href={`/profils?categorie=${encodeURIComponent(categorie.slug)}`}
                  className="inline-flex min-h-11 items-center rounded-full border border-[#D9D2BF] bg-card px-4 text-[15px] font-medium text-foreground transition-colors hover:border-pine hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {categorie.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Derniers parcours publiés (§4.1) — données réelles ou état vide honnête. */}
      <section aria-labelledby="derniers-parcours" className="mx-auto w-full max-w-6xl px-4 pt-16 sm:px-6 sm:pt-24">
        <p className={EYEBROW}>À la une</p>
        <h2 id="derniers-parcours" className={H2}>
          Derniers parcours publiés
        </h2>

        {latestProfiles.length > 0 ? (
          <>
            <ul className="mt-8 grid list-none gap-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
              {latestProfiles.map((profile) => (
                <li key={profile.slug} className="h-full">
                  <ProfileCard profile={profile} />
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <Button asChild variant="outline" className="min-h-11 rounded-full border-pine px-5 text-pine hover:bg-accent hover:text-pine">
                <Link href="/profils">
                  Découvrir tous les parcours
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </>
        ) : (
          <div className="mt-8 rounded-2xl border border-dashed border-[#CFC7B2] bg-card p-6 sm:p-8">
            <p className="flex items-start gap-3 text-sm leading-relaxed text-foreground/85 sm:text-base">
              <Users aria-hidden="true" className="mt-1 size-5 shrink-0 text-pine" />
              Les premiers parcours seront publiés prochainement, à mesure que les dossiers auront
              été examinés et validés avec le consentement des personnes concernées.
            </p>
          </div>
        )}
      </section>

      {/* Notre démarche — frise en 4 étapes. */}
      <section
        id="demarche"
        aria-labelledby="demarche-titre"
        className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 pt-16 sm:px-6 sm:pt-28"
      >
        <p className={EYEBROW}>Notre démarche</p>
        <h2 id="demarche-titre" className={`${H2} max-w-2xl`}>
          De l&apos;identification à la publication, quatre étapes
        </h2>
        <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {DEMARCHE.map((etape) => (
            <li key={etape.etape} className="border-t-2 border-pine pt-5">
              <span
                aria-hidden="true"
                className="flex size-10 items-center justify-center rounded-full bg-pine font-display text-lg font-semibold text-gold"
              >
                {etape.etape}
              </span>
              <h3 className="mt-4 font-display text-xl font-semibold text-foreground">
                <span className="sr-only">Étape {etape.etape} : </span>
                {etape.titre}
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{etape.texte}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Critères de valorisation — liste numérotée éditoriale. */}
      <section
        id="criteres"
        aria-labelledby="criteres-titre"
        className="mt-16 scroll-mt-24 border-y border-border/70 bg-muted sm:mt-28"
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:flex-row lg:gap-20">
          <div className="lg:w-80 lg:shrink-0">
            <p className={EYEBROW}>Nos critères</p>
            <h2 id="criteres-titre" className={H2}>
              Ni notes, ni popularité.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-foreground/80 sm:text-lg">
              La valorisation s&apos;appuie sur des critères publics, explicables et vérifiables —
              jamais sur le nombre de vues.
            </p>
          </div>
          <ol className="grid flex-1 gap-x-10 sm:grid-cols-2">
            {CRITERES.map((critere, position) => (
              <li key={critere.titre} className="flex gap-4 border-b border-[#D9D2BF] py-5">
                <span
                  aria-hidden="true"
                  className="pt-0.5 font-display text-[15px] font-semibold text-[#7A5E22] tabular-nums"
                >
                  {String(position + 1).padStart(2, "0")}
                </span>
                <span>
                  <strong className="block font-display text-lg font-semibold text-foreground">
                    {critere.titre}
                  </strong>
                  <span className="mt-1.5 block text-[15px] leading-relaxed text-muted-foreground">
                    {critere.texte}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Notre mission */}
      <section aria-labelledby="mission" className="mx-auto w-full max-w-6xl px-4 pt-16 sm:px-6 sm:pt-24">
        <p className={EYEBROW}>Notre mission</p>
        <h2 id="mission" className={`${H2} max-w-3xl`}>
          Un espace de reconnaissance, de transmission et de découverte
        </h2>
        <p className="mt-6 max-w-3xl text-base leading-relaxed text-foreground/85 sm:text-lg">
          Chaque profil présenté ici a été identifié, invité et examiné par l&apos;équipe, puis
          publié avec le consentement de la personne concernée. La qualité et l&apos;impact
          d&apos;un engagement priment toujours sur la popularité en ligne. Les profils de mineures
          bénéficient de protections renforcées.
        </p>
      </section>

      {/* Appel à proposer une personne. */}
      <section aria-labelledby="proposer-titre" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="flex flex-col gap-8 rounded-3xl bg-pine px-6 py-10 text-[#F8F5EF] sm:px-12 sm:py-14 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <h2 id="proposer-titre" className="font-display text-3xl leading-tight font-semibold sm:text-4xl">
              Vous connaissez une personne engagée ?
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[#F8F5EF]/85 sm:text-lg">
              Proposez son parcours. L&apos;équipe l&apos;examine, puis la contacte par une
              invitation privée — rien n&apos;est publié sans son accord.
            </p>
          </div>
          <Button
            asChild
            size="lg"
            className="min-h-12 shrink-0 self-start rounded-full bg-gold px-7 text-base text-pine-deep shadow-none hover:bg-gold-soft focus-visible:ring-gold/50 lg:self-center"
          >
            <Link href="/proposer">
              <MailPlus aria-hidden="true" />
              Proposer une personne
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
