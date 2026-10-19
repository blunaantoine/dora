// ---------------------------------------------------------------------------
// Seme les textes de consentement officiels v1.0 (ADULT_CONSENT,
// GUARDIAN_CONSENT) dans la table ConsentText — upsert idempotent.
//
// N'insère AUCUNE donnée fictive : uniquement les textes officiels.
// Exécution unique : bun scripts/seed-consent-texts.ts
// (ou via package.json : bun run consent:seed).
// ---------------------------------------------------------------------------

import { db } from "../src/lib/db";
import { OFFICIAL_CONSENT_TEXTS } from "../src/lib/consent-texts";

async function main(): Promise<void> {
  for (const text of OFFICIAL_CONSENT_TEXTS) {
    const existing = await db.consentText.findUnique({
      where: { code_version: { code: text.code, version: text.version } },
      select: { id: true, isActive: true, title: true },
    });

    if (existing) {
      if (existing.title !== text.title) {
        await db.consentText.update({
          where: { id: existing.id },
          data: { title: text.title, body: text.body, isActive: true },
        });
        console.log(`✓ ConsentText « ${text.code} » v${text.version} : texte mis à jour.`);
      } else if (!existing.isActive) {
        await db.consentText.update({
          where: { id: existing.id },
          data: { isActive: true },
        });
        console.log(`✓ ConsentText « ${text.code} » v${text.version} : réactivé.`);
      } else {
        console.log(`= ConsentText « ${text.code} » v${text.version} : déjà en place, inchangé.`);
      }
      continue;
    }

    await db.consentText.create({
      data: {
        code: text.code,
        version: text.version,
        title: text.title,
        body: text.body,
        isActive: true,
      },
    });
    console.log(`✓ ConsentText « ${text.code} » v${text.version} : créé.`);
  }
}

main()
  .then(() => {
    console.log("Semis des textes de consentement terminé.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Échec du semis des textes de consentement :", error);
    process.exit(1);
  });
