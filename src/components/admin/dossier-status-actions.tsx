"use client";

// ---------------------------------------------------------------------------
// Actions de transition de statut d'un dossier (§5.4) — côté client :
// seules les transitions PERMISES par la machine à états (canTransition /
// DOSSIER_TRANSITIONS) sont affichées et exécutées via
// PATCH /api/admin/dossiers/[id] {status}. Chaque transition est confirmée
// (AlertDialog) ; le serveur revalide et journalise.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";

import {
  DOSSIER_TRANSITIONS,
  DOSSIER_STATUS_LABELS,
  type DossierStatus,
} from "@/lib/constants";
import { patchJson } from "@/lib/client-api";
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
import { useToast } from "@/hooks/use-toast";

export function DossierStatusActions({
  dossierId,
  status,
}: {
  dossierId: string;
  status: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [target, setTarget] = useState<DossierStatus | null>(null);
  const [pending, setPending] = useState(false);

  const current = status as DossierStatus;
  const allowedTargets = DOSSIER_TRANSITIONS.get(current) ?? [];

  if (allowedTargets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucune transition n&apos;est possible depuis ce statut.
      </p>
    );
  }

  async function handleConfirm() {
    if (!target || pending) return;
    setPending(true);
    const result = await patchJson<{ dossier: { id: string; status: string } }>(
      `/api/admin/dossiers/${dossierId}`,
      { status: target },
    );
    setPending(false);
    if (!result.ok) {
      toast({ variant: "destructive", title: "Transition refusée", description: result.error.message });
      setTarget(null);
      return;
    }
    setTarget(null);
    toast({
      title: "Statut mis à jour",
      description: `Le dossier est désormais « ${DOSSIER_STATUS_LABELS[result.data.dossier.status as DossierStatus] ?? result.data.dossier.status} ». La transition est journalisée.`,
    });
    router.refresh();
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Transitions permises depuis « {DOSSIER_STATUS_LABELS[current] ?? status} » :
      </p>
      <div className="flex flex-wrap gap-2">
        {allowedTargets.map((next) => (
          <Button
            key={next}
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            onClick={() => setTarget(next)}
            disabled={pending}
          >
            <ArrowRight aria-hidden="true" className="size-4" />
            {DOSSIER_STATUS_LABELS[next]}
          </Button>
        ))}
      </div>

      <AlertDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!pending) setTarget(open ? target : null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Passer le dossier de « {DOSSIER_STATUS_LABELS[current] ?? status} » à «{" "}
              {target ? DOSSIER_STATUS_LABELS[target] : ""} » ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Cette action respecte la machine à états du cahier des charges et sera journalisée
              dans le journal d&apos;audit avec votre identité.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={pending}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11"
              onClick={(event) => {
                event.preventDefault();
                void handleConfirm();
              }}
              disabled={pending}
            >
              {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
              {pending ? "Application…" : "Confirmer la transition"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
