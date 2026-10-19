import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { ChevronLeft, ChevronRight, FolderOpen, ShieldAlert } from "lucide-react";

import { db } from "@/lib/db";
import { getAdminSessionSafe } from "@/lib/auth-options";
import { hasPermission } from "@/lib/permissions";
import {
  DOSSIER_STATUSES,
  DOSSIER_STATUS_BADGE_CLASS,
  DOSSIER_STATUS_LABELS,
  type DossierStatus,
} from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { cn } from "@/lib/utils";

// Liste des dossiers — données réelles (PersonRecord), pagination 10/page.
// La création et l'examen des dossiers arrivent en phase 3 : cette liste est
// en lecture seule.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dossiers",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 10;

// Les liens du tableau de bord utilisent des statuts groupés par virgules.
function parseStatusParam(raw: string | undefined): DossierStatus[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is DossierStatus => (DOSSIER_STATUSES as readonly string[]).includes(s));
}

function formatFrDate(date: Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(date);
}

export default async function DossiersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const session = await getAdminSessionSafe();
  const role = session?.user.role;

  const canManage = hasPermission(role, "MANAGE_DOSSIERS");
  const canReview = hasPermission(role, "REVIEW_DOSSIERS");
  if (!canManage && !canReview) {
    return <AccessDenied role={role} />;
  }

  const params = await searchParams;
  const statuses = parseStatusParam(params.status);
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const where = statuses.length > 0 ? { status: { in: statuses } } : {};

  const total = await db.personRecord.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Une page demandée au-delà de la dernière retombe sur la dernière page.
  const safePage = Math.min(page, totalPages);

  const records = await db.personRecord.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    skip: (safePage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      // Nom de gestion : réservé à la gestion des dossiers (jamais envoyé
      // au client pour un rôle sans MANAGE_DOSSIERS).
      ...(canManage ? { managementName: true } : {}),
      publicName: true,
      status: true,
      isMinor: true,
      submittedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const displayStatuses = statuses.map((s) => DOSSIER_STATUS_LABELS[s]);

  return (
    <div>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
            Dossiers
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total.toLocaleString("fr-FR")} dossier{total > 1 ? "s" : ""} au total
            {displayStatuses.length > 0 ? <> — filtre : {displayStatuses.join(", ")}</> : null}
            {" · "}consultation seule ; la création et l&apos;examen arrivent dans une phase
            ultérieure.
          </p>
        </div>
        <Suspense fallback={null}>
          <StatusFilter current={params.status} />
        </Suspense>
      </header>

      {records.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-border bg-card/60 px-6 py-16 text-center">
          <FolderOpen aria-hidden="true" className="mx-auto size-10 text-muted-foreground/70" />
          <p className="mt-4 text-base font-medium text-foreground">
            {total === 0 && statuses.length === 0
              ? "Aucun dossier pour le moment."
              : "Aucun dossier ne correspond à ce filtre."}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {total === 0 && statuses.length === 0
              ? "Les dossiers seront créés par l'équipe lors de la phase d'identification et d'invitation."
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
                  <TableHead>{canManage ? "Nom de gestion" : "Nom public"}</TableHead>
                  <TableHead>Nom public</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Mineure</TableHead>
                  <TableHead>Soumis le</TableHead>
                  <TableHead>Mise à jour</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => (
                  <TableRow key={record.id} className="group hover:bg-muted/40">
                    <TableCell className="relative font-medium">
                      <Link
                        href={`/admin/dossiers/${record.id}`}
                        className="after:absolute after:inset-0 after:rounded-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        <span className="font-medium text-pine underline-offset-4 group-hover:underline">
                          {canManage ? record.managementName : record.publicName ?? "—"}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>{record.publicName ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>
                      <StatusBadge status={record.status} />
                    </TableCell>
                    <TableCell>{record.isMinor ? <MinorBadge /> : <span className="text-muted-foreground">Non</span>}</TableCell>
                    <TableCell>{formatFrDate(record.submittedAt)}</TableCell>
                    <TableCell>{formatFrDate(record.updatedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Cartes — mobile */}
          <ul className="mt-6 grid list-none gap-3 p-0 md:hidden">
            {records.map((record) => (
              <li key={record.id}>
                <Link
                  href={`/admin/dossiers/${record.id}`}
                  className="block rounded-xl border border-border bg-card p-4 shadow-xs transition-shadow hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-display text-base font-semibold text-foreground">
                        {canManage ? record.managementName : record.publicName ?? "—"}
                      </p>
                      {record.publicName && canManage ? (
                        <p className="truncate text-sm text-muted-foreground">{record.publicName}</p>
                      ) : null}
                    </div>
                    <StatusBadge status={record.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {record.isMinor ? <MinorBadge /> : null}
                    <span>Soumis : {formatFrDate(record.submittedAt)}</span>
                    <span>Mise à jour : {formatFrDate(record.updatedAt)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {totalPages > 1 ? (
            <Pagination
              page={safePage}
              totalPages={totalPages}
              buildHref={(p) => {
                const usp = new URLSearchParams();
                if (params.status) usp.set("status", params.status);
                if (p > 1) usp.set("page", String(p));
                const qs = usp.toString();
                return qs ? `/admin/dossiers?${qs}` : "/admin/dossiers";
              }}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

async function StatusFilter({ current }: { current?: string }) {
  return (
    <UrlSelect
      param="status"
      label="Filtrer par statut"
      allValue="__all__"
      allLabel="Tous les statuts"
      value={current ?? "__all__"}
      options={DOSSIER_STATUSES.map((status) => ({
        value: status,
        label: DOSSIER_STATUS_LABELS[status],
      }))}
    />
  );
}

function StatusBadge({ status }: { status: string }) {
  const label = DOSSIER_STATUS_LABELS[status as DossierStatus] ?? status;
  const badgeClass = DOSSIER_STATUS_BADGE_CLASS[status as DossierStatus];
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap", badgeClass)}>
      {label}
    </Badge>
  );
}

function MinorBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-gold/60 bg-gold/15 px-1.5 py-0.5 text-xs font-medium text-pine">
      <ShieldAlert aria-hidden="true" className="size-3" />
      Mineure
    </span>
  );
}

function Pagination({
  page,
  totalPages,
  buildHref,
}: {
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
}) {
  return (
    <nav aria-label="Pagination des dossiers" className="mt-6 flex items-center justify-between">
      {page > 1 ? (
        <Button asChild variant="outline" size="sm">
          <Link href={buildHref(page - 1)}>
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
        Page <span className="font-medium text-foreground">{page}</span> sur {totalPages}
      </p>
      {page < totalPages ? (
        <Button asChild variant="outline" size="sm">
          <Link href={buildHref(page + 1)}>
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
  );
}
