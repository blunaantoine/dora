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
