"use client";

// ---------------------------------------------------------------------------
// Gestion des propositions publiques (§11.2) — interface administration.
//
// Liste filtrable par statut avec compteurs, lecture du détail (y compris le
// contact du proposant — administration uniquement, jamais public), actions :
// à examiner, à vérifier, doublon, acceptée pour prise de contact (crée un
// dossier DRAFT pré-rempli — aucune publication, aucune invitation auto),
// refusée, archivée. Chaque action demande une note optionnelle et est
// confirmée lorsqu'elle est définitive.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Copy, ExternalLink, Loader2, Search } from "lucide-react";

import { getJson, patchJson } from "@/lib/client-api";
import {
  NOMINATION_STATUSES,
  NOMINATION_STATUS_LABELS,
  type NominationStatus,
} from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface NominationItem {
  id: string;
  nomineePublicName: string;
  presentation: string;
  reason: string;
  sourceUrl: string | null;
  proposerName: string | null;
  proposerContact: string | null;
  goodFaith: boolean;
  status: NominationStatus;
  adminNotes: string | null;
  decidedAt: string | null;
  createdAt: string;
  category: { id: string; name: string; slug: string } | null;
  duplicateOf: { id: string; publicName: string | null; managementName: string; status: string } | null;
  handledByName: string | null;
}

interface NominationsResponse {
  items: NominationItem[];
  total: number;
  page: number;
  pageSize: number;
  statusCounts: Record<string, number>;
}

type ActionKind = "to_review" | "to_verify" | "duplicate" | "accept" | "reject" | "archive";

const ACTION_LABELS: Record<ActionKind, string> = {
  to_review: "Marquer à examiner",
  to_verify: "Marquer à vérifier",
  duplicate: "Marquer doublon",
  accept: "Accepter pour prise de contact",
  reject: "Refuser",
  archive: "Archiver",
};

/** Actions définitives qui demandent une confirmation explicite. */
const CONFIRMED_ACTIONS: ActionKind[] = ["accept", "reject", "archive"];

const STATUS_BADGE_CLASS: Record<NominationStatus, string> = {
  NEW: "bg-amber-50 text-amber-800 border-amber-200",
  TO_REVIEW: "bg-yellow-100 text-yellow-800 border-yellow-200",
  POTENTIAL_DUPLICATE: "bg-rose-100 text-rose-800 border-rose-200",
  TO_VERIFY: "bg-purple-100 text-purple-800 border-purple-200",
  ACCEPTED_FOR_CONTACT: "bg-emerald-100 text-emerald-800 border-emerald-200",
  REJECTED: "bg-red-100 text-red-800 border-red-200",
  ARCHIVED: "bg-stone-200 text-stone-600 border-stone-300",
};

function formatDateFr(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export function PropositionsManager() {
  const [data, setData] = useState<NominationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statutFilter, setStatutFilter] = useState<string>("");
  const [pending, setPending] = useState<string | null>(null);

  /** Action en cours : {id, kind} avant confirmation, {id, kind, note} à l'exécution. */
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; kind: ActionKind; nominee: string } | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async (statut: string) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (statut) params.set("statut", statut);
    const result = await getJson<NominationsResponse>(`/api/admin/nominations?${params.toString()}`);
    if (result.ok) {
      setData(result.data);
    } else {
      setError(result.error.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load(statutFilter);
    }, 0);
    return () => clearTimeout(timer);
  }, [load, statutFilter]);

  async function runAction(id: string, kind: ActionKind, noteValue: string) {
    setPending(`${kind}-${id}`);
    const result = await patchJson<{ nomination: { status: NominationStatus }; createdPersonId: string | null }>(
      `/api/admin/nominations/${id}`,
      { action: kind, ...(noteValue.trim() ? { note: noteValue.trim().slice(0, 500) } : {}) },
    );
    setPending(null);
    setConfirmTarget(null);
    setNote("");
    if (result.ok) {
      toast.success(
        result.data.createdPersonId
          ? "Proposition acceptée : un dossier de travail (brouillon) a été créé. Aucune publication ni invitation automatique — la prise de contact reste manuelle."
          : "Proposition mise à jour.",
      );
      void load(statutFilter);
    } else {
      toast.error(result.error.message);
    }
  }

  function openAction(item: NominationItem, kind: ActionKind) {
    if (CONFIRMED_ACTIONS.includes(kind)) {
      setConfirmTarget({ id: item.id, kind, nominee: item.nomineePublicName });
      setNote(item.adminNotes ?? "");
      return;
    }
    void runAction(item.id, kind, "");
  }

  const counts = data?.statusCounts ?? {};

  return (
    <div className="grid gap-4">
      {/* Filtres par statut (compteurs réels) */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrer par statut">
        <Button
          variant={statutFilter === "" ? "default" : "outline"}
          className="min-h-9"
          onClick={() => setStatutFilter("")}
        >
          Toutes
        </Button>
        {NOMINATION_STATUSES.map((status) => (
          <Button
            key={status}
            variant={statutFilter === status ? "default" : "outline"}
            className="min-h-9"
            onClick={() => setStatutFilter(status)}
          >
            {NOMINATION_STATUS_LABELS[status]}
            {typeof counts[status] === "number" ? (
              <span className="ml-1.5 rounded-full bg-foreground/10 px-1.5 text-xs" aria-hidden="true">
                {counts[status]}
              </span>
            ) : null}
          </Button>
        ))}
      </div>

      {loading ? (
        <p className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="animate-spin" aria-hidden="true" /> Chargement des propositions…
        </p>
      ) : error ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : !data || data.items.length === 0 ? (
        <p className="rounded-lg border border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
          Aucune proposition pour ce filtre. Les propositions envoyées depuis la page
          « Proposer une personne » apparaîtront ici.
        </p>
      ) : (
        <ul className="grid list-none gap-4 p-0">
          {data.items.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-border bg-card p-4 sm:p-5"
              aria-label={`Proposition pour ${item.nomineePublicName}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={STATUS_BADGE_CLASS[item.status]}>
                    {NOMINATION_STATUS_LABELS[item.status]}
                  </Badge>
                  <span className="font-medium text-foreground">{item.nomineePublicName}</span>
                  {item.category ? (
                    <Badge variant="secondary" className="font-normal">
                      {item.category.name}
                    </Badge>
                  ) : null}
                  {item.duplicateOf ? (
                    <Badge variant="outline" className="border-rose-200 bg-rose-50 font-normal text-rose-800">
                      Doublon possible : {item.duplicateOf.managementName}
                    </Badge>
                  ) : null}
                </div>
                <time dateTime={item.createdAt} className="text-xs text-muted-foreground">
                  {formatDateFr(item.createdAt)}
                </time>
              </div>

              <dl className="mt-3 grid gap-2 text-sm">
                <div>
                  <dt className="font-medium text-foreground/80">Présentation de l&apos;action</dt>
                  <dd className="mt-0.5 whitespace-pre-line text-muted-foreground">{item.presentation}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground/80">Raison de la proposition</dt>
                  <dd className="mt-0.5 whitespace-pre-line text-muted-foreground">{item.reason}</dd>
                </div>
                {item.sourceUrl ? (
                  <div>
                    <dt className="font-medium text-foreground/80">Source publique</dt>
                    <dd className="mt-0.5">
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="inline-flex items-center gap-1 break-all text-primary underline underline-offset-4"
                      >
                        {item.sourceUrl}
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    </dd>
                  </div>
                ) : null}
                <div className="grid gap-2 rounded-lg border border-border/70 bg-muted/30 p-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Proposant (confidentiel)
                    </dt>
                    <dd className="mt-0.5 text-sm text-foreground/85">{item.proposerName ?? "Non communiqué"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Contact (confidentiel)
                    </dt>
                    <dd className="mt-0.5 flex items-center gap-1.5 text-sm text-foreground/85">
                      {item.proposerContact ?? "Non communiqué"}
                      {item.proposerContact ? (
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                          aria-label="Copier le contact du proposant"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(item.proposerContact ?? "");
                              toast.success("Contact copié.");
                            } catch {
                              toast.error("Copie impossible sur ce navigateur.");
                            }
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      ) : null}
                    </dd>
                  </div>
                </div>
                {item.adminNotes ? (
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Note interne</dt>
                    <dd className="mt-0.5 whitespace-pre-line text-sm text-foreground/85">{item.adminNotes}</dd>
                  </div>
                ) : null}
                {item.handledByName ? (
                  <dd className="text-xs text-muted-foreground">
                    Traité par {item.handledByName}
                    {item.decidedAt ? ` — décision le ${formatDateFr(item.decidedAt)}` : ""}
                  </dd>
                ) : null}
              </dl>

              {item.status !== "REJECTED" && item.status !== "ARCHIVED" ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {item.status !== "TO_REVIEW" ? (
                    <Button variant="outline" className="min-h-9" disabled={pending !== null} onClick={() => openAction(item, "to_review")}>
                      {ACTION_LABELS.to_review}
                    </Button>
                  ) : null}
                  {item.status !== "TO_VERIFY" ? (
                    <Button variant="outline" className="min-h-9" disabled={pending !== null} onClick={() => openAction(item, "to_verify")}>
                      {ACTION_LABELS.to_verify}
                    </Button>
                  ) : null}
                  {item.status !== "POTENTIAL_DUPLICATE" ? (
                    <Button variant="outline" className="min-h-9" disabled={pending !== null} onClick={() => openAction(item, "duplicate")}>
                      {ACTION_LABELS.duplicate}
                    </Button>
                  ) : null}
                  {item.status !== "ACCEPTED_FOR_CONTACT" ? (
                    <Button className="min-h-9" disabled={pending !== null} onClick={() => openAction(item, "accept")}>
                      <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                      {ACTION_LABELS.accept}
                    </Button>
                  ) : null}
                  <Button variant="destructive" className="min-h-9" disabled={pending !== null} onClick={() => openAction(item, "reject")}>
                    {ACTION_LABELS.reject}
                  </Button>
                  <Button variant="ghost" className="min-h-9" disabled={pending !== null} onClick={() => openAction(item, "archive")}>
                    {ACTION_LABELS.archive}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {/* Dialog de confirmation pour les actions définitives */}
      <Dialog open={confirmTarget !== null} onOpenChange={(open) => { if (!open && pending === null) setConfirmTarget(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {confirmTarget ? `${ACTION_LABELS[confirmTarget.kind]} — ${confirmTarget.nominee}` : ""}
            </DialogTitle>
            <DialogDescription>
              {confirmTarget?.kind === "accept"
                ? "Un dossier de travail (brouillon, non publié) sera créé pour préparer la prise de contact. L'acceptation ne publie rien et n'envoie aucune invitation : l'équipe vérifie l'identité et les conditions avant toute invitation (§11.2)."
                : confirmTarget?.kind === "reject"
                  ? "La proposition sera marquée refusée et quittera la file de traitement. Cette action est définitive (le journal d'audit conserve la trace)."
                  : "La proposition sera archivée et quittera la file de traitement. Cette action est réversible uniquement par l'équipe technique."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="nomination-note">Note interne (facultative, 500 caractères max.)</Label>
            <Textarea
              id="nomination-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              rows={3}
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" className="min-h-11" disabled={pending !== null} onClick={() => setConfirmTarget(null)}>
              Annuler
            </Button>
            <Button
              className="min-h-11"
              variant={confirmTarget?.kind === "reject" ? "destructive" : "default"}
              disabled={pending !== null}
              onClick={() => {
                if (confirmTarget) void runAction(confirmTarget.id, confirmTarget.kind, note);
              }}
            >
              {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sélecteur de recherche décoratif évité : aucune fausse fonction —
          la recherche se fait via le filtre statut ci-dessus (données réelles). */}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-hidden="true">
        <Search className="h-3.5 w-3.5" />
        Les compteurs reflètent la base à chaque chargement.
      </p>
    </div>
  );
}
