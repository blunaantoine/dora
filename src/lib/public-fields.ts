// ---------------------------------------------------------------------------
// Liste blanche FIXE des champs publics d'un profil (§4.4, §8.4) + libellés
// français pour l'interface d'administration.
//
// Cette liste est la SEULE source de vérité pour :
//   - la publication (approvedFields de ProfilePublication, stocké en JSON) ;
//   - les champs concernés d'une demande de clarification (§8.2) ;
//   - la future fiche publique /profils/<slug> (tâche 4-b : seuls les champs
//     approuvés et présents dans cette liste peuvent être affichés).
//
// Aucun champ privé (téléphone, e-mail, nom légal, notes internes,
// contacts du tuteur…) n'y figure : ils sont strictement exclus (§4.4).
// ---------------------------------------------------------------------------

export const PUBLIC_FIELDS = [
  "publicName",
  "shortPresentation",
  "biography",
  "country",
  "region",
  "city",
  "languages",
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
  "visionCommunity",
  "futureGoals",
  "projectsToDevelop",
  "supportNeeded",
  "messageToYouth",
  "initiatives",
  "mainPhoto",
] as const;

export type PublicField = (typeof PUBLIC_FIELDS)[number];

export const PUBLIC_FIELD_LABELS: Record<PublicField, string> = {
  publicName: "Nom public",
  shortPresentation: "Présentation courte",
  biography: "Biographie",
  country: "Pays",
  region: "Région",
  city: "Ville",
  languages: "Langues",
  storyJourney: "Parcours d'engagement",
  engagementMotivation: "Motivation de l'engagement",
  keyEvent: "Événement déterminant",
  difficultiesEncountered: "Difficultés rencontrées",
  lessonsLearned: "Leçons apprises",
  inspirationSource: "Source d'inspiration",
  education: "Éducation",
  professionalExperience: "Expérience professionnelle",
  responsibilities: "Responsabilités",
  organizations: "Organisations",
  skills: "Compétences",
  distinctions: "Distinctions",
  visionCommunity: "Vision pour la communauté",
  futureGoals: "Objectifs futurs",
  projectsToDevelop: "Projets à développer",
  supportNeeded: "Soutien souhaité",
  messageToYouth: "Message à la jeunesse",
  initiatives: "Initiatives menées",
  mainPhoto: "Photo principale",
};

/** Vérifie qu'une valeur appartient à la liste blanche des champs publics. */
export function isPublicField(value: string): value is PublicField {
  return (PUBLIC_FIELDS as readonly string[]).includes(value);
}

/**
 * Champs Interdits pour une personne MINEURE (§4.4 : « limiter les données
 * personnelles, éviter la localisation précise ») : ville et région ne peuvent
 * jamais être approuvées à la publication d'un dossier mineur.
 */
export const MINOR_FORBIDDEN_FIELDS: readonly PublicField[] = ["city", "region"];

/**
 * Longueur maximale de la biographie à l'AFFICHAGE PUBLIC pour une mineure
 * (§14 : modèle de publication restreint). Le stockage n'est pas limité ;
 * la troncature est appliquée côté page publique (tâche 4-b).
 */
export const MINOR_BIOGRAPHY_PUBLIC_MAX_LENGTH = 2000;

/** Retire d'une liste de champs ceux interdits pour une mineure. */
export function filterFieldsForMinor(fields: readonly string[]): string[] {
  return fields.filter((field) => !MINOR_FORBIDDEN_FIELDS.includes(field as PublicField));
}
