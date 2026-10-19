import type { Metadata } from "next";

// Mentions légales (§4.6) — contenu sobre et honnête : aucune information
// inventée, les éléments non encore définis (hébergeur, contact) sont
// explicitement signalés « à compléter ».

export const metadata: Metadata = {
  title: "Mentions légales",
  description: "Éditeur de la plateforme, hébergement et conditions générales d'utilisation.",
  robots: { index: true, follow: true },
};

const siteName = process.env.SITE_NAME?.trim() || "Dora";
const contactEmail = process.env.CONTACT_EMAIL?.trim() ?? "";
const year = new Date().getFullYear();

function Champ({ terme, children }: { terme: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-border/70 py-4 last:border-b-0 sm:grid-cols-3 sm:gap-4">
      <dt className="font-medium text-foreground">{terme}</dt>
      <dd className="text-sm leading-relaxed text-muted-foreground sm:col-span-2">{children}</dd>
    </div>
  );
}

export default function MentionsLegalesPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <header>
        <h1 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">
          Mentions légales
        </h1>
        <div className="mt-4 h-1 w-14 rounded-full bg-gold" aria-hidden="true" />
      </header>

      <section aria-label="Éditeur et hébergement" className="mt-8">
        <dl>
          <Champ terme="Éditeur">
            {siteName} — plateforme de valorisation des femmes et des filles engagées. Projet en
            cours de préparation ; la structure éditrice (association ou institution responsable)
            sera précisée ici dès sa désignation officielle.
          </Champ>
          <Champ terme="Directeur de la publication">
            À désigner par l&apos;équipe du projet.
          </Champ>
          <Champ terme="Hébergement">
            À compléter : l&apos;hébergeur définitif (nom, adresse, téléphone) sera indiqué ici au
            moment de la mise en production.
          </Champ>
          <Champ terme="Contact">
            {contactEmail ? (
              <a
                href={`mailto:${contactEmail}`}
                className="font-medium text-pine underline decoration-gold underline-offset-4 hover:text-foreground"
              >
                {contactEmail}
              </a>
            ) : (
              "Adresse de contact : à définir par l'équipe (voir la page Contact)."
            )}
          </Champ>
          <Champ terme="Propriété intellectuelle">
            Les parcours, textes et photographies publiés sur cette plateforme sont protégés. Ils
            sont diffusés avec le consentement des personnes concernées ; toute réutilisation doit
            respecter ce cadre et citer la source.
          </Champ>
          <Champ terme="Responsabilité">
            Les contenus des profils sont fournis par les personnes concernées, examinés par
            l&apos;équipe avant publication, puis publiés sous leur responsabilité avec leur
            consentement. Un signalement peut être adressé via la page Contact ; une fiche
            signalée peut être corrigée ou dépubliée.
          </Champ>
          <Champ terme="Signalement et correction">
            Chaque fiche publique comporte un lien « Signaler ou demander une correction ». Les
            demandes sont enregistrées, suivies et clôturées avec une trace de décision.
          </Champ>
          <Champ terme="Mise à jour">Dernière mise à jour de cette page : {year}.</Champ>
        </dl>
      </section>
    </div>
  );
}
