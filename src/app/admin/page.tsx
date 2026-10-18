import { db } from "@/lib/db";
import { getAdminSessionSafe } from "@/lib/auth-options";
import { hasPermission } from "@/lib/permissions";
import { StatCard } from "@/components/admin/stat-card";

// Tableau de bord — indicateurs issus de requêtes Prisma RÉELLES en une seule
// passe (groupBy + counts parallèles). La base étant vide au lancement, des
// zéros réels sont attendus. revalidate = 0 : le tableau de bord est dynamique.
export const revalidate = 0;

const PREPARATION_STATUSES = ["INVITATION_CREATED", "INVITATION_SENT", "IN_PROGRESS"] as const;
const REVIEW_STATUSES = ["UNDER_REVIEW", "CLARIFICATION_REQUESTED"] as const;

export default async function AdminDashboardPage() {
  const session = await getAdminSessionSafe();
  const role = session?.user.role;

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [statusGroups, invitationsActives, temoignagesAModerer, propositionsAExaminer, demandesDeDroits, adminCount, auditCount] =
    await Promise.all([
      db.personRecord.groupBy({ by: ["status"], _count: true }),
      db.invitation.count({ where: { status: "ACTIVE", expiresAt: { gt: now } } }),
      db.testimonial.count({ where: { status: { in: ["PENDING", "REPORTED"] } } }),
      db.nomination.count({
        where: { status: { in: ["NEW", "TO_REVIEW", "TO_VERIFY", "POTENTIAL_DUPLICATE"] } },
      }),
      db.rightsRequest.count({ where: { status: { in: ["RECEIVED", "IN_PROGRESS"] } } }),
      hasPermission(role, "MANAGE_ADMINS")
        ? db.adminUser.count({ where: { isActive: true } })
        : Promise.resolve(null),
      hasPermission(role, "VIEW_AUDIT_LOG")
        ? db.auditLog.count({ where: { createdAt: { gte: thirtyDaysAgo } } })
        : Promise.resolve(null),
    ]);

  const countFor = (status: string): number =>
    statusGroups.find((group) => group.status === status)?._count ?? 0;

  const total = statusGroups.reduce((sum, group) => sum + group._count, 0);
  const enPreparation = PREPARATION_STATUSES.reduce((sum, s) => sum + countFor(s), 0);
  const enExamen = REVIEW_STATUSES.reduce((sum, s) => sum + countFor(s), 0);

  const dossiersHref = (statuses?: readonly string[]): string =>
    statuses && statuses.length > 0
      ? `/admin/dossiers?status=${statuses.join(",")}`
      : "/admin/dossiers";

  return (
    <div>
      <header>
        <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
          Tableau de bord
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Vue d&apos;ensemble réelle de l&apos;activité — les compteurs proviennent directement de
          la base de données.
        </p>
      </header>

      <section aria-labelledby="dossiers-titre" className="mt-8">
        <h2 id="dossiers-titre" className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Dossiers
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <StatCard
            label="Total dossiers"
            value={total}
            href={dossiersHref()}
            ariaLabel={`Total dossiers : ${total}. Ouvrir la liste des dossiers.`}
          />
          <StatCard label="Brouillons" value={countFor("DRAFT")} href={dossiersHref(["DRAFT"])} />
          <StatCard label="En préparation" value={enPreparation} href={dossiersHref(PREPARATION_STATUSES)} />
          <StatCard label="Soumis" value={countFor("SUBMITTED")} href={dossiersHref(["SUBMITTED"])} />
          <StatCard label="En examen" value={enExamen} href={dossiersHref(REVIEW_STATUSES)} />
          <StatCard label="Publiés" value={countFor("PUBLISHED")} href={dossiersHref(["PUBLISHED"])} />
          <StatCard label="Archivés" value={countFor("ARCHIVED")} href={dossiersHref(["ARCHIVED"])} />
          <StatCard
            label="Invitations actives"
            value={invitationsActives}
            hint="Création et envoi d'invitations : phase suivante"
          />
        </div>
      </section>

      <section aria-labelledby="communaute-titre" className="mt-10">
        <h2 id="communaute-titre" className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Communauté &amp; modération
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Témoignages à modérer"
            value={temoignagesAModerer}
            hint="Modération des témoignages : phase suivante"
          />
          <StatCard
            label="Propositions à examiner"
            value={propositionsAExaminer}
            hint="Propositions publiques : phase suivante"
          />
          <StatCard
            label="Demandes de droits"
            value={demandesDeDroits}
            hint="Traitement des demandes : phase suivante"
          />
        </div>
      </section>

      {(adminCount !== null || auditCount !== null) && (
        <section aria-labelledby="equipe-titre" className="mt-10">
          <h2 id="equipe-titre" className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Équipe &amp; traçabilité
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {adminCount !== null && (
              <StatCard
                label="Comptes équipe actifs"
                value={adminCount}
                href="/admin/utilisateurs"
                ariaLabel={`Comptes équipe actifs : ${adminCount}. Ouvrir la gestion des utilisateurs.`}
              />
            )}
            {auditCount !== null && (
              <StatCard
                label="Entrées de journal (30 derniers jours)"
                value={auditCount}
                href="/admin/journal"
                ariaLabel={`Entrées de journal sur 30 jours : ${auditCount}. Ouvrir le journal.`}
              />
            )}
          </div>
        </section>
      )}
    </div>
  );
}
