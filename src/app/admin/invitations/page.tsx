import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { ChevronLeft, ChevronRight, MailOpen } from "lucide-react";

import { db } from "@/lib/db";
import { getAdminSessionSafe } from "@/lib/auth-options";
import { hasPermission } from "@/lib/permissions";
import {
  INVITATION_STATUSES,
  INVITATION_STATUS_BADGE_CLASS,
  INVITATION_STATUS_LABELS,
  type InvitationStatus,
} from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UrlSelect } from "@/components/admin/url-select";
import { AccessDenied } from "@/components/admin/access-denied";
import { CreateInvitationDialog, InvitationRowActions } from "@/components/admin/invitations-manager";
import { cn } from "@/lib/utils";

// Liste des invitations (§6) — données réelles, pagination 10/page.
// Le jeton (brut ou empreinte) n'apparaît JAMAIS dans cette liste : le lien
// n'est montré qu'une seule fois, à sa création.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Invitations",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 10;

const frDate = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });
const frDateTime = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

function formatFrDateValue(date: Date | null): string {
  if (!date) return "—";
  return frDate.format(date);
}

export default async function InvitationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const session = await getAdminSessionSafe();
  const role = session?.user.role;
  if (!hasPermission(role, "MANAGE_DOSSIERS")) {
    return <AccessDenied role={role} />;
  }

  const params = await searchParams;
  const status = (INVITATION_STATUSES as readonly string[]).includes(params.status ?? "")
    ? (params.status as InvitationStatus)
    : undefined;
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const where = status ? { status } : {};

  const [total, invitations] = await Promise.all([
    db.invitation.count({ where }),
    db.invitation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        status: true,
        expiresAt: true,
        usedAt: true,
        revokedAt: true,
        accessCount: true,
        lastAccessAt: true,
        createdAt: true,
        person: {
          select: {
            id: true,
            managementName: true,
            publicName: true,
            status: true,
            isMinor: true,
          },
        },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  return (
    <div>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
            Invitations
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total.toLocaleString("fr-FR")} invitation{total > 1 ? "s" : ""} au total. Chaque lien
            donne accès au formulaire privé d&apos;un dossier et n&apos;est affiché qu&apos;une
            seule fois, à sa création.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Suspense fallback={null}>
            <UrlSelect
              param="status"
              label="Filtrer par statut d'invitation"
              allValue="__all__"
              allLabel="Tous les statuts"
              value={status ?? "__all__"}
              options={INVITATION_STATUSES.map((value) => ({
                value,
                label: INVITATION_STATUS_LABELS[value],
              }))}
            />
          </Suspense>
          <CreateInvitationDialog />
        </div>
      </header>

      {invitations.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-border bg-card/60 px-6 py-16 text-center">
          <MailOpen aria-hidden="true" className="mx-auto size-10 text-muted-foreground/70" />
          <p className="mt-4 text-base font-medium text-foreground">
            {total === 0 && !status
              ? "Aucune invitation pour le moment."
              : "Aucune invitation ne correspond à ce filtre."}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {total === 0 && !status
              ? "Créez une invitation pour qu'une personne puisse remplir son formulaire via un lien privé."
              : "Modifiez le filtre de statut pour élargir la recherche."}
          </p>
        </div>
      ) : (
        <>
          {/* Tableau — desktop */}
          <div className="mt-8 hidden overflow-hidden rounded-xl border border-border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead>Dossier</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Créée le</TableHead>
                  <TableHead>Expire le</TableHead>
                  <TableHead>Accès</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((invitation) => (
                  <TableRow key={invitation.id} className="hover:bg-muted/40">
                    <TableCell>
                      <Link
                        href={`/admin/dossiers/${invitation.person.id}`}
                        className="font-medium text-pine underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        {invitation.person.managementName || invitation.person.publicName || "—"}
                      </Link>
                      {invitation.person.isMinor ? (
                        <span className="ml-2 inline-flex items-center rounded-md border border-gold/60 bg-gold/15 px-1.5 py-0.5 text-xs font-medium text-pine">
                          Mineure
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <InvitationStatusBadge status={invitation.status} />
                    </TableCell>
                    <TableCell>{formatFrDateValue(invitation.createdAt)}</TableCell>
                    <TableCell>
                      {formatFrDateValue(invitation.expiresAt)}
                      {invitation.usedAt ? (
                        <span className="block text-xs text-muted-foreground">
                          utilisée le {frDateTime.format(invitation.usedAt)}
                        </span>
                      ) : null}
                      {invitation.revokedAt ? (
                        <span className="block text-xs text-muted-foreground">
                          révoquée le {frDateTime.format(invitation.revokedAt)}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <span className="tabular-nums">{invitation.accessCount}</span>
                      {invitation.lastAccessAt ? (
                        <span className="block text-xs text-muted-foreground">
                          dernier : {frDateTime.format(invitation.lastAccessAt)}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <InvitationRowActions
                        invitationId={invitation.id}
                        status={invitation.status}
                        dossierName={
                          invitation.person.managementName || invitation.person.publicName || "du dossier"
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Cartes — mobile */}
          <ul className="mt-6 grid list-none gap-3 p-0 md:hidden">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="rounded-xl border border-border bg-card p-4 shadow-xs">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/dossiers/${invitation.person.id}`}
                      className="block truncate font-display text-base font-semibold text-pine underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      {invitation.person.managementName || invitation.person.publicName || "—"}
                    </Link>
                  </div>
                  <InvitationStatusBadge status={invitation.status} />
                </div>
                <dl className="mt-3 grid gap-1 text-xs text-muted-foreground">
                  <div>Créée le {formatFrDateValue(invitation.createdAt)}</div>
                  <div>Expire le {formatFrDateValue(invitation.expiresAt)}</div>
                  <div>
                    {invitation.accessCount} accès
                    {invitation.lastAccessAt ? ` (dernier : ${frDateTime.format(invitation.lastAccessAt)})` : ""}
                  </div>
                </dl>
                <div className="mt-3 border-t border-border/60 pt-3">
                  <InvitationRowActions
                    invitationId={invitation.id}
                    status={invitation.status}
                    dossierName={
                      invitation.person.managementName || invitation.person.publicName || "du dossier"
                    }
                  />
                </div>
              </li>
            ))}
          </ul>

          {totalPages > 1 ? (
            <nav aria-label="Pagination des invitations" className="mt-6 flex items-center justify-between">
              {safePage > 1 ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={buildPageHref(params.status, safePage - 1)}>
                    <ChevronLeft aria-hidden="true" />
                    Précédente
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled aria-disabled="true">
                  <ChevronLeft aria-hidden="true" />
                  Précédente
                </Button>
              )}
              <p className="text-sm text-muted-foreground">
                Page <span className="font-medium text-foreground">{safePage}</span> sur {totalPages}
              </p>
              {safePage < totalPages ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={buildPageHref(params.status, safePage + 1)}>
                    Suivante
                    <ChevronRight aria-hidden="true" />
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled aria-disabled="true">
                  Suivante
                  <ChevronRight aria-hidden="true" />
                </Button>
              )}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}

function buildPageHref(status: string | undefined, page: number): string {
  const usp = new URLSearchParams();
  if (status) usp.set("status", status);
  if (page > 1) usp.set("page", String(page));
  const qs = usp.toString();
  return qs ? `/admin/invitations?${qs}` : "/admin/invitations";
}

function InvitationStatusBadge({ status }: { status: string }) {
  const label = INVITATION_STATUS_LABELS[status as InvitationStatus] ?? status;
  const badgeClass = INVITATION_STATUS_BADGE_CLASS[status as InvitationStatus];
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap", badgeClass)}>
      {label}
    </Badge>
  );
}
