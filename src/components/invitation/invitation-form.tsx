"use client";

// ---------------------------------------------------------------------------
// Formulaire d'invitation en 9 étapes (§7.2 à §7.10) — composant client.
//
// Contrats consommés (tâche 3-a) :
//   GET  /api/invitation/[token]        → validité + notice de consentement ;
//   GET  /api/invitation/[token]/state  → reprise du brouillon (état en base fait foi) ;
//   PUT  /api/invitation/[token]/draft  → sauvegarde par étape (payload réduit) ;
//   POST /api/invitation/[token]/consent → consentement versionné ;
//   POST/DELETE /api/invitation/[token]/media → médias ;
//   POST /api/invitation/[token]/submit → soumission définitive.
//
// Performance 3G (§19) : aucun média lourd, aucune prévisualisation locale,
// un seul payload par étape. Accessibilité (§19) : fieldset/legend par étape,
// aria-current="step", focus déplacé au changement d'étape, cibles ≥ 44 px.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronLeft, Loader2, TriangleAlert } from "lucide-react";

import { getJson, postJson, putJson } from "@/lib/client-api";
import { DRAFT_FIELD_KEYS, DRAFT_TEXT_FIELDS, type DraftTextFieldKey } from "@/lib/invitation-draft";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ConsentStep } from "@/components/invitation/invitation-consent-step";
import { InitiativesStep } from "@/components/invitation/invitation-initiatives-step";
import { LabeledInput, LabeledTextarea } from "@/components/invitation/invitation-fields";
import { MediaStep } from "@/components/invitation/invitation-media-step";
import { PublicationStep, ReviewStep } from "@/components/invitation/invitation-review-step";
import {
  FORM_STEPS,
  SAVABLE_STEPS,
  flattenFields,
  formatFrDate,
  formatFrDateTime,
  orNull,
  type ContactValues,
  type FormValues,
  type InitiativeValues,
  type InvitationIntroData,
  type InvitationStateData,
  type MediaItem,
  type TextFieldValues,
} from "@/components/invitation/invitation-types";
import { cn } from "@/lib/utils";

type Screen = "loading" | "invalid" | "rateLimited" | "error" | "ready" | "submitted";

interface ConsentMeta {
  accepte: boolean;
  code?: string;
  version?: number;
  acceptedAt?: string;
}

interface TextFieldConfig {
  key: DraftTextFieldKey;
  label: string;
  hint?: string;
  required?: boolean;
  control: "input" | "textarea";
  rows?: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Configurations des étapes de saisie (libellés issus du cahier des charges §7.3 à §7.7).
const PRESENTATION_FIELDS: TextFieldConfig[] = [
  { key: "publicName", label: "Nom public ou nom d'usage", required: true, control: "input", hint: "Sous ce nom votre profil pourra être publié. Vous pouvez choisir un prénom, un nom d'usage ou un pseudonyme." },
  { key: "shortPresentation", label: "Présentation courte", control: "textarea", rows: 3, hint: "Deux ou trois phrases pour vous présenter (600 caractères maximum)." },
  { key: "biography", label: "Biographie", control: "textarea", rows: 6, hint: "Présentation plus détaillée si vous le souhaitez." },
  { key: "country", label: "Pays", control: "input" },
  { key: "region", label: "Région", control: "input" },
  { key: "city", label: "Ville", control: "input", hint: "Indication générale uniquement — n'indiquez jamais d'adresse précise." },
  { key: "languages", label: "Langues parlées", control: "input", hint: "Par exemple : français, éwé, kabiyé." },
];

const PARCOURS_FIELDS: TextFieldConfig[] = [
  { key: "storyJourney", label: "Comment décririez-vous votre parcours ?", control: "textarea", rows: 5, hint: "Quelques phrases suffisent ; écrivez librement." },
  { key: "engagementMotivation", label: "Qu'est-ce qui vous a amenée à vous engager ?", control: "textarea", rows: 5 },
  { key: "keyEvent", label: "Quel événement a influencé votre engagement ?", control: "textarea", rows: 4 },
  { key: "difficultiesEncountered", label: "Quelles difficultés avez-vous rencontrées ?", control: "textarea", rows: 4 },
  { key: "lessonsLearned", label: "Quelles leçons en avez-vous tirées ?", control: "textarea", rows: 4 },
  { key: "inspirationSource", label: "Quelle personne ou quelle expérience vous inspire ?", control: "textarea", rows: 3 },
];

const CARRIERE_FIELDS: TextFieldConfig[] = [
  { key: "education", label: "Formations pertinentes", control: "textarea", rows: 3 },
  { key: "professionalExperience", label: "Expériences professionnelles", control: "textarea", rows: 4 },
  { key: "responsibilities", label: "Responsabilités exercées", control: "textarea", rows: 3 },
  { key: "organizations", label: "Associations ou organisations", control: "textarea", rows: 3, hint: "Ne mentionnez que celles dont vous acceptez la publication." },
  { key: "skills", label: "Compétences acquises", control: "textarea", rows: 3 },
  { key: "distinctions", label: "Distinctions ou reconnaissances", control: "textarea", rows: 3 },
];

const VISION_FIELDS: TextFieldConfig[] = [
  { key: "visionCommunity", label: "Quelle évolution souhaitez-vous apporter à votre communauté ?", control: "textarea", rows: 4 },
  { key: "futureGoals", label: "Quels sont vos objectifs pour les prochaines années ?", control: "textarea", rows: 4 },
  { key: "projectsToDevelop", label: "Quels projets souhaitez-vous développer ?", control: "textarea", rows: 4 },
  { key: "supportNeeded", label: "De quel accompagnement auriez-vous besoin ?", control: "textarea", rows: 3 },
  { key: "messageToYouth", label: "Quel message souhaitez-vous transmettre à d'autres jeunes ?", control: "textarea", rows: 3 },
];

const STEP_FIELDS: Record<number, TextFieldConfig[]> = {
  1: PRESENTATION_FIELDS,
  2: PARCOURS_FIELDS,
  3: CARRIERE_FIELDS,
  5: VISION_FIELDS,
};

const frTime = new Intl.DateTimeFormat("fr-FR", { timeStyle: "short" });

function emptyValues(): FormValues {
  const fields = {} as TextFieldValues;
  for (const key of DRAFT_FIELD_KEYS) fields[key] = "";
  return {
    fields,
    contacts: { phone: "", email: "", contactPreference: "" },
    initiatives: [],
    media: [],
  };
}

function buildValuesFromState(state: InvitationStateData): FormValues {
  const base = emptyValues();
  for (const key of DRAFT_FIELD_KEYS) {
    base.fields[key] = state.dossier[key] ?? "";
  }
  base.contacts = {
    phone: state.contacts.phone ?? "",
    email: state.contacts.email ?? "",
    contactPreference: state.contacts.contactPreference ?? "",
  };
  base.initiatives = state.initiatives.map((item) => ({
    uid: item.id,
    title: item.title ?? "",
    description: item.description ?? "",
    periodLabel: item.periodLabel ?? "",
    actionArea: item.actionArea ?? "",
    beneficiaries: item.beneficiaries ?? "",
    rolePlayed: item.rolePlayed ?? "",
    partners: item.partners ?? "",
    objectives: item.objectives ?? "",
    results: item.results ?? "",
    resultsType: item.resultsType ?? "",
    evidence: item.evidence ?? "",
    difficulties: item.difficulties ?? "",
    learnings: item.learnings ?? "",
    projectState: item.projectState ?? "",
  }));
  base.media = state.media.map((item) => ({
    id: item.id,
    kind: item.kind,
    status: item.status,
    sizeBytes: item.sizeBytes,
    uploadedAt: item.uploadedAt,
    width: item.width ?? null,
    height: item.height ?? null,
  }));
  return base;
}

/** Un bloc initiative est « rempli » si au moins un champ (hors uid) est non vide. */
function initiativeHasContent(item: InitiativeValues): boolean {
  const { uid: _uid, ...rest } = item;
  return Object.values(rest).some((value) => value.trim() !== "");
}

export function InvitationForm({ token }: { token: string }) {
  const [screen, setScreen] = useState<Screen>("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [intro, setIntro] = useState<InvitationIntroData | null>(null);
  const [consentMeta, setConsentMeta] = useState<ConsentMeta>({ accepte: false });
  const [values, setValues] = useState<FormValues | null>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<{ message: string; submittedAt: string } | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  // Chargement initial + reprise automatique du brouillon (§7.1).
  // (Le retry remet l'écran « loading » AVANT d'incrémenter reloadKey.)
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [introRes, stateRes] = await Promise.all([
        getJson<InvitationIntroData>(`/api/invitation/${token}`),
        getJson<InvitationStateData>(`/api/invitation/${token}/state`),
      ]);
      if (cancelled) return;

      for (const res of [introRes, stateRes]) {
        if (!res.ok) {
          if (res.error.code === "NOT_FOUND") setScreen("invalid");
          else if (res.error.code === "RATE_LIMITED") setScreen("rateLimited");
          else setScreen("error");
          return;
        }
      }

      const introData = (introRes as { ok: true; data: InvitationIntroData }).data;
      const stateData = (stateRes as { ok: true; data: InvitationStateData }).data;
      setIntro(introData);
      setValues(buildValuesFromState(stateData));
      setConsentMeta({
        accepte: stateData.consent.accepte,
        code: stateData.consent.code,
        version: stateData.consent.version,
        acceptedAt: stateData.consent.acceptedAt,
      });
      setScreen("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  // Focus management : le titre de l'étape reçoit le focus à chaque changement.
  useEffect(() => {
    if (screen === "ready") {
      headingRef.current?.focus();
    }
  }, [step, screen]);

  const goToStep = useCallback(
    (next: number) => {
      // Le consentement (étape 0) est bloquant : aucune navigation au-delà
      // tant qu'il n'est pas enregistré.
      if (!consentMeta.accepte && next > 0) return;
      setStepError(null);
      setFieldErrors({});
      setStep(Math.max(0, Math.min(FORM_STEPS.length - 1, next)));
    },
    [consentMeta.accepte],
  );

  /** Payload réduit de l'étape courante (seuls ses champs sont envoyés). */
  function buildPayload(currentStep: number, current: FormValues): Record<string, unknown> | null {
    const f = current.fields;
    switch (currentStep) {
      case 1:
        return {
          publicName: orNull(f.publicName),
          shortPresentation: orNull(f.shortPresentation),
          biography: orNull(f.biography),
          country: orNull(f.country),
          region: orNull(f.region),
          city: orNull(f.city),
          languages: orNull(f.languages),
          contacts: {
            phone: orNull(current.contacts.phone),
            email: orNull(current.contacts.email),
            contactPreference: orNull(current.contacts.contactPreference),
          },
        };
      case 2:
        return {
          storyJourney: orNull(f.storyJourney),
          engagementMotivation: orNull(f.engagementMotivation),
          keyEvent: orNull(f.keyEvent),
          difficultiesEncountered: orNull(f.difficultiesEncountered),
          lessonsLearned: orNull(f.lessonsLearned),
          inspirationSource: orNull(f.inspirationSource),
        };
      case 3:
        return {
          education: orNull(f.education),
          professionalExperience: orNull(f.professionalExperience),
          responsibilities: orNull(f.responsibilities),
          organizations: orNull(f.organizations),
          skills: orNull(f.skills),
          distinctions: orNull(f.distinctions),
        };
      case 4: {
        // Les blocs entièrement vides sont ignorés ; les blocs remplis
        // remplacent l'ensemble (sémantique idempotente du serveur).
        const kept = current.initiatives
          .filter(initiativeHasContent)
          .map((item) => ({
            title: item.title.trim(),
            description: orNull(item.description),
            periodLabel: orNull(item.periodLabel),
            actionArea: orNull(item.actionArea),
            beneficiaries: orNull(item.beneficiaries),
            rolePlayed: orNull(item.rolePlayed),
            partners: orNull(item.partners),
            objectives: orNull(item.objectives),
            results: orNull(item.results),
            resultsType: item.resultsType === "" ? null : item.resultsType,
            evidence: orNull(item.evidence),
            difficulties: orNull(item.difficulties),
            learnings: orNull(item.learnings),
            projectState: item.projectState === "" ? null : item.projectState,
          }));
        return { initiatives: kept };
      }
      case 5:
        return {
          visionCommunity: orNull(f.visionCommunity),
          futureGoals: orNull(f.futureGoals),
          projectsToDevelop: orNull(f.projectsToDevelop),
          supportNeeded: orNull(f.supportNeeded),
          messageToYouth: orNull(f.messageToYouth),
        };
      default:
        return null;
    }
  }

  /** Validation cliente : only les règles utiles (le serveur revalide tout). */
  function validateStep(currentStep: number, current: FormValues): Record<string, string> {
    const errors: Record<string, string> = {};
    if (currentStep === 1) {
      if (current.fields.publicName.trim() === "") {
        errors.publicName = "Indiquez le nom sous lequel votre parcours sera présenté.";
      }
      const email = current.contacts.email.trim();
      if (email !== "" && !EMAIL_RE.test(email)) {
        errors["contacts.email"] = "Adresse e-mail invalide (exemple : nom@exemple.com).";
      }
    }
    if (currentStep === 4) {
      current.initiatives.forEach((item, index) => {
        if (initiativeHasContent(item) && item.title.trim() === "") {
          errors[`initiatives.${index}.title`] = "Le titre de l'initiative est obligatoire.";
        }
      });
    }
    return errors;
  }

  async function handleSaveAndContinue() {
    if (!values || busy) return;
    setStepError(null);

    const localErrors = validateStep(step, values);
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      setStepError("Corrigez les champs signalés avant de continuer.");
      return;
    }

    const payload = buildPayload(step, values);
    if (payload === null) {
      goToStep(step + 1);
      return;
    }

    setBusy(true);
    const result = await putJson<{ saved: boolean; statut: string; updatedAt: string }>(
      `/api/invitation/${token}/draft`,
      payload,
    );
    setBusy(false);

    if (!result.ok) {
      if (result.error.code === "NOT_FOUND") {
        setScreen("invalid");
        return;
      }
      setFieldErrors(flattenFields(result.error.fields));
      setStepError(result.error.message);
      return;
    }

    setSavedAt(result.data.updatedAt);
    goToStep(step + 1);
  }

  async function handleSubmit() {
    if (busy || !values) return;
    setBusy(true);
    setStepError(null);

    const result = await postJson<{ soumis: boolean; statut: string; submittedAt: string; message: string }>(
      `/api/invitation/${token}/submit`,
      {},
    );
    setBusy(false);

    if (!result.ok) {
      if (result.error.code === "NOT_FOUND" || result.error.code === "CONFLICT") {
        // Déjà soumis, révoqué ou expiré : le lien cesse d'être utilisable.
        setScreen("invalid");
        return;
      }
      setStepError(result.error.message);
      return;
    }

    setSubmitResult({ message: result.data.message, submittedAt: result.data.submittedAt });
    setScreen("submitted");
  }

  function updateField(key: DraftTextFieldKey, value: string) {
    setValues((prev) => (prev ? { ...prev, fields: { ...prev.fields, [key]: value } } : prev));
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: "" } : prev));
  }

  function updateContact(key: keyof ContactValues, value: string) {
    setValues((prev) => (prev ? { ...prev, contacts: { ...prev.contacts, [key]: value } } : prev));
    setFieldErrors((prev) => (prev[`contacts.${key}`] ? { ...prev, [`contacts.${key}`]: "" } : prev));
  }

  // --- Écrans d'état (§16.3 : chargement, erreur, indisponible) --------------

  if (screen === "loading") {
    return (
      <div className="grid gap-4 py-6 text-center" role="status">
        <Loader2 aria-hidden="true" className="mx-auto size-6 animate-spin text-pine" />
        <p className="text-sm text-muted-foreground">Chargement de votre formulaire…</p>
      </div>
    );
  }

  if (screen === "invalid") {
    return (
      <div className="grid gap-3 text-center">
        <TriangleAlert aria-hidden="true" className="mx-auto size-8 text-gold" />
        <p className="font-display text-xl font-semibold text-[#173D32]">Lien invalide ou expiré</p>
        <p className="text-sm leading-relaxed text-[#202522]/80">
          Ce lien de formulaire n&apos;est plus utilisable : il a peut-être été révoqué ou le
          dossier a déjà été soumis. Merci de contacter l&apos;équipe de la plateforme pour
          obtenir un nouveau lien.
        </p>
      </div>
    );
  }

  if (screen === "rateLimited" || screen === "error") {
    return (
      <div className="grid gap-3 text-center">
        <TriangleAlert aria-hidden="true" className="mx-auto size-8 text-gold" />
        <p className="font-display text-xl font-semibold text-[#173D32]">
          {screen === "rateLimited" ? "Trop de tentatives" : "Connexion interrompue"}
        </p>
        <p className="text-sm leading-relaxed text-[#202522]/80">
          {screen === "rateLimited"
            ? "Merci de patienter quelques instants avant de réessayer. Vos réponses déjà enregistrées sont conservées."
            : "Impossible de charger votre formulaire pour le moment. Vos réponses déjà enregistrées sont conservées côté serveur."}
        </p>
        <Button
          type="button"
          onClick={() => {
            setScreen("loading");
            setReloadKey((key) => key + 1);
          }}
          className="mx-auto min-h-11"
        >
          Réessayer
        </Button>
      </div>
    );
  }

  if (screen === "submitted" && submitResult) {
    return (
      <div className="grid gap-4 text-center">
        <CheckCircle2 aria-hidden="true" className="mx-auto size-10 text-emerald-600" />
        <p className="font-display text-xl font-semibold text-[#173D32]">
          Votre dossier a bien été soumis
        </p>
        <p className="text-sm leading-relaxed text-[#202522]/85">{submitResult.message}</p>
        <p className="text-sm text-muted-foreground">
          Soumis le {formatFrDateTime(submitResult.submittedAt)}.
        </p>
        <div className="rounded-lg border border-gold/50 bg-gold/10 p-4 text-left text-sm leading-relaxed text-foreground">
          <strong>Conservez précieusement ce lien.</strong> C&apos;est votre accès personnel au
          formulaire : l&apos;équipe pourra vous demander de le rouvrir pour ajouter des
          compléments. Ne le partagez avec personne.
        </div>
        <p className="text-xs text-muted-foreground">
          Vous pouvez fermer cette page en toute sécurité. L&apos;équipe vous recontactera après
          examen de votre dossier.
        </p>
      </div>
    );
  }

  if (!intro || !values) {
    // État transitoire imprévu — traité comme une erreur rechargeable.
    return (
      <div className="grid gap-3 text-center">
        <p className="text-sm text-muted-foreground">Une erreur inattendue est survenue.</p>
        <Button
          type="button"
          onClick={() => {
            setScreen("loading");
            setReloadKey((key) => key + 1);
          }}
          className="mx-auto min-h-11"
        >
          Réessayer
        </Button>
      </div>
    );
  }

  // --- Formulaire (screen === "ready") ---------------------------------------

  const currentStepConfig = FORM_STEPS[step];
  // Valeurs réduites après garde de nullité (utilisable dans les helpers).
  const formValues: FormValues = values;

  function renderTextField(config: TextFieldConfig) {
    const common = {
      label: config.label,
      hint: config.hint,
      required: config.required,
      value: formValues.fields[config.key],
      maxLength: DRAFT_TEXT_FIELDS[config.key],
      error: fieldErrors[config.key] || undefined,
      disabled: busy,
      onChange: (value: string) => updateField(config.key, value),
    };
    return config.control === "input" ? (
      <LabeledInput key={config.key} {...common} />
    ) : (
      <LabeledTextarea key={config.key} {...common} rows={config.rows} />
    );
  }

  return (
    <div className="text-left">
      {/* En-tête personnalisé (données minimales renvoyées par l'API) */}
      <p className="font-display text-xl font-semibold text-[#173D32]">
        Bonjour {intro.dossier.prenom}
        {intro.dossier.initialeNom ? ` ${intro.dossier.initialeNom}.` : ""},
      </p>
      <p className="mt-2 text-sm leading-relaxed text-[#202522]/80">
        Ce formulaire recueille votre parcours pour le valoriser sur la plateforme. Vous pouvez le
        remplir en plusieurs fois : vos réponses sont enregistrées sur nos serveurs à chaque
        étape, puis reprises automatiquement ici même.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Votre lien est valable jusqu&apos;au {formatFrDate(intro.invitation.expiresAt)}.
      </p>

      {/* Progression (§7.1) */}
      <div className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-foreground">
            Étape {step + 1} sur {FORM_STEPS.length} — {currentStepConfig.label}
          </p>
          <p className="text-xs tabular-nums text-muted-foreground" aria-hidden="true">
            {Math.round(((step + 1) / FORM_STEPS.length) * 100)} %
          </p>
        </div>
        <Progress
          value={((step + 1) / FORM_STEPS.length) * 100}
          className="mt-2 h-2"
          aria-label={`Progression du formulaire : étape ${step + 1} sur ${FORM_STEPS.length}`}
        />
        <nav aria-label="Étapes du formulaire" className="mt-3">
          <ol className="flex list-none gap-1.5 overflow-x-auto p-0 pb-1">
            {FORM_STEPS.map((item, index) => {
              const active = index === step;
              return (
                <li key={item.key} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => goToStep(index)}
                    aria-current={active ? "step" : undefined}
                    aria-label={`Étape ${index + 1} : ${item.label}`}
                    disabled={!consentMeta.accepte && index > 0}
                    className={cn(
                      "flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
                      active
                        ? "border-pine bg-pine text-[#F8F5EF]"
                        : "border-border bg-white text-foreground/75 hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                        active ? "bg-gold text-pine" : "bg-muted text-foreground/70",
                      )}
                    >
                      {index + 1}
                    </span>
                    <span className="hidden lg:inline">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </div>

      {/* Contenu de l'étape courante */}
      <fieldset disabled={busy} className="mt-6 grid gap-5 border-0 p-0">
        <legend className="sr-only">Étape {step + 1} : {currentStepConfig.label}</legend>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-lg font-semibold text-foreground focus:outline-none"
        >
          Étape {step + 1} — {currentStepConfig.label}
        </h2>

        {stepError ? (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
            {stepError}
          </p>
        ) : null}

        {step === 0 ? (
          <ConsentStep
            token={token}
            intro={intro}
            consentMeta={consentMeta}
            onAccepted={(meta) => {
              setConsentMeta(meta);
              goToStep(1);
            }}
            onUnavailableError={() => setScreen("invalid")}
          />
        ) : null}

        {step === 1 ? (
          <>
            <div className="grid gap-5">{PRESENTATION_FIELDS.map(renderTextField)}</div>
            <fieldset disabled={busy} className="grid gap-4 rounded-xl border border-gold/50 bg-gold/10 p-4">
              <legend className="rounded px-1.5 text-sm font-semibold text-pine">
                Coordonnées privées — jamais publiées
              </legend>
              <p className="text-sm leading-relaxed text-foreground/85">
                Ces informations servent uniquement à l&apos;équipe pour vous recontacter au sujet
                de votre dossier. Elles n&apos;apparaîtront jamais sur votre profil public.
              </p>
              <LabeledInput
                label="Téléphone"
                type="tel"
                autoComplete="tel"
                value={values.contacts.phone}
                maxLength={40}
                error={fieldErrors["contacts.phone"] || undefined}
                disabled={busy}
                onChange={(value) => updateContact("phone", value)}
              />
              <LabeledInput
                label="Adresse e-mail"
                type="email"
                autoComplete="email"
                value={values.contacts.email}
                maxLength={200}
                error={fieldErrors["contacts.email"] || undefined}
                disabled={busy}
                onChange={(value) => updateContact("email", value)}
              />
              <LabeledInput
                label="Moyen de contact privilégié"
                hint="Par exemple : WhatsApp, appel téléphonique, e-mail."
                value={values.contacts.contactPreference}
                maxLength={60}
                error={fieldErrors["contacts.contactPreference"] || undefined}
                disabled={busy}
                onChange={(value) => updateContact("contactPreference", value)}
              />
            </fieldset>
          </>
        ) : null}

        {step === 2 ? <div className="grid gap-5">{PARCOURS_FIELDS.map(renderTextField)}</div> : null}
        {step === 3 ? <div className="grid gap-5">{CARRIERE_FIELDS.map(renderTextField)}</div> : null}

        {step === 4 ? (
          <InitiativesStep
            initiatives={values.initiatives}
            disabled={busy}
            errors={fieldErrors}
            onChange={(next) => setValues((prev) => (prev ? { ...prev, initiatives: next } : prev))}
          />
        ) : null}

        {step === 5 ? <div className="grid gap-5">{VISION_FIELDS.map(renderTextField)}</div> : null}

        {step === 6 ? (
          <MediaStep
            token={token}
            media={values.media}
            disabled={busy}
            onMediaChange={(next: MediaItem[]) =>
              setValues((prev) => (prev ? { ...prev, media: next } : prev))
            }
          />
        ) : null}

        {step === 7 ? <PublicationStep values={values} /> : null}

        {step === 8 ? (
          <ReviewStep
            values={values}
            submitting={busy}
            submitError={stepError}
            onSubmit={handleSubmit}
            onGoToStep={goToStep}
          />
        ) : null}
      </fieldset>

      {/* Navigation entre étapes */}
      <div className="mt-6 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {step > 0 ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => goToStep(step - 1)}
              disabled={busy}
              className="min-h-11"
            >
              <ChevronLeft aria-hidden="true" />
              Précédent
            </Button>
          ) : null}
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          {savedAt ? (
            <p role="status" className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground sm:mr-2">
              <CheckCircle2 aria-hidden="true" className="size-3.5 text-emerald-600" />
              Enregistré à {frTime.format(new Date(savedAt))}
            </p>
          ) : null}
          {/* Étape 0 : le bouton « Accepter et continuer » est porté par le
              consentement (bloquant) — pas de navigation directe. */}
          {step >= 1 && step < FORM_STEPS.length - 1 ? (
            <Button
              type="button"
              onClick={handleSaveAndContinue}
              disabled={busy}
              className="min-h-11 w-full sm:w-auto"
            >
              {busy && SAVABLE_STEPS.includes(step) ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : null}
              {SAVABLE_STEPS.includes(step) ? "Enregistrer et continuer" : "Continuer"}
            </Button>
          ) : null}
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Vos réponses sont enregistrées lorsque vous cliquez sur « Enregistrer et continuer ». En
        cas de coupure, rouvrez ce lien : tout ce qui a été enregistré sera repris.
      </p>
    </div>
  );
}
