// ---------------------------------------------------------------------------
// Brouillon du formulaire invité (§7) — contrat partagé entre GET /state et
// PUT /draft : liste blanche STRICTE des champs éditables par la participante.
//
// Ne sont JAMAIS éditables via le jeton : statut, nom de gestion, nom de
// famille, prénom, genre, année de naissance, minorité, catégorie, photo
// principale — ces champs d'identité appartiennent à l'administration.
// ---------------------------------------------------------------------------

import { z } from "zod";
import { INITIATIVE_PROJECT_STATES, INITIATIVE_RESULT_TYPES } from "@/lib/constants";

/** Champs PersonRecord éditables via le jeton, avec longueur maximale. */
export const DRAFT_TEXT_FIELDS = {
  publicName: 150,
  shortPresentation: 600,
  biography: 20000,
  country: 120,
  region: 120,
  city: 120,
  languages: 300,
  storyJourney: 10000,
  engagementMotivation: 10000,
  keyEvent: 10000,
  difficultiesEncountered: 10000,
  lessonsLearned: 10000,
  inspirationSource: 10000,
  education: 10000,
  professionalExperience: 10000,
  responsibilities: 10000,
  organizations: 10000,
  skills: 10000,
  distinctions: 10000,
  visionCommunity: 10000,
  futureGoals: 10000,
  projectsToDevelop: 10000,
  supportNeeded: 10000,
  messageToYouth: 10000,
} as const;

export type DraftTextFieldKey = keyof typeof DRAFT_TEXT_FIELDS;

export const DRAFT_FIELD_KEYS = Object.keys(DRAFT_TEXT_FIELDS) as DraftTextFieldKey[];

/** Nombre maximal d'initiatives décrites par dossier (§7.6). */
export const DRAFT_MAX_INITIATIVES = 10;

const nullableTextField = (max: number) =>
  z.string().max(max, `${max} caractères maximum.`).nullable();

/** Schéma zod strict d'une initiative (champs inconnus refusés). */
export const draftInitiativeSchema = z.object({
  title: z.string().trim().min(1, "Le titre de l'initiative est obligatoire.").max(200),
  description: nullableTextField(10000).optional(),
  periodLabel: z.string().trim().max(120).nullable().optional(),
  actionArea: z.string().trim().max(200).nullable().optional(),
  beneficiaries: z.string().trim().max(300).nullable().optional(),
  rolePlayed: z.string().trim().max(200).nullable().optional(),
  partners: z.string().trim().max(300).nullable().optional(),
  objectives: nullableTextField(5000).optional(),
  results: nullableTextField(5000).optional(),
  resultsType: z.enum(INITIATIVE_RESULT_TYPES).nullable().optional(),
  evidence: z.string().trim().max(5000).nullable().optional(),
  difficulties: nullableTextField(5000).optional(),
  learnings: nullableTextField(5000).optional(),
  projectState: z.enum(INITIATIVE_PROJECT_STATES).nullable().optional(),
});

/** Schéma zod strict du brouillon : tout champ inconnu est refusé. */
export const draftSchema = z
  .object({
    ...Object.fromEntries(
      DRAFT_FIELD_KEYS.map((key) => [key, nullableTextField(DRAFT_TEXT_FIELDS[key]).optional()]),
    ),
    contacts: z
      .object({
        phone: z.string().trim().max(40, "40 caractères maximum.").nullable().optional(),
        email: z.email("Adresse e-mail invalide.").max(200).nullable().optional(),
        contactPreference: z.string().trim().max(60).nullable().optional(),
      })
      .optional(),
    initiatives: z.array(draftInitiativeSchema).max(DRAFT_MAX_INITIATIVES, {
      message: `${DRAFT_MAX_INITIATIVES} initiatives maximum.`,
    }).optional(),
  })
  .strict();

export type DraftPayload = z.infer<typeof draftSchema>;

/**
 * Sérialisation en liste blanche de l'état courant du brouillon (GET /state) :
 * uniquement les champs du formulaire — jamais les champs système ni les
 * données d'identité gérées par l'administration.
 */
export function serializeDraftRecord(person: {
  [K in DraftTextFieldKey]?: string | null;
}): Record<DraftTextFieldKey, string | null> {
  const out = {} as Record<DraftTextFieldKey, string | null>;
  for (const key of DRAFT_FIELD_KEYS) {
    out[key] = person[key] ?? null;
  }
  return out;
}
