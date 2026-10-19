"use client";

// ---------------------------------------------------------------------------
// Gestion des catégories d'engagement (§4.3) — côté client.
//
//   • liste : nom, description, état actif, nombre de profils publiés (et
//     nombre total de dossiers liés) ;
//   • ajout (Dialog) : slug généré côté serveur depuis le nom ;
//   • renommage (Dialog) ;
//   • bascule active : si des dossiers sont liés, AlertDialog avec message
//     clair — « les profils publiés restent visibles, la catégorie disparaît
//     des filtres » ; désactiver n'efface jamais rien.
//
// Toutes les opérations passent par /api/admin/categories (permission
// MANAGE_CATEGORIES vérifiée côté serveur, journalisées CATEGORY_CREATED /
// CATEGORY_UPDATED).
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Power, RefreshCw } from "lucide-react";

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
import { useToast } from "@/hooks/use-toast";

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  publishedCount: number;
  personsCount: number;
  createdAt: string;
  updatedAt: string;
}

export function CategoriesManager() {
  const router = useRouter();
  const { toast } = useToast();

  const [categories, setCategories] = useState<CategoryRow[] | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  // Formulaire d'ajout
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addDescription, setAddDescription] = useState("");

  // Formulaire de renommage
  const [renameTarget, setRenameTarget] = useState<CategoryRow | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameDescription, setRenameDescription] = useState("");

  // Bascule d'activation
  const [toggleTarget, setToggleTarget] = useState<CategoryRow | null>(null);

  const load = useCallback(async () => {
    const result = await getJson<{ categories: CategoryRow[] }>("/api/admin/categories");
    if (!result.ok) {
      setCategories([]);
      toast({ variant: "destructive", title: "Lecture impossible", description: result.error.message });
      return;
    }
    setCategories(result.data.categories);
  }, [toast]);

  useEffect(() => {
    // Chargement différé d'un tick (composants existants) : évite un setState
    // synchrone dans le corps de l'effet.
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function handleAdd() {
    if (pending) return;
    if (addName.trim().length < 2) {
      toast({ variant: "destructive", title: "Nom trop court", description: "Le nom doit contenir au moins 2 caractères." });
      return;
    }
    setPending("add");
    const result = await postJson<{ category: CategoryRow }>("/api/admin/categories", {
      name: addName.trim(),
      ...(addDescription.trim() !== "" ? { description: addDescription.trim() } : {}),
    });
    setPending(null);
    if (!result.ok) {
      toast({ variant: "destructive", title: "Création impossible", description: result.error.message });
      return;
    }
    setAddOpen(false);
    setAddName("");
    setAddDescription("");
    toast({ title: "Catégorie créée", description: `« ${result.data.category.name} » est active (slug : ${result.data.category.slug}).` });
    await load();
    router.refresh();
  }

  async function handleRename() {
    if (pending || !renameTarget) return;
    if (renameName.trim().length < 2) {
      toast({ variant: "destructive", title: "Nom trop court", description: "Le nom doit contenir au moins 2 caractères." });
      return;
    }
    setPending(`rename-${renameTarget.id}`);
    const result = await patchJson<{ category: CategoryRow }>(`/api/admin/categories/${renameTarget.id}`, {
      name: renameName.trim(),
      description: renameDescription.trim() !== "" ? renameDescription.trim() : null,
    });
    setPending(null);
    if (!result.ok) {
      toast({ variant: "destructive", title: "Renommage impossible", description: result.error.message });
      return;
    }
    setRenameTarget(null);
    toast({ title: "Catégorie modifiée", description: "Le nom affiché a été mis à jour (le slug reste stable)." });
    await load();
    router.refresh();
  }

  async function handleToggle() {
    if (pending || !toggleTarget) return;
    const target = toggleTarget;
    setPending(`toggle-${target.id}`);
    const result = await patchJson<{ category: CategoryRow }>(`/api/admin/categories/${target.id}`, {
      isActive: !target.isActive,
    });
    setPending(null);
    setToggleTarget(null);
    if (!result.ok) {
      toast({ variant: "destructive", title: "Modification impossible", description: result.error.message });
      return;
    }
    toast({
      title: result.data.category.isActive ? "Catégorie réactivée" : "Catégorie désactivée",
      description: result.data.category.isActive
        ? "Elle apparaît à nouveau dans les filtres et les choix de catégorie."
        : "Les profils liés restent visibles ; la catégorie disparaît seulement des filtres et des futurs choix.",
    });
    await load();
    router.refresh();
  }

  if (categories === null) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        Chargement des catégories…
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {categories.length} catégorie{categories.length > 1 ? "s" : ""} — les catégories officielles du cahier
          des charges (§4.3) sont préinstallées. Une catégorie se désactive, ne se supprime jamais : les profils
          liés restent intacts.
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" className="min-h-9 text-muted-foreground" onClick={() => void load()} disabled={pending !== null}>
            <RefreshCw aria-hidden="true" className="size-3.5" />
            Actualiser
          </Button>
          <Button type="button" size="sm" className="min-h-9" onClick={() => setAddOpen(true)} disabled={pending !== null}>
            <Plus aria-hidden="true" className="size-4" />
            Ajouter une catégorie
          </Button>
        </div>
      </div>

      <ul className="grid list-none gap-3 p-0">
        {categories.map((category) => (
          <li
            key={category.id}
            className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-base font-semibold text-foreground">{category.name}</h2>
                {category.isActive ? (
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
                    Active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-stone-200 bg-stone-100 text-stone-600">
                    Désactivée
                  </Badge>
                )}
              </div>
              {category.description ? (
                <p className="mt-1 text-sm text-muted-foreground">{category.description}</p>
              ) : null}
              <p className="mt-1 text-xs text-muted-foreground">
                {category.publishedCount} profil{category.publishedCount > 1 ? "s" : ""} publié
                {category.publishedCount > 1 ? "s" : ""}
                {" · "}
                {category.personsCount} dossier{category.personsCount > 1 ? "s" : ""} lié
                {category.personsCount > 1 ? "s" : ""}
                {" · "}
                slug : <span className="font-mono">{category.slug}</span>
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-9"
                onClick={() => {
                  setRenameTarget(category);
                  setRenameName(category.name);
                  setRenameDescription(category.description ?? "");
                }}
                disabled={pending !== null}
              >
                Renommer
              </Button>
              <Button
                type="button"
                variant={category.isActive ? "outline" : "default"}
                size="sm"
                className={category.isActive ? "min-h-9 text-red-700 hover:text-red-800" : "min-h-9"}
                onClick={() => setToggleTarget(category)}
                disabled={pending !== null}
              >
                <Power aria-hidden="true" className="size-4" />
                {category.isActive ? "Désactiver" : "Réactiver"}
              </Button>
            </div>
          </li>
        ))}
        {categories.length === 0 ? (
          <li className="rounded-xl border border-dashed border-border bg-card/60 px-6 py-10 text-center text-sm text-muted-foreground">
            Aucune catégorie. Ajoutez-en une pour organiser l&apos;annuaire.
          </li>
        ) : null}
      </ul>

      {/* — Dialog : ajout — */}
      <Dialog open={addOpen} onOpenChange={(open) => { if (!open && pending !== "add") setAddOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ajouter une catégorie</DialogTitle>
            <DialogDescription>
              Le slug (identifiant d&apos;URL) est généré automatiquement depuis le nom : minuscules, accents
              retirés, tirets.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="category-name">Nom *</Label>
              <Input
                id="category-name"
                value={addName}
                onChange={(event) => setAddName(event.target.value)}
                maxLength={80}
                placeholder="Ex. : Accès à l'eau et à l'assainissement"
                disabled={pending !== null}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="category-desc">Description (facultative)</Label>
              <Textarea
                id="category-desc"
                value={addDescription}
                onChange={(event) => setAddDescription(event.target.value)}
                rows={3}
                maxLength={300}
                placeholder="À quoi correspond ce domaine d'engagement ?"
                disabled={pending !== null}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setAddOpen(false)} disabled={pending !== null}>
              Annuler
            </Button>
            <Button type="button" className="min-h-11" onClick={() => void handleAdd()} disabled={pending !== null}>
              {pending === "add" ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
              Créer la catégorie
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* — Dialog : renommage — */}
      <Dialog open={renameTarget !== null} onOpenChange={(open) => { if (!open && pending === null) setRenameTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renommer « {renameTarget?.name} »</DialogTitle>
            <DialogDescription>
              Le nom affiché et la description peuvent être modifiés. Le slug reste stable pour ne pas casser les
              filtres existants.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="rename-name">Nom *</Label>
              <Input
                id="rename-name"
                value={renameName}
                onChange={(event) => setRenameName(event.target.value)}
                maxLength={80}
                disabled={pending !== null}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rename-desc">Description</Label>
              <Textarea
                id="rename-desc"
                value={renameDescription}
                onChange={(event) => setRenameDescription(event.target.value)}
                rows={3}
                maxLength={300}
                disabled={pending !== null}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setRenameTarget(null)} disabled={pending !== null}>
              Annuler
            </Button>
            <Button type="button" className="min-h-11" onClick={() => void handleRename()} disabled={pending !== null}>
              {pending?.startsWith("rename-") ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* — AlertDialog : bascule active — */}
      <AlertDialog open={toggleTarget !== null} onOpenChange={(open) => { if (!open && pending === null) setToggleTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggleTarget?.isActive ? "Désactiver" : "Réactiver"} « {toggleTarget?.name} » ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleTarget?.isActive ? (
                toggleTarget.personsCount > 0 ? (
                  <>
                    {toggleTarget.personsCount} dossier{toggleTarget.personsCount > 1 ? "s" : ""}{" "}
                    {toggleTarget.personsCount > 1 ? "sont" : "est"} lié{toggleTarget.personsCount > 1 ? "s" : ""} à
                    cette catégorie, dont {toggleTarget.publishedCount} profil
                    {toggleTarget.publishedCount > 1 ? "s" : ""} publié{toggleTarget.publishedCount > 1 ? "s" : ""}.
                    Les profils publiés restent visibles, la catégorie disparaît des filtres et des futurs choix.
                    Rien n&apos;est effacé.
                  </>
                ) : (
                  "Aucun dossier n'est lié à cette catégorie. Elle disparaîtra des filtres et des futurs choix ; rien n'est effacé."
                )
              ) : (
                "Cette catégorie redeviendra proposable dans les filtres et les futurs choix de catégorie."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={pending !== null}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11"
              disabled={pending !== null}
              onClick={(event) => {
                event.preventDefault();
                void handleToggle();
              }}
            >
              {pending?.startsWith("toggle-") ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
