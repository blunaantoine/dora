"use client";

// ---------------------------------------------------------------------------
// UI admin des invitations (§6) — composants clients consommant les API
// réelles de la tâche 3-a :
//   POST  /api/admin/invitations {personRecordId}   → { invitation, token, url, urlAbsolue }
//   PATCH /api/admin/invitations/[id] {action:"revoke"|"renew"}
//   GET   /api/admin/dossiers?q=&status=…           → recherche de dossiers éligibles
//
// Le jeton brut n'est JAMAIS ré-affiché après coup : il apparaît une seule
// fois (Alert + copie presse-papiers), conformément au contrat serveur.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Link2, Loader2, MailPlus, RefreshCw, ShieldBan, Search } from "lucide-react";

import {
  DOSSIER_FORM_OPEN_STATUSES,
  DOSSIER_STATUS_BADGE_CLASS,
  DOSSIER_STATUS_LABELS,
  type DossierStatus,
} from "@/lib/constants";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// --- Affichage unique du lien d'invitation -----------------------------------

export function LinkReveal({ url, urlAbsolue }: { url: string; urlAbsolue?: string }) {
  const { toast } = useToast();
  // L'URL absolue renvoyée par le serveur fait foi ; repli sur l'origine courante.
  // Ce composant n'est rendu qu'après une action utilisateur (fenêtre ouverte),
  // l'accès à window y est donc sûr.
  const link =
    urlAbsolue ||
    (typeof window === "undefined" ? url : `${window.location.origin}${url}`);

  async function copyLink() {
    if (!link) return;
    let copied = false;
    try {
      await navigator.clipboard.writeText(link);
      copied = true;
    } catch {
      // Repli pour les contextes sans Clipboard API.
      try {
        const area = document.createElement("textarea");
        area.value = link;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        copied = document.execCommand("copy");
        area.remove();
      } catch {
        copied = false;
      }
    }
    if (copied) {
      toast({
        title: "Lien copié",
        description: "Collez-le dans votre message à la participante, via un canal privé.",
      });
    } else {
      toast({
        variant: "destructive",
        title: "Copie impossible",
        description: "Sélectionnez le lien ci-dessus et copiez-le manuellement.",
      });
    }
  }

  return (
    <Alert className="border-emerald-300 bg-emerald-50 [&>svg]:text-emerald-700">
      <Link2 aria-hidden="true" />
      <AlertTitle className="text-emerald-900">Lien d&apos;invitation créé</AlertTitle>
      <AlertDescription className="grid gap-3 text-emerald-900/90">
        <span>
          Transmettez ce lien à la personne concernée (WhatsApp, e-mail…). Elle seule pourra
          remplir le formulaire.
        </span>
        <span className="block rounded-md border border-emerald-200 bg-white px-3 py-2 font-mono text-xs break-all text-foreground select-all">
          {link || url}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={copyLink} className="min-h-11 sm:min-h-9">
            <Copy aria-hidden="true" />
            Copier le lien
          </Button>
        </span>
        <span className="text-xs font-medium">
          Attention : ce lien ne sera plus affiché. Copiez-le maintenant — il ne peut pas être
          retrouvé par la suite (seule une nouvelle invitation ou un renouvellement en génère un
          autre).
        </span>
      </AlertDescription>
    </Alert>
  );
}

// --- Création d'une invitation ------------------------------------------------

interface DossierOption {
  id: string;
  managementName?: string | null;
  publicName?: string | null;
  status: string;
  isMinor?: boolean;
}

export function CreateInvitationDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="min-h-11">
          <MailPlus aria-hidden="true" />
          Créer une invitation
        </Button>
      </DialogTrigger>
      {/* Le contenu est démonté à la fermeture : état repart à zéro — aucun
          reliquat d'un lien précédent n'est conservé ni ré-affiché. */}
      {open ? <CreateInvitationContent onClose={() => setOpen(false)} /> : null}
    </Dialog>
  );
}

function CreateInvitationContent({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DossierOption[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<DossierOption | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ url: string; urlAbsolue?: string } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Recherche débounced des dossiers éligibles (statuts ouverts au formulaire).
  useEffect(() => {
    if (reveal) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void (async () => {
        setSearching(true);
        const params = new URLSearchParams({
          status: DOSSIER_FORM_OPEN_STATUSES.join(","),
          pageSize: "8",
        });
        if (query.trim() !== "") params.set("q", query.trim());
        const result = await getJson<{ items: DossierOption[] }>(
          `/api/admin/dossiers?${params.toString()}`,
        );
        setSearching(false);
        if (!result.ok) {
          setResults([]);
          setSearched(true);
          setCreateError(result.error.message);
          return;
        }
        setResults(result.data.items);
        setSearched(true);
      })();
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, reveal]);

  async function handleCreate() {
    if (!selected || creating) return;
    setCreating(true);
    setCreateError(null);
    const result = await postJson<{ token: string; url: string; urlAbsolue: string }>(
      "/api/admin/invitations",
      { personRecordId: selected.id },
    );
    setCreating(false);
    if (!result.ok) {
      setCreateError(result.error.message);
      return;
    }
    setReveal({ url: result.data.url, urlAbsolue: result.data.urlAbsolue });
    router.refresh();
  }

  return (
    <DialogContent className="sm:max-w-lg">
        {reveal ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-display">Invitation créée</DialogTitle>
              <DialogDescription>
                Dossier : {selected?.managementName || selected?.publicName || "—"}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <LinkReveal url={reveal.url} urlAbsolue={reveal.urlAbsolue} />
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => {
                  setReveal(null);
                  onClose();
                }}
              >
                J&apos;ai copié le lien — fermer
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-display">Créer une invitation</DialogTitle>
              <DialogDescription>
                Choisissez un dossier en préparation (brouillon, invitation créée/envoyée ou en
                cours de remplissage). Si une invitation active existe déjà pour ce dossier, elle
                sera automatiquement révoquée et remplacée.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="invitation-dossier-search">Rechercher un dossier</Label>
                <div className="relative">
                  <Search
                    aria-hidden="true"
                    className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id="invitation-dossier-search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Nom, prénom ou nom public…"
                    className="min-h-11 bg-white pl-9"
                    autoComplete="off"
                  />
                </div>
              </div>

              {createError ? (
                <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                  {createError}
                </p>
              ) : null}

              <div className="max-h-72 overflow-y-auto rounded-lg border border-border" role="listbox" aria-label="Dossiers éligibles">
                {searching ? (
                  <p role="status" className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
                    <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                    Recherche…
                  </p>
                ) : results.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                    {searched
                      ? "Aucun dossier éligible ne correspond à cette recherche. Créez d'abord le dossier dans la liste des dossiers."
                      : "Saisissez un nom pour rechercher un dossier."}
                  </p>
                ) : (
                  <ul className="grid list-none gap-1 p-1">
                    {results.map((dossier) => {
                      const isSelected = selected?.id === dossier.id;
                      return (
                        <li key={dossier.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => setSelected(dossier)}
                            className={cn(
                              "flex w-full flex-col items-start gap-1 rounded-md px-3 py-2.5 text-left transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                              isSelected ? "bg-accent" : "hover:bg-muted/60",
                            )}
                          >
                            <span className="text-sm font-medium text-foreground">
                              {dossier.managementName || dossier.publicName || "Dossier sans nom"}
                            </span>
                            <span className="flex flex-wrap items-center gap-1.5">
                              <Badge
                                variant="outline"
                                className={cn(
                                  DOSSIER_STATUS_BADGE_CLASS[dossier.status as DossierStatus],
                                )}
                              >
                                {DOSSIER_STATUS_LABELS[dossier.status as DossierStatus] ?? dossier.status}
                              </Badge>
                              {dossier.isMinor ? (
                                <Badge variant="outline" className="border-gold/60 bg-gold/15 text-pine">
                                  Mineure
                                </Badge>
                              ) : null}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <Button
                type="button"
                onClick={handleCreate}
                disabled={!selected || creating}
                className="min-h-11"
              >
                {creating ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
                {creating ? "Création…" : "Créer l'invitation pour ce dossier"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
  );
}

// --- Actions sur une invitation (révoquer / renouveler) ------------------------

export function InvitationRowActions({
  invitationId,
  status,
  dossierName,
}: {
  invitationId: string;
  status: string;
  dossierName: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [pending, setPending] = useState<"revoke" | "renew" | null>(null);
  const [reveal, setReveal] = useState<{ url: string; urlAbsolue?: string } | null>(null);

  if (status !== "ACTIVE") {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  async function runAction(action: "revoke" | "renew") {
    if (pending) return;
    setPending(action);
    const result = await patchJson<{
      invitation: { id: string; status: string };
      token?: string;
      url?: string;
      urlAbsolue?: string;
    }>(`/api/admin/invitations/${invitationId}`, { action });
    setPending(null);

    if (!result.ok) {
      toast({ variant: "destructive", title: "Action impossible", description: result.error.message });
      return;
    }

    if (action === "revoke") {
      setRevokeOpen(false);
      toast({ title: "Invitation révoquée", description: "Le lien cesse immédiatement d'être utilisable." });
      router.refresh();
      return;
    }

    // renew : nouveau jeton affiché une seule fois.
    setRenewOpen(false);
    if (result.data.url) {
      setReveal({ url: result.data.url, urlAbsolue: result.data.urlAbsolue });
    }
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 sm:min-h-9"
          onClick={() => setRenewOpen(true)}
          disabled={pending !== null}
        >
          <RefreshCw aria-hidden="true" className="size-4" />
          Renouveler
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11 text-destructive hover:bg-destructive/10 hover:text-destructive sm:min-h-9"
          onClick={() => setRevokeOpen(true)}
          disabled={pending !== null}
        >
          <ShieldBan aria-hidden="true" className="size-4" />
          Révoquer
        </Button>
      </div>

      {/* Révocation */}
      <AlertDialog open={revokeOpen} onOpenChange={(open) => !pending && setRevokeOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Révoquer l&apos;invitation de {dossierName} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le lien actuel cessera immédiatement d&apos;être utilisable. La personne ne pourra
              plus accéder à son formulaire ; créez une nouvelle invitation pour lui redonner
              accès.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={pending !== null}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 bg-destructive text-white hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void runAction("revoke");
              }}
              disabled={pending !== null}
            >
              {pending === "revoke" ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
              {pending === "revoke" ? "Révocation…" : "Révoquer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Renouvellement */}
      <AlertDialog open={renewOpen} onOpenChange={(open) => !pending && setRenewOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Renouveler l&apos;invitation de {dossierName} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Un nouveau jeton sera généré (nouveau délai de 30 jours) et l&apos;ancien lien
              deviendra définitivement inutilisable. Le nouveau lien ne sera affiché qu&apos;une
              seule fois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={pending !== null}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11"
              onClick={(event) => {
                event.preventDefault();
                void runAction("renew");
              }}
              disabled={pending !== null}
            >
              {pending === "renew" ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
              {pending === "renew" ? "Renouvellement…" : "Renouveler"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Nouveau lien (affiché une seule fois) */}
      <Dialog open={reveal !== null} onOpenChange={(open) => !open && setReveal(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">Nouveau lien généré</DialogTitle>
            <DialogDescription>
              Invitation de {dossierName} renouvelée — l&apos;ancien lien ne fonctionne plus.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            {reveal ? <LinkReveal url={reveal.url} urlAbsolue={reveal.urlAbsolue} /> : null}
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => setReveal(null)}
            >
              J&apos;ai copié le lien — fermer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
