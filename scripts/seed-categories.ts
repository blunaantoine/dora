// ---------------------------------------------------------------------------
// Sème les 12 catégories d'engagement officielles (§4.3) dans la table
// Category — upsert idempotent, toutes actives, dans l'ordre du cahier des
// charges (sortOrder 1 → 12).
//
// N'insère AUCUNE donnée fictive : uniquement les catégories officielles.
// Exécution : bun scripts/seed-categories.ts
// ---------------------------------------------------------------------------

import { db } from "../src/lib/db";
import { slugify } from "../src/lib/slug";

/** Catégories officielles §4.3, dans l'ordre du cahier des charges. */
const OFFICIAL_CATEGORIES: ReadonlyArray<{ name: string; description: string }> = [
  {
    name: "Éducation et formation",
    description: "Scolarisation, alphabétisation, formation professionnelle et transmission des savoirs.",
  },
  {
    name: "Santé et bien-être",
    description: "Accès aux soins, santé maternelle, hygiène, nutrition et santé mentale.",
  },
  {
    name: "Droits des femmes et des filles",
    description: "Égalité, lutte contre les violences, autonomisation et défense des droits.",
  },
  {
    name: "Environnement et climat",
    description: "Protection de la nature, lutte contre le changement climatique et gestion des déchets.",
  },
  {
    name: "Entrepreneuriat et innovation",
    description: "Création d'activités, innovation sociale, insertion économique et finance inclusive.",
  },
  {
    name: "Action sociale et humanitaire",
    description: "Solidarité de proximité, aide d'urgence et accompagnement des personnes vulnérables.",
  },
  {
    name: "Culture et arts",
    description: "Patrimoine, création artistique, préservation des langues et des traditions.",
  },
  {
    name: "Leadership et citoyenneté",
    description: "Engagement associatif, participation citoyenne, paix et bonne gouvernance.",
  },
  {
    name: "Sciences et technologies",
    description: "Numérique, sciences, ingénierie et accès des filles aux métiers techniques.",
  },
  {
    name: "Agriculture et développement local",
    description: "Agriculture durable, élevage, transformation locale et développement des territoires.",
  },
  {
    name: "Sport",
    description: "Pratique et encouragement du sport, inclusion par le sport et compétition.",
  },
  {
    name: "Autres domaines",
    description: "Engagements qui ne relèvent d'aucune catégorie ci-dessus.",
  },
];

async function main(): Promise<void> {
  for (let index = 0; index < OFFICIAL_CATEGORIES.length; index += 1) {
    const official = OFFICIAL_CATEGORIES[index]!;
    const slug = slugify(official.name);
    if (!slug) {
      throw new Error(`Slug vide pour la catégorie « ${official.name} ».`);
    }

    const existing = await db.category.findUnique({ where: { slug }, select: { id: true, name: true, isActive: true } });

    if (existing) {
      if (existing.name !== official.name || !existing.isActive) {
        await db.category.update({
          where: { id: existing.id },
          data: { name: official.name, description: official.description, isActive: true, sortOrder: index + 1 },
        });
        console.log(`✓ Catégorie « ${official.name} » : mise à jour (nom, description, active, ordre ${index + 1}).`);
      } else {
        await db.category.update({
          where: { id: existing.id },
          data: { description: official.description, sortOrder: index + 1 },
        });
        console.log(`= Catégorie « ${official.name} » : déjà en place, description et ordre resynchronisés.`);
      }
      continue;
    }

    await db.category.create({
      data: {
        name: official.name,
        slug,
        description: official.description,
        isActive: true,
        sortOrder: index + 1,
      },
    });
    console.log(`✓ Catégorie « ${official.name} » : créée (ordre ${index + 1}).`);
  }

  const total = await db.category.count();
  console.log(`— Terminé : ${total} catégorie(s) en base (attendu : ${OFFICIAL_CATEGORIES.length}).`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Échec du seed des catégories :", error);
    process.exit(1);
  });
