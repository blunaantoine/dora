"use client";

// ---------------------------------------------------------------------------
// Étapes 8 et 9 du formulaire (§7.9, §7.10).
//   - PublicationStep : choix de publication — vision claire de ce qui est
//     destiné au public (après validation de l'équipe) et de ce qui reste
//     réservé à l'équipe (aucune donnée privée publiée par défaut).
//   - ReviewStep : récapitulatif lisible + confirmation explicite avant la
//     soumission irréversible (Dialog shadcn) puis POST /submit.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { AlertTriangle, Loader2, Lock, ShieldCheck } from "lucide-react";

import {
  INITIATIVE_PROJECT_STATE_LABELS,
  INITIATIVE_RESULT_TYPE_LABELS,
  MEDIA_KIND_LABELS,
  type InitiativeProjectState,
  type InitiativeResultType,
  type MediaKind,
} from "@/lib/constants";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { FormValues } from "@/components/invitation/invitation-types";

// --- Étape 8 : choix de publication -----------------------------------------

export function PublicationStep({ values }: { values: FormValues }) {
  const hasContacts =
    values.contacts.phone.trim() !== "" ||
    values.contacts.email.trim() !== "" ||
    values.contacts.contactPreference.trim() !== "";

  return (
    <div className="grid gap-5">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Avant la dernière étape, voici comment vos informations sont traitées. Rien n&apos;est
        publié par défaut : la publication nécessite la validation de l&apos;équipe après votre
        soumission.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
          <h4 className="flex items-center gap-2 font-display text-sm font-semibold text-emerald-900">
            <ShieldCheck aria-hidden="true" className="size-4" />
            Destiné au public — après validation de l&apos;équipe
          </h4>
          <ul className="mt-3 grid list-disc gap-1.5 pl-5 text-sm leading-relaxed text-emerald-900/90">
            <li>Votre nom public et votre présentation</li>
            <li>Votre parcours et le récit de votre engagement</li>
            <li>Votre parcours scolaire et professionnel</li>
            <li>Vos initiatives et leurs résultats déclarés</li>
            <li>Votre vision et vos projets</li>
            <li>Votre pays, région et langues</li>
            <li>Les médias que l&apos;équipe validera (photos, affiches…)</li>
          </ul>
        </div>
        <div className="rounded-xl border border-gold/50 bg-gold/10 p-4">
          <h4 className="flex items-center gap-2 font-display text-sm font-semibold text-pine">
            <Lock aria-hidden="true" className="size-4" />
            Réservé à l&apos;équipe — jamais publié
          </h4>
          <ul className="mt-3 grid list-disc gap-1.5 pl-5 text-sm leading-relaxed text-foreground/85">
            <li>Votre téléphone et votre adresse e-mail</li>
            <li>Votre préférence de contact</li>
            <li>Les éléments servant à vérifier vos résultats</li>
            <li>Les informations que vous laissez vides ne sont pas publiées</li>
          </ul>
          {hasContacts ? (
            <p className="mt-3 text-xs leading-relaxed text-foreground/75">
              Vos coordonnées seront visibles uniquement par les membres autorisés de l&apos;équipe
              pour vous recontacter au sujet de votre dossier.
            </p>
          ) : null}
        </div>
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground">
        Tous les champs facultatifs que vous préférez ne pas publier peuvent rester vides : ils
        n&apos;apparaîtront pas sur votre profil. Vous pourrez aussi demander des corrections à
        tout moment via l&apos;équipe.
      </p>
    </div>
  );
}

// --- Étape 9 : vérification et soumission ------------------------------------

function RecapRow({ label, value, private: isPrivate }: { label: string; value: string; private?: boolean }) {
  const empty = value.trim() === "";
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
        {isPrivate ? (
          <span className="inline-flex items-center gap-0.5 rounded bg-gold/20 px-1 py-0.5 text-[10px] font-medium normal-case text-pine">
            <Lock aria-hidden="true" className="size-2.5" />
            privé
          </span>
        ) : null}
      </dt>
      <dd
        className={
          empty
            ? "mt-0.5 text-sm text-muted-foreground italic"
            : "mt-0.5 text-sm leading-relaxed whitespace-pre-line text-foreground"
        }
      >
        {empty ? "Non renseigné" : value}
      </dd>
    </div>
  );
}

function RecapButton({ target, onGoToStep }: { target: number; onGoToStep: (step: number) => void }) {
  return (
    <button
      type="button"
      onClick={() => onGoToStep(target)}
      className="self-start rounded text-sm font-medium text-pine underline underline-offset-4 transition-colors hover:text-pine-soft focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      Modifier
    </button>
  );
}

export function ReviewStep({
  values,
  submitting,
  submitError,
  onSubmit,
  onGoToStep,
}: {
  values: FormValues;
  submitting: boolean;
  submitError: string | null;
  onSubmit: () => void;
  onGoToStep: (step: number) => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const f = values.fields;

  const publicNameEmpty = f.publicName.trim() === "";

  return (
    <div className="grid gap-6">
      {publicNameEmpty ? (
        <p className="flex items-start gap-2 rounded-lg border border-gold/60 bg-gold/10 px-4 py-3 text-sm text-foreground">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-gold" />
          <span>
            Votre nom public n&apos;est pas renseigné. Il est nécessaire pour préparer votre profil
            — <RecapButtonInline target={1} onGoToStep={onGoToStep} />.
          </span>
        </p>
      ) : null}

      <section aria-label="Récapitulatif — présentation" className="rounded-xl border border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-display text-base font-semibold text-foreground">Présentation</h4>
          <RecapButton target={1} onGoToStep={onGoToStep} />
        </div>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <RecapRow label="Nom public" value={f.publicName} />
          <RecapRow label="Pays" value={f.country} />
          <RecapRow label="Région" value={f.region} />
          <RecapRow label="Ville" value={f.city} />
          <RecapRow label="Langues" value={f.languages} />
        </dl>
        <dl className="mt-3 grid gap-3">
          <RecapRow label="Présentation courte" value={f.shortPresentation} />
          <RecapRow label="Biographie" value={f.biography} />
        </dl>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          <RecapRow label="Téléphone" value={values.contacts.phone} private />
          <RecapRow label="E-mail" value={values.contacts.email} private />
          <RecapRow label="Contact privilégié" value={values.contacts.contactPreference} private />
        </dl>
      </section>

      <section aria-label="Récapitulatif — parcours personnel" className="rounded-xl border border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-display text-base font-semibold text-foreground">Parcours personnel</h4>
          <RecapButton target={2} onGoToStep={onGoToStep} />
        </div>
        <dl className="mt-3 grid gap-3">
          <RecapRow label="Votre parcours" value={f.storyJourney} />
          <RecapRow label="Ce qui vous a amenée à vous engager" value={f.engagementMotivation} />
          <RecapRow label="Événement déterminant" value={f.keyEvent} />
          <RecapRow label="Difficultés rencontrées" value={f.difficultiesEncountered} />
          <RecapRow label="Leçons tirées" value={f.lessonsLearned} />
          <RecapRow label="Source d'inspiration" value={f.inspirationSource} />
        </dl>
      </section>

      <section aria-label="Récapitulatif — parcours scolaire et professionnel" className="rounded-xl border border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-display text-base font-semibold text-foreground">
            Parcours scolaire et professionnel
          </h4>
          <RecapButton target={3} onGoToStep={onGoToStep} />
        </div>
        <dl className="mt-3 grid gap-3">
          <RecapRow label="Formations" value={f.education} />
          <RecapRow label="Expériences professionnelles" value={f.professionalExperience} />
          <RecapRow label="Responsabilités" value={f.responsibilities} />
          <RecapRow label="Organisations" value={f.organizations} />
          <RecapRow label="Compétences" value={f.skills} />
          <RecapRow label="Distinctions" value={f.distinctions} />
        </dl>
      </section>

      <section aria-label="Récapitulatif — initiatives" className="rounded-xl border border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-display text-base font-semibold text-foreground">
            Initiatives ({values.initiatives.filter((item) => item.title.trim() !== "").length})
          </h4>
          <RecapButton target={4} onGoToStep={onGoToStep} />
        </div>
        {values.initiatives.filter((item) => item.title.trim() !== "").length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground italic">Aucune initiative renseignée.</p>
        ) : (
          <ul className="mt-3 grid list-none gap-3 p-0">
            {values.initiatives
              .filter((item) => item.title.trim() !== "")
              .map((item, index) => (
                <li key={item.uid} className="rounded-lg bg-muted/40 p-3">
                  <p className="text-sm font-medium text-foreground">
                    {index + 1}. {item.title.trim()}
                    {item.periodLabel.trim() !== "" ? (
                      <span className="ml-2 font-normal text-muted-foreground">({item.periodLabel.trim()})</span>
                    ) : null}
                  </p>
                  {item.resultsType ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {INITIATIVE_RESULT_TYPE_LABELS[item.resultsType as InitiativeResultType] ?? item.resultsType}
                      {item.projectState
                        ? ` · ${INITIATIVE_PROJECT_STATE_LABELS[item.projectState as InitiativeProjectState] ?? item.projectState}`
                        : ""}
                    </p>
                  ) : null}
                </li>
              ))}
          </ul>
        )}
      </section>

      <section aria-label="Récapitulatif — vision et projets" className="rounded-xl border border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-display text-base font-semibold text-foreground">Vision et projets</h4>
          <RecapButton target={5} onGoToStep={onGoToStep} />
        </div>
        <dl className="mt-3 grid gap-3">
          <RecapRow label="Évolution souhaitée pour votre communauté" value={f.visionCommunity} />
          <RecapRow label="Objectifs pour les prochaines années" value={f.futureGoals} />
          <RecapRow label="Projets à développer" value={f.projectsToDevelop} />
          <RecapRow label="Accompagnement souhaité" value={f.supportNeeded} />
          <RecapRow label="Message à la jeunesse" value={f.messageToYouth} />
        </dl>
      </section>

      <section aria-label="Récapitulatif — médias" className="rounded-xl border border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-display text-base font-semibold text-foreground">
            Médias ({values.media.length})
          </h4>
          <RecapButton target={6} onGoToStep={onGoToStep} />
        </div>
        {values.media.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground italic">Aucun fichier téléversé.</p>
        ) : (
          <ul className="mt-3 grid list-disc gap-1 pl-5 text-sm text-foreground">
            {values.media.map((item) => (
              <li key={item.id}>
                {MEDIA_KIND_LABELS[item.kind as MediaKind] ?? item.kind} — {" "}
                <span className="text-muted-foreground">
                  sera examiné par l&apos;équipe avant publication
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {submitError ? (
        <div className="grid gap-2">
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
            {submitError}
          </p>
          <button
            type="button"
            onClick={() => onGoToStep(0)}
            className="self-start rounded text-sm font-medium text-pine underline underline-offset-4 hover:text-pine-soft focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            Revenir à l&apos;étape du consentement
          </button>
        </div>
      ) : null}

      <div className="rounded-xl border border-pine/20 bg-pine/5 p-4">
        <p className="text-sm leading-relaxed text-foreground">
          Vérifiez les informations ci-dessus. La soumission est <strong>définitive</strong> :
          après envoi, le dossier passe à l&apos;équipe pour examen et vous ne pourrez plus le
          modifier directement. Vous pourrez toujours demander une correction via l&apos;équipe.
        </p>
        <Button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={submitting}
          className="mt-4 min-h-11 w-full sm:w-auto"
        >
          {submitting ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
          {submitting ? "Soumission…" : "Soumettre mon parcours"}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={(open) => !submitting && setConfirmOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la soumission définitive ?</AlertDialogTitle>
            <AlertDialogDescription>
              En soumettant, votre dossier sera transmis à l&apos;équipe pour examen. Cette action
              est irréversible : vous ne pourrez plus modifier le formulaire vous-même. Vos
              informations resteront privées tant que l&apos;équipe n&apos;aura pas validé leur
              publication.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={submitting}>
              Non, revenir en arrière
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11"
              onClick={(event) => {
                event.preventDefault(); // garde le dialogue ouvert pendant la requête
                onSubmit();
              }}
              disabled={submitting}
            >
              {submitting ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
              {submitting ? "Soumission…" : "Oui, je soumets mon dossier"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Lien inline « Modifier » (utilisé dans les avertissements). */
function RecapButtonInline({ target, onGoToStep }: { target: number; onGoToStep: (step: number) => void }) {
  return (
    <button
      type="button"
      onClick={() => onGoToStep(target)}
      className="rounded font-semibold text-pine underline underline-offset-4 hover:text-pine-soft focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      complétez-le dès maintenant
    </button>
  );
}
