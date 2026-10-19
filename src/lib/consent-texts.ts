// ---------------------------------------------------------------------------
// Textes de consentement officiels (§7.2, §14) — version 1.0, français.
//
// Les textes sont versionnés en base (ConsentText, version Int) : toute
// modification substantielle devra être publiée sous une nouvelle version,
// les ConsentRecord conservant la version exacte acceptée par chaque personne.
// Le responsable du traitement est matérialisé par un champ à compléter —
// aucune donnée fictive n'est insérée (consigne projet).
// ---------------------------------------------------------------------------

import { db } from "@/lib/db";
import type { ConsentCode } from "@/lib/constants";

/** Version d'affichage des textes officiels courants. */
export const CONSENT_VERSION = "1.0";

/** Version numérique stockée en base (ConsentText.version). */
export const CONSENT_VERSION_NUMBER = 1;

const RESPONSABLE_PLACEHOLDER = "[Responsable du traitement — à compléter par le porteur du projet]";

export interface OfficialConsentText {
  code: ConsentCode;
  version: number;
  title: string;
  body: string;
}

export const OFFICIAL_CONSENT_TEXTS: OfficialConsentText[] = [
  {
    code: "ADULT_CONSENT",
    version: CONSENT_VERSION_NUMBER,
    title: "Consentement de la personne majeure — collecte et valorisation de son parcours",
    body: `Objet de la collecte
La plateforme « Dora » recueille et met en valeur le parcours des femmes engagées, afin de les rendre visibles et d'inspirer d'autres personnes. La présente fiche décrit ce que vous acceptez en poursuivant le formulaire.

Responsable du traitement
${RESPONSABLE_PLACEHOLDER}. Il détermine les finalités et les moyens du traitement de vos données.

Informations collectées
• Votre identité et votre présentation (nom public ou nom d'usage, prénom, photographie si vous la fournissez, pays, région ou ville, langues parlées) ;
• le récit de votre parcours et de votre engagement ;
• votre parcours scolaire et professionnel ;
• les initiatives que vous décrivez (titres, périodes, résultats, partenaires que vous autorisez) ;
• votre vision et vos projets ;
• les médias que vous téléversez (photographies, affiches, documents) ;
• vos coordonnées de contact (téléphone, adresse électronique), qui restent strictement privées.

Finalités
• Créer votre profil de participante et, après votre accord et la validation de l'équipe, le publier dans l'annuaire public ;
• vous informer de l'avancement de votre dossier ;
• respecter nos obligations légales et garantir la sécurité de la plateforme.

Ce qui peut être publié
Seules les informations que vous destinez au public — identité publique, présentation, parcours, initiatives, médias autorisés — peuvent être publiées, après validation administrative. Aucune donnée n'est publiée par défaut ; la publication n'a lieu qu'après votre soumission et l'accord de l'équipe.

Accès à vos données privées
Vos coordonnées et réponses non destinées au public ne sont accessibles qu'aux membres autorisés de l'équipe d'administration. Elles ne sont jamais publiées, ni cédées à des tiers.

Durées de conservation
• Dossiers non soumis : supprimés ou archivés dans un délai maximum de douze mois après la dernière activité ;
• profils publiés : conservés tant que la publication est active, puis archivés ;
• dossiers refusés ou retirés : conservés au maximum trois ans pour la traçabilité, puis supprimés ;
• pièces privées : supprimées dès qu'elles ne sont plus nécessaires.

Vos droits
Vous pouvez demander à tout moment : l'accès à vos données, leur correction, le retrait de la publication de votre profil, l'effacement de votre dossier, ou le retrait de votre consentement, en écrivant à l'adresse de contact indiquée par le responsable du traitement. Ces demandes sont traitées dans un délai raisonnable et n'affectent pas la licéité du traitement antérieur.

Services tiers
Aucun service tiers de mesure d'audience ou de publicité n'est intégré au formulaire. La plateforme peut être hébergée par un prestataire d'hébergement agissant sur instruction du responsable du traitement.

Consentement
En cochant la case de consentement, vous confirmez avoir lu la présente notice, compris ce qui sera publié et accepté la collecte de vos informations aux finalités décrites ci-dessus. Vous pouvez retirer votre consentement à tout moment par une simple demande.`,
  },
  {
    code: "GUARDIAN_CONSENT",
    version: CONSENT_VERSION_NUMBER,
    title: "Consentement du représentant légal — participation d'une fille mineure",
    body: `Objet de ce consentement
La plateforme « Dora » recueille le parcours des filles et des femmes engagées. Lorsque la participante est mineure, le consentement de son représentant légal est requis avant toute collecte, et l'accord de la mineure elle-même est recueilli selon son âge et sa compréhension.

Responsable du traitement
${RESPONSABLE_PLACEHOLDER}. Il détermine les finalités et les moyens du traitement des données.

Informations collectées concernant la mineure
• Son identité limitée au strict nécessaire (nom public ou nom d'usage, prénom, photographie si elle est fournie, pays, région ou ville de manière générale) ;
• le récit de son engagement et de son parcours scolaire, en évitant toute information de localisation précise, d'établissement scolaire ou d'habitudes quotidiennes ;
• les initiatives qu'elle décrit ;
• les médias qu'elle téléverse ;
• vos coordonnées de représentant légal, qui restent strictement privées.

Ne sont PAS collectées : adresse complète du domicile, pièce d'identité, données sensibles, coordonnées directes de la mineure publiées publiquement.

Finalités
• Créer le profil de la participante mineure et, après validation administrative, le publier dans l'annuaire public, sans messagerie directe ni classement de popularité ;
• assurer le suivi du dossier avec vous, représentant légal.

Ce qui peut être publié
Seules les informations destinées au public, validées par l'équipe, peuvent être publiées. Les photographies et documents sont examinés avant toute publication. Aucune donnée n'est publiée par défaut.

Engagement de supervision du représentant légal
En donnant votre consentement, vous reconnaissez :
• accompagner la mineure dans le remplissage du formulaire ;
• vérifier, avant chaque soumission, les informations et médias proposés à la publication ;
• pouvoir demander à tout moment la correction, le retrait de publication ou l'effacement du profil ;
• être notre interlocuteur pour toute question concernant les données de la mineure.

Accès aux données privées
Vos coordonnées et les réponses non destinées au public ne sont accessibles qu'aux membres autorisés de l'équipe d'administration. Elles ne sont jamais publiées.

Durées de conservation
• Dossiers non soumis : supprimés ou archivés dans un délai maximum de douze mois après la dernière activité ;
• profils publiés : conservés tant que la publication est active, avec possibilité de retrait simplifié à votre demande ;
• dossiers refusés ou retirés : conservés au maximum trois ans pour la traçabilité, puis supprimés.

Vos droits et ceux de la mineure
Vous pouvez demander l'accès, la correction, la limitation, le retrait de la publication ou l'effacement des données de la mineure, ainsi que le retrait de votre consentement, en écrivant à l'adresse de contact indiquée par le responsable du traitement. Le retrait simplifié est garanti pour les profils de mineures.

Services tiers
Aucun service tiers de mesure d'audience ou de publicité n'est intégré au formulaire.

Consentement
En cochant la case de consentement, vous confirmez agir en qualité de représentant légal de la mineure, avoir lu la présente notice, compris ce qui peut être publié et accepté la collecte des informations décrites, sous votre supervision.`,
  },
];

/**
 * Version active d'un texte de consentement (version la plus élevée, active).
 * Retourne null si le texte n'a pas été semé — l'API doit le traiter comme
 * une erreur de configuration, sans jamais exposer de texte vide.
 */
export async function getActiveConsentText(code: ConsentCode) {
  return db.consentText.findFirst({
    where: { code, isActive: true },
    orderBy: { version: "desc" },
    select: { id: true, code: true, version: true, title: true, body: true },
  });
}
