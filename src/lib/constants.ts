// ---------------------------------------------------------------------------
// Référentiel métier : rôles, statuts, transitions, libellés français.
// Source : cahier des charges §2, §5.4, §9.2, §11, §15.3 — SQLite oblige :
// les statuts sont des String en base ; ces constantes en sont la seule
// source de vérité (aucun enum Prisma).
// ---------------------------------------------------------------------------

// --- Rôles administratifs (§2.3 à §2.5) ------------------------------------

export const ROLES = ["ADMIN", "MODERATOR", "EDITOR"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrateur principal",
  MODERATOR: "Modérateur",
  EDITOR: "Responsable éditorial",
};

// --- Statuts de dossier (machine à états, §5.4) -----------------------------

export const DOSSIER_STATUSES = [
  "DRAFT",
  "INVITATION_CREATED",
  "INVITATION_SENT",
  "IN_PROGRESS",
  "SUBMITTED",
  "UNDER_REVIEW",
  "CLARIFICATION_REQUESTED",
  "CLARIFICATION_RECEIVED",
  "APPROVED",
  "PUBLISHED",
  "REJECTED",
  "ARCHIVED",
  "RETRACTION_REQUESTED",
  "UNPUBLISHING",
] as const;
export type DossierStatus = (typeof DOSSIER_STATUSES)[number];

export const DOSSIER_STATUS_LABELS: Record<DossierStatus, string> = {
  DRAFT: "Brouillon",
  INVITATION_CREATED: "Invitation créée",
  INVITATION_SENT: "Invitation envoyée",
  IN_PROGRESS: "En cours de remplissage",
  SUBMITTED: "Soumis",
  UNDER_REVIEW: "En cours d'examen",
  CLARIFICATION_REQUESTED: "Informations complémentaires demandées",
  CLARIFICATION_RECEIVED: "Complément reçu",
  APPROVED: "Approuvé",
  PUBLISHED: "Publié",
  REJECTED: "Refusé",
  ARCHIVED: "Archivé",
  RETRACTION_REQUESTED: "Retrait demandé",
  UNPUBLISHING: "Dépublication en cours",
};

/** Classes Tailwind suggérées pour les badges de statut (variante shadcn/ui). */
export const DOSSIER_STATUS_BADGE_CLASS: Record<DossierStatus, string> = {
  DRAFT: "bg-stone-100 text-stone-700 border-stone-200",
  INVITATION_CREATED: "bg-amber-50 text-amber-700 border-amber-200",
  INVITATION_SENT: "bg-amber-100 text-amber-800 border-amber-200",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800 border-yellow-200",
  SUBMITTED: "bg-orange-100 text-orange-800 border-orange-200",
  UNDER_REVIEW: "bg-purple-100 text-purple-800 border-purple-200",
  CLARIFICATION_REQUESTED: "bg-rose-100 text-rose-800 border-rose-200",
  CLARIFICATION_RECEIVED: "bg-teal-100 text-teal-800 border-teal-200",
  APPROVED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  PUBLISHED: "bg-emerald-600 text-white border-emerald-600",
  REJECTED: "bg-red-100 text-red-800 border-red-200",
  ARCHIVED: "bg-stone-200 text-stone-600 border-stone-300",
  RETRACTION_REQUESTED: "bg-red-50 text-red-700 border-red-200",
  UNPUBLISHING: "bg-orange-50 text-orange-700 border-orange-200",
};

/**
 * Transitions autorisées entre statuts de dossier (§5.4).
 * Clé = statut source, valeur = statuts cibles autorisés.
 */
export const DOSSIER_TRANSITIONS: ReadonlyMap<DossierStatus, readonly DossierStatus[]> = new Map<
  DossierStatus,
  readonly DossierStatus[]
>([
  ["DRAFT", ["INVITATION_CREATED", "ARCHIVED"]],
  ["INVITATION_CREATED", ["INVITATION_SENT", "ARCHIVED"]],
  ["INVITATION_SENT", ["IN_PROGRESS", "ARCHIVED"]],
  ["IN_PROGRESS", ["SUBMITTED", "ARCHIVED"]],
  ["SUBMITTED", ["UNDER_REVIEW", "ARCHIVED"]],
  ["UNDER_REVIEW", ["CLARIFICATION_REQUESTED", "APPROVED", "REJECTED"]],
  ["CLARIFICATION_REQUESTED", ["CLARIFICATION_RECEIVED"]],
  ["CLARIFICATION_RECEIVED", ["UNDER_REVIEW"]],
  ["APPROVED", ["PUBLISHED", "UNDER_REVIEW", "ARCHIVED"]],
  ["PUBLISHED", ["RETRACTION_REQUESTED", "UNPUBLISHING", "ARCHIVED"]],
  ["RETRACTION_REQUESTED", ["UNPUBLISHING", "PUBLISHED", "ARCHIVED"]],
  ["UNPUBLISHING", ["ARCHIVED", "APPROVED"]],
  ["REJECTED", ["UNDER_REVIEW", "ARCHIVED"]],
  ["ARCHIVED", ["UNDER_REVIEW"]],
]);

/** Vérifie si le passage de `from` à `to` est autorisé par la machine à états. */
export function canTransition(from: DossierStatus, to: DossierStatus): boolean {
  return DOSSIER_TRANSITIONS.get(from)?.includes(to) ?? false;
}

/** Le statut correspond-il à un profil actuellement publié ? */
export function isPublished(status: DossierStatus): boolean {
  return status === "PUBLISHED";
}

// --- Témoignages (§9.2) ------------------------------------------------------

export const TESTIMONIAL_STATUSES = [
  "PENDING",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
  "REPORTED",
  "ARCHIVED",
] as const;
export type TestimonialStatus = (typeof TESTIMONIAL_STATUSES)[number];

export const TESTIMONIAL_STATUS_LABELS: Record<TestimonialStatus, string> = {
  PENDING: "En attente",
  IN_REVIEW: "En examen",
  APPROVED: "Approuvé",
  REJECTED: "Refusé",
  REPORTED: "Signalé",
  ARCHIVED: "Archivé",
};

// --- Propositions publiques (§11.2) ------------------------------------------

export const NOMINATION_STATUSES = [
  "NEW",
  "TO_REVIEW",
  "POTENTIAL_DUPLICATE",
  "TO_VERIFY",
  "ACCEPTED_FOR_CONTACT",
  "REJECTED",
  "ARCHIVED",
] as const;
export type NominationStatus = (typeof NOMINATION_STATUSES)[number];

export const NOMINATION_STATUS_LABELS: Record<NominationStatus, string> = {
  NEW: "Nouvelle",
  TO_REVIEW: "À examiner",
  POTENTIAL_DUPLICATE: "Doublon potentiel",
  TO_VERIFY: "À vérifier",
  ACCEPTED_FOR_CONTACT: "Acceptée pour contact",
  REJECTED: "Refusée",
  ARCHIVED: "Archivée",
};

// --- Demandes de droits (§15.3) ----------------------------------------------

export const RIGHTS_REQUEST_TYPES = [
  "ACCESS",
  "CORRECTION",
  "UNPUBLISH",
  "ERASE",
  "CONSENT_WITHDRAWAL",
  "REPORT_ERROR",
] as const;
export type RightsRequestType = (typeof RIGHTS_REQUEST_TYPES)[number];

export const RIGHTS_REQUEST_TYPE_LABELS: Record<RightsRequestType, string> = {
  ACCESS: "Accès aux données",
  CORRECTION: "Correction",
  UNPUBLISH: "Retrait de la publication",
  ERASE: "Effacement",
  CONSENT_WITHDRAWAL: "Retrait du consentement",
  REPORT_ERROR: "Signalement d'erreur",
};

export const RIGHTS_REQUEST_STATUSES = ["RECEIVED", "IN_PROGRESS", "DECIDED", "CLOSED"] as const;
export type RightsRequestStatus = (typeof RIGHTS_REQUEST_STATUSES)[number];

export const RIGHTS_REQUEST_STATUS_LABELS: Record<RightsRequestStatus, string> = {
  RECEIVED: "Reçue",
  IN_PROGRESS: "En cours de traitement",
  DECIDED: "Décision prise",
  CLOSED: "Clôturée",
};

// --- Médias (§7.8) -----------------------------------------------------------

export const MEDIA_KINDS = [
  "PROFILE_PHOTO",
  "ACTIVITY_PHOTO",
  "POSTER",
  "DOCUMENT",
  "OTHER",
] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const MEDIA_KIND_LABELS: Record<MediaKind, string> = {
  PROFILE_PHOTO: "Photo de profil",
  ACTIVITY_PHOTO: "Photo d'activité",
  POSTER: "Affiche",
  DOCUMENT: "Document",
  OTHER: "Autre",
};

export const MEDIA_VISIBILITY = ["PUBLIC", "PRIVATE"] as const;
export type MediaVisibility = (typeof MEDIA_VISIBILITY)[number];

export const MEDIA_VISIBILITY_LABELS: Record<MediaVisibility, string> = {
  PUBLIC: "Publique",
  PRIVATE: "Privée",
};

export const MEDIA_STATUSES = [
  "PENDING",
  "READY",
  "VALIDATED",
  "REJECTED",
  "DELETED",
] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number];

export const MEDIA_STATUS_LABELS: Record<MediaStatus, string> = {
  PENDING: "En attente de validation",
  READY: "Téléversé (à valider)",
  VALIDATED: "Validé",
  REJECTED: "Rejeté",
  DELETED: "Supprimé",
};

/** Nombre maximal de médias téléversables par dossier (§7.8 — limitation). */
export const MEDIA_MAX_PER_DOSSIER = 20;

/** Largeur maximale (px) après traitement sharp (§17.5). */
export const MEDIA_MAX_WIDTH_PX = 1600;

/** Qualité JPEG du ré-encodage sharp. */
export const MEDIA_JPEG_QUALITY = 82;

// --- Consentements (§7.2) ------------------------------------------------------

export const CONSENT_CODES = [
  "PRIVACY_POLICY",
  "ADULT_CONSENT",
  "GUARDIAN_CONSENT",
  "PUBLICATION_CONSENT",
  "IMAGE_CONSENT",
  "MINOR_GUARDIAN_CONSENT",
  "TESTIMONIAL_RULES",
] as const;
export type ConsentCode = (typeof CONSENT_CODES)[number];

export const CONSENT_CODE_LABELS: Record<ConsentCode, string> = {
  PRIVACY_POLICY: "Politique de confidentialité",
  ADULT_CONSENT: "Consentement de la personne majeure",
  GUARDIAN_CONSENT: "Consentement du représentant légal (mineure)",
  PUBLICATION_CONSENT: "Consentement à la publication du parcours",
  IMAGE_CONSENT: "Consentement à l'utilisation d'images",
  MINOR_GUARDIAN_CONSENT: "Consentement du représentant légal (personne mineure)",
  TESTIMONIAL_RULES: "Règles de publication des témoignages",
};

/**
 * Code de consentement requis selon la majorité de la participante (§14) :
 * la personne majeure consent elle-même ; pour une mineure, le consentement
 * du représentant légal est recueilli.
 */
export const CONSENT_CODE_MAJEURE: ConsentCode = "ADULT_CONSENT";
export const CONSENT_CODE_MINEURE: ConsentCode = "GUARDIAN_CONSENT";

// --- Invitations (§6) ----------------------------------------------------------

export const INVITATION_STATUSES = ["ACTIVE", "USED", "REVOKED", "EXPIRED"] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export const INVITATION_STATUS_LABELS: Record<InvitationStatus, string> = {
  ACTIVE: "Active",
  USED: "Utilisée",
  REVOKED: "Révoquée",
  EXPIRED: "Expirée",
};

export const INVITATION_CHANNELS = ["WHATSAPP", "EMAIL", "OTHER"] as const;
export type InvitationChannel = (typeof INVITATION_CHANNELS)[number];

export const INVITATION_CHANNEL_LABELS: Record<InvitationChannel, string> = {
  WHATSAPP: "WhatsApp",
  EMAIL: "E-mail",
  OTHER: "Autre canal",
};

// --- Initiatives (étape 5 du formulaire) ---------------------------------------

export const INITIATIVE_RESULT_TYPES = ["OBSERVED", "ESTIMATED", "GOAL"] as const;
export type InitiativeResultType = (typeof INITIATIVE_RESULT_TYPES)[number];

export const INITIATIVE_RESULT_TYPE_LABELS: Record<InitiativeResultType, string> = {
  OBSERVED: "Résultats observés",
  ESTIMATED: "Résultats estimés",
  GOAL: "Objectifs visés",
};

export const INITIATIVE_PROJECT_STATES = ["PLANNED", "ONGOING", "COMPLETED"] as const;
export type InitiativeProjectState = (typeof INITIATIVE_PROJECT_STATES)[number];

export const INITIATIVE_PROJECT_STATE_LABELS: Record<InitiativeProjectState, string> = {
  PLANNED: "Planifié",
  ONGOING: "En cours",
  COMPLETED: "Terminé",
};

// --- Journal d'audit (§5.6) ------------------------------------------------------

export const AUDIT_RESULTS = ["SUCCESS", "DENIED", "ERROR"] as const;
export type AuditResult = (typeof AUDIT_RESULTS)[number];

export const AUDIT_RESULT_LABELS: Record<AuditResult, string> = {
  SUCCESS: "Succès",
  DENIED: "Refusé",
  ERROR: "Erreur",
};

export const AUDIT_ACTIONS = [
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "LOGOUT",
  "DOSSIER_CREATED",
  "DOSSIER_UPDATED",
  "DOSSIER_STATUS_CHANGED",
  "DOSSIER_SUBMITTED",
  "INVITATION_CREATED",
  "INVITATION_REVOKED",
  "INVITATION_RENEWED",
  "INVITATION_ACCESSED",
  "CONSENT_RECORDED",
  "MEDIA_UPLOADED",
  "MEDIA_DELETED",
  "PROFILE_PUBLISHED",
  "PROFILE_UNPUBLISHED",
  "PROFILE_MODIFIED",
  "ROLE_CHANGED",
  "ADMIN_CREATED",
  "ADMIN_DEACTIVATED",
  "ADMIN_REACTIVATED",
  "MODERATION_DECISION",
  "RIGHTS_REQUEST_DECIDED",
  "SETTINGS_UPDATED",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  LOGIN_SUCCESS: "Connexion réussie",
  LOGIN_FAILED: "Échec de connexion",
  LOGOUT: "Déconnexion",
  DOSSIER_CREATED: "Dossier créé",
  DOSSIER_UPDATED: "Dossier modifié",
  DOSSIER_STATUS_CHANGED: "Changement de statut d'un dossier",
  DOSSIER_SUBMITTED: "Dossier soumis par la participante",
  INVITATION_CREATED: "Invitation créée",
  INVITATION_REVOKED: "Invitation révoquée",
  INVITATION_RENEWED: "Invitation renouvelée",
  INVITATION_ACCESSED: "Invitation consultée",
  CONSENT_RECORDED: "Consentement enregistré",
  MEDIA_UPLOADED: "Média téléversé",
  MEDIA_DELETED: "Média supprimé",
  PROFILE_PUBLISHED: "Profil publié",
  PROFILE_UNPUBLISHED: "Profil dépublié",
  PROFILE_MODIFIED: "Profil modifié",
  ROLE_CHANGED: "Rôle modifié",
  ADMIN_CREATED: "Administrateur créé",
  ADMIN_DEACTIVATED: "Administrateur désactivé",
  ADMIN_REACTIVATED: "Administrateur réactivé",
  MODERATION_DECISION: "Décision de modération",
  RIGHTS_REQUEST_DECIDED: "Demande de droits traitée",
  SETTINGS_UPDATED: "Paramètres mis à jour",
};

// --- Paramètres applicatifs ------------------------------------------------------

export type SettingValue = string | number | boolean;

export const DEFAULT_SETTINGS = {
  INVITATION_TTL_DAYS: 30,
  MAX_UPLOAD_MB: 2,
  RATINGS_ENABLED: false,
  TESTIMONIALS_ENABLED: true,
  MIN_VOTES_FOR_AVERAGE: 5,
  MODERATION_NOTE_MAX: 500,
} as const satisfies Readonly<Record<string, SettingValue>>;

export type SettingKey = keyof typeof DEFAULT_SETTINGS;

// --- Clés des textes de consentement / durées diverses ---------------------------

/** Durée du cache mémoire des AdminUser dans le callback jwt de NextAuth (ms). */
export const ADMIN_SESSION_CACHE_TTL_MS = 30_000;

/** Nombre de caractères maximal des métadonnées d'audit (JSON sérialisé). */
export const AUDIT_METADATA_MAX_LENGTH = 4000;

/**
 * Statuts de dossier dans lesquels le formulaire invité est OUVRABLE
 * (jeton valide côté API publique). Au-delà, le dossier est considéré
 * verrouillé pour la participante (§7.10 : après soumission, modifications
 * limitées — la réouverture après demande de clarification passera par
 * CLARIFICATION_RECEIVED en phase 4).
 */
export const DOSSIER_FORM_OPEN_STATUSES = [
  "DRAFT",
  "INVITATION_CREATED",
  "INVITATION_SENT",
  "IN_PROGRESS",
] as const satisfies readonly DossierStatus[];

/** Valeurs admises pour le champ « genre » (plateforme dédiée aux femmes et filles). */
export const GENDER_VALUES = ["FEMME", "FILLE"] as const;
export type GenderValue = (typeof GENDER_VALUES)[number];

export const GENDER_LABELS: Record<GenderValue, string> = {
  FEMME: "Femme",
  FILLE: "Fille",
};
