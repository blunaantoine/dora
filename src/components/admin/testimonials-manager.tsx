"use client";

// ---------------------------------------------------------------------------
// Modération des témoignages (§9.2) — côté client.
//
//   • liste filtrable par statut + compteurs réels ;
//   • lecture complète (contenu, auteur, relation, coordonnées — administration
//     uniquement) ;
//   • actions : Approuver (AlertDialog), Refuser (Dialog, motif OBLIGATOIRE),
//     Archiver, Supprimer les coordonnées (vide authorContact en base + toast) ;
//   • toutes les décisions sont journalisées côté API (TESTIMONIAL_*).
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Check, Eraser, Loader2, RefreshCw, ShieldX } from "lucide-react";

import { getJson, patchJson } from "@/lib/client-api";
import {
  TESTIMONIAL_STATUSES,
  TESTIMONIAL_STATUS_LABELS,
  type TestimonialStatus,
} from "@/lib/constants";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const TESTIMONIAL_STATUS_BADGE_CLASS: Record<TestimonialStatus, string> = {
  PENDING: "bg-amber-50 text-amber-800 border-amber-200",
  IN_REVIEW: "bg-purple-100 text-purple-800 border-purple-200",
  APPROVED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  REJECTED: "bg-red-100 text-red-800 border-red-200",
  REPORTED: "bg-orange-100 text-orange-800 border-orange-200",
  ARCHIVED: "bg-stone-200 text-stone-600 border-stone-300",
};

interface TestimonialRow {
  id: string;
  person: {
    id: string;
    publicName: string | null;
    managementName: string;
    status: string;
    slug: string | null;
  };
  authorDisplayName: string;
  authorContact: string | null;
  relation: string | null;
  content: string;
  status: TestimonialStatus;
  moderatorNote: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  createdAt: string;
}

interface TestimonialListResponse {
  items: TestimonialRow[];
  total: number;
  statusCounts: Record<string, number>;
}

const frDateTime = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

export function TestimonialsManager() {
  const router = useRouter();
  const { toast } = useToast();

  const [data, setData] = useState<TestimonialListResponse | null>(null);
  const [filter, setFilter] = useState<string>("ALL");
  const [pending, setPending] = useState<string | null>(null);

  // Actions
  const [approveTarget, setApproveTarget] = useState<TestimonialRow | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<TestimonialRow | null>(null);
  const [clearContactTarget, setClearContactTarget] = useState<TestimonialRow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<TestimonialRow | null>(null);
  const [rejectMotif, setRejectMotif] = useState("");

  const load = useCallback(async () => {
    const url =
      filter === "ALL" ? "/api/admin/testimonials" : `/api/admin/testimonials?statut=${filter}`;
    const result = await getJson<TestimonialListResponse>(url);
    if (!result.ok) {
      setData({ items: [], total: 0, statusCounts: {} });
      toast({ variant: "destructive", title: "Lecture impossible", description: result.error.message });
      return;
    }
    setData(result.data);
  }, [filter, toast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function runAction(
    key: string,
    target: TestimonialRow,
    body: Record<string, unknown>,
    successTitle: string,
    successDescription: string,
  ) {
    setPending(key);
    const result = await patchJson<{ testimonial: { status: string } }>(
      `/api/admin/testimonials/${target.id}`,
      body,
    );
    setPending(null);
    if (!result.ok) {
      toast({ variant: "destructive", title: "Action impossible", description: result.error.message });
      return false;
    }
    toast({ title: successTitle, description: successDescription });
    await load();
    router.refresh(); // met à jour les compteurs de navigation
    return true;
  }

  async function handleApprove() {
    if (!approveTarget) return;
    const ok = await runAction(
      `approve-${approveTarget.id}`,
      approveTarget,
      { action: "approve" },
      "Témoignage approuvé",
      "Il est désormais visible sur la fiche publique.",
    );
    if (ok) setApproveTarget(null);
  }

  async function handleReject() {
    if (!rejectTarget) return;
    if (rejectMotif.trim().length === 0) {
      toast({ variant: "destructive", title: "Motif obligatoire", description: "Indiquez le motif du refus (trace de la décision, §9.2)." });
      return;
    }
    const ok = await runAction(
      `reject-${rejectTarget.id}`,
      rejectTarget,
      { action: "reject", motif: rejectMotif.trim() },
      "Témoignage refusé",
      "Il reste invisible sur la fiche publique ; le motif est conservé.",
    );
    if (ok) {
      setRejectTarget(null);
      setRejectMotif("");
    }
  }

  async function handleArchive() {
    if (!archiveTarget) return;
    const ok = await runAction(
      `archive-${archiveTarget.id}`,
      archiveTarget,
      { action: "archive" },
      "Témoignage archivé",
      "Il quitte la file de modération et reste invisible publiquement.",
    );
    if (ok) setArchiveTarget(null);
  }

  async function handleClearContact() {
    if (!clearContactTarget) return;
    const ok = await runAction(
      `clear-${clearContactTarget.id}`,
      clearContactTarget,
      { action: "clearContact" },
      "Coordonnées supprimées",
      "Le moyen de contact a été effacé de la base (trace conservée dans le journal).",
    );
    if (ok) setClearContactTarget(null);
  }

  if (data === null) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        Chargement des témoignages…
      </p>
    );
  }

  const items = data.items;
  const pendingCount = data.statusCounts["PENDING"] ?? 0;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {pendingCount > 0
            ? `${pendingCount} témoignage${pendingCount > 1 ? "s" : ""} en attente de modération.`
            : "Aucun témoignage en attente."}{" "}
          Seuls les témoignages approuvés sont visibles sur les fiches publiques.
        </p>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger aria-label="Filtrer par statut" className="w-[200px] bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tous les statuts</SelectItem>
              {TESTIMONIAL_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {TESTIMONIAL_STATUS_LABELS[status]} ({data.statusCounts[status] ?? 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-9 text-muted-foreground"
            onClick={() => void load()}
            disabled={pending !== null}
          >
            <RefreshCw aria-hidden="true" className="size-3.5" />
            Actualiser
          </Button>
        </div>
      </div>

      <ul className="grid list-none gap-4 p-0">
        {items.map((testimonial) => (
          <li key={testimonial.id} className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={TESTIMONIAL_STATUS_BADGE_CLASS[testimonial.status]}>
                {TESTIMONIAL_STATUS_LABELS[testimonial.status]}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Reçu le {frDateTime.format(new Date(testimonial.createdAt))}
              </span>
              {testimonial.authorContact ? (
                <Badge variant="outline" className="border-stone-200 bg-stone-100 text-stone-600">
                  Coordonnées enregistrées
                </Badge>
              ) : null}
            </div>

            <blockquote className="mt-3 border-l-2 border-gold/60 pl-3 text-sm leading-relaxed text-foreground/90">
              <p className="whitespace-pre-line">{testimonial.content}</p>
            </blockquote>

            <dl className="mt-3 grid gap-1 text-sm">
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-medium text-foreground">Auteur :</dt>
                <dd className="text-muted-foreground">{testimonial.authorDisplayName}</dd>
              </div>
              {testimonial.relation ? (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="font-medium text-foreground">Relation :</dt>
                  <dd className="text-muted-foreground">{testimonial.relation}</dd>
                </div>
              ) : null}
              {testimonial.authorContact ? (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="font-medium text-foreground">Coordonnées (privées) :</dt>
                  <dd className="break-all text-muted-foreground">{testimonial.authorContact}</dd>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-medium text-foreground">Profil concerné :</dt>
                <dd className="text-muted-foreground">
                  {testimonial.person.publicName ?? testimonial.person.managementName}
                  {testimonial.person.slug ? (
                    <>
                      {" · "}
                      <a
                        href={`/profils/${testimonial.person.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-gold underline-offset-4 hover:text-foreground"
                      >
                        voir la fiche
                      </a>
                    </>
                  ) : (
                    <> · fiche non publiée</>
                  )}
                </dd>
              </div>
              {testimonial.moderatorNote ? (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="font-medium text-foreground">Décision :</dt>
                  <dd className="text-muted-foreground">
                    {testimonial.moderatorNote}
                    {testimonial.decidedByName ? ` — ${testimonial.decidedByName}` : ""}
                  </dd>
                </div>
              ) : null}
            </dl>

            <div className="mt-4 flex flex-wrap gap-2">
              {testimonial.status !== "APPROVED" && testimonial.status !== "ARCHIVED" ? (
                <Button
                  type="button"
                  size="sm"
                  className="min-h-9"
                  onClick={() => setApproveTarget(testimonial)}
                  disabled={pending !== null}
                >
                  <Check aria-hidden="true" className="size-4" />
                  Approuver
                </Button>
              ) : null}
              {testimonial.status !== "REJECTED" && testimonial.status !== "ARCHIVED" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-9 text-red-700 hover:text-red-800"
                  onClick={() => {
                    setRejectTarget(testimonial);
                    setRejectMotif("");
                  }}
                  disabled={pending !== null}
                >
                  <ShieldX aria-hidden="true" className="size-4" />
                  Refuser
                </Button>
              ) : null}
              {testimonial.status !== "ARCHIVED" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-9"
                  onClick={() => setArchiveTarget(testimonial)}
                  disabled={pending !== null}
                >
                  <Archive aria-hidden="true" className="size-4" />
                  Archiver
                </Button>
              ) : null}
              {testimonial.authorContact ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-9 text-muted-foreground"
                  onClick={() => setClearContactTarget(testimonial)}
                  disabled={pending !== null}
                >
                  <Eraser aria-hidden="true" className="size-4" />
                  Supprimer les coordonnées
                </Button>
              ) : null}
            </div>
          </li>
        ))}
        {items.length === 0 ? (
          <li className="rounded-xl border border-dashed border-border bg-card/60 px-6 py-10 text-center text-sm text-muted-foreground">
            {filter === "ALL"
              ? "Aucun témoignage reçu pour le moment. Les propositions des visiteurs apparaîtront ici."
              : "Aucun témoignage avec ce statut."}
          </li>
        ) : null}
      </ul>

      {/* — AlertDialog : approbation — */}
      <AlertDialog open={approveTarget !== null} onOpenChange={(open) => { if (!open && pending === null) setApproveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approuver ce témoignage ?</AlertDialogTitle>
            <AlertDialogDescription>
              Une fois approuvé, il sera visible publiquement sur la fiche de{" "}
              {approveTarget?.person.publicName ?? approveTarget?.person.managementName} avec le nom
              « {approveTarget?.authorDisplayName} ». Vérifiez qu&apos;il respecte les règles :
              sincère, respectueux, sans propos injurieux ou discriminatoires (§9.2).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={pending !== null}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11"
              disabled={pending !== null}
              onClick={(event) => {
                event.preventDefault();
                void handleApprove();
              }}
            >
              {pending?.startsWith("approve-") ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
              Approuver
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* — Dialog : refus avec motif — */}
      <Dialog open={rejectTarget !== null} onOpenChange={(open) => { if (!open && pending === null) { setRejectTarget(null); setRejectMotif(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Refuser ce témoignage ?</DialogTitle>
            <DialogDescription>
              Le témoignage restera invisible publiquement. Le motif est conservé comme trace de la
              décision (§9.2) et n&apos;est jamais affiché au public.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="reject-motif">Motif du refus *</Label>
            <Textarea
              id="reject-motif"
              value={rejectMotif}
              onChange={(event) => setRejectMotif(event.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Ex. : propos non conformes aux règles de modération"
              disabled={pending !== null}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => { setRejectTarget(null); setRejectMotif(""); }} disabled={pending !== null}>
              Annuler
            </Button>
            <Button type="button" variant="destructive" className="min-h-11" onClick={() => void handleReject()} disabled={pending !== null || rejectMotif.trim().length === 0}>
              {pending?.startsWith("reject-") ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
              Confirmer le refus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* — AlertDialog : archivage — */}
      <AlertDialog open={archiveTarget !== null} onOpenChange={(open) => { if (!open && pending === null) setArchiveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archiver ce témoignage ?</AlertDialogTitle>
            <AlertDialogDescription>
              Il quitte la file de modération et n&apos;apparaîtra plus sur la fiche publique. Le
              contenu est conservé en base (aucune suppression).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={pending !== null}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11"
              disabled={pending !== null}
              onClick={(event) => {
                event.preventDefault();
                void handleArchive();
              }}
            >
              {pending?.startsWith("archive-") ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
              Archiver
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* — AlertDialog : suppression des coordonnées — */}
      <AlertDialog open={clearContactTarget !== null} onOpenChange={(open) => { if (!open && pending === null) setClearContactTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer les coordonnées de ce témoignage ?</AlertDialogHeader>
            <AlertDialogDescription>
              Le moyen de contact (« {clearContactTarget?.authorContact} ») sera définitivement
              effacé de la base. Le témoignage lui-même est conservé. L&apos;opération est tracée
              dans le journal d&apos;audit (§9.2, minimisation §15.2).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={pending !== null}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11"
              disabled={pending !== null}
              onClick={(event) => {
                event.preventDefault();
                void handleClearContact();
              }}
            >
              {pending?.startsWith("clear-") ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
              Supprimer les coordonnées
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
