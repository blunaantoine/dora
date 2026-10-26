# Dora

**Dora = Distinguer, Oser, Reconnaître, Agir.**

Plateforme web de valorisation des femmes et des filles engagées dans des actions sociales, éducatives, humanitaires, environnementales et citoyennes (cadre : loi n° 2019-014 portant IPDCP au Togo). Les parcours des hommes engagés y sont également accueillis.

## Présentation

Dora permet de :

- **Repérer et documenter** les parcours par une invitation sécurisée et un formulaire structuré en 9 étapes (consentement versionné, initiatives, vision, médias).
- **Examiner et publier** chaque dossier avec un circuit de clarification, une publication vérifiée et révocable, et un journal d'audit de toutes les actions sensibles.
- **Valoriser publiquement** les parcours publiés : annuaire filtrable (recherche sans JavaScript, adaptée aux connexions 3G), fiches individuelles optimisées SEO/réseaux sociaux.
- **Recevoir la communauté** : témoignages modérés, propositions publiques de nouvelles personnes (avec détection de doublons), badges manuels justifiés.
- **Garantir les droits des personnes** : demande d'accès, de correction, de dépublication, d'effacement ou de retrait de consentement, avec dépublication immédiate sur les cas concernés.
- **Opérer sereinement** : sauvegardes chiffrables, procédure de restauration testée, sonde de santé `/api/health`, documentation de déploiement VPS.

## Confidentialité par défaut

- Consentement libre, spécifique, éclairé et **révocable** (version des textes enregistrée).
- **Protection renforcée des mineures** : données de localisation jamais publiées, biographie limitée, bandeau « Profil protégé ».
- Téléversements privés stockés hors dossier public, servis uniquement selon la visibilité choisie et l'état de publication (vérification par magic bytes, suppression EXIF, ré-encodage).
- Jetons d'invitation : 32 octets aléatoires (CSPRNG), **seul le hachage SHA-256 est stocké**, révocation immédiate avant tout renouvellement.
- Aucune donnée privée dans les métadonnées publiques, le JSON-LD ou les tags Open Graph.
- Journal d'audit sans secrets pour toutes les actions sensibles.

## Stack technique

| Domaine | Choix |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript 5 |
| Interface | Tailwind CSS 4, shadcn/ui (New York), Lucide Icons |
| Base de données | SQLite via Prisma ORM (WAL), migrable vers PostgreSQL |
| Authentification | next-auth v4 (sessions, rôles et permissions fines) |
| Images | sharp (ré-encodage, nettoyage EXIF) |
| Validation | Zod strict côté serveur |

## Démarrage local

```bash
bun install
bun run db:push          # crée/met à jour le schéma SQLite
bun run seed:categories  # 12 catégories officielles
bun run seed:consents    # textes de consentement v1.0
bun run admin:create     # crée un administrateur local
bun run dev              # http://localhost:3000
```

Variables d'environnement (voir `.env.example`) : `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `SITE_NAME`, `CONTACT_EMAIL`.

> ⚠️ Les identifiants administrateur créés localement sont **réservés au développement**. En production, créez un compte dédié et supprimez tout compte de démonstration avant la mise en ligne.

## Scripts d'exploitation

```bash
scripts/backup-db.sh        # sauvegarde SQLite (API .backup WAL, gzip, SHA-256, rotation 14 j)
scripts/backup-uploads.sh   # sauvegarde des téléversements (tar.gz, SHA-256, rotation 30 j)
scripts/restore-db.sh       # restauration vérifiée (empreinte, integrity_check, sauvegarde préalable)
```

Tests de restauration recommandés : une fois par mois (voir `docs/DEPLOIEMENT-VPS.md`).

## Documentation

- `docs/DEPLOIEMENT-VPS.md` — déploiement sur VPS (systemd durci, HTTPS, crons de sauvegarde, supervision, bascule PostgreSQL).
- Journal d'exploitation détaillé par phase : `worklog.md`.

## Statut

MVP fonctionnel couvrant les 21 fonctions obligatoires du cahier des charges (vérifiées de bout en bout). Fonctionnalités explicitement reportées : classement public, notation publique, badges automatiques, application mobile native, messagerie, notifications.
