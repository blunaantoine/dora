"use client";

// ---------------------------------------------------------------------------
// Étape 7 du formulaire (§7.8) — Médias et justificatifs.
// Contraintes réelles du backend : POST /media (multipart champ `file`,
// JPEG/PNG/WebP, ≤ MAX_UPLOAD_MB = 2 Mo, octets magiques vérifiés), liste
// obtenue via GET /state (id, type, statut, taille — AUCUNE URL publique),
// suppression via DELETE /media/[id]. Aucun aperçu local (économie mémoire et
// données) : seules les informations renvoyées par le serveur sont affichées.
// ---------------------------------------------------------------------------

import { useRef, useState } from "react";
import { FileImage, Loader2, Trash2, Upload } from "lucide-react";

import {
  MEDIA_KINDS,
  MEDIA_KIND_LABELS,
  MEDIA_MAX_PER_DOSSIER,
  MEDIA_STATUS_LABELS,
  type MediaKind,
  type MediaStatus,
} from "@/lib/constants";
import { postForm, deleteJson } from "@/lib/client-api";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatBytes, formatFrDateTime, type MediaItem } from "@/components/invitation/invitation-types";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // setting MAX_UPLOAD_MB = 2
const ACCEPTED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ACCEPT_ATTR = "image/jpeg,image/png,image/webp";

export function MediaStep({
  token,
  media,
  onMediaChange,
  disabled,
}: {
  token: string;
  media: MediaItem[];
  onMediaChange: (next: MediaItem[]) => void;
  disabled: boolean;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [kind, setKind] = useState<string>("ACTIVITY_PHOTO");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const atLimit = media.length >= MEDIA_MAX_PER_DOSSIER;

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    // Réinitialise l'input pour permettre de re-sélectionner le même fichier.
    event.target.value = "";
    if (!file || uploading || disabled) return;

    setUploadError(null);

    if (!ACCEPTED_MIMES.has((file.type || "").toLowerCase())) {
      setUploadError("Format non pris en charge. Utilisez une image JPEG, PNG ou WebP.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError("Fichier trop volumineux : la taille maximale est de 2 Mo.");
      return;
    }
    if (atLimit) {
      setUploadError(`Limite de ${MEDIA_MAX_PER_DOSSIER} fichiers atteinte pour ce dossier.`);
      return;
    }

    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("kind", kind);
    const result = await postForm<{ media: MediaItem }>(`/api/invitation/${token}/media`, form);
    setUploading(false);

    if (!result.ok) {
      setUploadError(result.error.message);
      return;
    }
    onMediaChange([...media, result.data.media]);
    toast({
      title: "Fichier envoyé",
      description: "Votre fichier a été téléversé en toute sécurité. Il sera examiné par l'équipe.",
    });
  }

  async function handleDeleteConfirmed() {
    if (!pendingDeleteId || deleting) return;
    setDeleting(true);
    const result = await deleteJson<{ deleted: boolean }>(
      `/api/invitation/${token}/media/${pendingDeleteId}`,
    );
    setDeleting(false);
    if (!result.ok) {
      setUploadError(result.error.message);
      setPendingDeleteId(null);
      return;
    }
    onMediaChange(media.filter((item) => item.id !== pendingDeleteId));
    setPendingDeleteId(null);
    toast({ title: "Fichier supprimé" });
  }

  const pendingDelete = media.find((item) => item.id === pendingDeleteId) ?? null;

  return (
    <div className="grid gap-5">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Vous pouvez ajouter une photographie de profil, des photographies d&apos;activités, des
        affiches ou des documents de présentation (20 fichiers maximum). Les fichiers restent
        privés : ils ne seront publiés que si l&apos;équipe les valide. Aucune donnée cachée
        (position, appareil) n&apos;est conservée : les images sont retraitées par le serveur.
      </p>

      {atLimit ? (
        <p role="status" className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          Limite de {MEDIA_MAX_PER_DOSSIER} fichiers atteinte. Supprimez un fichier pour en
          téléverser un autre.
        </p>
      ) : (
        <div className="grid gap-4 rounded-xl border border-dashed border-border bg-muted/30 p-4 sm:p-5">
          <div className="grid gap-1.5">
            <Label htmlFor="media-kind" className="text-sm font-medium">
              Type de fichier
            </Label>
            <Select value={kind} onValueChange={setKind} disabled={disabled || uploading}>
              <SelectTrigger id="media-kind" className="min-h-11 w-full bg-white sm:w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEDIA_KINDS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {MEDIA_KIND_LABELS[value as MediaKind]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="media-file" className="text-sm font-medium">
              Fichier à téléverser
            </Label>
            <input
              ref={fileInputRef}
              id="media-file"
              type="file"
              accept={ACCEPT_ATTR}
              onChange={handleFileSelected}
              disabled={disabled || uploading}
              aria-describedby="media-file-hint media-file-error"
              className="block w-full rounded-lg border border-input bg-white px-3 py-2.5 text-sm text-foreground shadow-xs file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground hover:file:bg-secondary/80 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
            <p id="media-file-hint" className="text-xs leading-relaxed text-muted-foreground">
              Formats acceptés : JPEG, PNG, WebP — 2 Mo maximum par fichier.
            </p>
            {uploadError ? (
              <p id="media-file-error" role="alert" className="text-sm font-medium text-destructive">
                {uploadError}
              </p>
            ) : null}
          </div>

          {uploading ? (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              Envoi en cours… (selon votre connexion, cela peut prendre quelques instants)
            </p>
          ) : null}
        </div>
      )}

      <div>
        <h4 className="font-display text-base font-semibold text-foreground">
          Fichiers téléversés ({media.length})
        </h4>
        {media.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Aucun fichier pour le moment. Cette étape est facultative : vous pouvez continuer sans
            téléverser de fichier.
          </p>
        ) : (
          <ul className="mt-3 grid list-none gap-2 p-0">
            {media.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-card px-4 py-3"
              >
                <FileImage aria-hidden="true" className="size-5 shrink-0 text-pine" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {MEDIA_KIND_LABELS[item.kind as MediaKind] ?? item.kind}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(item.sizeBytes)} · envoyé le {formatFrDateTime(item.uploadedAt)} ·{" "}
                    {MEDIA_STATUS_LABELS[item.status as MediaStatus] ?? item.status}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPendingDeleteId(item.id)}
                  disabled={disabled || deleting}
                  className="min-h-11 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Supprimer le fichier : ${MEDIA_KIND_LABELS[item.kind as MediaKind] ?? item.kind}`}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                  Supprimer
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce fichier ?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `Le fichier « ${MEDIA_KIND_LABELS[pendingDelete.kind as MediaKind] ?? pendingDelete.kind} » (${formatBytes(pendingDelete.sizeBytes)}) sera définitivement supprimé.`
                : "Le fichier sera définitivement supprimé."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={deleting}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 bg-destructive text-white hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault(); // garde le dialogue ouvert pendant la requête
                void handleDeleteConfirmed();
              }}
              disabled={deleting}
            >
              {deleting ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
              {deleting ? "Suppression…" : "Supprimer définitivement"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <Upload aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        Pour préserver votre connexion et votre vie privée, l&apos;aperçu des images n&apos;est pas
        affiché ici : seul le nom du type de fichier, sa taille et son état sont indiqués.
        L&apos;équipe contrôlera chaque fichier avant toute publication.
      </p>
    </div>
  );
}
