"use client";

// ---------------------------------------------------------------------------
// Panneau « Invitation » du détail dossier (§6) : état courant de
// l'invitation du dossier + actions créer / révoquer / renouveler.
// Réutilise les actions ligne (révoquer/renouveler) et l'affichage unique du
// lien (LinkReveal) définis dans invitations-manager.tsx.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MailPlus, ShieldAlert } from "lucide-react";

import {
  DOSSIER_FORM_OPEN_STATUSES,
  INVITATION_STATUS_BADGE_CLASS,
  INVITATION_STATUS_LABELS,
  type DossierStatus,
  type InvitationStatus,
} from "@/lib/constants";
import { postJson } from "@/lib/client-api";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LinkReveal, InvitationRowActions } from "@/components/admin/invitations-manager";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export interface InvitationInfo {
  id: string;
  status: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  accessCount: number;
  lastAccessAt: string | null;
}

const frDate = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });
const frDateTime = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

export function DossierInvitationPanel({
  dossierId,
  dossierName,
  dossierStatus,
  invitation,
}: {
  dossierId: string;
  dossierName: string;
  dossierStatus: string;
  invitation: InvitationInfo | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ url: string; urlAbsolue?: string } | null>(null);

  const eligible = (DOSSIER_FORM_OPEN_STATUSES as readonly string[]).includes(dossierStatus);
  const hasActiveInvitation = invitation?.status === "ACTIVE";
  const canCreate = eligible && !hasActiveInvitation;

  async function handleCreate() {
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    const result = await postJson<{ url: string; urlAbsolue: string }>(
      "/api/admin/invitations",
      { personRecordId: dossierId },
    );
    setCreating(false);
    if (!result.ok) {
      setCreateError(result.error.message);
      return;
    }
    setCreateOpen(false);
    setReveal({ url: result.data.url, urlAbsolue: result.data.urlAbsolue });
    router.refresh();
  }

  return (
    <div className="grid gap-4">
      {invitation ? (
        <div className="grid gap-2 rounded-lg border border-border bg-muted/30 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn(INVITATION_STATUS_BADGE_CLASS[invitation.status as InvitationStatus])}
            >
              {INVITATION_STATUS_LABELS[invitation.status as InvitationStatus] ?? invitation.status}
            </Badge>
            <span className="text-sm text-muted-foreground">
              créée le {frDate.format(new Date(invitation.createdAt))}
            </span>
          </div>
          <dl className="grid gap-1 text-xs text-muted-foreground">
            <div>Expire le {frDate.format(new Date(invitation.expiresAt))}</div>
            <div>
              {invitation.accessCount} accès
              {invitation.lastAccessAt
                ? ` — dernier le ${frDateTime.format(new Date(invitation.lastAccessAt))}`
                : ""}
            </div>
            {invitation.usedAt ? <div>Utilisée le {frDateTime.format(new Date(invitation.usedAt))}</div> : null}
            {invitation.revokedAt ? (
              <div>Révoquée le {frDateTime.format(new Date(invitation.revokedAt))}</div>
            ) : null}
          </dl>
          {hasActiveInvitation ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Le lien actif n&apos;est jamais ré-affiché ici : utilisez « Renouveler » pour
              générer un nouveau lien (l&apos;ancien devient inutilisable).
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Aucune invitation pour ce dossier.{" "}
          {eligible
            ? "Créez-en une pour donner accès au formulaire privé."
            : "Aucune invitation ne peut être créée dans l'état actuel du dossier."}
        </p>
      )}

      {hasActiveInvitation && invitation ? (
        <InvitationRowActions
          invitationId={invitation.id}
          status={invitation.status}
          dossierName={dossierName}
        />
      ) : null}

      {canCreate ? (
        <Button type="button" onClick={() => setCreateOpen(true)} className="min-h-11 sm:w-fit">
          <MailPlus aria-hidden="true" />
          Créer une invitation
        </Button>
      ) : null}

      {!eligible && dossierStatus === "SUBMITTED" ? (
        <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          <ShieldAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          Le dossier est soumis : le formulaire est verrouillé pour la participante.
        </p>
      ) : null}

      {/* Confirmation de création */}
      <AlertDialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!creating) setCreateOpen(open);
          if (!open) setCreateError(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Créer une invitation pour {dossierName} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Un lien privé unique sera généré (valable 30 jours). Il ne sera affiché qu&apos;une
              seule fois : copiez-le pour le transmettre à la personne concernée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {createError ? (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
              {createError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={creating}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11"
              onClick={(event) => {
                event.preventDefault();
                void handleCreate();
              }}
              disabled={creating}
            >
              {creating ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
              {creating ? "Création…" : "Créer l'invitation"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lien affiché une seule fois */}
      <Dialog open={reveal !== null} onOpenChange={(open) => !open && setReveal(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">Lien d&apos;invitation créé</DialogTitle>
            <DialogDescription>
              Dossier : {dossierName} — transmettez ce lien par un canal privé.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            {reveal ? <LinkReveal url={reveal.url} urlAbsolue={reveal.urlAbsolue} /> : null}
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setReveal(null)}>
              J&apos;ai copié le lien — fermer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
