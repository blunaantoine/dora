"use client";

// ---------------------------------------------------------------------------
// Panneau d'examen d'un dossier (§8.1-8.3) — côté client.
//
// Selon le statut :
//   • SUBMITTED                 → bouton « Commencer l'examen » (UNDER_REVIEW) ;
//   • UNDER_REVIEW              → « Demander des précisions » (Dialog),
//                                 « Approuver » (AlertDialog),
//                                 « Refuser » (Dialog, motif interne
//                                 obligatoire + note respectueuse optionnelle) ;
//   • CLARIFICATION_REQUESTED   → liste des demandes + « Réponse reçue »
//                                 (transition CLARIFICATION_RECEIVED) ;
//   • CLARIFICATION_RECEIVED    → rappel : reprendre l'examen pour décider ;
//   • APPROVED / REJECTED       → récapitulatif de la décision.
//
// Toutes les actions passent par les API admin (réponses normalisées), le
// serveur revalide la machine à états et journalise. Les libellés des champs
// viennent de la liste blanche public-fields.ts (§4.4).
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, MessageCircleQuestion, RefreshCw } from "lucide-react";

import {
  DOSSIER_STATUS_LABELS,
  type DossierStatus,
} from "@/lib/constants";
import { PUBLIC_FIELDS, PUBLIC_FIELD_LABELS, type PublicField } from "@/lib/public-fields";
import { getJson, patchJson, postJson } from "@/lib/client-api";
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
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface ClarificationItem {
  id: string;
  fieldsConcerned: string[];
  questions: string;
  message: string;
  dueDateHint: string | null;
  status: string;
  createdAt: string;
  answeredAt: string | null;
  askedByName: string | null;
}

const frDateTime = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

export function DossierReviewPanel({
  dossierId,
  status,
  isMinor,
  internalNotes,
}: {
  dossierId: string;
  status: string;
  isMinor: boolean;
  internalNotes: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [clarifyOpen, setClarifyOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);

  // Formulaire « Demander des précisions »
  const [concerned, setConcerned] = useState<PublicField[]>([]);
  const [questions, setQuestions] = useState("");
  const [explainMessage, setExplainMessage] = useState("");
  const [dueDateHint, setDueDateHint] = useState("");

  // Formulaire « Refuser »
  const [rejectReason, setRejectReason] = useState("");
  const [rejectNote, setRejectNote] = useState("");

  // Historique des demandes de clarification
  const [clarifications, setClarifications] = useState<ClarificationItem[] | null>(null);
  const [answerTarget, setAnswerTarget] = useState<ClarificationItem | null>(null);

  const current = status as DossierStatus;
  const isReviewer = current === "SUBMITTED" || current === "UNDER_REVIEW" || current === "CLARIFICATION_REQUESTED" || current === "CLARIFICATION_RECEIVED";

  const loadClarifications = useCallback(async () => {
    const result = await getJson<{ clarifications: ClarificationItem[] }>(
      `/api/admin/dossiers/${dossierId}/clarifications`,
    );
    if (result.ok) {
      setClarifications(result.data.clarifications);
    } else {
      setClarifications([]);
    }
  }, [dossierId]);

  useEffect(() => {
    if (!isReviewer) return;
    // Chargement différé d'un tick : évite un setState synchrone dans l'effet.
    const timer = setTimeout(() => { void loadClarifications(); }, 0);
    return () => clearTimeout(timer);
  }, [isReviewer, loadClarifications]);

  function toggleConcerned(field: PublicField) {
    setConcerned((prev) => (prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]));
  }

  async function runStatusTransition(target: DossierStatus, actionKey: string) {
    if (pendingAction) return;
    setPendingAction(actionKey);
    const result = await patchJson<{ dossier: { status: string } }>(`/api/admin/dossiers/${dossierId}`, {
      status: target,
    });
    setPendingAction(null);
    if (!result.ok) {
      toast({ variant: "destructive", title: "Action refusée", description: result.error.message });
      return;
    }
    toast({
      title: "Statut mis à jour",
      description: `Le dossier est désormais « ${DOSSIER_STATUS_LABELS[result.data.dossier.status as DossierStatus] ?? result.data.dossier.status} ». L'action est journalisée.`,
    });
    router.refresh();
  }

  async function handleSubmitClarification() {
    if (pendingAction) return;
    if (concerned.length === 0) {
      toast({ variant: "destructive", title: "Champs concernés manquants", description: "Sélectionnez au moins un champ concerné." });
      return;
    }
    if (questions.trim().length < 5) {
      toast({ variant: "destructive", title: "Questions manquantes", description: "Précisez les questions à clarifier." });
      return;
    }
    if (explainMessage.trim().length < 5) {
      toast({ variant: "destructive", title: "Message manquant", description: "Rédigez un message explicatif respectueux." });
      return;
    }
    setPendingAction("clarify");
    const result = await postJson<{ dossierStatus: string }>(`/api/admin/dossiers/${dossierId}/clarifications`, {
      fieldsConcerned: concerned,
      questions: questions.trim(),
      message: explainMessage.trim(),
      ...(dueDateHint.trim() !== "" ? { dueDateHint: dueDateHint.trim() } : {}),
    });
    setPendingAction(null);
    if (!result.ok) {
      toast({ variant: "destructive", title: "Demande non envoyée", description: result.error.message });
      return;
    }
    setClarifyOpen(false);
    setConcerned([]);
    setQuestions("");
    setExplainMessage("");
    setDueDateHint("");
    toast({
      title: "Demande de précisions envoyée",
      description: "Le dossier est passé à « Informations complémentaires demandées ». La demande est journalisée.",
    });
    void loadClarifications();
    router.refresh();
  }

  async function handleSubmitRejection() {
    if (pendingAction) return;
    if (rejectReason.trim().length < 5) {
      toast({ variant: "destructive", title: "Motif interne obligatoire", description: "Décrivez le motif interne du refus (5 caractères au moins)." });
      return;
    }
    setPendingAction("reject");
    const stamped = `[Refus — ${frDateTime.format(new Date())}]\nMotif interne : ${rejectReason.trim()}${
      rejectNote.trim() !== "" ? `\nNote explicative (communiquée dans un langage respectueux) : ${rejectNote.trim()}` : ""
    }`;
    const updatedNotes = internalNotes ? `${internalNotes}\n\n${stamped}` : stamped;
    const result = await patchJson<{ dossier: { status: string } }>(`/api/admin/dossiers/${dossierId}`, {
      status: "REJECTED",
      privateData: { internalNotes: updatedNotes },
    });
    setPendingAction(null);
    if (!result.ok) {
      toast({ variant: "destructive", title: "Refus impossible", description: result.error.message });
      return;
    }
    setRejectOpen(false);
    setRejectReason("");
    setRejectNote("");
    toast({
      title: "Dossier refusé",
      description: "Le motif interne est enregistré dans les données privées. Un dossier refusé n'est jamais publié.",
    });
    router.refresh();
  }

  async function handleMarkAnswered(item: ClarificationItem) {
    if (pendingAction) return;
    setPendingAction(`answer-${item.id}`);
    const result = await patchJson<{ dossierStatus: string }>(`/api/admin/clarifications/${item.id}`, {
      markAnswered: true,
    });
    setPendingAction(null);
    setAnswerTarget(null);
    if (!result.ok) {
      toast({ variant: "destructive", title: "Action refusée", description: result.error.message });
      return;
    }
    toast({
      title: "Réponse enregistrée",
      description:
        result.data.dossierStatus === "CLARIFICATION_RECEIVED"
          ? "Le dossier est passé à « Complément reçu ». Reprenez l'examen pour statuer."
          : "La demande est marquée comme répondue.",
    });
    void loadClarifications();
    router.refresh();
  }

  return (
    <div className="grid gap-4">
      {/* — Actions contextuelles selon le statut — */}
      {current === "SUBMITTED" ? (
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            Le dossier est soumis. Commencez l&apos;examen : cohérence du parcours, qualité des informations,
            autorisations de publication et risques de confidentialité (§8.1).
          </p>
          <Button
            type="button"
            className="min-h-11 w-fit"
            onClick={() => void runStatusTransition("UNDER_REVIEW", "start-review")}
            disabled={pendingAction !== null}
          >
            {pendingAction === "start-review" ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            Commencer l&apos;examen
          </Button>
        </div>
      ) : null}

      {current === "UNDER_REVIEW" ? (
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            Examen en cours. Vous pouvez demander des précisions à la participante, approuver le dossier ou le
            refuser avec un motif interne.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setClarifyOpen(true)} disabled={pendingAction !== null}>
              <MessageCircleQuestion aria-hidden="true" className="size-4" />
              Demander des précisions
            </Button>
            <Button type="button" className="min-h-11" onClick={() => setApproveOpen(true)} disabled={pendingAction !== null}>
              <CheckCircle2 aria-hidden="true" className="size-4" />
              Approuver
            </Button>
            <Button type="button" variant="destructive" className="min-h-11" onClick={() => setRejectOpen(true)} disabled={pendingAction !== null}>
              Refuser
            </Button>
          </div>
        </div>
      ) : null}

      {current === "CLARIFICATION_REQUESTED" ? (
        <p className="text-sm text-muted-foreground">
          Une demande de précisions a été envoyée. Dès que la participante a répondu (via son formulaire), marquez
          la réponse comme reçue : le dossier passera à « Complément reçu ».
        </p>
      ) : null}

      {current === "CLARIFICATION_RECEIVED" ? (
        <p className="text-sm text-muted-foreground">
          Complément reçu : reprenez l&apos;examen du dossier (bouton « En cours d&apos;examen » dans le panneau
          Statut) puis approuvez-le ou demandez à nouveau des précisions.
        </p>
      ) : null}

      {current === "APPROVED" ? (
        <p className="text-sm text-muted-foreground">
          Dossier approuvé : il peut être publié (panneau « Publication ») ou replacé en examen si un complément
          s&apos;impose.
        </p>
      ) : null}

      {current === "REJECTED" ? (
        <p className="text-sm text-muted-foreground">
          Dossier refusé : le motif interne est conservé dans les données privées. Un dossier refusé n&apos;est
          jamais publié ni affiché dans l&apos;annuaire.
        </p>
      ) : null}

      {/* — Liste des demandes de clarification — */}
      {isReviewer && clarifications !== null && clarifications.length > 0 ? (
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Demandes de clarification ({clarifications.length})</h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-9 text-muted-foreground"
              onClick={() => void loadClarifications()}
            >
              <RefreshCw aria-hidden="true" className="size-3.5" />
              Actualiser
            </Button>
          </div>
          <ul className="grid max-h-64 list-none gap-2 overflow-y-auto p-0 pr-1 [scrollbar-width:thin]">
            {clarifications.map((item) => (
              <li key={item.id} className="rounded-lg border border-border bg-background px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={item.status === "ANSWERED" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}>
                    {item.status === "ANSWERED" ? "Répondue" : "En attente"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{frDateTime.format(new Date(item.createdAt))}</span>
                  {item.askedByName ? <span className="text-xs text-muted-foreground">par {item.askedByName}</span> : null}
                </div>
                {item.fieldsConcerned.length > 0 ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Champs concernés :{" "}
                    {item.fieldsConcerned
                      .map((field) => PUBLIC_FIELD_LABELS[field as PublicField] ?? field)
                      .join(", ")}
                  </p>
                ) : null}
                <p className="mt-1.5 whitespace-pre-line text-foreground">{item.questions}</p>
                {item.dueDateHint ? (
                  <p className="mt-1 text-xs text-muted-foreground">Réponse souhaitée (indicative) : {item.dueDateHint}</p>
                ) : null}
                {item.status !== "ANSWERED" && current === "CLARIFICATION_REQUESTED" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2 min-h-9"
                    onClick={() => setAnswerTarget(item)}
                    disabled={pendingAction !== null}
                  >
                    Réponse reçue
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* — Dialog : demander des précisions — */}
      <Dialog open={clarifyOpen} onOpenChange={(open) => { if (!open && pendingAction !== "clarify") setClarifyOpen(false); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Demander des précisions</DialogTitle>
            <DialogDescription>
              La demande comprend les champs concernés, les questions, une date indicative et un message
              explicatif (§8.2). Le dossier passera à « Informations complémentaires demandées ».
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Champs concernés</Label>
              <div className="grid max-h-44 gap-1 overflow-y-auto rounded-lg border border-border p-3 pr-2 sm:grid-cols-2 [scrollbar-width:thin]">
                {PUBLIC_FIELDS.map((field) => (
                  <label key={field} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent/60">
                    <input
                      type="checkbox"
                      className="size-4 accent-[#173D32]"
                      checked={concerned.includes(field)}
                      onChange={() => toggleConcerned(field)}
                      disabled={pendingAction !== null}
                    />
                    {PUBLIC_FIELD_LABELS[field]}
                  </label>
                ))}
              </div>
              {concerned.length === 0 ? (
                <p className="text-xs text-destructive">Sélectionnez au moins un champ concerné.</p>
              ) : null}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="clarify-questions">Questions à clarifier *</Label>
              <Textarea
                id="clarify-questions"
                value={questions}
                onChange={(event) => setQuestions(event.target.value)}
                rows={4}
                maxLength={5000}
                placeholder="Ex. : Pouvez-vous préciser les dates et le rôle exact joué dans cette initiative ?"
                disabled={pendingAction !== null}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="clarify-message">Message explicatif *</Label>
              <Textarea
                id="clarify-message"
                value={explainMessage}
                onChange={(event) => setExplainMessage(event.target.value)}
                rows={3}
                maxLength={5000}
                placeholder="Expliquez avec bienveillance pourquoi ces précisions sont utiles."
                disabled={pendingAction !== null}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="clarify-due">Date indicative de réponse</Label>
              <Input
                id="clarify-due"
                type="date"
                value={dueDateHint}
                onChange={(event) => setDueDateHint(event.target.value)}
                disabled={pendingAction !== null}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setClarifyOpen(false)} disabled={pendingAction !== null}>
              Annuler
            </Button>
            <Button type="button" className="min-h-11" onClick={() => void handleSubmitClarification()} disabled={pendingAction !== null}>
              {pendingAction === "clarify" ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
              Envoyer la demande
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* — AlertDialog : approuver — */}
      <AlertDialog open={approveOpen} onOpenChange={(open) => { if (!open && pendingAction !== "approve") setApproveOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approuver ce dossier ?</AlertDialogTitle>
            <AlertDialogDescription>
              Après approbation, le dossier pourra être publié (étape distincte, avec choix des champs publics).
              Cette décision est journalisée avec votre identité.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={pendingAction === "approve"}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11"
              disabled={pendingAction === "approve"}
              onClick={(event) => {
                event.preventDefault();
                void runStatusTransition("APPROVED", "approve");
              }}
            >
              {pendingAction === "approve" ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
              {pendingAction === "approve" ? "Approbation…" : "Confirmer l'approbation"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* — Dialog : refuser — */}
      <Dialog open={rejectOpen} onOpenChange={(open) => { if (!open && pendingAction !== "reject") setRejectOpen(false); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Refuser le dossier</DialogTitle>
            <DialogDescription>
              Un refus est enregistré avec un motif interne (§8.3). Le motif peut être communiqué à la
              participante dans un langage respectueux. Un dossier refusé n&apos;est jamais publié.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="reject-reason">Motif interne (obligatoire)</Label>
              <Textarea
                id="reject-reason"
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Réservé à l'équipe : incohérences, éléments de preuve insuffisants, hors critères…"
                disabled={pendingAction !== null}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="reject-note">Note explicative respectueuse (facultative)</Label>
              <Textarea
                id="reject-note"
                value={rejectNote}
                onChange={(event) => setRejectNote(event.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Message envisageable pour la participante, formulé avec respect et sans reproche."
                disabled={pendingAction !== null}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setRejectOpen(false)} disabled={pendingAction !== null}>
              Annuler
            </Button>
            <Button type="button" variant="destructive" className="min-h-11" onClick={() => void handleSubmitRejection()} disabled={pendingAction !== null}>
              {pendingAction === "reject" ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
              Confirmer le refus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* — AlertDialog : réponse reçue — */}
      <AlertDialog
        open={answerTarget !== null}
        onOpenChange={(open) => { if (!open && pendingAction === null) setAnswerTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marquer cette demande comme répondue ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le dossier passera de « Informations complémentaires demandées » à « Complément reçu » si aucune
              autre évolution n&apos;est intervenue. L&apos;action est journalisée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={pendingAction !== null}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11"
              disabled={pendingAction !== null}
              onClick={(event) => {
                event.preventDefault();
                if (answerTarget) void handleMarkAnswered(answerTarget);
              }}
            >
              {pendingAction !== null ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
