// ---------------------------------------------------------------------------
// Données de DÉMONSTRATION pour la maquette « Top 5 des parcours » (demande
// client : visualiser la maquette à l'identique). Crée 5 parcours publiés
// (2 hommes inclus, conformément à la décision d'ouverture du genre) et les
// place aux rangs 1..5 du Top 5.
//
// Caractéristiques :
//   - IDEMPOTENT : rejouable sans doublons (les entrées démo précédentes sont
//     supprimées puis recréées — slugs préfixés demo-) ;
//   - AUCUNE photo jointe : les cartes affichent l'emplacement photo vide
//     (initiale), exactement comme la maquette ;
//   - contenu textuel réaliste mais générique, aisément supprimable depuis
//     l'espace équipe ;
//   - exécution : bun scripts/seed-top5-demo.ts
// ---------------------------------------------------------------------------

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const CATEGORIES = [
  { slug: "education", name: "Éducation", description: "Accès à l'école, soutien scolaire, alphabétisation.", sortOrder: 1 },
  { slug: "environnement", name: "Environnement", description: "Reboisement, propreté, protection du vivant.", sortOrder: 2 },
  { slug: "solidarite-sociale", name: "Solidarité sociale", description: "Aide aux personnes vulnérables du quartier ou du village.", sortOrder: 3 },
  { slug: "humanitaire", name: "Humanitaire", description: "Secours, dons, actions d'urgence et d'accompagnement.", sortOrder: 4 },
  { slug: "citoyennete", name: "Citoyenneté", description: "Éducation aux droits, participation et vie démocratique locale.", sortOrder: 5 },
] as const;

const DEMO_PEOPLE = [
  {
    slug: "demo-afi-adjavi",
    publicName: "Afi Adjavi",
    gender: "FEMME",
    birthYear: 1996,
    city: "Kpalimé",
    categorySlug: "education",
    presentation: "Donne des cours de rattrapage le week-end et anime une petite bibliothèque de quartier pour les filles déscolarisées de Kpalimé.",
    biography: "Institutrice, Afi Adjavi a ouvert en 2021 une bibliothèque de quartier prêtant des manuels récupérés et réparés. Chaque samedi, elle réunit les filles déscolarisées pour des cours de rattrapage en lecture et en calcul.\n\nSon action s'appuie sur un réseau de bénévoles formés sur place et sur la mise à disposition gracieuse d'une salle par un comité de quartier.",
    story: "Tout est parti d'une élève qui revenait après deux ans d'absence et n'osait plus lire à voix haute. Afi a d'abord donné des cours chez elle, avant que le groupe ne devienne trop grand.",
    motivation: "Rendre à sa communauté ce qu'elle a reçu : la scolarisation de ses propres sœurs aînées.",
    lessons: "La régularité compte plus que les moyens : deux heures chaque samedi valent mieux qu'une grande action ponctuelle.",
  },
  {
    slug: "demo-kossi-mensah",
    publicName: "Kossi Mensah",
    gender: "HOMME",
    birthYear: 1991,
    city: "Sokodé",
    categorySlug: "environnement",
    presentation: "Organise le reboisement des cours d'écoles de Sokodé et sensibilise les élèves à la gestion des déchets.",
    biography: "Technicien agricole, Kossi Mensah coordonne depuis 2020 un programme de reboisement scolaire : plus d'une dizaine d'établissements plantent et arrosent des arbres d'ombre avec leurs élèves.\n\nIl accompagne les clubs verts des écoles et met en place des points de tri simples fabriqués avec des matériaux locaux.",
    story: "La cour de son ancienne école, devenue invivable en saison chaude, lui a donné l'idée de planter des arbres avec les élèves.",
    motivation: "Laisser aux enfants des cours ombragées et un environnement plus propre que celui qu'il a connu.",
    lessons: "Un arbre planté par un élève est entretenu : l'appropriation locale est la clé de la pérennité.",
  },
  {
    slug: "demo-sika-dogbe",
    publicName: "Sika Dogbe",
    gender: "FEMME",
    birthYear: 1988,
    city: "Lomé",
    categorySlug: "solidarite-sociale",
    presentation: "Fait tourner une cantine solidaire de quartier et accompagne les femmes victimes de violences vers les services d'aide.",
    biography: "Couturière de métier, Sika Dogbe organise avec un groupe de voisines une cantine solidaire trois soirs par semaine, alimentée par les invendus du marché voisin et des dons de commerçants.\n\nElle est aussi une personne-relé connue des services sociaux du quartier pour orienter discrètement les femmes victimes de violences.",
    story: "Après avoir hébergé une voisine chassée de chez elle, elle a compris combien l'absence d'adresse sûre aggrave les situations.",
    motivation: "Personne ne devrait dormir dehors ni se taire faute de quelqu'un à qui parler.",
    lessons: "Écouter sans juger ouvre plus de portes que donner sans demander.",
  },
  {
    slug: "demo-yao-kpodar",
    publicName: "Yao Kpodar",
    gender: "HOMME",
    birthYear: 1994,
    city: "Atakpamé",
    categorySlug: "humanitaire",
    presentation: "Réunit des dons de fournitures scolaires et développe un potager solidaire au profit d'enfants confiés à des familles d'accueil.",
    biography: "Chauffeur-livreur, Yao Kpodar collecte tout au long de l'année des fournitures scolaires auprès des clients qu'il rencontre pour les redistribuer avant la rentrée aux enfants confiés à des familles d'accueil d'Atakpamé.\n\nIl a également lancé un potager solidaire dont les récoltes complètent les repas d'un foyer d'accueil.",
    story: "Un cartable abandonné sur un marché lui a fait imaginer que beaucoup de familles avaient des fournitures en double à donner.",
    motivation: "Que la rentrée ne soit pas une saison d'angoisse pour les enfants sans parents.",
    lessons: "De petites contributions régulières finissent par égaler de grosses campagnes.",
  },
  {
    slug: "demo-abra-tetteh",
    publicName: "Abra Tetteh",
    gender: "FEMME",
    birthYear: 1999,
    city: "Tsévié",
    categorySlug: "citoyennete",
    presentation: "Anime des clubs citoyens dans les collèges de Tsévié : éducation aux droits, débat, mini-parlements d'élèves.",
    biography: "Diplômée en droit, Abra Tetteh anime bénévolement des clubs citoyens dans trois collèges de Tsévié. Les élèves y apprennent leurs droits, débattent de sujets concrets et élisent un mini-parlement qui porte leurs propositions auprès de la direction.\n\nLe dispositif a été repris par d'autres établissements de la préfecture.",
    story: "Interrogée sur ses droits lors d'une visite scolaire, aucun élève n'a su répondre : elle a décidé d'y revenir en animatrice.",
    motivation: "Des citoyens qui connaissent leurs droits grandissent plus confiants et plus engagés.",
    lessons: "Les adolescents prennent au sérieux ce qu'on leur confie sérieusement.",
  },
] as const;

const APPROVED_FIELDS = [
  "shortPresentation",
  "country",
  "city",
  "biography",
  "storyJourney",
  "engagementMotivation",
  "lessonsLearned",
];

async function main() {
  console.log("— Nettoyage des anciennes données de démonstration…");
  const old = await db.profilePublication.findMany({
    where: { slug: { startsWith: "demo-" } },
    select: { id: true, personId: true },
  });
  for (const publication of old) {
    // Cascade sur médias/consentements : rien d'autre n'est joint aux entrées démo.
    await db.personRecord.delete({ where: { id: publication.personId } });
  }
  console.log(`  ${old.length} entrée(s) démo supprimée(s).`);

  console.log("— Catégories…");
  const categoryBySlug = new Map<string, string>();
  for (const category of CATEGORIES) {
    const row = await db.category.upsert({
      where: { slug: category.slug },
      create: { slug: category.slug, name: category.name, description: category.description, sortOrder: category.sortOrder, isActive: true },
      update: { name: category.name, isActive: true },
      select: { id: true },
    });
    categoryBySlug.set(category.slug, row.id);
  }
  console.log(`  ${CATEGORIES.length} catégories prêtes.`);

  console.log("— Création des 5 parcours de démonstration…");
  const country = "Togo";
  for (const [index, person] of DEMO_PEOPLE.entries()) {
    const record = await db.personRecord.create({
      data: {
        status: "PUBLISHED",
        managementName: `Démonstration — ${person.publicName}`,
        publicName: person.publicName,
        gender: person.gender,
        birthYear: person.birthYear,
        isMinor: false,
        country,
        city: person.city,
        categoryId: categoryBySlug.get(person.categorySlug) ?? null,
        shortPresentation: person.presentation,
        biography: person.biography,
        storyJourney: person.story,
        engagementMotivation: person.motivation,
        lessonsLearned: person.lessons,
        submittedAt: new Date(),
      },
    });
    await db.profilePublication.create({
      data: {
        personId: record.id,
        slug: person.slug,
        state: "PUBLISHED",
        approvedFields: JSON.stringify(APPROVED_FIELDS),
        featured: true,
        featuredRank: index + 1,
        publishedAt: new Date(),
      },
    });
    console.log(`  rang ${index + 1} — ${person.publicName} (${person.categorySlug})`);
  }

  const total = await db.profilePublication.count({ where: { featuredRank: { not: null } } });
  console.log(`— Terminé : ${total} parcours dans le Top 5.`);
}

main()
  .catch((error) => {
    console.error("Échec du seed de démonstration :", error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
