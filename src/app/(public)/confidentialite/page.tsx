import type { Metadata } from "next";
import Link from "next/link";

// Politique de confidentialité (§4.6, §15) — décrit le fonctionnement RÉEL de
// la plateforme au MVP : collecte sur invitation uniquement, consentements
// versionnés (textes v1 acceptés lors du formulaire), publications soumises à
// approbation, droits des personnes. Aucune affirmation non mise en œuvre.

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description:
    "Données collectées, consentements, publication et droits des personnes : comment la plateforme protège les informations des participantes, notamment des mineures.",
  robots: { index: true, follow: true },
};

const siteName = process.env.SITE_NAME?.trim() || "Dora";

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section aria-label={titre} className="mt-8">
      <h2 className="font-display text-xl font-semibold text-foreground sm:text-2xl">{titre}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-foreground/90">{children}</div>
    </section>
  );
}

export default function ConfidentialitePage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <header>
        <h1 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">
          Politique de confidentialité
        </h1>
        <div className="mt-4 h-1 w-14 rounded-full bg-gold" aria-hidden="true" />
        <p className="mt-6 text-base leading-relaxed text-foreground/85">
          Cette page décrit, de manière transparente, les données manipulées par {siteName} et les
          droits des personnes concernées. Elle reflète le fonctionnement réel de la plateforme à
          son lancement ; les textes de consentement officiels (version 1), présentés et acceptés
          dans le formulaire des participantes, en constituent le référentiel détaillé.
        </p>
      </header>

      <Section titre="Données collectées">
        <p>
          La plateforme ne fonctionne pas sur inscription ouverte : chaque dossier est créé par
          l&apos;équipe, puis la personne concernée remplit son parcours via une invitation
          personnelle sécurisée. Sont recueillies uniquement les informations nécessaires à la
          valorisation du parcours : identité publique choisie, présentation, récit
          d&apos;engagement, initiatives, éléments de parcours scolaire et professionnel, ainsi
          que — pour la gestion interne strictement confidentielle — des coordonnées de contact et
          l&apos;année de naissance (la date de naissance complète n&apos;est pas conservée).
        </p>
        <p>
          Ne sont pas collectées par défaut : copie de pièce d&apos;identité, adresse complète du
          domicile, données bancaires, informations médicales, opinions politiques ou religieuses.
        </p>
      </Section>

      <Section titre="Consentements">
        <p>
          Aucune information n&apos;est publiée sans consentement. Le formulaire comporte une étape
          de consentement explicite, versionnée : chaque acceptation est enregistrée avec sa date,
          le texte présenté (version 1 au lancement) et la preuve d&apos;horodatage. Pour les
          personnes mineures, le consentement du représentant légal est recueilli, avec des
          protections renforcées décrites ci-dessous.
        </p>
      </Section>

      <Section titre="Publication et champ public">
        <p>
          Seuls les champs explicitement approuvés par l&apos;équipe, champ par champ, apparaissent
          sur la fiche publique. Les coordonnées privées, notes internes, éléments de vérification
          et informations de sécurité ne sont jamais publiés. Une publication peut être corrigée ou
          retirée à tout moment : la fiche cesse alors d&apos;être accessible.
        </p>
      </Section>

      <Section titre="Protection des mineures">
        <p>
          Les profils de mineures suivent un modèle de publication restreint : pas de localisation
          précise (ville et région exclues), biographie tronquée, pas de coordonnées directes, pas
          de messagerie publique, et un bandeau « Profil protégé » rappelle ces limites. Les
          photographies sont examinées avant toute autorisation de publication.
        </p>
      </Section>

      <Section titre="Médias">
        <p>
          Les photographies sont stockées hors de l&apos;espace public. Une photographie ne devient
          accessible publiquement que si l&apos;équipe l&apos;a explicitement autorisée et si le
          profil correspondant est publié ; dans le cas contraire, elle reste inaccessible depuis
          l&apos;extérieur.
        </p>
      </Section>

      <Section titre="Journaux et sécurité">
        <p>
          L&apos;équipe tient un journal d&apos;audit technique (actions administratives,
          consentements, publications) qui ne contient ni contenu des dossiers ni coordonnées. Les
          invitations reposent sur des liens à usage unique : l&apos;empreinte seule est conservée,
          jamais le lien lui-même.
        </p>
      </Section>

      <Section titre="Droits des personnes">
        <p>
          Chacune peut demander : l&apos;accès à ses données, leur correction, la limitation ou le
          retrait de la publication, l&apos;effacement lorsque cela s&apos;applique, le retrait de
          son consentement, et signaler une erreur ou un risque. Pour toute personne mineure, une
          demande de retrait simplifiée est possible à tout moment. Ces demandes sont enregistrées,
          suivies et clôturées avec une trace de décision.
        </p>
        <p>
          Pour exercer ces droits :{" "}
          <Link
            href="/contact"
            className="font-medium text-pine underline decoration-gold underline-offset-4 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            page Contact
          </Link>
          .
        </p>
      </Section>

      <Section titre="Conservation">
        <p>
          Les données sont conservées le temps nécessaire à la valorisation des parcours et au
          suivi des demandes ; les dossiers non aboutis, invitations expirées et profils retirés
          suivent des règles de conservation définies par l&apos;équipe, sans conservation
          indéfinie par défaut.
        </p>
      </Section>
    </div>
  );
}
