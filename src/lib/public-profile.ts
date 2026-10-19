// ---------------------------------------------------------------------------
// Sérialiseur PUBLIC UNIQUE des profils publiés (§4.2, §4.4, §14) — tâche 4-b.
//
// TOUTES les pages publiques (annuaire /profils, fiche /profils/<slug>,
// accueil) passent par ce fichier : aucune autre ne lit directement
// PersonRecord/ProfilePublication pour l'affichage public.
//
// Garanties :
//   - liste blanche : seuls les champs présents dans
//     publication.approvedFields (validés contre PUBLIC_FIELDS) et non vides
//     sont renvoyés ;
//   - données de base minimales : nom public, slug, catégorie active, photo
//     autorisée, date de publication, mise en avant ;
//   - MINEURES (PersonRecord.isMinor) — modèle restreint §14 :
//       • city/region JAMAIS renvoyées, même si approvedFields les contient
//         (double garde : l'API admin les refuse déjà à la publication) ;
//       • biographie tronquée à MINOR_BIOGRAPHY_PUBLIC_MAX_LENGTH à l'affichage ;
//       • aucune date de naissance (elle n'est de toute façon pas stockée) ;
//   - AUCUNE donnée privée (contacts, notes internes, statuts, métadonnées,
//     nom de gestion, identité légale, jetons) ne transite ici.
// ---------------------------------------------------------------------------

import {
  MINOR_BIOGRAPHY_PUBLIC_MAX_LENGTH,
  MINOR_FORBIDDEN_FIELDS,
  PUBLIC_FIELD_LABELS,
  isPublicField,
  type PublicField,
} from "@/lib/public-fields";
import {
  INITIATIVE_PROJECT_STATE_LABELS,
  INITIATIVE_RESULT_TYPE_LABELS,
  type InitiativeProjectState,
  type InitiativeResultType,
} from "@/lib/constants";

// --- Types sources (sélections Prisma attendues des pages publiques) ---------

/** Formulaire de média photo autorisé à l'affichage public. */
export interface PublicPhotoSource {
  id: string;
  kind: string;
  status: string;
  visibility: string;
  width: number | null;
  height: number | null;
  originalName: string | null;
}

export interface PublicProfilePersonSource {
  publicName: string | null;
  isMinor: boolean;
  shortPresentation: string | null;
  biography: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  languages: string | null;
  storyJourney: string | null;
  engagementMotivation: string | null;
  keyEvent: string | null;
  difficultiesEncountered: string | null;
  lessonsLearned: string | null;
  inspirationSource: string | null;
  education: string | null;
  professionalExperience: string | null;
  responsibilities: string | null;
  organizations: string | null;
  skills: string | null;
  distinctions: string | null;
  visionCommunity: string | null;
  futureGoals: string | null;
  projectsToDevelop: string | null;
  supportNeeded: string | null;
  messageToYouth: string | null;
  category: { name: string; slug: string; isActive: boolean } | null;
  photoAsset: PublicPhotoSource | null;
  /** Médias du dossier déjà filtrés en amont : visibility PUBLIC, statut READY/VALIDATED. */
  media: PublicPhotoSource[];
  initiatives: {
    id: string;
    title: string;
    description: string | null;
    periodLabel: string | null;
    actionArea: string | null;
    beneficiaries: string | null;
    rolePlayed: string | null;
    partners: string | null;
    objectives: string | null;
    results: string | null;
    resultsType: string | null;
    projectState: string | null;
  }[];
}

export interface PublicPublicationSource {
  slug: string;
  state: string;
  approvedFields: string; // JSON array
  featured: boolean;
  publishedAt: Date | null;
}

// --- Types publics renvoyés ---------------------------------------------------

export interface PublicPhotoView {
  id: string;
  url: string; // /api/public/media/<id> — servie uniquement si visibility PUBLIC + publication active
  width: number | null;
  height: number | null;
  alt: string;
}

export interface PublicInitiativeView {
  id: string;
  title: string;
  description: string | null;
  periodLabel: string | null;
  actionArea: string | null;
  beneficiaries: string | null;
  rolePlayed: string | null;
  partners: string | null;
  objectives: string | null;
  results: string | null;
  resultsType: string | null; // libellé FR ou null
  projectState: string | null; // libellé FR ou null
}

/** Section textuelle générique de la fiche (champ approuvé + non vide). */
export interface PublicProfileSection {
  key: PublicField;
  label: string;
  value: string;
}

/** Données minimales utilisées par les cartes (annuaire, accueil). */
export interface PublicCardView {
  slug: string;
  publicName: string;
  shortPresentation: string | null;
  country: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  photo: PublicPhotoView | null;
  isMinor: boolean;
  publishedAtISO: string | null;
}

export interface PublicProfileView {
  slug: string;
  publicName: string;
  isMinor: boolean;
  featured: boolean;
  publishedAtISO: string | null;
  category: { name: string; slug: string } | null;
  photo: PublicPhotoView | null;
  /** Localisation affichable (« Ville, Région, Pays ») — approuvée uniquement, jamais pour une mineure au-delà du pays. */
  location: string | null;
  country: string | null;
  shortPresentation: string | null;
  /** Paragraphes de la biographie (approuvée uniquement ; tronquée pour une mineure). */
  biographyParagraphs: string[] | null;
  /** Champs textuels approuvés et non vides, ordonnés (hors champs traités à part). */
  sections: PublicProfileSection[];
  initiatives: PublicInitiativeView[];
}

// --- Utilitaires --------------------------------------------------------------

/** Parse et valide approvedFields (JSON) contre la liste blanche. */
export function approvedFieldsOf(raw: string): PublicField[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (value): value is PublicField => typeof value === "string" && isPublicField(value),
      );
    }
  } catch {
    // valeur corrompue → aucune champ approuvé (échec fermé)
  }
  return [];
}

/** Tronque à l'affichage (mineures : biographie ≤ 2000 caractères, §14). */
export function truncateForDisplay(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}

/** Découpe un texte en paragraphes sur les doubles sauts de ligne. */
export function splitParagraphs(value: string): string[] {
  return value
    .split(/\r?\n\s*\r?\n/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** Description SEO de secours : présentation courte (ou biographie) tronquée à 160. */
export function seoDescriptionFrom(shortPresentation: string | null, biography: string | null): string | undefined {
  const source = (shortPresentation ?? biography ?? "").replace(/\s+/g, " ").trim();
  return source.length > 0 ? truncateForDisplay(source, 160) : undefined;
}

const isDisplayablePhoto = (media: PublicPhotoSource): boolean =>
  media.visibility === "PUBLIC" && (media.status === "READY" || media.status === "VALIDATED");

/**
 * Résout la photo publique :
 *   - uniquement si « mainPhoto » est approuvé ;
 *   - photoAsset désigné par l'administration s'il est PUBLIC, sinon premier
 *     média PUBLIC du dossier (photo de profil privilégiée) ;
 *   - la route /api/public/media/[id] revalide chaque accès (défense en profondeur).
 */
function resolvePublicPhoto(
  person: Pick<PublicProfilePersonSource, "photoAsset" | "media" | "publicName">,
  mainPhotoApproved: boolean,
): PublicPhotoView | null {
  if (!mainPhotoApproved) return null;

  const designated =
    person.photoAsset && isDisplayablePhoto(person.photoAsset) ? person.photoAsset : null;
  const fallback = [...person.media]
    .filter(isDisplayablePhoto)
    .sort((a, b) => (a.kind === "PROFILE_PHOTO" ? -1 : 0) - (b.kind === "PROFILE_PHOTO" ? -1 : 0))[0];

  const media = designated ?? fallback ?? null;
  if (!media) return null;

  return {
    id: media.id,
    url: `/api/public/media/${media.id}`,
    width: media.width,
    height: media.height,
    alt: `Portrait de ${person.publicName ?? "la participante"}`,
  };
}

/** Ordre d'affichage éditorial des sections textuelles de la fiche. */
const PROFILE_SECTION_ORDER: readonly PublicField[] = [
  "storyJourney",
  "engagementMotivation",
  "keyEvent",
  "difficultiesEncountered",
  "lessonsLearned",
  "inspirationSource",
  "education",
  "professionalExperience",
  "responsibilities",
  "organizations",
  "skills",
  "distinctions",
  "languages",
  "visionCommunity",
  "futureGoals",
  "projectsToDevelop",
  "supportNeeded",
  "messageToYouth",
];

// --- Cartes (annuaire / accueil) ---------------------------------------------

/**
 * Sérialise les données de carte. Règles : nom public, présentation courte,
 * pays, catégorie et photo — chacun uniquement si approuvé. Pour une mineure,
 * city/region sont retirées (double garde) : seul le pays peut apparaître.
 */
export function serializePublicCard(
  person: Pick<
    PublicProfilePersonSource,
    "publicName" | "isMinor" | "shortPresentation" | "country" | "category" | "photoAsset" | "media"
  >,
  publication: Pick<PublicPublicationSource, "slug" | "state" | "approvedFields" | "publishedAt">,
): PublicCardView | null {
  if (publication.state !== "PUBLISHED") return null;
  const publicName = person.publicName?.trim() ?? "";
  if (publicName.length === 0) return null;

  const approved = new Set(approvedFieldsOf(publication.approvedFields));
  // Double garde mineures : city/region ne passent jamais (§14) — uniquement
  // pour une personne mineure, même si approvedFields les contiendrait par erreur.
  if (person.isMinor) {
    for (const forbidden of MINOR_FORBIDDEN_FIELDS) approved.delete(forbidden);
  }

  return {
    slug: publication.slug,
    publicName,
    shortPresentation: approved.has("shortPresentation") ? person.shortPresentation?.trim() || null : null,
    country: approved.has("country") ? person.country?.trim() || null : null,
    categoryName: person.category?.isActive ? person.category.name : null,
    categorySlug: person.category?.isActive ? person.category.slug : null,
    photo: resolvePublicPhoto(person, approved.has("mainPhoto")),
    isMinor: person.isMinor,
    publishedAtISO: publication.publishedAt ? publication.publishedAt.toISOString() : null,
  };
}

// --- Fiche publique complète --------------------------------------------------

/**
 * Sérialise la fiche publique complète. Retourne null si la publication n'est
 * pas à l'état PUBLISHED ou si le nom public est vide (la page appellera
 * notFound() — 404 générique anti-énumération, §4.5).
 */
export function serializePublicProfile(
  person: PublicProfilePersonSource,
  publication: PublicPublicationSource,
): PublicProfileView | null {
  if (publication.state !== "PUBLISHED") return null;
  const publicName = person.publicName?.trim() ?? "";
  if (publicName.length === 0) return null;

  const approved = new Set(approvedFieldsOf(publication.approvedFields));
  // Double garde mineures (§14) : city/region interdites même si approuvées
  // par erreur (ne devrait jamais arriver : l'API admin les refuse). Le filtre
  // ne s'applique qu'aux mineures — un profil majeur garde ses champs approuvés.
  if (person.isMinor) {
    for (const forbidden of MINOR_FORBIDDEN_FIELDS) approved.delete(forbidden);
  }

  // Biographie : uniquement si approuvée ; tronquée à l'affichage pour une mineure.
  let biographyParagraphs: string[] | null = null;
  if (approved.has("biography")) {
    const rawBiography = person.biography?.trim() ?? "";
    if (rawBiography.length > 0) {
      const effective = person.isMinor
        ? truncateForDisplay(rawBiography, MINOR_BIOGRAPHY_PUBLIC_MAX_LENGTH)
        : rawBiography;
      biographyParagraphs = splitParagraphs(effective);
    }
  }

  // Localisation : concaténée dans l'ordre Ville · Région · Pays, champs
  // approuvés uniquement (city/region déjà retirées pour une mineure).
  const locationParts = [
    approved.has("city") ? person.city?.trim() || null : null,
    approved.has("region") ? person.region?.trim() || null : null,
    approved.has("country") ? person.country?.trim() || null : null,
  ].filter((part): part is string => Boolean(part));
  const location = locationParts.length > 0 ? locationParts.join(", ") : null;

  // Sections textuelles : champ approuvé ET non vide.
  const sections: PublicProfileSection[] = [];
  for (const key of PROFILE_SECTION_ORDER) {
    if (!approved.has(key)) continue;
    const raw = person[key as keyof PublicProfilePersonSource];
    const value = typeof raw === "string" ? raw.trim() : "";
    if (value.length === 0) continue;
    sections.push({ key, label: PUBLIC_FIELD_LABELS[key], value });
  }

  // Initiatives : uniquement si le champ « initiatives » est approuvé.
  const initiatives: PublicInitiativeView[] = approved.has("initiatives")
    ? person.initiatives
        // L'ordre de la requête (sortOrder asc) est conservé tel quel.
        .map((initiative) => ({
          id: initiative.id,
          title: initiative.title,
          description: initiative.description?.trim() || null,
          periodLabel: initiative.periodLabel?.trim() || null,
          actionArea: initiative.actionArea?.trim() || null,
          beneficiaries: initiative.beneficiaries?.trim() || null,
          rolePlayed: initiative.rolePlayed?.trim() || null,
          partners: initiative.partners?.trim() || null,
          objectives: initiative.objectives?.trim() || null,
          results: initiative.results?.trim() || null,
          resultsType:
            initiative.resultsType && initiative.resultsType in INITIATIVE_RESULT_TYPE_LABELS
              ? INITIATIVE_RESULT_TYPE_LABELS[initiative.resultsType as InitiativeResultType]
              : null,
          projectState:
            initiative.projectState && initiative.projectState in INITIATIVE_PROJECT_STATE_LABELS
              ? INITIATIVE_PROJECT_STATE_LABELS[initiative.projectState as InitiativeProjectState]
              : null,
        }))
    : [];

  const categoryActive = person.category?.isActive
    ? { name: person.category.name, slug: person.category.slug }
    : null;

  return {
    slug: publication.slug,
    publicName,
    isMinor: person.isMinor,
    featured: publication.featured,
    publishedAtISO: publication.publishedAt ? publication.publishedAt.toISOString() : null,
    category: categoryActive,
    photo: resolvePublicPhoto(person, approved.has("mainPhoto")),
    location,
    country: approved.has("country") ? person.country?.trim() || null : null,
    shortPresentation: approved.has("shortPresentation") ? person.shortPresentation?.trim() || null : null,
    biographyParagraphs,
    sections,
    initiatives,
  };
}
