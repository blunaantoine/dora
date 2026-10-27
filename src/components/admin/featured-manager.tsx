"use client";

// ---------------------------------------------------------------------------
// Gestion du « Top 5 des parcours » (côté client) — l'équipe choisit au
// plus 5 parcours publiés et fixe leur ordre. CHOIX ÉDITORIAL : pas une
// notation (la plateforme n'a ni notes, ni popularité, ni nombre de vues).
//
// Affichage public (maquette, à l'identique) : rang 1 badge or « 1er »,
// rang 2 argent « 2e », rang 3 bronze « 3e », rangs suivants neutres.
// Toute l'action passe par PUT /api/admin/featured (permission
// PUBLISH_PROFILES vérifiée côté serveur, journal d'audit écrit).
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Info, Loader2, Star, X } from "lucide-react";

import { putJson } from "@/lib/client-api";
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
import { cn } from "@/lib/utils";

export interface FeaturedManagerEntry {
  id: string;
  slug: string;
  publicName: string;
}

/** Couleur de pastille de rang (même code que le carrousel public). */
function rankStyle(rank: number): string {
  if (rank === 1) return "bg-gold text-pine-deep";
  if (rank === 2) return "bg-[#C9CDD2] text-[#202522]";
  if (rank === 3) return "bg-[#C08A52] text-white";
  return "bg-pine-deep/85 text-[#F8F5EF]";
}

const RANK_BADGE_LABELS: Record<number, string> = {
  1: "or",
  2: "argent",
  3: "bronze",
};

export function FeaturedManager({
  max,
  initialHonored,
  candidates,
}: {
  max: number;
  initialHonored: FeaturedManagerEntry[];
  candidates: FeaturedManagerEntry[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [selected, setSelected] = useState<FeaturedManagerEntry[]>(initialHonored);
  const [initial] = useState<FeaturedManagerEntry[]>(initialHonored);
  const [pending, setPending] = useState(false);

  const candidatesLeft = useMemo(
    () =>
      candidates.filter(
        (candidate) => !selected.some((entry) => entry.id === candidate.id),
      ),
    [candidates, selected],
  );

  const dirty = useMemo(() => {
    if (selected.length !== initial.length) return true;
    return selected.some((entry, index) => entry.id !== initial[index]?.id);
  }, [selected, initial]);

  function addEntry(id: string) {
    if (selected.length >= max) return;
    const entry = candidates.find((candidate) => candidate.id === id);
    if (!entry) return;
    setSelected((prev) => [...prev, entry]);
  }

  function removeEntry(id: string) {
    setSelected((prev) => prev.filter((entry) => entry.id !== id));
  }

  function move(index: number, delta: -1 | 1) {
    setSelected((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [entry] = next.splice(index, 1);
      next.splice(target, 0, entry);
      return next;
    });
  }

  async function handleSave() {
    if (pending) return;
    setPending(true);
    const result = await putJson<{ honored: { id: string; rank: number }[]; note: string }>(
      "/api/admin/featured",
      { order: selected.map((entry) => entry.id) },
    );
    setPending(false);
    if (!result.ok) {
      toast({ variant: "destructive", title: "Enregistrement refusé", description: result.error.message });
      return;
    }
    toast({
      title: "Top 5 des parcours enregistré",
      description: "La bannière d'accueil affiche la nouvelle sélection (choix éditorial journalisé).",
    });
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      {/* Encart explicatif — le principe anti-notes reste affiché publiquement. */}
      <div className="flex items-start gap-3 rounded-lg border border-gold/50 bg-card p-4 text-sm leading-relaxed text-foreground/85">
        <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-pine" />
        <p>
          <strong className="font-semibold">Choix éditorial, pas une notation.</strong> La bannière
          d&apos;accueil présente le « Top 5 des parcours » : au plus {max} parcours sélectionnés
          par l&apos;équipe — la valorisation ne repose ni sur les notes, ni sur la popularité, ni
          sur le nombre de vues. Le rang 1 reçoit un badge or (« 1er »), le rang 2 argent (« 2e »),
          le rang 3 bronze (« 3e ») ; les rangs suivants restent neutres. L&apos;action est
          journalisée.
        </p>
      </div>

      {/* Sélection actuelle, ordonnée */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <h2 className="font-display text-base font-semibold text-foreground">
          Sélection actuelle ({selected.length}/{max})
        </h2>

        {selected.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Aucun parcours dans le Top 5 pour l&apos;instant : la bannière d&apos;accueil
            affichera le logo seul tant que la sélection est vide.
          </p>
        ) : (
          <ol className="mt-4 grid gap-2">
            {selected.map((entry, index) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5"
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                    rankStyle(index + 1),
                  )}
                  title={`Rang ${index + 1}${
                    RANK_BADGE_LABELS[index + 1] ? ` — badge ${RANK_BADGE_LABELS[index + 1]}` : ""
                  }`}
                >
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {entry.publicName}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    /profils/{entry.slug}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9"
                    onClick={() => move(index, -1)}
                    disabled={index === 0 || pending}
                    aria-label={`Monter « ${entry.publicName} » au rang ${index}`}
                  >
                    <ArrowUp aria-hidden="true" className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9"
                    onClick={() => move(index, 1)}
                    disabled={index === selected.length - 1 || pending}
                    aria-label={`Descendre « ${entry.publicName} » au rang ${index + 2}`}
                  >
                    <ArrowDown aria-hidden="true" className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9 text-destructive hover:text-destructive"
                    onClick={() => removeEntry(entry.id)}
                    disabled={pending}
                    aria-label={`Retirer « ${entry.publicName} » de la sélection`}
                  >
                    <X aria-hidden="true" className="size-4" />
                  </Button>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Ajout depuis les profils publiés */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <Label htmlFor="add-honored">Ajouter au Top 5 ({selected.length}/{max})</Label>
        <Select
          value=""
          onValueChange={addEntry}
          disabled={pending || selected.length >= max || candidatesLeft.length === 0}
        >
          <SelectTrigger id="add-honored" className="mt-2 min-h-11 w-full sm:max-w-md">
            <SelectValue
              placeholder={
                selected.length >= max
                  ? "Sélection complète — retirez un parcours pour en ajouter"
                  : candidatesLeft.length === 0
                    ? "Aucun autre profil publié disponible"
                    : "Choisir un profil publié…"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {candidatesLeft.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {candidate.publicName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-2 text-xs text-muted-foreground">
          Seuls les profils actuellement publiés peuvent figurer dans le Top 5. Dépublier un
          profil le retire automatiquement de la sélection.
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          className="min-h-11 w-fit"
          onClick={() => void handleSave()}
          disabled={pending || !dirty}
        >
          {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
          Enregistrer le Top 5
        </Button>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-pine underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Star aria-hidden="true" className="size-4" />
          Voir la bannière d&apos;accueil
        </Link>
      </div>
    </div>
  );
}
