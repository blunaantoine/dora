"use client";

// ---------------------------------------------------------------------------
// Étape 1 du formulaire (§7.2) — Présentation et consentements.
// Bloquante : aucune saisie n'est possible avant le consentement exprès.
// Le texte affiché provient de GET /api/invitation/[token] (ConsentText actif,
// versionné). Pour une mineure (§14), le nom du représentant légal est requis
// (POST /consent {nomTuteur}).
// ---------------------------------------------------------------------------

import { useState } from "react";
import { CheckCircle2, Loader2, ScrollText } from "lucide-react";

import { postJson } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { LabeledInput } from "@/components/invitation/invitation-fields";
import { flattenFields, formatFrDateTime, type InvitationIntroData } from "@/components/invitation/invitation-types";

interface ConsentMeta {
  accepte: boolean;
  code?: string;
  version?: number;
  acceptedAt?: string;
}

export function ConsentStep({
  token,
  intro,
  consentMeta,
  onAccepted,
  onUnavailableError,
}: {
  token: string;
  intro: InvitationIntroData;
  consentMeta: ConsentMeta;
  /** Appelé après enregistrement du consentement (ou directement si déjà accepté). */
  onAccepted: (meta: ConsentMeta) => void;
  /** Appelé si l'API renvoie une erreur fatale (404 — lien plus utilisable). */
  onUnavailableError: () => void;
}) {
  const [accepted, setAccepted] = useState(false);
  const [nomTuteur, setNomTuteur] = useState("");
  const [relationTuteur, setRelationTuteur] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const consent = intro.consent;
  const estMineure = intro.dossier.estMineure;

  const alreadyAccepted = consentMeta.accepte;

  async function handleSubmit() {
    if (submitting || !consent) return;
    setFormError(null);
    setFieldErrors({});

    if (!accepted) {
      setFieldErrors({ accepte: "Cochez la case de consentement pour continuer." });
      return;
    }
    if (estMineure && nomTuteur.trim().length < 2) {
      setFieldErrors({ nomTuteur: "Le nom du représentant légal est requis (2 caractères minimum)." });
      return;
    }

    setSubmitting(true);
    const result = await postJson<{
      consent: { code: string; version: number; acceptedAt: string };
      dossier: { estMineure: boolean };
    }>(`/api/invitation/${token}/consent`, {
      consentCode: consent.code,
      accepte: true,
      ...(estMineure ? { nomTuteur: nomTuteur.trim(), ...(relationTuteur.trim() ? { relationTuteur: relationTuteur.trim() } : {}) } : {}),
    });
    setSubmitting(false);

    if (!result.ok) {
      if (result.error.code === "NOT_FOUND") {
        onUnavailableError();
        return;
      }
      setFieldErrors(flattenFields(result.error.fields));
      setFormError(result.error.message);
      return;
    }

    onAccepted({
      accepte: true,
      code: result.data.consent.code,
      version: result.data.consent.version,
      acceptedAt: result.data.consent.acceptedAt,
    });
  }

  if (!consent) {
    // Configuration serveur incomplète : état explicite, aucune fausse promesse.
    return (
      <div className="grid gap-4">
        <p className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          Le texte de consentement n&apos;est pas disponible pour le moment. Merci de réessayer
          plus tard ; si le problème persiste, contactez l&apos;équipe de la plateforme.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <div>
        <h3 className="flex items-start gap-2 font-display text-base font-semibold text-foreground">
          <ScrollText aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-pine" />
          {consent.titre}
          <span className="sr-only"> (version {consent.version})</span>
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Version {consent.version} du texte en vigueur — lisez-le intégralement avant de continuer.
        </p>
      </div>

      <div
        role="region"
        aria-label="Notice d'information et de consentement"
        tabIndex={0}
        className="max-h-80 overflow-y-auto rounded-lg border border-border bg-white p-4 text-sm leading-relaxed whitespace-pre-line text-foreground/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {consent.texte}
      </div>

      {alreadyAccepted ? (
        <>
          <p className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              Consentement déjà enregistré
              {consentMeta.acceptedAt
                ? ` le ${formatFrDateTime(consentMeta.acceptedAt)}`
                : null}
              {consentMeta.version ? ` (version ${consentMeta.version})` : ""}. Vous pouvez
              relire la notice ci-dessus ; vous n&apos;avez pas besoin de recommencer.
            </span>
          </p>
          <div>
            <Button type="button" onClick={() => onAccepted(consentMeta)} className="min-h-11 w-full sm:w-auto">
              Continuer vers l&apos;étape suivante
            </Button>
          </div>
        </>
      ) : (
        <>
          {estMineure ? (
            <div className="grid gap-4 rounded-lg border border-gold/50 bg-gold/10 p-4">
              <p className="text-sm leading-relaxed text-foreground">
                La participante est mineure : le consentement de son représentant légal est requis
                avant toute collecte d&apos;informations (protection des mineures). Le formulaire
                doit être rempli sous sa supervision.
              </p>
              <LabeledInput
                label="Nom du représentant légal"
                required
                value={nomTuteur}
                onChange={(value) => {
                  setNomTuteur(value);
                  setFieldErrors((prev) => ({ ...prev, nomTuteur: "" }));
                }}
                error={fieldErrors.nomTuteur || undefined}
                maxLength={150}
                autoComplete="name"
                disabled={submitting}
              />
              <LabeledInput
                label="Lien avec la participante"
                hint="Par exemple : mère, père, tuteur ou tutrice."
                value={relationTuteur}
                onChange={setRelationTuteur}
                maxLength={100}
                disabled={submitting}
              />
            </div>
          ) : null}

          <div className="grid gap-1.5">
            <div className="flex items-start gap-3">
              <Checkbox
                id="consent-accepte"
                checked={accepted}
                onCheckedChange={(checked) => {
                  setAccepted(checked === true);
                  setFieldErrors((prev) => ({ ...prev, accepte: "" }));
                }}
                disabled={submitting}
                aria-invalid={fieldErrors.accepte ? true : undefined}
                className="mt-0.5 size-5"
              />
              <div className="grid gap-1">
                <Label htmlFor="consent-accepte" className="text-sm leading-snug font-medium">
                  J&apos;ai lu la notice ci-dessus et j&apos;accepte la collecte de mes informations
                  aux finalités qu&apos;elle décrit.{" "}
                  <span aria-hidden="true" className="font-semibold text-destructive">
                    *
                  </span>
                  <span className="sr-only">(obligatoire)</span>
                </Label>
                {fieldErrors.accepte ? (
                  <p id="consent-accepte-error" role="alert" className="text-sm font-medium text-destructive">
                    {fieldErrors.accepte}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {formError ? (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
              {formError}
            </p>
          ) : null}

          <div>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="min-h-11 w-full sm:w-auto"
            >
              {submitting ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
              {submitting ? "Enregistrement…" : "Accepter et continuer"}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Vous pourrez retirer votre consentement à tout moment en contactant l&apos;équipe.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
