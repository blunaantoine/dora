# Worklog — Plateforme de valorisation des femmes et des filles engagées

Référentiel du projet : cahier des charges v1.0 (upload/Pasted Content_1792340186799.txt, 1719 lignes, 30 sections).
Audit préparatoire réalisé (rapport remis au client) : exigences extraites, risques identifiés, architecture validée de principe.

Décisions appliquées (recommandations de l'audit, faute de contre-ordre) :
- D1 : Prisma + SQLite WAL (bascule PostgreSQL possible au déploiement, documentée).
- D2 : Notes (Rating) — schéma prêt, fonctionnalité DÉSACTIVÉE au lancement (§10/§24).
- D3/D4 : statut dossier (machine à états) ≠ état de publication (ProfilePublication) ≠ demandes de droits (RightsRequest) ; suppression dure réservée à l'effacement.
- D5 : anti-spam sans service tiers (honeypot + rate limiting).
- D6 : typescript.ignoreBuildErrors mis à false exigé en phase 2.
- D8 : `.env` retiré du suivi Git (commit 6481021, fichier conservé sur disque).
- D10 : sessions révocables via NextAuth v4 JWT + tokenVersion vérifié en base à chaque requête admin.
- D12 : nom de plateforme = placeholder configuré via env (SITE_NAME), aucune donnée fictive.

Palette (§16.1) : vert profond #173D32, ivoire #F8F5EF, or doux #D6B15E, anthracite #202522.
Langue UI : français. Mobile-first. Pas de boutons sans action réelle. Pas de fausses données.

Contraintes techniques : Next.js 16 App Router, TypeScript strict, API Routes (jamais de server actions), Prisma/SQLite (pas d'enums Prisma, pas de listes — JSON en String), zod, pas de code de test automatisé, vérification par navigateur réel en fin de phase.

---

Task ID: 1
Agent: Z.ai (orchestrateur)
Task: Audit préparatoire + validation du plan + mise en conformité Git

Work Log:
- Lecture intégrale du cahier des charges (1719 lignes).
- Examen du dépôt en lecture seule (package.json, schema.prisma, next.config.ts, Caddyfile, app/, lib/, git).
- Rapport d'audit livré (exigences EF/ET/ES/EQ, contradictions C1-C10, décisions D1-D12, risques, plan 8 phases).
- git rm --cached .env + commit (fichier conservé sur disque).

Stage Summary:
- Phase 1 terminée. Phase 2 (socle technique) démarrée. VPS LWS toujours non inspecté (client doit fournir les relevés avant phase 8).
---

Task ID: 2-a
Agent: full-stack-developer
Task: Socle données & sécurité (schéma, libs métier, auth, middleware, scripts)

Work Log:
- prisma/schema.prisma réécrit : 19 modèles SQLite (AdminUser, PersonRecord, PersonPrivateData, Invitation, Initiative, Category, ProfilePublication, MediaAsset, ConsentText, ConsentRecord, Testimonial, Rating, Nomination, Badge, BadgeAssignment, AuditLog, RightsRequest, ClarificationRequest, Setting). Aucun enum, aucun tableau (JSON en String), dates optionnelles en DateTime?. PersonRecord.photoAssetId → MediaAsset via relation nommée "principalPhoto" (onDelete SetNull, FK optionnelle). Category→PersonRecord en onDelete SetNull : une catégorie supprimée/désactivée n'efface ni ne masque les personnes (le filtrage public se fait côté requête annuaire). Rating conservé (décision D2, désactivé). `bun run db:push` : succès (client généré, 19 tables vérifiées en lecture seule, base vide — aucune donnée fictive).
- src/lib/db.ts : log: ['query'] → log: ['error'] (pattern singleton conservé).
- src/lib/constants.ts : ROLES, DOSSIER_STATUSES (14 statuts §5.4 + libellés FR + classes badge Tailwind suggérées), DOSSIER_TRANSITIONS (Map) + canTransition() + isPublished(), TESTIMONIAL_STATUSES, NOMINATION_STATUSES, RIGHTS_REQUEST_TYPES + RIGHTS_REQUEST_STATUSES, MEDIA_KINDS/VISIBILITY/STATUSES, CONSENT_CODES, INVITATION_STATUSES/CHANNELS, INITIATIVE_RESULT_TYPES/PROJECT_STATES, AUDIT_ACTIONS/AUDIT_RESULTS (16 actions + libellés FR), DEFAULT_SETTINGS (INVITATION_TTL_DAYS=30, MAX_UPLOAD_MB=2, RATINGS_ENABLED=false, TESTIMONIALS_ENABLED=true, MIN_VOTES_FOR_AVERAGE=5, MODERATION_NOTE_MAX=500).
- src/lib/permissions.ts : PERMISSIONS (14 actions), PERMISSIONS_BY_ROLE (ADMIN=tout ; MODERATOR=MODERATE_TESTIMONIALS, MANAGE_NOMINATIONS, VIEW_STATS ; EDITOR=MANAGE_CATEGORIES, VIEW_STATS), hasPermission(role, permission) — logique pure, tolérante aux rôles inconnus.
- src/lib/auth-password.ts : scrypt node:crypto (sel 16 o, keylen 64, format "scrypt:salt:hash" hex) — hashPassword/verifyPassword ASYNC (timingSafeEqual), validatePasswordStrength (min 12 caractères, ≥1 lettre, ≥1 chiffre, messages FR).
- src/lib/rate-limit.ts : fenêtre glissante en mémoire + purge périodique (60 s) ; rateLimit(key, limit, windowMs) → {allowed, remaining, retryAfterSec} ; helpers loginRateLimit(ip, email) [5/15 min, clé hachée SHA-256], invitationRateLimit(ip) [20/h], adminApiRateLimit(ip) [120/min].
- src/lib/audit.ts : writeAudit(entry) — jamais d'exception (try/catch + console.error) ; sanitizeMetadata (suppression récursive password/token/secret/etc., troncature des chaînes, plafond 4000 caractères) ; ipFromHeaders() (x-forwarded-for/x-real-ip).
- src/lib/api.ts : ApiError(status, code, message, fields?) + fabriques statiques (unauthorized/forbidden/notFound/rateLimited/conflict/validation/badRequest) ; withApi(handler) — try/catch, {ok:true,data} / {ok:false,error:{code,message,fields?}}, erreurs zod → 400 VALIDATION_ERROR avec fields par chemin, erreur inattendue → 500 générique (détail en console serveur uniquement) ; jsonOk(data, status).
- src/lib/settings.ts : getSetting(key) avec fallback DEFAULT_SETTINGS (JSON string en base), setSetting(key, value) (upsert), getAllSettings() (fusion défauts + base).
- Auth : src/lib/auth-options.ts (NextAuth v4, CredentialsProvider email+password, session JWT, pages.signIn="/admin/connexion"). authorize : rate limit login → LoginRateLimitError (message FR) ; compte actif obligatoire ; verifyPassword timing-safe ; LOGIN_FAILED journalisé (IP depuis x-forwarded-for) ; LOGIN_SUCCESS journalisé + lastLoginAt/lastLoginIp. Callback jwt : à la connexion stocke id/role/tokenVersion ; ensuite relecture AdminUser (cache mémoire 30 s) — absent, désactivé ou tokenVersion différent ⇒ throw "session révoquée" ; callback session expose id+role. events.signOut → audit LOGOUT. Exports additionnels : getAdminSessionSafe() (session ou null, n'échoue jamais), isLoginAllowed(ip,email) (pré-check pour la page de connexion), LoginRateLimitError, AdminSession. src/app/api/auth/[...nextauth]/route.ts (runtime nodejs, GET/POST). src/types/next-auth.d.ts : Session.user + {id, role}, JWT + {id?, role?, tokenVersion?}, User + {role, tokenVersion}.
- src/middleware.ts : matcher ["/admin/:path*", "/api/admin/:path*", "/invitation/:path*", "/api/invitation/:path*"] ; /admin* + /api/admin* exigent un JWT (getToken) — sinon 302 vers /admin/connexion?from=… (pages) ou 401 JSON {ok:false,error:{code:"UNAUTHORIZED"}} (API) ; /admin/connexion exclu ; en-têtes communs partout (X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin) ; /invitation* : Referrer-Policy no-referrer + X-Robots-Tag noindex, nofollow. Comportement vérifié par curl : 302 admin, 401 JSON api/admin, en-têtes invitation OK.
- next.config.ts : headers sécurité globaux (les mêmes 3 clés, complètent le middleware) + headers /invitation/:path* ; output: "standalone" conservé ; typescript.ignoreBuildErrors=false et reactStrictMode=true (D6).
- scripts/create-admin.ts + script npm "admin:create" : lit ADMIN_INITIAL_EMAIL/NAME/PASSWORD, messages FR si absents, validatePasswordStrength obligatoire, refuse un admin actif existant avec le même e-mail, upsert (actif, role ADMIN, tokenVersion incrémentée si mise à jour). NON EXÉCUTÉ (conforme à la consigne — aucun admin réel créé).
- .env : NEXTAUTH_SECRET (openssl rand -hex 32), NEXTAUTH_URL=http://localhost:3000, SITE_NAME — DATABASE_URL inchangé. .env.example créé (mêmes clés, valeurs "changez-moi" + variables du script admin).
- Qualité : `bun run lint` → 0 erreur. `bunx tsc --noEmit` → 4 erreurs PRÉ-EXISTANTES hors périmètre (examples/websocket : socket.io non installé ; skills/* : templates sandbox) — tsconfig.json hors liste des fichiers modifiables, non touché ; vérification ciblée du code applicatif (src/**, scripts/**, types/**) → 0 erreur. Sanity checks d'exécution des fonctions pures (scrypt round-trip, canTransition, rateLimit, sanitizeMetadata, hasPermission, zodErrorToFields) : OK. NextAuth responders /api/auth/session + /api/auth/providers : OK. Aucun code de test automatisé écrit.

Anomalies / points d'attention :
- Next.js 16 : avertissement "middleware file convention is deprecated, use proxy" — le fichier src/middleware.ts reste fonctionnel (consigne de la tâche) ; un renommage éventuel en proxy.ts est une évolution triviale à décider côté orchestrateur.
- NextAuth v4 masque côté client les messages levés dans authorize (réponse 401 générique). Le message FR de LoginRateLimitError est en journal serveur ; pour l'afficher clairement, la page /admin/connexion (2-b) doit appeler isLoginAllowed(ip, email) AVANT signIn('credentials') via une route API dédiée.
- getServerSession lève si la session est révoquée (tokenVersion) : les routes admin (2-b) doivent utiliser getAdminSessionSafe() et renvoyer 401 si null. Le middleware ne vérifie QUE la signature du JWT (les callbacks jwt ne s'exécutent pas dans getToken).
- Le modèle Initiative n'a volontairement pas de createdAt/updatedAt (non spécifiés au brief) ; tous les autres modèles ont leurs horodatages.

Stage Summary (contrat pour la tâche 2-b) :
- src/lib/db.ts : `db` — PrismaClient singleton (log ['error']).
- src/lib/constants.ts : `ROLES`, `Role`, `ROLE_LABELS` ; `DOSSIER_STATUSES`, `DossierStatus`, `DOSSIER_STATUS_LABELS`, `DOSSIER_STATUS_BADGE_CLASS`, `DOSSIER_TRANSITIONS`, `canTransition(from,to)`, `isPublished(status)` ; `TESTIMONIAL_STATUSES`/`TESTIMONIAL_STATUS_LABELS`, `NOMINATION_STATUSES`/`NOMINATION_STATUS_LABELS`, `RIGHTS_REQUEST_TYPES`/`RIGHTS_REQUEST_TYPE_LABELS`, `RIGHTS_REQUEST_STATUSES`/`RIGHTS_REQUEST_STATUS_LABELS`, `MEDIA_KINDS`/`MEDIA_KIND_LABELS`, `MEDIA_VISIBILITY`/`MEDIA_VISIBILITY_LABELS`, `MEDIA_STATUSES`/`MEDIA_STATUS_LABELS`, `CONSENT_CODES`/`CONSENT_CODE_LABELS`, `INVITATION_STATUSES`/`INVITATION_STATUS_LABELS`, `INVITATION_CHANNELS`/`INVITATION_CHANNEL_LABELS`, `INITIATIVE_RESULT_TYPES`/`INITIATIVE_RESULT_TYPE_LABELS`, `INITIATIVE_PROJECT_STATES`/`INITIATIVE_PROJECT_STATE_LABELS`, `AUDIT_ACTIONS`/`AUDIT_ACTION_LABELS`, `AUDIT_RESULTS`/`AUDIT_RESULT_LABELS`, `SettingValue`, `DEFAULT_SETTINGS`, `SettingKey`, `ADMIN_SESSION_CACHE_TTL_MS`, `AUDIT_METADATA_MAX_LENGTH`.
- src/lib/permissions.ts : `PERMISSIONS`, `Permission`, `PERMISSIONS_BY_ROLE`, `hasPermission(role, permission): boolean`.
- src/lib/auth-password.ts : `hashPassword(password): Promise<string>`, `verifyPassword(password, stored): Promise<boolean>`, `validatePasswordStrength(password): {ok, errors[]}`.
- src/lib/rate-limit.ts : `rateLimit(key, limit, windowMs): {allowed, remaining, retryAfterSec}`, `loginRateLimit(ip, email)`, `invitationRateLimit(ip)`, `adminApiRateLimit(ip)`.
- src/lib/audit.ts : `writeAudit(entry: {actorId?, actorLabel?, action, entityType, entityId?, result?, metadata?, ip?}): Promise<void>` (ne lève jamais), `sanitizeMetadata(metadata): string|undefined`, `ipFromHeaders(headers): string|null`.
- src/lib/api.ts : `ApiError` (+ statiques badRequest/validation/unauthorized/forbidden/notFound/rateLimited/conflict), `withApi<P>(handler)` (req: NextRequest, ctx: {params: Promise<P>}), `jsonOk<T>(data, status?)`, `zodErrorToFields(error)`, types `ApiResponse<T>`, `RouteContext<P>`.
- src/lib/settings.ts : `getSetting(key): Promise<SettingValue>`, `setSetting(key, value): Promise<void>`, `getAllSettings(): Promise<Record<string, SettingValue>>`.
- src/lib/auth-options.ts : `authOptions: NextAuthOptions`, `getAdminSessionSafe(): Promise<AdminSession|null>` (AdminSession = {user:{id, name?, email?, role}}), `isLoginAllowed(ip, email): {allowed, retryAfterSec}`, `class LoginRateLimitError`, `interface AdminSession`.
- src/app/api/auth/[...nextauth]/route.ts : GET/POST NextAuth (runtime nodejs).
- src/types/next-auth.d.ts : Session.user.id/.role, JWT.id?/.role?/.tokenVersion?, User.role/.tokenVersion.
- src/middleware.ts : garde JWT sur /admin* + /api/admin* (302 page, 401 JSON api), en-têtes sécurité + /invitation* (no-referrer, noindex).
- scripts/create-admin.ts (`bun run admin:create`) ; .env : NEXTAUTH_SECRET, NEXTAUTH_URL, SITE_NAME ; .env.example.
- Rappel machine à états : toute transition de statut dossier DOIT passer par canTransition() et être journalisée via writeAudit(DOSSIER_STATUS_CHANGED).

---
Task ID: 2-b
Agent: full-stack-developer (livraison récupérée par l'orchestrateur après dépassement de délai — travail vérifié intégralement en 2-c)
Task: Interface admin protégée + socle public minimal + palette

Work Log:
- Identité visuelle §16 appliquée (globals.css : tokens Tailwind 4 + shadcn — vert #173D32, ivoire #F8F5EF, or #D6B15E accents, anthracite #202522 ; Fraunces titres + Geist corps).
- Migré src/middleware.ts → src/proxy.ts (convention Next.js 16), matcher identique.
- src/app/layout.tsx : lang fr, metadata depuis SITE_NAME, plus de métadonnées scaffold.
- Pages publiques : (public)/page.tsx (accueil honnête : slogan, mission, critères §13, démarche ; CTA « Proposer » désactivé explicité), (public)/annuaire (état vide réel), (public)/layout.tsx avec header + footer sticky liens réels. src/app/page.tsx scaffold supprimé.
- Admin : (auth)/admin/connexion (client, pré-check rate limit via /api/auth/check-rate-limit), admin/layout.tsx (garde getAdminSessionSafe + AdminShell responsive), /admin (tableau de bord compteurs réels), /admin/dossiers (liste + filtre statut + pagination), /admin/dossiers/[id] (détail lecture seule + historique AuditLog), /admin/utilisateurs (création/désactivation/rôle + AlertDialog confirmation + protection dernier admin), /admin/journal (filtres action/résultat, pagination 50), admin/error.tsx + not-found.tsx + loading.tsx.
- API : /api/admin/users (GET/POST), /api/admin/users/[id] (PATCH), /api/admin/dossiers (GET), /api/admin/audit (GET) — toutes withApi + rate limit + permissions serveur + audit ; /api/auth/check-rate-limit.
- Scaffold page.tsx racine supprimé (remplacé par (public)/page.tsx).

Stage Summary:
- Parcours admin complet opérationnel : connexion → tableau de bord réel → gestion comptes → journal.
- Tous les compteurs proviennent de requêtes Prisma réelles ; aucune donnée fictive ; liens morts absents (« Bientôt disponible » explicite, cartes non cliquables).

---
Task ID: 2-c
Agent: Z.ai (orchestrateur)
Task: Vérification E2E navigateur + qualité + correctifs phase 2

Work Log:
- bun run lint : 0 erreur ; bunx tsc --noEmit : propre sur src/** (erreurs pré-existantes hors périmètre examples/ + skills/ uniquement).
- dev.log analysé : erreurs historiques uniquement (EADDRINUSE transitoire, coexistence middleware/proxy pendant migration) ; serveur actif sain via proxy.ts ; aucune erreur de police Fraunces.
- Admin créé via bun run admin:create (procédure sécurisée, mot de passe fort validé).
- E2E navigateur réel : accueil (sémantique, slogan, CTA honnêtes) ✓ ; /annuaire état vide ✓ ; /admin → 302 /admin/connexion?from ✓ ; connexion admin ✓ (cookie session posé) ; tableau de bord compteurs réels (1 compte, 1 entrée journal) ✓ ; /admin/journal : LOGIN_SUCCESS tracé ✓ ; /admin/utilisateurs : liste réelle, protection dernier admin (switch désactivé), création modérateur ✓, désactivation/réactivation avec AlertDialog ✓ ; journal : ADMIN_CREATED + ADMIN_DEACTIVATED + ADMIN_REACTIVATED tracés ✓ ; déconnexion ✓ ; connexion modérateur → nav restreinte ✓ ; /admin/utilisateurs en modérateur → « Accès refusé » ✓ ; GET/POST /api/admin/users anonyme → 401 ✓ ; API en modérateur → 403 FR ✓ ; mobile iPhone 14 : pas de débordement horizontal, footer poussé naturellement ✓ ; page courte : footer en bas ✓.
- Correctif appliqué : ADMIN_REACTIVATED absent des constantes (affiché en code brut dans le journal) → ajouté à AUDIT_ACTIONS + AUDIT_ACTION_LABELS (constants.ts), relint OK.
- Captures : tool-results/{home-desktop,home-mobile,annuaire-mobile,admin-desktop}.png.

Stage Summary:
- PHASE 2 VALIDÉE par vérification E2E réelle : socle technique opérationnel (19 tables, auth révocable, permissions serveur, audit, UI admin, socle public honnête).
- Criteres d'acceptation phase 2 du plan : visiteur bloqué ✓ (302/401), migrations exécutables ✓ (db:push), journal d'audit actif ✓.
- Reste pour phase 3 : création de dossiers, invitations token, formulaire multi-étapes, consentements, téléversements. Dépend de la décision client sur l'âge minimal/consentement tuteur.
---
Task ID: 3-0
Agent: Z.ai (orchestrateur)
Task: Nom plateforme = Dora + restauration environnement + configuration GitHub

Work Log:
- Client a nommé la plateforme « Dora » (SITE_NAME) et demandé l'autonomie totale (plus d'attente de feu vert) + poussée de chaque mise à jour sur https://github.com/blunaantoine/dora.git
- .env restauré (les clés NEXTAUTH_SECRET/NEXTAUTH_URL/SITE_NAME avaient disparu) : NEXTAUTH_SECRET régénéré (openssl rand -hex 32), SITE_NAME="Dora". .env.example recréé (valeurs changez-moi + variables du script admin).
- .env reste hors suivi Git (.gitignore, politique §26.7).
- Nouveau compte admin de développement créé via scripts/create-admin.ts (procédure sécurisée, mot de passe fort) : admin@dora-dev.local. Les comptes de la phase 2 E2E existent toujours (mots de passe perdus hors contexte).
- Serveur dev redémarré : branding « Dora » vérifié en HTTP 200, /api/auth/providers OK.
- git remote add origin https://github.com/blunaantoine/dora.git ; commit phase 2 (f6ed371).
- Tentative de poussée : ÉCHEC authentification — aucun identifiant GitHub dans l'environnement (pas de PAT, pas de gh CLI, pas de credential helper). origin configuré ; chaque phase sera committée localement et poussée dès que le client fournira un token (PAT GitHub scope repo).

Stage Summary:
- Plateforme nommée Dora. Environnement sain. Remote GitHub configuré. Poussée en attente d'un PAT client (blocage externe, signalé).
---
Task ID: 3-a
Agent: full-stack-developer (livraison récupérée après dépassement de délai ; vérification complète par l'orchestrateur)
Task: Backend phase 3 — dossiers admin, invitations token sécurisé, téléversements, consentements

Work Log:
- Livrables vérifiés présents : src/lib/tokens.ts (CSPRNG 32 o base64url + SHA-256, hash seul en base), src/lib/consent-texts.ts (ADULT_CONSENT/GUARDIAN_CONSENT v1) + scripts/seed-consent-texts.ts exécuté ; src/lib/media.ts, invitation-guard.ts, admin-guard.ts, invitation-draft.ts (zod .strict(), 24 champs texte + initiatives ≤10 + contacts privés), dossier-status.ts, person.ts.
- API admin : POST /api/admin/dossiers (création, genre FEMME/FILLE, XOR date/année naissance), PATCH /api/admin/dossiers/[id] (édition + transitions via canTransition + audit), GET avec recherche q ; /api/admin/invitations (POST révoque l'ancienne invitation active avant création, GET liste blanche), /api/admin/invitations/[id] (revoke/renew) ; /api/admin/media/[id]/file (servage privé D7, Cache-Control private no-store).
- API publique invitation : GET [token] (404 générique anti-énumération), /state (reprise brouillon), /draft (PUT zod strict), /consent (versionné), /media (upload magic bytes JPEG/PNG/WebP + sharp EXIF strip + ré-encodage + uploads-private/ hors public), /media/[id] DELETE, /submit (verrouillage + invitation USED).
- .gitignore : uploads-private/ ajouté.
- Tests curl réels E2E : login 302+session ✓ ; POST dossier ✓ ; POST invitation (url /invitation/<token>) ✓ ; GET invitation publique (texte consentement inclus) ✓ ; state ✓ ; PUT draft (publicName/storyJourney/contacts/initiative OBSERVED) ✓ persistance ✓ ; CONSENT ✓ ; upload JPEG 300×200 ✓ (media READY) ; GET file admin image/jpeg 200 ✓ ; rejet MZ fake.exe TYPE_NON_SUPPORTE ✓ ; submit → SUBMITTED ✓ ; re-submit 409 CONFLICT ✓ ; token réutilisé 404 ✓ ; anonyme /api/admin 401 ✓.
- Journal d'audit vérifié : DOSSIER_CREATED ×3, INVITATION_CREATED, INVITATION_ACCESSED, CONSENT_RECORDED, MEDIA_UPLOADED, DOSSIER_STATUS_CHANGED ×3, DOSSIER_SUBMITTED — tous SUCCESS, sans token ni hash dans les métadonnées.
- bun run lint : 0 erreur ; tsc --noEmit : propre sur src/** + scripts/**.
- Dossier de démonstration actif créé pour le développement UI 3-b : /invitation/8r5s98Sv34BW93UaJBFJmCTyS5qhX8mqiiFrPVKh7E8 (dossier « Kossiwa Demonstration », FEMME 1990).

Stage Summary (contrat pour 3-b) :
- Le formulaire 9 étapes (§7) se construit sur : GET /api/invitation/[token] (validité + consent à accepter), GET /state (reprise), PUT /draft (champs : publicName, shortPresentation, biography, country, region, city, languages, storyJourney, engagementMotivation, keyEvent, difficultiesEncountered, lessonsLearned, inspirationSource, education, professionalExperience, responsibilities, organizations, skills, distinctions, visionCommunity, futureGoals, projectsToDevelop, supportNeeded, messageToYouth + contacts{phone,email,contactPreference} + initiatives[{title,description,periodLabel,actionArea,beneficiaries,rolePlayed,partners,objectives,results,resultsType(OBSERVED|ESTIMATED|GOAL),evidence,difficulties,learnings,projectState}]).
- Enum réels : genre FEMME|FILLE ; resultsType OBSERVED|ESTIMATED|GOAL (PAS MESURABLE).
- Réponses : {ok:true,data} ; erreurs {ok:false,error:{code,message,fields?}}.
- Consent : POST /consent {consentCode, accepte:true} (clé française « accepte ») avant submit ; submit : POST /submit {} → 409 si déjà soumis.
- Upload : POST /media multipart champ file (JPEG/PNG/WebP, magic bytes, ≤2 Mo) → data.media{id,kind,statut,sizeBytes,width,height} ; DELETE /media/[mediaId].
- UI admin invitations : consommer /api/admin/invitations + PATCH [id] {action:"revoke"|"renew"} (vérifier le nom exact du champ action dans la route).
---
Task ID: 3-b
Agent: full-stack-developer (livraison récupérée après dépassement de délai ; vérification complète par l'orchestrateur)
Task: UI formulaire public 9 étapes + UI admin invitations

Work Log:
- Formulaire /invitation/[token] reconstruit : Server Component (validation serveur du jeton via validateInvitationToken) + Client Components src/components/invitation/ (form, consent-step, fields, initiatives-step, media-step, review-step, types). Navigation 9 étapes (Consentement, Identité, Parcours personnel, Scolaire/Pro, Initiatives, Vision, Médias, Choix de publication, Vérification) ; barre de progression ; étapes verrouillées avant consentement (boutons disabled + garde dans goToStep) ; consentement bloquant (case + nom tuteur si mineure, GUARDIAN_CONSENT auto-sélectionné pour FILLE 2008) ; sauvegarde PUT /draft par étape ; reprise automatique via GET /state (valeurs pré-remplies vérifiées après reload) ; upload médias avec aperçu liste + suppression ; récapitulatif + Soumettre (Dialog confirmation).
- UI admin : /admin/invitations (liste statuts/dates/acces, filtre, Dialog création avec recherche dossier q=, URL affichée UNE fois + Copier + toast, AlertDialog pour Révoquer/Renouveler) ; panneau Invitation + actions de transition statut sur /admin/dossiers/[id] (transitions permises calculées via canTransition, AlertDialog de confirmation) ; lien « Invitations » ajouté à AdminShell.
- Vérifications navigateur réelles (orchestrateur) : FILLE 2008 → notice tuteur + champs tuteur requis ✓ ; Continuer sans case → bloqué, étapes 2-9 disabled ✓ ; consent tuteur enregistré → étapes déverrouillées ✓ ; étape 2 saisie + Enregistrer → étape 3 ✓ ; reload → valeurs pré-remplies (Eya V./Togo/Kara) ✓ ; étape 7 upload JPEG réel → « Fichiers téléversés (1) » + Supprimer ✓ ; étapes 8-9 rendues avec récap ✓ (soumission NON déclenchée volontairement) ; admin : connexion → /admin/invitations liste réelle ✓ ; création invitation (recherche « Afi », sélection, URL + Copier + toast « Lien copié ») ✓ ; Révoquer (AlertDialog) → statut « Révoquée » ✓ ; token révoqué → 404 anti-énumération ✓ ; détail dossier → transitions confirmées (DRAFT→INVITE_CREATED→INVITE_SENT) + panel invitation propose une nouvelle après révocation ✓.
- Audit vérifié en base : DOSSIER_STATUS_CHANGED ×2, INVITATION_CREATED, INVITATION_REVOKED, MEDIA_UPLOADED, INVITATION_ACCESSED, LOGIN_SUCCESS — tous SUCCESS.
- lint 0 erreur ; tsc propre ; dev.log sans erreur. Captures : tool-results/p3b-{form-consent,admin-invitations,form-mobile}.png.
- UX notée (acceptée) : après enregistrement du consentement, l'étape 1 reste affichée en mode « déjà enregistré » avec bouton Continuer (un clic supplémentaire, non bloquant).

Stage Summary:
- Parcours participant complet opérationnel bout en bout (invitation → consentement → 9 étapes → brouillon persistant → médias → récap), UI admin invitations opérationnelle.
- Dossiers en base : Kossiwa Demonstration (ACTIVE, brouillon avec consent), Eya Verification (ACTIVE, brouillon avec consent tuteur + 1 média + étapes 2 remplies), Afi Test-E2E (INVITE_SENT, invitation RÉVOQUÉE — jetable), Afi Parcours (SUBMITTED + invitation USED — jetable).
- Prêt pour phase 4 : examen (IN_REVIEW), publication (ProfilePublication), fiches publiques.

---
Task ID: 4-a
Agent: full-stack-developer
Task: Workflow d'examen et de publication (§8) + catégories (§4.3) + UI admin associée

Work Log:
- src/lib/constants.ts : ajout des codes audit CLARIFICATION_SENT, CLARIFICATION_ANSWERED, CATEGORY_CREATED, CATEGORY_UPDATED, PROFILE_PUBLICATION_UPDATED (action + libellé FR) — schéma Prisma INCHANGÉ (aucune migration nécessaire).
- src/lib/public-fields.ts (nouveau) : liste blanche FIXE PUBLIC_FIELDS (26 champs : publicName…mainPhoto), PUBLIC_FIELD_LABELS (libellés FR), isPublicField(), MINOR_FORBIDDEN_FIELDS=["city","region"], MINOR_BIOGRAPHY_PUBLIC_MAX_LENGTH=2000 (troncature d'affichage côté public), filterFieldsForMinor().
- src/lib/slug.ts (nouveau) : slugify() (NFD, accents retirés, apostrophes→espace, tirets, ≤80 car.) ; generateUniquePublicationSlug() / generateUniqueCategorySlug() (base → suffixes -2…-20 → suffixe aléatoire court base36, unicité vérifiée en base).
- API catégories : GET/POST /api/admin/categories (GET avec publishedCount = dossiers au statut PUBLISHED + personsCount = tous dossiers liés ; POST {name, description?} slug auto + unicité du nom, sortOrder incrémental) ; PATCH /api/admin/categories/[id] {name?, description?, isActive?} — désactiver n'efface rien, le slug N'est PAS régénéré au renommage (stabilité des filtres) ; DELETE → 405 METHOD_NOT_ALLOWED explicite. Permission MANAGE_CATEGORIES (ADMIN+EDITOR). Audit CATEGORY_CREATED/CATEGORY_UPDATED.
- scripts/seed-categories.ts : upsert idempotent des 12 catégories officielles §4.3 (FR, descriptions rédigées, toutes actives, sortOrder 1→12) — EXÉCUTÉ : 12 catégories en base.
- API clarification : POST /api/admin/dossiers/[id]/clarifications {fieldsConcerned[](liste blanche), questions, message, dueDateHint?} — 409 si le dossier n'est pas UNDER_REVIEW (message : repositionner d'abord via PATCH) ; création + transition UNDER_REVIEW→CLARIFICATION_REQUESTED dans UNE transaction (update conditionnel WHERE status=from) ; audit CLARIFICATION_SENT + DOSSIER_STATUS_CHANGED {from,to}. GET …/clarifications : liste (50 max) en liste blanche. PATCH /api/admin/clarifications/[id] {markAnswered:true} → ANSWERED+answeredAt ; si le dossier est CLARIFICATION_REQUESTED → transition CLARIFICATION_RECEIVED (même transaction), sinon réponse seule ; 409 si déjà répondue ; audit CLARIFICATION_ANSWERED (+DOSSIER_STATUS_CHANGED si transition). Permission MANAGE_DOSSIERS partout.
- API publication : GET/POST/PATCH/DELETE /api/admin/dossiers/[id]/publication. Permission PUBLISH_PROFILES (ADMIN). POST : pré-requis 409 explicites FR — statut APPROVED (transition APPROVED→PUBLISHED), ConsentRecord présent, publicName non vide, ≥1 champ approuvé ; règle mineures → 400 si city/region dans approvedFields (message FR « localisation précise exclue ») ; slug depuis publicName (existant conservé en cas de republication, sinon généré unique) ; création/mise à jour ProfilePublication {state:"PUBLISHED", approvedFields:JSON, publishedAt} + transition dans UNE transaction ; audit PROFILE_PUBLISHED + DOSSIER_STATUS_CHANGED. PATCH : dossier PUBLISHED uniquement (409 sinon) — approvedFields (règle mineures revalidée), seoTitle ≤70, seoDescription ≤160 (null→vidage), featured ; audit PROFILE_PUBLICATION_UPDATED {fields}. DELETE {motif?} : 409 si non PUBLISHED ; publication state="UNPUBLISHED"+unpublishedAt ET transition PUBLISHED→UNPUBLISHING dans la MÊME transaction ; audit PROFILE_UNPUBLISHED {slug, motif, from, to} + DOSSIER_STATUS_CHANGED ; l'admin atteint ensuite ARCHIVED via PATCH existant. GET : état {dossier{status,publicName,isMinor}, publication|null, prerequisites{statusOk,consentOk,publicNameOk,fieldsOk}, slug (réel ou prévisionnel), previewUrl:"/profils/<slug>"}.
- UI : src/components/admin/dossier-review-panel.tsx — SUBMITTED « Commencer l'examen » ; UNDER_REVIEW « Demander des précisions » (Dialog : checkboxes des 26 champs avec libellés FR, questions, message, date indicative) / « Approuver » (AlertDialog) / « Refuser » (Dialog : motif interne obligatoire, note respectueuse optionnelle — les deux apposés dans privateData.internalNotes horodatés, pas de changement de schéma) ; CLARIFICATION_REQUESTED → liste des demandes + « Réponse reçue » (AlertDialog) ; CLARIFICATION_RECEIVED/APPROVED/REJECTED → rappels contextuels. src/components/admin/publication-panel.tsx — APPROVED : checklist pré-requis (✓/✗), champs approuvés (city/region désactivés pour mineure avec bandeau d'explication), SEO (70/160), switch mise en avant, URL publique prévisionnelle ; PUBLISHED : lien « Voir la fiche publique » (/profils/<slug>), édition, « Dépublier » (AlertDialog, motif facultatif). Page détail enrichie (sections « Examen du dossier » pour statuts d'examen, « Publication » réservée PUBLISH_PROFILES). src/lib/client-api.ts : deleteJson() étendu avec corps optionnel (rétrocompatible).
- UI catégories : src/app/admin/categories/page.tsx + src/components/admin/categories-manager.tsx (liste nom/description/active/publiés/liés/slug, Dialog ajout, Dialog renommage, bascule active avec AlertDialog « les profils publiés restent visibles, la catégorie disparaît des filtres » quand des dossiers sont liés). AdminShell : lien « Catégories » (Shapes) visible si MANAGE_CATEGORIES.
- Conformité transversale : toutes les routes withApi + guardAdminApi (rate limit adminApiRateLimit → 429, getAdminSessionSafe → 401, hasPermission → 403), zod .strict(), sérialiseurs liste blanche, jamais de donnée privée dans les réponses/audit.
- Qualité : bun run lint → 0 erreur ; bunx tsc --noEmit → propre sur src/** + scripts/** (erreurs pré-existantes hors périmètre uniquement). Correctif react-hooks/set-state-in-effect : chargements initiaux différés d'un tick (pattern existant invitations-manager).
- Vérifications curl réelles (login admin@dora-dev.local, cookie session) : dossier jetable « Examen Verif » (FEMME 1992) créé → invitation → consent ADULT_CONSENT → draft (publicName « Adjoa Vérif » + storyJourney) → submit SUBMITTED. Puis : SUBMITTED→UNDER_REVIEW ✓ ; POST clarification (2 champs, date indicative) → CLARIFICATION_REQUESTED ✓ ; GET clarifications (1 PENDING) ✓ ; markAnswered → ANSWERED + CLARIFICATION_RECEIVED ✓ ; →UNDER_REVIEW→APPROVED ✓ ; GET publication (pré-requis ✓✓✓, previewUrl /profils/adjoa-verif) ✓ ; règle mineures testée (PATCH isMinor:true → POST avec city+region → 400 VALIDATION_ERROR avec messages FR par champ → isMinor:false) ✓ ; POST publication (publicName+shortPresentation+storyJourney+mainPhoto, SEO) → 201 PUBLISHED slug "adjoa-verif" ✓ ; GET publication (state PUBLISHED, champs, URL) ✓ ; PATCH publication (featured:true + seoDescription) ✓ ; PATCH publication refusé sur dossier non publié (409) ✓ ; double POST refusé (409) ✓ ; DELETE publication {motif} → state UNPUBLISHED + statut UNPUBLISHING ✓ ; PATCH ARCHIVED ✓. Catégories : GET (12 officielles) ✓ ; POST temporaire (slug auto) ✓ ; PATCH renommage ✓ ; PATCH isActive:false ✓ ; DELETE → 405 ✓ ; anonyme → 401 ✓. UI rendue vérifiée : page détail (sections Statut/Invitation/Examen/Publication/Historique selon statut et rôle), page /admin/categories 200, AdminShell avec « Catégories ».
- Audit vérifié en base (sqlite3 via python, lecture seule) : DOSSIER_STATUS_CHANGED ×11 avec {from,to} exacts ; CLARIFICATION_SENT/CLARIFICATION_ANSWERED ; CATEGORY_CREATED/CATEGORY_UPDATED ; PROFILE_PUBLISHED {slug, approvedFields, from, to} ; PROFILE_PUBLICATION_UPDATED {fields:[seoDescription,featured]} ; PROFILE_UNPUBLISHED {slug, motif, from, to} — tous SUCCESS, aucune donnée privée dans les métadonnées.
- Base laissée propre : dossier jetable ARCHIVED (publication state=UNPUBLISHED — JAMAIS PUBLISHED à la fin, annuaire public reste vide ✓), clarification ANSWERED, catégorie de vérification désactivée (jetable, notée). « Eya Verification » et « Kossiwa Demonstration » non touchés.

Stage Summary (contrat API pour la tâche 4-b) :
- Champs publics (liste blanche FIXE, src/lib/public-fields.ts) : PUBLIC_FIELDS = ["publicName","shortPresentation","biography","country","region","city","languages","storyJourney","engagementMotivation","keyEvent","difficultiesEncountered","lessonsLearned","inspirationSource","education","professionalExperience","responsibilities","organizations","skills","distinctions","visionCommunity","futureGoals","projectsToDevelop","supportNeeded","messageToYouth","initiatives","mainPhoto"] + PUBLIC_FIELD_LABELS (FR). La fiche publique /profils/<slug> n'affiche QUE les champs présents dans publication.approvedFields (JSON array) ET renseignés. MINEURES : ne JAMAIS afficher city/region ; tronquer biography à MINOR_BIOGRAPHY_PUBLIC_MAX_LENGTH=2000 à l'affichage ; "mainPhoto" approuvé ⇒ prévoir en 4-b un servage public dédié de la photo (aucun servage public n'existe encore : /api/admin/media/[id]/file reste privé) — tant qu'il n'est pas défini, la fiche publique n'affiche pas la photo.
- ProfilePublication : {id, personId(unique), slug(unique), state("UNPUBLISHED"|"PUBLISHED"), approvedFields(JSON String), featured, seoTitle?, seoDescription?, publishedAt?, unpublishedAt?, updatedAt}. Sérialisation conseillée pour le public : {slug, publicName, approvedFields[], featured, publishedAt} + champs PersonRecord filtrés par approvedFields.
- Slug : généré (accents retirés, tirets, ≤80 car., unicité garantie) ; réel = publication.slug ; URL publique = /profils/<slug> (page à créer en 4-b : Server Component, GET direct Prisma — ne servir QUE state="PUBLISHED", sinon notFound() 404 générique anti-énumération ; metadata SEO depuis seoTitle/seoDescription ; viewCount++ à chaque vue).
- Machine à états (rappel) : APPROVED→PUBLISHED (fait en POST publication) ; PUBLISHED→UNPUBLISHING (fait en DELETE publication) ; UNPUBLISHING→ARCHIVED|APPROVED (PATCH /api/admin/dossiers/[id] {status}) ; RETRACTION_REQUESTED traité en phase demandes de droits.
- Routes disponibles pour 4-b : GET /api/admin/dossiers/[id]/publication {dossier{status,publicName,isMinor}, publication|null, prerequisites{statusOk,consentOk,publicNameOk,fieldsOk}, slug, previewUrl} (permission PUBLISH_PROFILES) ; POST/PATCH/DELETE même URL (PUBLISH_PROFILES) ; GET/POST /api/admin/dossiers/[id]/clarifications + PATCH /api/admin/clarifications/[id] {markAnswered:true} (MANAGE_DOSSIERS) ; GET/POST /api/admin/categories + PATCH /api/admin/categories/[id] {name?,description?,isActive?} (MANAGE_CATEGORIES ; DELETE=405). Réponses normalisées {ok:true,data}/{ok:false,error:{code,message,fields?}}.
- Catégories publiques (annuaire 4-b) : Category {id,name,slug,description,isActive,sortOrder} — filtrer isActive:true pour les filtres ; les dossiers liés à une catégorie désactivée RESTENT visibles (relation SetNull jamais utilisée : categoryId reste rempli). publishedCount par catégorie = PersonRecord.count({categoryId, status:"PUBLISHED"}).
- État de la base (pour 4-b) : 12 catégories officielles actives (sortOrder 1→12) + 1 catégorie jetable désactivée « Vérification Temporaire 4a (renomée) » ; dossier jetable « Examen Verif » ARCHIVED (publication UNPUBLISHED, slug adjoa-verif, 1 clarification ANSWERED) ; dossiers réutilisables pour l'UI : « Afi Parcours » (SUBMITTED), « Kossiwa Demonstration » (IN_PROGRESS, brouillon riche), « Eya Verification » (IN_PROGRESS, FILLE mineure — NE PAS TOUCHER, réservé).
---
Task ID: 4-b
Agent: full-stack-developer (livraison récupérée après dépassement de délai ; vérification complète par l'orchestrateur)
Task: Pages publiques — annuaire /profils, fiche /profils/[slug], accueil, pages légales

Work Log:
- src/lib/public-profile.ts : sérialiseur liste blanche unique (double garde mineures : city/region jamais renvoyés, biographie tronquée 2000 car., bandeau Profil protégé).
- /profils : Server Component + formulaire GET natif (q, categorie, page — sans JS, 3G), Suspense interne (sémantique 404 préservée sur [slug]), pagination 12/page, états vide/chargement/erreur réels ; catégories actives seulement (§4.3).
- /profils/[slug] : notFound() si non PUBLISHED ; generateMetadata (title/description/openGraph avec image publique, canonical) ; sections affichées uniquement si champ approuvé ET non vide ; initiatives ; JSON-LD Person minimal sans données privées ; bouton partage (Web Share API + fallback) ; lien signalement/correction.
- Médias : GET /api/public/media/[id] (visibilité PUBLIC + publication active uniquement — Cache-Control public max-age=3600) ; PATCH /api/admin/media/[id] {visibility} (permission PUBLISH_PROFILES, audit MEDIA_VISIBILITY_CHANGED) + bloc « Photo principale » dans publication-panel.tsx.
- Accueil : section « Derniers parcours publiés » (3 derniers, cartes réelles) ou phrase honnête si aucun ; /contact, /mentions-legales, /confidentialité statiques sobres + CONTACT_EMAIL dans .env.example ; footer liens réels.
- Vérifications réelles : 2 participantes de test créées via curl complet (adulte + mineure) puis publiées : annuaire cartes ✓ ; fiche adulte sections conformes aux champs approuvés (champ non approuvé absent) ✓ ; og:title/description/url/image exacts ✓ ; fiche mineure « Profil protégé » sans ville ✓ ; /api/public/media photo publique 200, photos privées 404 ✓ ; dépublication → fiche 404 ✓ ; recherche q + état vide ✓ ; accueil section réelle ✓ ; contact/légales 200 ✓.
- Nettoyage : les 2 dossiers de test dépubliés (UNPUBLISHING) puis ARCHIVED — annuaire public vide et honnête à la fin (« Aucun profil publié pour le moment — la plateforme prépare son lancement »). Eya/Kossiwa intacts.
- lint 0 erreur ; tsc propre ; dev.log sans erreur.

Stage Summary:
- Parcours public complet opérationnel : accueil → annuaire (recherche/filtres/pagination sans JS) → fiche publique SEO/OG → partage → signalement. Médias publics gardés par visibilité + publication active. Modèle restreint mineures effectif (double garde).
- Contrat : src/lib/public-profile.ts serializePublicCard/serializePublicProfile ; GET /api/public/media/[id] ; PATCH /api/admin/media/[id] ; /profils (searchParams q|categorie|page) ; /profils/[slug].
---
Task ID: 5-a
Agent: full-stack-developer (livraison interrompue par arrêt serveur ; complétion + vérification par l'orchestrateur)
Task: Témoignages (§9), propositions publiques (§11), badges manuels (§12)

Work Log:
- Livré par le sous-agent avant interruption : API témoignages publique (POST /api/public/profiles/[slug]/testimonials, honeypot siteWeb, declaration obligatoire, statut PENDING) + admin (GET/PATCH actions approve/reject/archive/clear-contact) ; API propositions publique (POST /api/public/nominations, détection doublons normalisés, honeypot, statuts NEW→…) + admin (GET/PATCH actions to_review/to_verify/duplicate/accept/reject/archive — accept crée un PersonRecord DRAFT, jamais de publication/invitation auto) ; API badges (GET/POST/PATCH, attributions POST, retrait logique PATCH avec justification, permission MANAGE_BADGES) ; composants publics testimonial-form, nomination-form, badge-icon (sous-ensemble lucide sûr src/lib/badge-icons.ts) ; pages /proposer + /proposer-une-personne ; sections publiques fiche (Témoignages APPROVED only + Reconnaissances avec mention « distincte d'une certification officielle ») ; src/app/admin/temoignages + manager (509 lignes).
- Complété par l'orchestrateur : correction JSX tronqué (</AlertDialogHeader> → </AlertDialogTitle> dans testimonials-manager) ; correction règle lint react-hooks/static-components sur badge-icon (disable justifié : table statique hors rendu) ; CRÉATION des pages admin manquantes : /admin/propositions (manager : filtres statut avec compteurs réels, contact proposant confidentiel avec copie, dialog confirmation pour actions définitives) et /admin/badges (manager : CRUD définitions, switch actif, attribution sur dossier PUBLISHED avec recherche + justification obligatoire, retrait logique avec justification) ; correction clé API badge (assignments → activeAssignments qui provoquait un TypeError en rendu) ; patterns useEffect conformes (setTimeout 0).
- Environnement : .env à nouveau tronqué par le sandbox lors du redémarrage → clés restaurées dans .env.local (priorité Next.js, hors Git) pour résilience ; .env régénéré.
- Vérifications réelles : proposition soumise au navigateur (combobox domaine, compteur total 2) ✓ ; honeypot rempli → 201 silencieux, 0 création ✓ ; admin propositions : liste réelle, acceptation « Awa Verif Nomination » → ACCEPTED_FOR_CONTACT + PersonRecord DRAFT créé (aucune publication) ✓ ; audit NOMINATION_SUBMITTED/NOMINATION_STATUS_CHANGED/DOSSIER_CREATED ✓ ; badge « Engagement communautaire » créé au navigateur ✓ ; attribué à un profil publié (recherche, justification) ✓ ; fiche publique affiche la section Reconnaissances + mention certification ✓ ; témoignage public soumis (après restart du limiteur anti-spam 5/h — comportement attendu) puis approuvé admin → visible sur fiche (auteur, relation, date) et contact JAMAIS présent dans le HTML public (grep 0) ✓ ; honeypot témoignage → 201 silencieux ✓ ; dépublication du profil de test → fiche 404 ✓ ; mobile 390px /proposer sans débordement ✓.
- Nettoyage : profil de test dépublié puis ARCHIVED ; annuaire honnêtement vide ; 1 témoignage APPROVED orphelin reste en base (invisible tant que le profil n'est pas publié — acceptable) ; propositions de test conservées (1 NEW, 1 ACCEPTED_FOR_CONTACT).
- lint 0 erreur ; tsc propre ; dev.log sans erreur. Capture : tool-results/p5-proposer-mobile.png.

Stage Summary:
- Phase 5 opérationnelle : témoignages (modération complète, minimisation des contacts), propositions (file de traitement, acceptation = dossier de travail uniquement), badges manuels (définitions/attribution/retrait justifiés, icônes sûres).
- Nouveaux endpoints : POST /api/public/profiles/[slug]/testimonials, GET/PATCH /api/admin/testimonials[/id] (action: approve|reject|archive|clear_contact), POST /api/public/nominations, GET /api/admin/nominations, PATCH /api/admin/nominations/[id] {action,note?}, GET/POST/PATCH /api/admin/badges, POST /api/admin/badges/[id]/assignments {personId,justification}, PATCH /api/admin/badges/assignments/[assignmentId] {justification}.
- Clé badges : activeAssignments. Champs témoignage public : nomPublic, contenu, relation?, contact?, declaration:true, siteWeb (honeypot).
---
Task ID: 6-a
Agent: Z.ai (orchestrateur — développement direct)
Task: Droits des personnes (§15.3), sitemap, sonde santé, sauvegardes/restauration + doc déploiement

Work Log:
- API publique POST /api/public/rights-requests : 6 types (ACCÈS, CORRECTION, UNPUBLISH, ERASE, CONSENT_WITHDRAWAL, REPORT_ERROR), honeypot silencieux, rate limit publicSubmissionRateLimit, déclaration obligatoire, rattachement au profil si slug publié valide sinon nom libre (jamais de révélation d'existence), audit RIGHTS_REQUEST_SUBMITTED (codes ajoutés à constants.ts).
- API admin GET /api/admin/rights-requests (compteurs, filtres, contact confidentiel) + PATCH [id] : start → decide (décision motivée ≥10 car.) → close ; action execute_unpublish (UNPUBLISH/ERASE/CONSENT_WITHDRAWAL) : dépublication transactionnelle immédiate (publication UNPUBLISHED + PUBLISHED→UNPUBLISHING, §8.5/§14 retrait simplifié) + audit PROFILE_UNPUBLISHED + RIGHTS_REQUEST_DECIDED.
- UI publique /demandes-droits (formulaire §15.3, slug pré-rempli depuis la fiche ?profil=) ; lien pied de fiche « Signaler ou demander une correction » pointe désormais dessus ; lien footer « Vos droits sur vos données ».
- UI admin /admin/droits (manager : filtres statut avec compteurs, workflow Prendre en charge → Enregistrer la décision (dialog motivé, exécution auto si retrait) → Clôturer) ; nav AdminShell « Droits des personnes » (icône Scale, gated MANAGE_DOSSIERS).
- SEO : src/app/sitemap.ts (7 pages statiques + profils publiés ≤500, fallback statique si base indisponible) ; GET /api/health (sonde {status:ok|degraded}, no-store, base vérifiée SELECT 1).
- Sauvegardes (§26.7 / MVP « sauvegardes et procédure de restauration ») : scripts/backup-db.sh (API .backup SQLite compatible WAL, gzip, SHA-256, rotation 14 j, repli python si sqlite3 absent), scripts/backup-uploads.sh (tar.gz + SHA-256, rotation 30 j), scripts/restore-db.sh (vérification empreinte, confirmation RESTAURER, PRAGMA integrity_check, sauvegarde pré-restauration locale) ; docs/DEPLOIEMENT-VPS.md (10 sections : prérequis non destructifs, arborescence persistante, utilisateur dédié, systemd durci MemoryMax/ProtectSystem, HTTPS selon proxy existant, crons + rapatriement chiffré + test mensuel de restauration, supervision, premier lancement, checklist, bascule PostgreSQL).
- Vérifications réelles : soumission publique ✓ (total 1) ; honeypot → 201 silencieux (total inchangé) ✓ ; workflow admin start→decide→close ✓ avec audit RIGHTS_REQUEST_SUBMITTED/STATUS_CHANGED/DECIDED ✓ ; chemin critique execute_unpublish sur profil publié réel → fiche 404 immédiatement ✓ ; /admin/droits rendu navigateur avec données réelles ✓ ; /demandes-droits rendu navigateur ✓ ; sitemap.xml 200 avec 7 loc statiques ✓ ; /api/health {"status":"ok"} ✓ ; exécution réelle backup → restore (integrity_check ok, données conservées, login/health/annuaire revalidés) ✓ ; syntaxe bash des 3 scripts vérifiée ✓.
- lint 0 erreur ; tsc propre ; dev.log sans erreur. Capture : tool-results/p6-droits-admin.png.

Stage Summary:
- Couverture MVP §24 complète côté application (21 fonctions obligatoires : site public, accueil, annuaire, profils, admin sécurisé, rôles, dossiers, invitations, formulaire multi-étapes, sauvegarde/reprise formulaire, médias, examen/clarification/publication, dépublication/archivage, propositions, témoignages, catégories, badges manuels, audit, pages légales, SEO de base, sauvegardes+restauration, tests de fonctionnement continus E2E).
- Reste extérieur au code : inspection du VPS LWS (phase 8 — jamais effectuée, client doit fournir les accès/relevés), domaine réel, PAT GitHub pour la poussée, service d'envoi d'e-mails (reporté — notifications hors MVP).
