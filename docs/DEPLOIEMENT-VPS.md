# Déploiement VPS LWS — plateforme Dora

> Document d'exécution pour la phase 8 (déploiement). À NE PAS exécuter sans
> inspection préalable du VPS : le serveur n'a jamais été audité à ce jour.
> Chaque commande est non destructive tant que la séquence est respectée.

## 1. Prérequis à vérifier sur le VPS (avant toute installation)

```bash
free -m                      # RAM totale/disponible (cible : ≥ 1 Go libre)
df -h                        # Stockage (cible : ≥ 5 Go libres hors système)
node --version || true       # Node ≥ 20 requis (Next.js 16)
bun --version || true        # Bun (recommandé pour l'exécution)
ss -tlnp | head              # Ports occupés (3000 ou autres apps existantes ?)
systemctl list-units --type=service | head -20   # Services existants (NE RIEN arrêter)
which caddy nginx apache2 || true                # Reverse proxy existant ?
```

**Règle d'or : ne rien supprimer, ne rien réutiliser sans accord explicite du
client.** Si un reverse proxy existe déjà, il FAUT s'y adapter plutôt que
d'installer Caddy.

## 2. Arborescence cible

```
/srv/valorisation/
├── app/            # code (jetable — redeployable)
├── data/           # base SQLite (PERSISTANT — jamais écrasé par un déploiement)
├── uploads-private/ # médias privés (PERSISTANT)
└── backups/        # archives locales (PERSISTANT + rapatriement chiffré hors VPS)
```

Utilisateur applicatif dédié, sans shell interactif ni droits root :

```bash
sudo useradd --system --home-dir /srv/valorisation --shell /usr/sbin/nologin dora
sudo mkdir -p /srv/valorisation/{app,data,uploads-private,backups}
sudo chown -R dora:dora /srv/valorisation
```

## 3. Déploiement de l'application

```bash
# Sur la machine de travail : paquet standalone
bun install && bun run build   # output: "standalone" est déjà configuré
scp -r .next/standalone .next/static public package.json user@vps:/srv/valorisation/app/

# Sur le VPS : variables (jamais de secret dans Git)
sudo -u dora tee /srv/valorisation/app/.env >/dev/null <<'EOF'
DATABASE_URL="file:/srv/valorisation/data/custom.db"
NEXTAUTH_SECRET="<openssl rand -hex 32 — générer sur le VPS>"
NEXTAUTH_URL="https://VOTRE-DOMAINE"
SITE_NAME="Dora"
EOF
```

Migrations : `DATABASE_URL=... bunx prisma db push` (idempotent, non destructif).

## 4. Service systemd

```ini
# /etc/systemd/system/dora.service
[Unit]
Description=Dora — plateforme de valorisation
After=network.target

[Service]
User=dora
WorkingDirectory=/srv/valorisation/app
EnvironmentFile=/srv/valorisation/app/.env
ExecStart=/usr/local/bin/bun /srv/valorisation/app/server.js
Restart=always
RestartSec=5
MemoryMax=512M
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/srv/valorisation/data /srv/valorisation/uploads-private

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now dora
```

## 5. HTTPS

- **Si aucun proxy n'existe** : installer Caddy (certificats Let's Encrypt
  automatiques) avec un Caddyfile inversant vers `localhost:3000`.
- **Si un proxy existe** : ajouter un vhost/server block à la configuration
  existante (pas de double proxy). Ne jamais désactiver ce qui est en place.

## 6. Sauvegardes (OBLIGATOIRE au lancement)

1. Crontab de l'utilisateur applicatif :
   ```
   30 3 * * * /srv/valorisation/app/scripts/backup-db.sh /srv/valorisation/backups
   45 3 * * 0 /srv/valorisation/app/scripts/backup-uploads.sh /srv/valorisation/backups
   ```
2. Rapatriement chiffré hors du VPS (au choix du client) :
   `age -r <clé-publique> fichier | ssh backup@autre-serveur 'cat > fichier.age'`
   ou rclone chiffré vers un stockage externe.
3. **Test de restauration mensuel obligatoire** :
   `scripts/restore-db.sh <archive>` sur un environnement de contrôle, puis
   vérification `/api/health` + contenu attendu. Une restauration jamais
   répétée n'est pas fiable.

## 7. Supervision minimale

- `systemctl status dora` + `journalctl -u dora -f` (journald).
- `/api/health` (route intégrée) — à surveiller par un uptime externe.
- Alertes disque : `df` hebdomadaire (les sauvegardes locales tournent).

## 8. Premier lancement (sécurisé)

```bash
cd /srv/valorisation/app
DATABASE_URL=... ADMIN_INITIAL_EMAIL="..." ADMIN_INITIAL_NAME="..." \
  ADMIN_INITIAL_PASSWORD="..." bun scripts/create-admin.ts
bun scripts/seed-consent-texts.ts && bun scripts/seed-categories.ts
```

Aucun identifiant par défaut n'existe. L'admin crée ensuite les autres comptes
depuis l'interface (`/admin/utilisateurs`).

## 9. Checklist avant mise en ligne

- [ ] HTTPS actif (redirection 80→443)
- [ ] `.env` avec NEXTAUTH_SECRET fort, jamais committé
- [ ] `NEXTAUTH_URL` = domaine public réel
- [ ] admin créé via script (mot de passe fort), autres rôles via UI
- [ ] base + médias dans des répertoires PERSISTANTS (hors `app/`)
- [ ] cron sauvegardes actif + première restauration de contrôle réussie
- [ ] `/api/health` surveillé
- [ ] journal d'audit consultable et vérifié après les premiers usages
- [ ] test mobile réel (3G) : chargement accueil < 3 s visé, pas de débordement

## 10. Bascule PostgreSQL (évolution, pas au lancement)

Documentée dans l'audit (décision D1) : changer `provider` dans
`prisma/schema.prisma`, `DATABASE_URL`, puis tester sur une copie de la base
AVANT toute bascule réelle. SQLite WAL suffit au volume attendu du MVP.
