import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";

import { db } from "@/lib/db";
import { getAdminSessionSafe } from "@/lib/auth-options";
import { hasPermission } from "@/lib/permissions";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_LABELS,
  AUDIT_RESULTS,
  AUDIT_RESULT_LABELS,
  type AuditAction,
  type AuditResult,
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
import { cn } from "@/lib/utils";

// Journal d'audit — consultation seule (§5.6). Les métadonnées techniques
// (potentiellement sensibles) ne sont ni chargées ni affichées.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Journal",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 50;

const frDateTime = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "medium" });

function truncate(value: string | null, max = 14): string {
  if (!value) return "—";
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function parseParam(values: readonly string[], raw: string | undefined): string {
  return raw && (values as readonly string[]).includes(raw) ? raw : "";
}

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; result?: string; page?: string }>;
}) {
  const session = await getAdminSessionSafe();
  const role = session?.user.role;
  if (!hasPermission(role, "VIEW_AUDIT_LOG")) {
    return <AccessDenied role={role} />;
  }

  const params = await searchParams;
  const actionFilter = parseParam(AUDIT_ACTIONS, params.action);
  const resultFilter = parseParam(AUDIT_RESULTS, params.result);
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const where = {
    ...(actionFilter ? { action: actionFilter } : {}),
    ...(resultFilter ? { result: resultFilter } : {}),
  };

  const total = await db.auditLog.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Une page demandée au-delà de la dernière retombe sur la dernière page.
  const safePage = Math.min(page, totalPages);

  const entries = await db.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (safePage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    // metadata volontairement exclue de la sélection.
    select: {
      id: true,
      actorId: true,
      actorLabel: true,
      actor: { select: { displayName: true } },
      action: true,
      entityType: true,
      entityId: true,
      result: true,
      ip: true,
      createdAt: true,
    },
  });

  return (
    <div>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
            Journal
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total.toLocaleString("fr-FR")} entrée{total > 1 ? "s" : ""} journalisée
            {total > 1 ? "s" : ""} — ordre chronologique inverse, 50 par page. Les métadonnées
            techniques ne sont pas affichées.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Suspense fallback={null}>
            <UrlSelect
              param="action"
              label="Filtrer par action"
              allValue="__all__"
              allLabel="Toutes les actions"
              value={actionFilter || "__all__"}
              options={AUDIT_ACTIONS.map((a) => ({ value: a, label: AUDIT_ACTION_LABELS[a] }))}
              triggerClassName="w-[230px] bg-card"
            />
            <UrlSelect
              param="result"
              label="Filtrer par résultat"
              allValue="__all__"
              allLabel="Tous les résultats"
              value={resultFilter || "__all__"}
              options={AUDIT_RESULTS.map((r) => ({ value: r, label: AUDIT_RESULT_LABELS[r] }))}
              triggerClassName="w-[170px] bg-card"
            />
          </Suspense>
        </div>
      </header>

      {entries.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-border bg-card/60 px-6 py-16 text-center">
          <ScrollText aria-hidden="true" className="mx-auto size-10 text-muted-foreground/70" />
          <p className="mt-4 text-base font-medium text-foreground">
            {total === 0 && !actionFilter && !resultFilter
              ? "Aucune entrée dans le journal pour le moment."
              : "Aucune entrée ne correspond à ces filtres."}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {total === 0 && !actionFilter && !resultFilter
              ? "Les connexions, créations de comptes et mutations y seront consignées automatiquement."
              : "Modifiez les filtres d'action ou de résultat."}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
            <div className="overflow-x-auto">
              <Table className="min-w-[860px]">
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead>Date et heure</TableHead>
                    <TableHead>Acteur</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Cible</TableHead>
                    <TableHead>Résultat</TableHead>
                    <TableHead>IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id} className="hover:bg-muted/40">
                      <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                        {frDateTime.format(entry.createdAt)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {entry.actor?.displayName ?? entry.actorLabel ?? "—"}
                      </TableCell>
                      <TableCell>
                        {AUDIT_ACTION_LABELS[entry.action as AuditAction] ?? entry.action}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {entry.entityType}
                        <span className="ml-1.5 font-mono text-xs">{truncate(entry.entityId)}</span>
                      </TableCell>
                      <TableCell>
                        <ResultBadge result={entry.result} />
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {truncate(entry.ip, 20)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {totalPages > 1 ? (
            <nav
              aria-label="Pagination du journal"
              className="mt-6 flex items-center justify-between"
            >
              {safePage > 1 ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={buildHref(params, safePage - 1)}>
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
                  <Link href={buildHref(params, safePage + 1)}>
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

function buildHref(
  params: { action?: string; result?: string },
  page: number,
): string {
  const usp = new URLSearchParams();
  if (params.action) usp.set("action", params.action);
  if (params.result) usp.set("result", params.result);
  if (page > 1) usp.set("page", String(page));
  const qs = usp.toString();
  return qs ? `/admin/journal?${qs}` : "/admin/journal";
}

function ResultBadge({ result }: { result: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "whitespace-nowrap",
        result === "SUCCESS" && "border-emerald-300 bg-emerald-50 text-emerald-800",
        result === "DENIED" && "border-red-200 bg-red-50 text-red-800",
        result === "ERROR" && "border-red-300 bg-red-100 text-red-900",
      )}
    >
      {AUDIT_RESULT_LABELS[result as AuditResult] ?? result}
    </Badge>
  );
}
