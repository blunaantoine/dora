// ---------------------------------------------------------------------------
// Création du premier administrateur (§5.1 : « procédure de configuration
// sécurisée, sans identifiants par défaut »).
//
// Usage :
//   ADMIN_INITIAL_EMAIL="..." ADMIN_INITIAL_NAME="..." ADMIN_INITIAL_PASSWORD="..." bun scripts/create-admin.ts
//   (ou `bun run admin:create` avec les variables d'environnement définies)
//
// Le script n'est JAMAIS exécuté automatiquement et ne crée rien sans les
// trois variables requises. Aucun identifiant par défaut n'est fourni.
// ---------------------------------------------------------------------------

import { PrismaClient } from "@prisma/client";
import { hashPassword, validatePasswordStrength } from "../src/lib/auth-password";

const prisma = new PrismaClient();

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const email = process.env.ADMIN_INITIAL_EMAIL?.trim().toLowerCase() ?? "";
  const displayName = process.env.ADMIN_INITIAL_NAME?.trim() ?? "";
  const password = process.env.ADMIN_INITIAL_PASSWORD ?? "";

  if (!email) {
    fail("Variable ADMIN_INITIAL_EMAIL manquante. Exemple : ADMIN_INITIAL_EMAIL=\"admin@exemple.org\"");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fail("ADMIN_INITIAL_EMAIL ne semble pas être une adresse e-mail valide.");
  }
  if (!displayName) {
    fail("Variable ADMIN_INITIAL_NAME manquante. Exemple : ADMIN_INITIAL_NAME=\"Prénom Nom\"");
  }
  if (!password) {
    fail("Variable ADMIN_INITIAL_PASSWORD manquante. Aucun identifiant par défaut n'est fourni.");
  }

  const strength = validatePasswordStrength(password);
  if (!strength.ok) {
    console.error("✗ Mot de passe refusé (politique : 12 caractères minimum, au moins une lettre et un chiffre) :");
    for (const error of strength.errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  const existing = await prisma.adminUser.findUnique({ where: { email } });

  if (existing && existing.isActive) {
    fail(
      `Un administrateur actif existe déjà avec l'adresse « ${email} ».\n` +
        "  Pour des raisons de sécurité, ce script ne réinitialise pas un compte actif.\n" +
        "  Utilisez la gestion des administrateurs de la plateforme (réinitialisation d'accès).",
    );
  }

  const passwordHash = await hashPassword(password);

  const admin = await prisma.adminUser.upsert({
    where: { email },
    create: {
      email,
      displayName,
      passwordHash,
      role: "ADMIN",
      isActive: true,
    },
    update: {
      displayName,
      passwordHash,
      role: "ADMIN",
      isActive: true,
      tokenVersion: { increment: 1 }, // révoque les éventuelles anciennes sessions
    },
    select: { id: true, email: true, displayName: true, role: true, isActive: true },
  });

  console.log("✓ Administrateur configuré avec succès :");
  console.log(`  - identifiant  : ${admin.id}`);
  console.log(`  - nom affiché  : ${admin.displayName}`);
  console.log(`  - e-mail       : ${admin.email}`);
  console.log(`  - rôle         : ${admin.role}`);
  console.log("  Ce compte est actif. Vous pouvez maintenant vous connecter sur /admin/connexion.");
}

main()
  .catch((error: unknown) => {
    console.error("✗ Échec de la création de l'administrateur :", error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
