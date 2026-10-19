"use client";

// ---------------------------------------------------------------------------
// Suivi des demandes de droits (§15.3) — interface administration.
//
// « Les demandes doivent être enregistrées, suivies et clôturées avec une
// trace de décision. » File : Reçue → En cours → Décision prise → Clôturée.
// Le retrait de publication peut être exécuté immédiatement (dépublication
// rapide §8.5) lors de la décision, avec justification obligatoire.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { getJson, patchJson } from "@/lib/client-api";
import {
  RIGHTS_REQUEST_STATUSES,
  RIGHTS_REQUEST_STATUS_LABELS,
  RIGHTS_REQUEST_TYPE_LABELS,
  type RightsRequestStatus,
  type RightsRequestType,
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast as sonnerToast } from "sonner";

interface RightsRequestItem {
  id: string;
  type: RightsRequestType;
  requesterName: string;
  requesterContact: string | null;
  description: string;
  status: RightsRequestStatus;
  decision: string | null;
  decidedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  person: { id: string; nom: string; status: string; isMinor: boolean } | null;
  decidedByName: string | null;
}

interface RightsRequestsResponse {
  items: RightsRequestItem[];
  total: number;
  page: number;
  pageSize: number;
  statusCounts: Record<string, number>;
}

const STATUS_BADGE_CLASS: Record<RightsRequestStatus, string> = {
  RECEIVED: "bg-amber-50 text-amber-800 border-amber-200",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800 border-yellow-200",
  DECIDED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  CLOSED: "bg-stone-200 text-stone-600 border-stone-300",
};

function formatDateFr(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export function RightsRequestsManager() {
  const [data, setData] = useState<RightsRequestsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statutFilter, setStatutFilter] = useState<string>("");
  const [pending, setPending] = useState<string | null>(null);

  const [decideTarget, setDecideTarget] = useState<RightsRequestItem | null>(null);
  const [decisionText, setDecisionText] = useState("");
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const load = useCallback(async (statut: string) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (statut) params.set("statut", statut);
    const result = await getJson<RightsRequestsResponse>(`/api/admin/rights-requests?${params.toString()}`);
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

  async function startRequest(item: RightsRequestItem) {
    setPending(`start-${item.id}`);
    const result = await patchJson<{ request: { status: RightsRequestStatus } }>(
      `/api/admin/rights-requests/${item.id}`,
      { action: "start" },
    );
    setPending(null);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success("Demande prise en charge.");
    void load(statutFilter);
  }

  function openDecide(item: RightsRequestItem) {
    setDecideTarget(item);
    setDecisionText("");
    setDecisionError(null);
  }

  async function submitDecide() {
    if (!decideTarget) return;
    setDecisionError(null);
    setPending("decide");
    const execute = ["UNPUBLISH", "CONSENT_WITHDRAWAL", "ERASE"].includes(decideTarget.type);
    const result = await patchJson<{ request: { status: RightsRequestStatus }; message: string }>(
      `/api/admin/rights-requests/${decideTarget.id}`,
      { action: execute ? "execute_unpublish" : "decide", decision: decisionText.trim() },
    );
    setPending(null);
    if (!result.ok) {
      setDecisionError(result.error.message);
      return;
    }
    sonnerToast.success(result.data.message);
    setDecideTarget(null);
    void load(statutFilter);
  }

  async function closeRequest(item: RightsRequestItem) {
    setPending(`close-${item.id}`);
    const result = await patchJson<{ request: { status: RightsRequestStatus } }>(
      `/api/admin/rights-requests/${item.id}`,
      { action: "close" },
    );
    setPending(null);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success("Demande clôturée (trace conservée).");
    void load(statutFilter);
  }

  const counts = data?.statusCounts ?? {};

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrer par statut">
        <Button variant={statutFilter === "" ? "default" : "outline"} className="min-h-9" onClick={() => setStatutFilter("")}>
          Toutes
        </Button>
        {RIGHTS_REQUEST_STATUSES.map((status) => (
          <Button
            key={status}
            variant={statutFilter === status ? "default" : "outline"}
            className="min-h-9"
            onClick={() => setStatutFilter(status)}
          >
            {RIGHTS_REQUEST_STATUS_LABELS[status]}
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
          <Loader2 className="animate-spin" aria-hidden="true" /> Chargement des demandes…
        </p>
      ) : error ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : !data || data.items.length === 0 ? (
        <p className="rounded-lg border border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
          Aucune demande de droits pour ce filtre. Les demandes envoyées depuis la page
          « Vos droits sur vos données » apparaîtront ici.
        </p>
      ) : (
        <ul className="grid list-none gap-4 p-0">
          {data.items.map((item) => (
            <li key={item.id} className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={STATUS_BADGE_CLASS[item.status]}>
                    {RIGHTS_REQUEST_STATUS_LABELS[item.status]}
                  </Badge>
                  <Badge variant="secondary" className="font-normal">
                    {RIGHTS_REQUEST_TYPE_LABELS[item.type]}
                  </Badge>
                  {item.person ? (
                    <Badge variant="outline" className="font-normal">
                      {item.person.nom}
                      {item.person.isMinor ? " (mineure)" : ""}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-dashed font-normal">
                      Fiche non identifiée
                    </Badge>
                  )}
                </div>
                <time dateTime={item.createdAt} className="text-xs text-muted-foreground">
                  {formatDateFr(item.createdAt)}
                </time>
              </div>

              <div className="mt-3 grid gap-2 text-sm">
                <p className="whitespace-pre-line text-muted-foreground">{item.description}</p>
                <div className="grid gap-2 rounded-lg border border-border/70 bg-muted/30 p-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Demandeur</p>
                    <p className="mt-0.5 text-sm text-foreground/85">{item.requesterName}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contact (confidentiel)</p>
                    <p className="mt-0.5 text-sm text-foreground/85">{item.requesterContact ?? "Non communiqué"}</p>
                  </div>
                </div>
                {item.decision ? (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Décision</p>
                    <p className="mt-0.5 whitespace-pre-line text-sm text-foreground/85">{item.decision}</p>
                    {item.decidedByName ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Par {item.decidedByName}
                        {item.decidedAt ? ` — ${formatDateFr(item.decidedAt)}` : ""}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {item.status === "RECEIVED" ? (
                  <Button variant="outline" className="min-h-9" disabled={pending !== null} onClick={() => void startRequest(item)}>
                    Prendre en charge
                  </Button>
                ) : null}
                {item.status === "IN_PROGRESS" ? (
                  <Button className="min-h-9" disabled={pending !== null} onClick={() => openDecide(item)}>
                    Enregistrer la décision
                  </Button>
                ) : null}
                {item.status === "DECIDED" ? (
                  <Button variant="outline" className="min-h-9" disabled={pending !== null} onClick={() => void closeRequest(item)}>
                    Clôturer
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Dialog décision motivée */}
      <Dialog open={decideTarget !== null} onOpenChange={(open) => { if (!open && pending === null) setDecideTarget(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {decideTarget ? `Décision — ${RIGHTS_REQUEST_TYPE_LABELS[decideTarget.type]}` : ""}
            </DialogTitle>
            <DialogDescription>
              {decideTarget && ["UNPUBLISH", "CONSENT_WITHDRAWAL", "ERASE"].includes(decideTarget.type) && decideTarget.person ? (
                <>
                  La décision exécutera immédiatement la <strong>dépublication</strong> du profil
                  rattaché (retrait simplifié garanti pour les mineures). Décrivez la décision et
                  le suivi prévu (effacement des données, contact de la personne…). La trace est
                  conservée dans le journal d&apos;audit.
                </>
              ) : (
                "Décrivez la décision prise et la réponse apportée à la personne. La trace est conservée dans le journal d'audit."
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="rights-decision">Décision motivée (10 à 2000 caractères)</Label>
            <Textarea
              id="rights-decision"
              value={decisionText}
              onChange={(event) => setDecisionText(event.target.value)}
              maxLength={2000}
              rows={4}
              className="resize-none"
            />
          </div>
          {decisionError ? (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {decisionError}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" className="min-h-11" disabled={pending !== null} onClick={() => setDecideTarget(null)}>
              Annuler
            </Button>
            <Button
              className="min-h-11"
              disabled={pending !== null || decisionText.trim().length < 10}
              onClick={() => void submitDecide()}
            >
              {pending === "decide" ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Enregistrer la décision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
