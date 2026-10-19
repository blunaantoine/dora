import type { Metadata } from "next";
import { db } from "@/lib/db";
import { NominationForm } from "@/components/public/nomination-form";

// Proposition publique d'une nouvelle personne (§11.1) — Server Component :
// les catégories actives sont lues côté serveur ; le formulaire (client)
// n'ajoute que l'interactivité de saisie. Texte de contexte honnête :
// l'acceptation ne publie jamais automatiquement (§11.2).

export const metadata: Metadata = {
  title: "Proposer une personne",
  description:
    "Proposez le parcours d'une femme ou d'une fille engagée : l'équipe vérifie chaque proposition avant toute invitation et toute publication.",
  robots: { index: true, follow: true },
};

export default async function ProposerPage() {
  const categories = await db.category.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { slug: true, name: true },
  });

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <header>
        <h1 className="font-display text-3xl font-semibold text-balance text-foreground sm:text-4xl">
          Proposer une personne
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-foreground/90">
          Vous connaissez une femme ou une fille dont l&apos;engagement mérite d&apos;être documenté
          et transmis ? Proposez son parcours : chaque suggestion est examinée par l&apos;équipe.
        </p>
      </header>

      <div
        role="note"
        className="mt-6 rounded-xl border border-gold/60 bg-gold/10 p-4 text-sm leading-relaxed text-pine sm:p-5"
      >
        <p>
          <strong className="font-semibold">Comment se passe la suite ?</strong> L&apos;acceptation
          d&apos;une proposition ne publie pas automatiquement la personne : l&apos;équipe vérifie
          son identité et la pertinence du dossier, puis la contacte directement. C&apos;est la
          personne concernée qui garde la maîtrise de ses informations ; rien n&apos;est publié sans
          son consentement éclairé.
        </p>
      </div>

      {categories.length > 0 ? (
        <section aria-label="Formulaire de proposition" className="mt-8">
          <NominationForm categories={categories} />
        </section>
      ) : (
        <p role="status" className="mt-8 rounded-xl border border-dashed border-border bg-card/60 px-6 py-10 text-center text-sm text-muted-foreground">
          La proposition de personnes est momentanément indisponible : les domaines d&apos;engagement
          sont en cours de préparation. Merci de revenir un peu plus tard ou d&apos;utiliser la page
          contact.
        </p>
      )}
    </article>
  );
}
