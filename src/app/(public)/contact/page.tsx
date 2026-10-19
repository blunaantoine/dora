import type { Metadata } from "next";
import Link from "next/link";
import { Flag, Mail, ShieldCheck } from "lucide-react";

// Page contact (§4.6) — honnête : aucun formulaire de messagerie (pas de
// backend d'e-mail au MVP), uniquement les moyens de contact réellement
// configurés. Si CONTACT_EMAIL n'est pas définie, c'est dit explicitement.

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contacter l'équipe de la plateforme : questions, signalements, demandes de correction, de retrait ou d'accès aux données.",
  robots: { index: true, follow: true },
};

export default function ContactPage() {
  const contactEmail = process.env.CONTACT_EMAIL?.trim() ?? "";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <header>
        <h1 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">Contact</h1>
        <div className="mt-4 h-1 w-14 rounded-full bg-gold" aria-hidden="true" />
        <p className="mt-6 text-base leading-relaxed text-foreground/85">
          L&apos;équipe lit chaque message et répond dans la mesure de ses moyens. Les demandes
          concernant les données personnelles sont enregistrées et suivies jusqu&apos;à leur
          clôture.
        </p>
      </header>

      <section aria-labelledby="moyens-contact" className="mt-10">
        <h2 id="moyens-contact" className="font-display text-xl font-semibold text-foreground sm:text-2xl">
          Moyens de contact
        </h2>
        <ul className="mt-4 grid list-none gap-3 p-0">
          <li className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
            <Mail aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-pine" />
            <div>
              <p className="font-medium text-foreground">Par e-mail</p>
              {contactEmail ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  <a
                    href={`mailto:${contactEmail}`}
                    className="font-medium text-pine underline decoration-gold underline-offset-4 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    {contactEmail}
                  </a>
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  Adresse de contact : à définir par l&apos;équipe. En attendant, vous pouvez passer
                  par les canaux officiels du projet (associations et institutions partenaires).
                </p>
              )}
            </div>
          </li>
        </ul>
      </section>

      <section aria-labelledby="demandes-specifiques" className="mt-10">
        <h2 id="demandes-specifiques" className="font-display text-xl font-semibold text-foreground sm:text-2xl">
          Signalements et demandes concernant un profil
        </h2>
        <ul className="mt-4 grid list-none gap-3 p-0 text-sm">
          <li className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
            <Flag aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-pine" />
            <span className="leading-relaxed text-muted-foreground">
              <strong className="font-medium text-foreground">Signaler une erreur ou demander une
              correction</strong>{" "}
              sur un profil publié : indiquez le lien de la fiche (par exemple{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">/profils/…</code>) et la
              correction souhaitée.
            </span>
          </li>
          <li className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-pine" />
            <span className="leading-relaxed text-muted-foreground">
              <strong className="font-medium text-foreground">Personnes concernées</strong> : vous
              pouvez demander l&apos;accès à vos données, leur correction, le retrait de la
              publication ou l&apos;effacement, et retirer votre consentement à tout moment. La
              procédure est décrite dans la{" "}
              <Link
                href="/confidentialite"
                className="font-medium text-pine underline decoration-gold underline-offset-4 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                politique de confidentialité
              </Link>
              .
            </span>
          </li>
        </ul>
      </section>
    </div>
  );
}
