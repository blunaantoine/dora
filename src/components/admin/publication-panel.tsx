"use client";

// ---------------------------------------------------------------------------
// Panneau de publication d'un profil (§8.4-8.5) — côté client.
//
//   • APPROVED : checklist des pré-requis (consentement, nom public, champs
//     approuvés), sélection des champs publics (libellés FR, liste blanche),
//     SEO, mise en avant, bouton « Publier le profil » avec URL publique
//     prévisionnelle. Pour une mineure : Ville et Région désactivées
//     (protection renforcée §4.4/§14).
//   • PUBLISHED : lien « Voir la fiche publique », édition des champs/SEO/mise
//     en avant, « Dépublier » (AlertDialog, motif facultatif).
//   • Autres statuts : information.
//
// Toutes les actions passent par /api/admin/dossiers/[id]/publication
// (permission PUBLISH_PROFILES vérifiée côté serveur) ; le serveur revalide
// les pré-requis et journalise.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, Loader2, ShieldAlert, XCircle } from "lucide-react";

import { PUBLIC_FIELDS, PUBLIC_FIELD_LABELS, type PublicField } from "@/lib/public-fields";
import { deleteJson, getJson, patchJson, postJson } from "@/lib/client-api";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface PublicationState {
  dossier: { id: string; status: string; publicName: string | null; isMinor: boolean };
  publication: {
    id: string;
    slug: string;
    state: string;
    approvedFields: string[];
    featured: boolean;
    seoTitle: string | null;
    seoDescription: string | null;
    publishedAt: string | null;
    unpublishedAt: string | null;
  } | null;
  prerequisites: { statusOk: boolean; consentOk: boolean; publicNameOk: boolean; fieldsOk: boolean };
  slug: string | null;
  previewUrl: string | null;
}

const MINOR_EXCLUDED_FIELDS: readonly PublicField[] = ["city", "region"];

export function PublicationPanel({
  dossierId,
  status,
  isMinor,
  publicName,
}: {
  dossierId: string;
  status: string;
  isMinor: boolean;
  publicName: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [data, setData] = useState<PublicationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);

  // Formulaire
  const [selectedFields, setSelectedFields] = useState<PublicField[]>([]);
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [featured, setFeatured] = useState(false);
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const [unpublishMotif, setUnpublishMotif] = useState("");

  const isPublished = status === "PUBLISHED";
  const isApprovable = status === "APPROVED";

  const loadState = useCallback(async () => {
    setLoading(true);
    const result = await getJson<PublicationState>(`/api/admin/dossiers/${dossierId}/publication`);
    setLoading(false);
    if (!result.ok) {
      toast({ variant: "destructive", title: "Lecture impossible", description: result.error.message });
      return;
    }
    setData(result.data);
    const existing = result.data.publication;
    if (existing) {
      setSelectedFields(existing.approvedFields.filter((f): f is PublicField => (PUBLIC_FIELDS as readonly string[]).includes(f)));
      setSeoTitle(existing.seoTitle ?? "");
      setSeoDescription(existing.seoDescription ?? "");
      setFeatured(existing.featured);
    } else if (isApprovable) {
      // Sélection prudente par défaut : nom public + présentation courte.
      setSelectedFields((prev) => (prev.length > 0 ? prev : ["publicName", "shortPresentation"]));
    }
  }, [dossierId, toast, isApprovable]);

  useEffect(() => {
    if (isApprovable || isPublished) {
      // Chargement différé d'un tick : évite un setState synchrone dans l'effet.
      const timer = setTimeout(() => { void loadState(); }, 0);
      return () => clearTimeout(timer);
    }
  }, [isApprovable, isPublished, loadState]);

  const previewUrl = useMemo(() => {
    if (data?.publication?.slug) return `/profils/${data.publication.slug}`;
    if (data?.previewUrl) return data.previewUrl;
    return null;
  }, [data]);

  function toggleField(field: PublicField) {
    setSelectedFields((prev) => (prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]));
  }

  function fieldDisabled(field: PublicField): boolean {
    return Boolean(isMinor && MINOR_EXCLUDED_FIELDS.includes(field));
  }

  async function handlePublish() {
    if (pending || !data) return;
    if (selectedFields.length === 0) {
      toast({ variant: "destructive", title: "Champs manquants", description: "Cochez au moins un champ à publier." });
      return;
    }
    setPending("publish");
    const result = await postJson<{ publication: { slug: string; publicUrl: string }; dossierStatus: string }>(
      `/api/admin/dossiers/${dossierId}/publication`,
      {
        approvedFields: selectedFields,
        seoTitle: seoTitle.trim() !== "" ? seoTitle.trim() : null,
        seoDescription: seoDescription.trim() !== "" ? seoDescription.trim() : null,
        featured,
      },
    );
    setPending(null);
    if (!result.ok) {
      toast({ variant: "destructive", title: "Publication impossible", description: result.error.message });
      return;
    }
    toast({
      title: "Profil publié",
      description: `La fiche est en ligne sur ${result.data.publication.publicUrl}. L'action est journalisée (§8.4).`,
    });
    await loadState();
    router.refresh();
  }

  async function handleUpdate() {
    if (pending || !data) return;
    setPending("update");
    const result = await patchJson<{ publication: { slug: string } }>(`/api/admin/dossiers/${dossierId}/publication`, {
      approvedFields: selectedFields,
      seoTitle: seoTitle.trim() !== "" ? seoTitle.trim() : null,
      seoDescription: seoDescription.trim() !== "" ? seoDescription.trim() : null,
      featured,
    });
    setPending(null);
    if (!result.ok) {
      toast({ variant: "destructive", title: "Mise à jour refusée", description: result.error.message });
      return;
    }
    toast({ title: "Publication mise à jour", description: "Les champs approuvés et les réglages SEO sont enregistrés." });
    await loadState();
    router.refresh();
  }

  async function handleUnpublish() {
    if (pending || !data) return;
    setPending("unpublish");
    const result = await deleteJson<{ dossierStatus: string }>(`/api/admin/dossiers/${dossierId}/publication`, {
      ...(unpublishMotif.trim() !== "" ? { motif: unpublishMotif.trim() } : {}),
    });
    setPending(null);
    setUnpublishOpen(false);
    setUnpublishMotif("");
    if (!result.ok) {
      toast({ variant: "destructive", title: "Dépublication impossible", description: result.error.message });
      return;
    }
    toast({
      title: "Profil dépublié",
      description: "La fiche n'est plus accessible publiquement (§8.5). Le dossier est en « Dépublication en cours » : archivez-le ensuite si nécessaire.",
    });
    await loadState();
    router.refresh();
  }

  if (!isApprovable && !isPublished) {
    return (
      <p className="text-sm text-muted-foreground">
        La publication est possible après approbation du dossier. Statut actuel : le dossier n&apos;est pas au
        stade de la publication.
      </p>
    );
  }

  if (loading || !data) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        Chargement de l&apos;état de publication…
      </p>
    );
  }

  const prereq = data.prerequisites;
  const effectiveIsMinor = isMinor || data.dossier.isMinor;

  return (
    <div className="grid gap-5">
      {/* — Profil publié : accès public + édition — */}
      {isPublished && data.publication ? (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
            <CheckCircle2 aria-hidden="true" className="size-4 text-emerald-700" />
            <span className="font-medium text-emerald-900">Profil publié</span>
            {data.publication.slug ? (
              <Link
                href={`/profils/${data.publication.slug}`}
                target="_blank"
                className="inline-flex min-h-9 items-center gap-1.5 font-medium text-pine underline decoration-gold underline-offset-4 hover:text-foreground"
              >
                Voir la fiche publique
                <ExternalLink aria-hidden="true" className="size-3.5" />
              </Link>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Publié le{" "}
            {data.publication.publishedAt ? new Date(data.publication.publishedAt).toLocaleString("fr-FR") : "—"}
            {data.publication.featured ? " · mis en avant" : ""}
          </p>
        </div>
      ) : null}

      {/* — Checklist des pré-requis (§8.4) — */}
      <div className="grid gap-2">
        <h3 className="text-sm font-semibold text-foreground">Pré-requis de publication</h3>
        <ul className="grid list-none gap-1.5 p-0 text-sm">
          <PrereqItem ok={isPublished ? true : prereq.statusOk} label="Dossier approuvé" />
          <PrereqItem ok={prereq.consentOk} label="Consentement enregistré" />
          <PrereqItem ok={prereq.publicNameOk} label="Nom public renseigné" okDetail={data.dossier.publicName ?? undefined} />
          <PrereqItem
            ok={selectedFields.length > 0}
            label={`${selectedFields.length} champ${selectedFields.length > 1 ? "s" : ""} approuvé${selectedFields.length > 1 ? "s" : ""}`}
          />
        </ul>
      </div>

      {/* — Champs approuvés — */}
      <div className="grid gap-2">
        <Label>Champs publics approuvés</Label>
        {effectiveIsMinor ? (
          <p className="flex items-start gap-1.5 rounded-md border border-gold/60 bg-gold/15 px-3 py-2 text-xs text-pine">
            <ShieldAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            Personne mineure : « Ville » et « Région » sont désactivées — la localisation précise est exclue de la
            publication. La biographie est tronquée à 2 000 caractères à l&apos;affichage public.
          </p>
        ) : null}
        <div className="grid max-h-56 gap-1 overflow-y-auto rounded-lg border border-border p-3 pr-2 [scrollbar-width:thin] sm:grid-cols-2">
          {PUBLIC_FIELDS.map((field) => {
            const disabled = fieldDisabled(field);
            return (
              <label
                key={field}
                className={cn(
                  "flex items-center gap-2 rounded px-1 py-1 text-sm",
                  disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-accent/60",
                )}
              >
                <input
                  type="checkbox"
                  className="size-4 accent-[#173D32]"
                  checked={selectedFields.includes(field)}
                  onChange={() => toggleField(field)}
                  disabled={disabled || pending !== null}
                  aria-disabled={disabled}
                />
                {PUBLIC_FIELD_LABELS[field]}
                {disabled ? <span className="sr-only">(interdit pour une personne mineure)</span> : null}
              </label>
            );
          })}
        </div>
      </div>

      {/* — SEO + mise en avant — */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="seo-title">Titre SEO (facultatif, 70 caractères max.)</Label>
          <Input
            id="seo-title"
            value={seoTitle}
            onChange={(event) => setSeoTitle(event.target.value)}
            maxLength={70}
            placeholder={`Ex. : ${publicName ?? "La participante"} — parcours d'engagement`}
            disabled={pending !== null}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="seo-desc">Description SEO (facultative, 160 caractères max.)</Label>
          <Input
            id="seo-desc"
            value={seoDescription}
            onChange={(event) => setSeoDescription(event.target.value)}
            maxLength={160}
            placeholder="Résumé court affiché par les moteurs de recherche."
            disabled={pending !== null}
          />
        </div>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Switch id="featured" checked={featured} onCheckedChange={setFeatured} disabled={pending !== null} />
          <Label htmlFor="featured" className="cursor-pointer">
            Mettre ce profil en avant (à la une de l&apos;annuaire)
          </Label>
        </div>
      </div>

      {/* — Actions — */}
      {isApprovable ? (
        <div className="grid gap-2">
          <Button type="button" className="min-h-11 w-fit" onClick={() => void handlePublish()} disabled={pending !== null}>
            {pending === "publish" ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            Publier le profil
          </Button>
          <p className="text-xs text-muted-foreground">
            {previewUrl ? (
              <>
                URL publique prévisionnelle : <span className="font-mono text-foreground">{previewUrl}</span> — l&apos;unicité finale du lien est garantie à la publication.
              </>
            ) : (
              "L'URL publique prévisionnelle apparaîtra dès que le nom public sera renseigné."
            )}
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void handleUpdate()} disabled={pending !== null}>
            {pending === "update" ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            Enregistrer les modifications
          </Button>
          <Button type="button" variant="destructive" className="min-h-11" onClick={() => setUnpublishOpen(true)} disabled={pending !== null}>
            Dépublier
          </Button>
        </div>
      )}

      {/* — AlertDialog : dépublier — */}
      <AlertDialog open={unpublishOpen} onOpenChange={(open) => { if (!open && pending === null) setUnpublishOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dépublier ce profil ?</AlertDialogTitle>
            <AlertDialogDescription>
              La fiche cessera immédiatement d&apos;être accessible publiquement et sortira de l&apos;annuaire
              (§8.5). Le dossier passera en « Dépublication en cours » ; vous pourrez ensuite l&apos;archiver.
              Cette action est journalisée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="unpublish-motif">Motif (facultatif, conservé dans le journal)</Label>
            <Input
              id="unpublish-motif"
              value={unpublishMotif}
              onChange={(event) => setUnpublishMotif(event.target.value)}
              maxLength={500}
              placeholder="Ex. : demande de retrait de la participante, données à corriger…"
              disabled={pending !== null}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={pending === "unpublish"}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={pending === "unpublish"}
              onClick={(event) => {
                event.preventDefault();
                void handleUnpublish();
              }}
            >
              {pending === "unpublish" ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
              Confirmer la dépublication
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PrereqItem({ ok, label, okDetail }: { ok: boolean; label: string; okDetail?: string }) {
  return (
    <li className="flex items-center gap-2">
      {ok ? (
        <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-emerald-700" />
      ) : (
        <XCircle aria-hidden="true" className="size-4 shrink-0 text-red-600" />
      )}
      <span className={ok ? "text-foreground" : "text-muted-foreground"}>
        {label}
        {ok && okDetail ? ` — ${okDetail}` : ""}
      </span>
    </li>
  );
}
