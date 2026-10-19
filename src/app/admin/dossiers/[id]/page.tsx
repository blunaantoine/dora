import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, CalendarDays, Eye, Lock, ShieldAlert } from "lucide-react";

import { db } from "@/lib/db";
import { getAdminSessionSafe } from "@/lib/auth-options";
import { hasPermission } from "@/lib/permissions";
import {
  AUDIT_ACTION_LABELS,
  AUDIT_RESULT_LABELS,
  DOSSIER_STATUS_BADGE_CLASS,
  DOSSIER_STATUS_LABELS,
  INITIATIVE_RESULT_TYPE_LABELS,
  INITIATIVE_PROJECT_STATE_LABELS,
  type AuditResult,
  type DossierStatus,
} from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AccessDenied } from "@/components/admin/access-denied";
import { DossierInvitationPanel } from "@/components/admin/dossier-invitation-panel";
import { DossierStatusActions } from "@/components/admin/dossier-status-actions";
import { DossierReviewPanel } from "@/components/admin/dossier-review-panel";
import { PublicationPanel } from "@/components/admin/publication-panel";
import { cn } from "@/lib/utils";

// Détail d'un dossier — consultation complète + actions de gestion (phase 4) :
// transitions de statut (machine à états), gestion de l'invitation, examen
// (démarrage, clarification, approbation, refus §8.1-8.3) et publication
// (pré-requis, champs approuvés, SEO, dépublication §8.4-8.5).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Détail du dossier",
  robots: { index: false, follow: false },
};

const frDateTime = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });
const frDate = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

export default async function DossierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAdminSessionSafe();
  const role = session?.user.role;

  const canManage = hasPermission(role, "MANAGE_DOSSIERS");
  const canReview = hasPermission(role, "REVIEW_DOSSIERS");
  const canPublish = hasPermission(role, "PUBLISH_PROFILES");
  if (!canManage && !canReview) {
    return <AccessDenied role={role} />;
  }

  const { id } = await params;

  const record = await db.personRecord.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      ...(canManage ? { managementName: true } : {}),
      publicName: true,
      shortPresentation: true,
      biography: true,
      birthYear: true,
      isMinor: true,
      country: true,
      region: true,
      city: true,
      languages: true,
      category: { select: { name: true } },
      // Récit
      storyJourney: true,
      engagementMotivation: true,
      keyEvent: true,
      difficultiesEncountered: true,
      lessonsLearned: true,
      inspirationSource: true,
      // Parcours
      education: true,
      professionalExperience: true,
      responsibilities: true,
      organizations: true,
      skills: true,
      distinctions: true,
      // Vision
      visionCommunity: true,
      futureGoals: true,
      projectsToDevelop: true,
      supportNeeded: true,
      messageToYouth: true,
      submittedAt: true,
      viewCount: true,
      createdAt: true,
      updatedAt: true,
      ...(canManage
        ? {
            privateData: {
              select: {
                legalName: true,
                phone: true,
                email: true,
                contactPreference: true,
                guardianName: true,
                guardianContact: true,
                guardianConsentAt: true,
                internalNotes: true,
              },
            },
          }
        : {}),
      initiatives: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          title: true,
          description: true,
          periodLabel: true,
          actionArea: true,
          beneficiaries: true,
          rolePlayed: true,
          partners: true,
          objectives: true,
          results: true,
          resultsType: true,
          evidence: true,
          difficulties: true,
          learnings: true,
          projectState: true,
        },
      },
      // Médias du dossier (hors supprimés) — liste blanche pour le panneau de
      // publication (bloc « Photo principale », autorisation visibility).
      media: {
        where: { status: { not: "DELETED" } },
        orderBy: { uploadedAt: "desc" },
        select: {
          id: true,
          kind: true,
          originalName: true,
          visibility: true,
          status: true,
          sizeBytes: true,
          width: true,
          height: true,
        },
      },
    },
  });

  if (!record) {
    notFound();
  }

  const history = await db.auditLog.findMany({
    where: { entityType: "PersonRecord", entityId: id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      action: true,
      result: true,
      createdAt: true,
      actorLabel: true,
      actor: { select: { displayName: true } },
    },
  });

  // Invitation la plus récente du dossier (une seule active au maximum).
  const invitation = canManage
    ? await db.invitation.findFirst({
        where: { personId: id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          expiresAt: true,
          usedAt: true,
          revokedAt: true,
          createdAt: true,
          accessCount: true,
          lastAccessAt: true,
        },
      })
    : null;

  const dossierName =
    (canManage && record.managementName) || record.publicName || "ce dossier";

  const statusLabel = DOSSIER_STATUS_LABELS[record.status as DossierStatus] ?? record.status;
  const statusClass = DOSSIER_STATUS_BADGE_CLASS[record.status as DossierStatus];

  return (
    <div className="mx-auto max-w-5xl">
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground hover:text-foreground">
        <Link href="/admin/dossiers">
          <ArrowLeft aria-hidden="true" />
          Retour à la liste des dossiers
        </Link>
      </Button>

      <header className="mt-4 rounded-xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
              {canManage && record.managementName ? record.managementName : record.publicName ?? "Dossier sans nom public"}
            </h1>
            {canManage && record.managementName && record.publicName ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Nom public : <span className="font-medium text-foreground">{record.publicName}</span>
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn("whitespace-nowrap", statusClass)}>
                {statusLabel}
              </Badge>
              {record.isMinor ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-gold/60 bg-gold/15 px-2 py-0.5 text-xs font-medium text-pine">
                  <ShieldAlert aria-hidden="true" className="size-3" />
                  Personne mineure — protection renforcée
                </span>
              ) : null}
              {record.category ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-pine px-2.5 py-0.5 text-xs font-medium text-[#F8F5EF]">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-gold" />
                  {record.category.name}
                </span>
              ) : null}
            </div>
          </div>
          <dl className="shrink-0 space-y-1 text-xs text-muted-foreground sm:text-right">
            <div className="flex items-center gap-1.5 sm:justify-end">
              <CalendarDays aria-hidden="true" className="size-3.5" />
              <span>Créé le {frDate.format(record.createdAt)}</span>
            </div>
            <div>Mise à jour : {frDateTime.format(record.updatedAt)}</div>
            {record.submittedAt ? <div>Soumis le {frDateTime.format(record.submittedAt)}</div> : null}
            <div className="flex items-center gap-1.5 sm:justify-end">
              <Eye aria-hidden="true" className="size-3.5" />
              <span>{record.viewCount.toLocaleString("fr-FR")} vue{record.viewCount > 1 ? "s" : ""}</span>
            </div>
          </dl>
        </div>
      </header>

      <p className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
        <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-pine" />
        Consultation complète : examen (précisions, approbation, refus) et publication (champs publics, SEO,
        dépublication) sont disponibles ci-dessous — toute action est journalisée.
      </p>

      {canManage ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section aria-label="Statut du dossier" className="rounded-xl border border-border bg-card p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold text-foreground">Statut du dossier</h2>
            <Separator className="my-4" />
            <DossierStatusActions dossierId={record.id} status={record.status} />
          </section>

          <section aria-label="Invitation du dossier" className="rounded-xl border border-border bg-card p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold text-foreground">Invitation</h2>
            <Separator className="my-4" />
            <DossierInvitationPanel
              dossierId={record.id}
              dossierName={dossierName}
              dossierStatus={record.status}
              invitation={
                invitation
                  ? {
                      id: invitation.id,
                      status: invitation.status,
                      expiresAt: invitation.expiresAt.toISOString(),
                      usedAt: invitation.usedAt ? invitation.usedAt.toISOString() : null,
                      revokedAt: invitation.revokedAt ? invitation.revokedAt.toISOString() : null,
                      createdAt: invitation.createdAt.toISOString(),
                      accessCount: invitation.accessCount,
                      lastAccessAt: invitation.lastAccessAt ? invitation.lastAccessAt.toISOString() : null,
                    }
                  : null
              }
            />
          </section>
        </div>
      ) : null}

      {/* Examen (§8.1-8.3) : actions contextuelles selon le statut + demandes de clarification */}
      {(canManage || canReview) &&
        (["SUBMITTED", "UNDER_REVIEW", "CLARIFICATION_REQUESTED", "CLARIFICATION_RECEIVED", "APPROVED", "REJECTED"] as string[]).includes(
          record.status,
        ) ? (
        <section aria-label="Examen du dossier" className="mt-6 rounded-xl border border-border bg-card p-5 sm:p-6">
          <h2 className="font-display text-lg font-semibold text-foreground">Examen du dossier</h2>
          <Separator className="my-4" />
          <DossierReviewPanel
            dossierId={record.id}
            status={record.status}
            isMinor={record.isMinor}
            internalNotes={canManage ? record.privateData?.internalNotes ?? null : null}
          />
        </section>
      ) : null}

      {/* Publication (§8.4-8.5) : réservée à la permission PUBLISH_PROFILES */}
      {canPublish ? (
        <section aria-label="Publication du profil" className="mt-6 rounded-xl border border-border bg-card p-5 sm:p-6">
          <h2 className="font-display text-lg font-semibold text-foreground">Publication</h2>
          <Separator className="my-4" />
          <PublicationPanel
            dossierId={record.id}
            status={record.status}
            isMinor={record.isMinor}
            publicName={record.publicName}
            mediaAssets={record.media}
          />
        </section>
      ) : null}

      <div className="mt-6 grid gap-6">
        {/* Identité */}
        <Section title="Identité et localisation">
          <FieldGrid>
            {canManage && record.managementName ? <Field label="Nom de gestion (privé)">{record.managementName}</Field> : null}
            <Field label="Nom public">{record.publicName}</Field>
            {record.birthYear ? <Field label="Année de naissance">{record.birthYear}</Field> : null}
            <Field label="Pays">{record.country}</Field>
            <Field label="Région">{record.region}</Field>
            <Field label="Ville">{record.city}</Field>
            <Field label="Langues">{record.languages}</Field>
          </FieldGrid>
          <TextField label="Présentation courte" value={record.shortPresentation} />
        </Section>

        {/* Récit personnel */}
        <Section title="Récit personnel">
          <TextField label="Biographie" value={record.biography} />
          <TextField label="Parcours d'engagement" value={record.storyJourney} />
          <TextField label="Motivation de l'engagement" value={record.engagementMotivation} />
          <TextField label="Événement déterminant" value={record.keyEvent} />
          <TextField label="Difficultés rencontrées" value={record.difficultiesEncountered} />
          <TextField label="Leçons apprises" value={record.lessonsLearned} />
          <TextField label="Source d'inspiration" value={record.inspirationSource} />
        </Section>

        {/* Parcours scolaire et professionnel */}
        <Section title="Parcours scolaire et professionnel">
          <TextField label="Éducation" value={record.education} />
          <TextField label="Expérience professionnelle" value={record.professionalExperience} />
          <TextField label="Responsabilités" value={record.responsibilities} />
          <TextField label="Organisations" value={record.organizations} />
          <TextField label="Compétences" value={record.skills} />
          <TextField label="Distinctions" value={record.distinctions} />
        </Section>

        {/* Vision et projets */}
        <Section title="Vision et projets futurs">
          <TextField label="Vision pour la communauté" value={record.visionCommunity} />
          <TextField label="Objectifs futurs" value={record.futureGoals} />
          <TextField label="Projets à développer" value={record.projectsToDevelop} />
          <TextField label="Soutien souhaité" value={record.supportNeeded} />
          <TextField label="Message à la jeunesse" value={record.messageToYouth} />
        </Section>

        {/* Initiatives */}
        <Section title={`Initiatives (${record.initiatives.length})`}>
          {record.initiatives.length === 0 ? (
            <EmptyHint>Aucune initiative renseignée pour le moment.</EmptyHint>
          ) : (
            <ul className="grid list-none gap-4 p-0">
              {record.initiatives.map((initiative, index) => (
                <li key={initiative.id} className="rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-display text-base font-semibold text-foreground">
                      {index + 1}. {initiative.title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {initiative.periodLabel ? (
                        <Badge variant="secondary">{initiative.periodLabel}</Badge>
                      ) : null}
                      {initiative.projectState ? (
                        <Badge variant="secondary">
                          {INITIATIVE_PROJECT_STATE_LABELS[initiative.projectState as keyof typeof INITIATIVE_PROJECT_STATE_LABELS] ??
                            initiative.projectState}
                        </Badge>
                      ) : null}
                      {initiative.resultsType ? (
                        <Badge variant="secondary">
                          {INITIATIVE_RESULT_TYPE_LABELS[initiative.resultsType as keyof typeof INITIATIVE_RESULT_TYPE_LABELS] ??
                            initiative.resultsType}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm">
                    <TextField inline label="Description" value={initiative.description} />
                    <TextField inline label="Domaine d'action" value={initiative.actionArea} />
                    <TextField inline label="Bénéficiaires" value={initiative.beneficiaries} />
                    <TextField inline label="Rôle joué" value={initiative.rolePlayed} />
                    <TextField inline label="Partenaires" value={initiative.partners} />
                    <TextField inline label="Objectifs" value={initiative.objectives} />
                    <TextField inline label="Résultats" value={initiative.results} />
                    <TextField inline label="Éléments de preuve" value={initiative.evidence} />
                    <TextField inline label="Difficultés" value={initiative.difficulties} />
                    <TextField inline label="Enseignements" value={initiative.learnings} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Données privées (rôle MANAGE_DOSSIERS uniquement) */}
        {canManage ? (
          <Section title="Données privées" restricted>
            {record.privateData ? (
              <>
                <FieldGrid>
                  <Field label="Nom légal">{record.privateData.legalName}</Field>
                  <Field label="Téléphone">{record.privateData.phone}</Field>
                  <Field label="E-mail">{record.privateData.email}</Field>
                  <Field label="Moyen de contact privilégié">{record.privateData.contactPreference}</Field>
                  <Field label="Représentant légal">{record.privateData.guardianName}</Field>
                  <Field label="Contact du représentant">{record.privateData.guardianContact}</Field>
                </FieldGrid>
                <TextField
                  label="Consentement du représentant légal"
                  value={
                    record.privateData.guardianConsentAt
                      ? frDateTime.format(record.privateData.guardianConsentAt)
                      : null
                  }
                />
                <TextField label="Notes internes" value={record.privateData.internalNotes} />
              </>
            ) : (
              <EmptyHint>Aucune donnée privée enregistrée pour ce dossier.</EmptyHint>
            )}
          </Section>
        ) : null}

        {/* Historique */}
        <Section title={`Historique (${history.length} dernières entrées)`}>
          {history.length === 0 ? (
            <EmptyHint>Aucun événement journalisé pour ce dossier.</EmptyHint>
          ) : (
            <ol className="grid list-none gap-2 p-0">
              {history.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm"
                >
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {frDateTime.format(entry.createdAt)}
                  </span>
                  <span className="font-medium text-foreground">
                    {AUDIT_ACTION_LABELS[entry.action as keyof typeof AUDIT_ACTION_LABELS] ?? entry.action}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      entry.result === "SUCCESS" && "border-emerald-300 bg-emerald-50 text-emerald-800",
                      entry.result === "DENIED" && "border-red-200 bg-red-50 text-red-800",
                      entry.result === "ERROR" && "border-red-300 bg-red-100 text-red-900",
                    )}
                  >
                    {AUDIT_RESULT_LABELS[entry.result as AuditResult] ?? entry.result}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {entry.actor?.displayName ?? entry.actorLabel ?? "—"}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  restricted,
  children,
}: {
  title: string;
  restricted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
        {restricted ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-gold/60 bg-gold/15 px-2 py-0.5 text-xs font-medium text-pine">
            <Lock aria-hidden="true" className="size-3" />
            Accès restreint
          </span>
        ) : null}
      </div>
      <Separator className="my-4" />
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">{children}</dl>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const value =
    typeof children === "string" || typeof children === "number" ? children : null;
  if (value === null || value === "" ) return null;
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

function TextField({
  label,
  value,
  inline,
}: {
  label: string;
  value: string | null | undefined;
  inline?: boolean;
}) {
  if (!value || value.trim() === "") return null;
  return (
    <div className={inline ? "min-w-0" : undefined}>
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 text-sm leading-relaxed whitespace-pre-line text-foreground">{value}</p>
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground italic">{children}</p>;
}
