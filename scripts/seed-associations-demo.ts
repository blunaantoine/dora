// ---------------------------------------------------------------------------
// Données de DÉMONSTRATION pour l'annuaire des associations et ONG
// (/associations). Idempotent : peut être rejoué sans dupliquer.
//
//   bun scripts/seed-associations-demo.ts
//
// Les organisations ci-dessous sont FICTIVES mais réalistes : elles montrent
// les deux états de l'adhésion (ouverte / fermée) et la diversité des domaines.
// Remplacez-les par les organisations réelles via l'espace équipe
// (/admin/associations) puis désactivez celles de démonstration.
// ---------------------------------------------------------------------------

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`]/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface DemoOrg {
  name: string;
  acronym?: string;
  mission: string;
  domains: string[];
  city: string;
  region: string;
  website?: string;
  email?: string;
  phone?: string;
  membershipOpen: boolean;
  membershipInfo?: string;
}

const DEMO_ORGS: DemoOrg[] = [
  {
    name: "Cercle d'Appui aux Initiatives Féminines de Sokodé",
    acronym: "CAIFS",
    mission:
      "Accompagne les groupements de femmes de la région Centrale : alphabétisation fonctionnelle, épargne et crédit solidaire, plaidoyer pour la scolarisation des filles.",
    domains: ["education-et-formation", "droits-des-femmes-et-des-filles"],
    city: "Sokodé",
    region: "Centrale",
    membershipOpen: true,
    membershipInfo:
      "Adhésion ouverte à toute personne majeure. Cotisation annuelle de 2 000 FCFA. Se présenter au siège le mercredi ou écrire à l'adresse e-mail avec une courte présentation — le bureau répond sous une semaine.",
    email: "contact@caifs-demo.org",
    phone: "+228 90 00 00 01",
  },
  {
    name: "Jeunesse Verte du Golfe",
    mission:
      "Sensibilisation des écoles et des quartiers de Lomé au tri des déchets, reboisement urbain et opérations « carnet vert » dans les collèges.",
    domains: ["environnement-et-climat", "education-et-formation"],
    city: "Lomé",
    region: "Maritime",
    membershipOpen: true,
    membershipInfo:
      "Rejoignez un samedi d'action : inscrivez-vous par e-mail, participation libre à partir de 15 ans. Les bénévoles réguliers reçoivent une formation de mobilisateur.",
    email: "bonjour@jeunesseverte-demo.org",
  },
  {
    name: "Regroupement des Productrices de la Kara",
    mission:
      "Mutualisation de la production maraîchère et de la transformation (soja, gari) autour de Kara ; formation aux techniques compost et accès aux marchés.",
    domains: ["agriculture-et-developpement-local", "entrepreneuriat-et-innovation"],
    city: "Kara",
    region: "Kara",
    membershipOpen: false,
    membershipInfo:
      "Le regroupement n'accepte pas de nouvelles adhésions cette saison : la capacité de transformation est saturée. Les demandes peuvent être déposées en fin de campagne — contacter la coordination en octobre.",
    email: "coordination@rpk-demo.org",
  },
  {
    name: "Éclats de Culture",
    mission:
      "Troupe et ateliers de théâtre-forum sur les droits des filles, animations culturelles dans les lycées et festivals scolaires de la région des Plateaux.",
    domains: ["culture-et-arts", "droits-des-femmes-et-des-filles", "education-et-formation"],
    city: "Atakpamé",
    region: "Plateaux",
    membershipOpen: true,
    membershipInfo:
      "Ateliers ouverts le samedi après-midi (théâtre, slam, conte). Venir assister à une répétition puis exprimer son envie de rejoindre — aucune expérience requise.",
    phone: "+228 91 00 00 04",
  },
  {
    name: "Relais Santé Communautaire de Dapaong",
    acronym: "RSC",
    mission:
      "Agents de santé communautaire bénévoles : prévention du paludisme, suivi des grossesses, causeries éducatives dans les villages de la Tône.",
    domains: ["sante-et-bien-etre", "action-sociale-et-humanitaire"],
    city: "Dapaong",
    region: "Savanes",
    membershipOpen: false,
    membershipInfo:
      "Le relais recrute uniquement des professionnels ou étudiants en santé (infirmiers, sages-femmes, médecins) lors de campagnes précises. Les volontaires hors santé peuvent être orientés vers des actions ponctuelles.",
    email: "relais@rsc-demo.org",
  },
  {
    name: "Club Robotique Togo",
    mission:
      "Initiation à la programmation et à la robotique des collégiennes et lycéens, participation aux concours régionaux de sciences et mentorat entre pairs.",
    domains: ["sciences-et-technologies", "education-et-formation"],
    city: "Lomé",
    region: "Maritime",
    membershipOpen: true,
    membershipInfo:
      "Inscriptions en début de trimestre via le site ou l'e-mail. Groupes de 15 jeunes encadrés par des étudiants en génie ; matériel fourni sur place.",
    website: "https://robotique-togo-demo.org",
    email: "inscriptions@clubrobotique-demo.org",
  },
  {
    name: "Main Tendue pour l'Enfance de la Région des Lacs",
    mission:
      "Soutien scolaire et kits pédagogiques pour les enfants des villages lacustres, cellules d'écoute et accompagnement des familles.",
    domains: ["action-sociale-et-humanitaire", "education-et-formation"],
    city: "Vogan",
    region: "Maritime",
    membershipOpen: true,
    membershipInfo:
      "Bénévolat ouvert : répétiteurs du soir, logistique des distributions, sensibilisation. Réunion d'accueil le premier dimanche du mois au bureau de Vogan.",
    phone: "+228 93 00 00 08",
  },
  {
    name: "Forum des Leaders de Demain",
    acronym: "FLD",
    mission:
      "Formation au leadership citoyen et à la prise de parole des jeunes (16-30 ans), simulations de débat parlementaire et projets d'intérêt collectif.",
    domains: ["leadership-et-citoyennete", "education-et-formation"],
    city: "Lomé",
    region: "Maritime",
    membershipOpen: false,
    membershipInfo:
      "Le forum fonctionne par cohorte annuelle : les candidatures de la cohorte 2026 sont closes. La prochaine session ouvrira en janvier — surveiller le site et la page publique.",
    website: "https://fld-demo.org",
  },
  {
    name: "Coopérative Agroécologique d'Anié",
    mission:
      "Promotion de l'agroécologie paysanne, semences locales et défense des terres communautaires dans le prefecture d'Anié.",
    domains: ["agriculture-et-developpement-local", "environnement-et-climat"],
    city: "Anié",
    region: "Plateaux",
    membershipOpen: true,
    membershipInfo:
      "Ouverte aux producteurs et productrices de la zone. Lettre de motivation simple + visite de la parcelle avec un membre parrain ; validation en assemblée mensuelle.",
    email: "coop@anie-demo.org",
  },
  {
    name: "Élan Sportif des Filles de Tsévié",
    mission:
      "Sections football et athlisme féminines, tournois interquartiers et accompagnement à la double carrière sport-études.",
    domains: ["sport", "droits-des-femmes-et-des-filles"],
    city: "Tsévié",
    region: "Maritime",
    membershipOpen: true,
    membershipInfo:
      "Entraînements ouverts les mardis et jeudis en fin d'après-midi au stade municipal ; encadrement bénévole, licence subventionnée pour les licenciées de moins de 18 ans.",
    phone: "+228 92 00 00 10",
  },
];

async function main() {
  console.log("Seed associations de démonstration…");
  for (const [index, org] of DEMO_ORGS.entries()) {
    const domains = await db.category.findMany({
      where: { slug: { in: org.domains } },
      select: { id: true },
    });
    if (domains.length === 0) {
      console.warn(`  ⚠ ${org.name} : aucune catégorie trouvée (${org.domains.join(", ")}) — ignorée.`);
      continue;
    }
    const data = {
      name: org.name,
      acronym: org.acronym ?? null,
      slug: slugify(org.name),
      mission: org.mission,
      city: org.city,
      region: org.region,
      website: org.website ?? null,
      email: org.email ?? null,
      phone: org.phone ?? null,
      membershipOpen: org.membershipOpen,
      membershipInfo: org.membershipInfo ?? null,
      isActive: true,
      sortOrder: index + 1,
    };
    await db.partnerOrganization.upsert({
      where: { name: org.name },
      update: { ...data, domains: { set: domains.map((d) => ({ id: d.id })) } },
      create: { ...data, domains: { connect: domains.map((d) => ({ id: d.id })) } },
    });
    console.log(
      `  ✓ ${org.name} (${org.membershipOpen ? "adhésion ouverte" : "adhésion fermée"}, ${domains.length} domaine(s))`,
    );
  }
  const total = await db.partnerOrganization.count();
  console.log(`Terminé — ${total} organisation(s) active(s) en base.`);
}

main()
  .catch((error) => {
    console.error("Erreur de seed :", error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
