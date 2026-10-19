"use client";

// ---------------------------------------------------------------------------
// Étape 5 du formulaire (§7.6) — Engagement et initiatives.
// Liste répétable (10 maximum, DRAFT_MAX_INITIATIVES) ; schéma = contrat réel
// draftInitiativeSchema. resultsType distingue résultats observés / estimés /
// objectifs visés (§7.6 : pas de confusion entre réalisations et annonces).
// ---------------------------------------------------------------------------

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import {
  INITIATIVE_PROJECT_STATES,
  INITIATIVE_PROJECT_STATE_LABELS,
  INITIATIVE_RESULT_TYPES,
  INITIATIVE_RESULT_TYPE_LABELS,
  type InitiativeProjectState,
  type InitiativeResultType,
} from "@/lib/constants";
import { DRAFT_MAX_INITIATIVES } from "@/lib/invitation-draft";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LabeledInput, LabeledTextarea } from "@/components/invitation/invitation-fields";
import type { InitiativeValues } from "@/components/invitation/invitation-types";

const EMPTY_VALUE = "__vide__";

/** Sélecteur à valeur facultative ("" autorisé — contrat : nullable). */
function OptionalSelect({
  id,
  label,
  hint,
  value,
  options,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium leading-snug">
        {label}
        <span className="ml-1.5 text-xs font-normal text-muted-foreground">(facultatif)</span>
      </label>
      <Select
        value={value === "" ? EMPTY_VALUE : value}
        onValueChange={(next) => onChange(next === EMPTY_VALUE ? "" : next)}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="min-h-11 w-full bg-white sm:w-72">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={EMPTY_VALUE}>—</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint ? <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function InitiativeCard({
  index,
  initiative,
  disabled,
  errors,
  onUpdate,
  onRemove,
}: {
  index: number;
  initiative: InitiativeValues;
  disabled: boolean;
  errors: Record<string, string>;
  onUpdate: (patch: Partial<InitiativeValues>) => void;
  onRemove: () => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const base = `initiatives.${index}`;

  return (
    <li className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-display text-base font-semibold text-foreground">
          Initiative {index + 1}
        </h4>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setConfirmRemove(true)}
          disabled={disabled}
          className="min-h-11 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 aria-hidden="true" className="size-4" />
          Retirer
        </Button>
      </div>

      <div className="mt-4 grid gap-4">
        <LabeledInput
          label="Titre de l'initiative"
          required
          value={initiative.title}
          onChange={(value) => onUpdate({ title: value })}
          error={errors[`${base}.title`]}
          maxLength={200}
          disabled={disabled}
        />
        <LabeledTextarea
          label="Description"
          value={initiative.description}
          onChange={(value) => onUpdate({ description: value })}
          maxLength={10000}
          rows={4}
          disabled={disabled}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <LabeledInput
            label="Date ou période"
            hint="Par exemple : 2021–2023, depuis mars 2024."
            value={initiative.periodLabel}
            onChange={(value) => onUpdate({ periodLabel: value })}
            maxLength={120}
            disabled={disabled}
          />
          <LabeledInput
            label="Zone d'action générale"
            hint="Par exemple : éducation des filles, santé communautaire."
            value={initiative.actionArea}
            onChange={(value) => onUpdate({ actionArea: value })}
            maxLength={200}
            disabled={disabled}
          />
          <LabeledInput
            label="Public bénéficiaire"
            value={initiative.beneficiaries}
            onChange={(value) => onUpdate({ beneficiaries: value })}
            maxLength={300}
            disabled={disabled}
          />
          <LabeledInput
            label="Rôle exact que vous avez joué"
            value={initiative.rolePlayed}
            onChange={(value) => onUpdate({ rolePlayed: value })}
            maxLength={200}
            disabled={disabled}
          />
        </div>
        <LabeledInput
          label="Partenaires"
          hint="Ne mentionnez que les partenaires dont vous autorisez la publication."
          value={initiative.partners}
          onChange={(value) => onUpdate({ partners: value })}
          maxLength={300}
          disabled={disabled}
        />
        <LabeledTextarea
          label="Objectifs"
          value={initiative.objectives}
          onChange={(value) => onUpdate({ objectives: value })}
          maxLength={5000}
          rows={3}
          disabled={disabled}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <LabeledTextarea
            label="Résultats obtenus"
            hint="Restez factuelle : ce qui a réellement eu lieu."
            value={initiative.results}
            onChange={(value) => onUpdate({ results: value })}
            maxLength={5000}
            rows={3}
            disabled={disabled}
          />
          <OptionalSelect
            id={`${base}-results-type`}
            label="Nature des résultats"
            hint="Distinguez clairement les réalisations observées des estimations ou des objectifs."
            value={initiative.resultsType}
            options={INITIATIVE_RESULT_TYPES.map((value) => ({
              value,
              label: INITIATIVE_RESULT_TYPE_LABELS[value as InitiativeResultType],
            }))}
            onChange={(value) => onUpdate({ resultsType: value })}
            disabled={disabled}
          />
        </div>
        <LabeledTextarea
          label="Éléments qui étayent ces résultats"
          hint="Réservé à l'équipe pour la vérification — jamais publié."
          value={initiative.evidence}
          onChange={(value) => onUpdate({ evidence: value })}
          maxLength={5000}
          rows={3}
          disabled={disabled}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <LabeledTextarea
            label="Difficultés rencontrées"
            value={initiative.difficulties}
            onChange={(value) => onUpdate({ difficulties: value })}
            maxLength={5000}
            rows={3}
            disabled={disabled}
          />
          <LabeledTextarea
            label="Enseignements tirés"
            value={initiative.learnings}
            onChange={(value) => onUpdate({ learnings: value })}
            maxLength={5000}
            rows={3}
            disabled={disabled}
          />
        </div>
        <OptionalSelect
          id={`${base}-project-state`}
          label="État du projet"
          value={initiative.projectState}
          options={INITIATIVE_PROJECT_STATES.map((value) => ({
            value,
            label: INITIATIVE_PROJECT_STATE_LABELS[value as InitiativeProjectState],
          }))}
          onChange={(value) => onUpdate({ projectState: value })}
          disabled={disabled}
        />
      </div>

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer l&apos;initiative « {initiative.title.trim() || `n° ${index + 1}`} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              {initiative.title.trim()
                ? "Cette initiative sera retirée du formulaire lors du prochain enregistrement de l'étape."
                : "Le bloc sera retiré du formulaire. Rien n'a encore été enregistré pour cette initiative."}{" "}
              Cette action est définitive pour cette session de saisie.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 bg-destructive text-white hover:bg-destructive/90"
              onClick={onRemove}
            >
              Retirer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

export function InitiativesStep({
  initiatives,
  disabled,
  errors,
  onChange,
}: {
  initiatives: InitiativeValues[];
  disabled: boolean;
  errors: Record<string, string>;
  onChange: (next: InitiativeValues[]) => void;
}) {
  function addInitiative() {
    if (initiatives.length >= DRAFT_MAX_INITIATIVES) return;
    onChange([
      ...initiatives,
      {
        uid: `initiative-${Date.now()}-${initiatives.length}`,
        title: "",
        description: "",
        periodLabel: "",
        actionArea: "",
        beneficiaries: "",
        rolePlayed: "",
        partners: "",
        objectives: "",
        results: "",
        resultsType: "",
        evidence: "",
        difficulties: "",
        learnings: "",
        projectState: "",
      },
    ]);
  }

  const atLimit = initiatives.length >= DRAFT_MAX_INITIATIVES;

  return (
    <div className="grid gap-5">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Décrivez une ou plusieurs initiatives que vous avez menées (10 maximum). Seul le titre est
        obligatoire ; les autres champs sont facultatifs. Les blocs entièrement vides sont ignorés
        à l&apos;enregistrement : vous pouvez aussi continuer sans rien remplir.
      </p>

      {initiatives.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
          Aucune initiative pour le moment. Vous pouvez en ajouter une, ou passer à l&apos;étape
          suivante si cela ne vous concerne pas.
        </p>
      ) : (
        <ul className="grid list-none gap-4 p-0">
          {initiatives.map((initiative, index) => (
            <InitiativeCard
              key={initiative.uid}
              index={index}
              initiative={initiative}
              disabled={disabled}
              errors={errors}
              onUpdate={(patch) =>
                onChange(initiatives.map((item) => (item.uid === initiative.uid ? { ...item, ...patch } : item)))
              }
              onRemove={() => onChange(initiatives.filter((item) => item.uid !== initiative.uid))}
            />
          ))}
        </ul>
      )}

      <div>
        <Button
          type="button"
          variant="outline"
          onClick={addInitiative}
          disabled={disabled || atLimit}
          className="min-h-11 w-full sm:w-auto"
        >
          <Plus aria-hidden="true" />
          Ajouter une initiative
        </Button>
        <p className="mt-2 text-xs text-muted-foreground" role="status">
          {initiatives.length} initiative{initiatives.length > 1 ? "s" : ""} sur{" "}
          {DRAFT_MAX_INITIATIVES} maximum.
        </p>
      </div>
    </div>
  );
}
