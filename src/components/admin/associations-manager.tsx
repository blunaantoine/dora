"use client";

// ---------------------------------------------------------------------------
// Gestion des associations et ONG partenaires — côté client.
//
//   • liste : nom, sigle, domaines, localisation, état d'adhésion, état actif ;
//   • ajout (Dialog) : nom, sigle, mission, domaines (1 à 4), localisation,
//     coordonnées, adhésion ouverte + modalités ;
//   • édition (même formulaire) ;
//   • activation / désactivation (AlertDialog) : une organisation désactivée
//     disparaît de l'annuaire public sans jamais être supprimée.
//
// Toutes les opérations passent par /api/admin/associations (permission
// MANAGE_PARTNERS vérifiée côté serveur, journalisées PARTNER_CREATED /
// PARTNER_UPDATED). La liste des domaines vient de /api/admin/categories.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface DomainOption {
  slug: string;
  name: string;
}

interface OrganizationRow {
  id: string;
  name: string;
  acronym: string | null;
  slug: string;
  mission: string;
  city: string | null;
  region: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  membershipOpen: boolean;
  membershipInfo: string | null;
  isActive: boolean;
  domains: { slug: string; name: string }[];
}

interface OrganizationForm {
  name: string;
  acronym: string;
  mission: string;
  domainSlugs: string[];
  city: string;
  region: string;
  website: string;
  email: string;
  phone: string;
  membershipOpen: boolean;
  membershipInfo: string;
}

const EMPTY_FORM: OrganizationForm = {
  name: "",
  acronym: "",
  mission: "",
  domainSlugs: [],
  city: "",
  region: "",
  website: "",
  email: "",
  phone: "",
  membershipOpen: true,
  membershipInfo: "",
};

const MAX_DOMAINS = 4;

/** Erreurs de champ renvoyées par l'API (400 VALIDATION_ERROR). */
function extractFieldErrors(fields: unknown): string[] {
  if (!fields || typeof fields !== "object") return [];
  return Object.values(fields as Record<string, unknown>)
    .flatMap((value) => (Array.isArray(value) ? value.map(String) : [String(value)]));
}

export function AssociationsManager() {
  const router = useRouter();
  const { toast } = useToast();

  const [organizations, setOrganizations] = useState<OrganizationRow[] | null>(null);
  const [domains, setDomains] = useState<DomainOption[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Formulaire (création ou édition)
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<OrganizationRow | null>(null);
  const [form, setForm] = useState<OrganizationForm>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Bascule d'activation
  const [toggleTarget, setToggleTarget] = useState<OrganizationRow | null>(null);

  const loadOrganizations = useCallback(async () => {
    const result = await getJson<{ organizations: OrganizationRow[] }>("/api/admin/associations");
    if (result.ok) {
      setOrganizations(result.data.organizations);
    } else {
      setOrganizations([]);
      toast({
        title: "Impossible de charger les organisations",
        description: result.error?.message ?? "Réessayez dans un instant.",
        variant: "destructive",
      });
    }
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [orgs, cats] = await Promise.all([
        getJson<{ organizations: OrganizationRow[] }>("/api/admin/associations"),
        getJson<{ categories: { slug: string; name: string; isActive: boolean }[] }>("/api/admin/categories"),
      ]);
      if (cancelled) return;
      if (orgs.ok) setOrganizations(orgs.data.organizations);
      else setOrganizations([]);
      if (cats.ok) {
        setDomains(
          cats.data.categories
            .filter((c) => c.isActive)
            .map((c) => ({ slug: c.slug, name: c.name })),
        );
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey, toast]);

  const activeCount = useMemo(
    () => organizations?.filter((o) => o.isActive).length ?? 0,
    [organizations],
  );

  function openCreate() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setFormErrors([]);
    setFormOpen(true);
  }

  function openEdit(org: OrganizationRow) {
    setEditTarget(org);
    setForm({
      name: org.name,
      acronym: org.acronym ?? "",
      mission: org.mission,
      domainSlugs: org.domains.map((d) => d.slug),
      city: org.city ?? "",
      region: org.region ?? "",
      website: org.website ?? "",
      email: org.email ?? "",
      phone: org.phone ?? "",
      membershipOpen: org.membershipOpen,
      membershipInfo: org.membershipInfo ?? "",
    });
    setFormErrors([]);
    setFormOpen(true);
  }

  function toggleDomain(slug: string) {
    setForm((previous) => {
      const has = previous.domainSlugs.includes(slug);
      if (has) {
        return { ...previous, domainSlugs: previous.domainSlugs.filter((s) => s !== slug) };
      }
      if (previous.domainSlugs.length >= MAX_DOMAINS) return previous;
      return { ...previous, domainSlugs: [...previous.domainSlugs, slug] };
    });
  }

  async function submitForm() {
    setSaving(true);
    setFormErrors([]);
    try {
      const result = editTarget
        ? await patchJson<{ organization: OrganizationRow }>(
            `/api/admin/associations?id=${encodeURIComponent(editTarget.id)}`,
            { ...form, isActive: editTarget.isActive },
          )
        : await postJson<{ organization: OrganizationRow }>("/api/admin/associations", form);

      if (result.ok) {
        toast({
          title: editTarget ? "Organisation mise à jour" : "Organisation ajoutée",
          description: `${form.name} est ${editTarget ? "enregistrée" : "visible dans l'annuaire public"}.`,
        });
        setFormOpen(false);
        setOrganizations(null);
        setReloadKey((k) => k + 1);
        router.refresh();
      } else {
        const fieldErrors = extractFieldErrors(result.error?.fields);
        setFormErrors(
          fieldErrors.length > 0
            ? fieldErrors
            : [result.error?.message ?? "Une erreur est survenue. Réessayez."],
        );
      }
    } finally {
      setSaving(false);
    }
  }

  async function confirmToggle() {
    if (!toggleTarget) return;
    setPendingId(toggleTarget.id);
    try {
      const result = await patchJson<{ organization: OrganizationRow }>(
        `/api/admin/associations?id=${encodeURIComponent(toggleTarget.id)}`,
        {
          name: toggleTarget.name,
          acronym: toggleTarget.acronym ?? "",
          mission: toggleTarget.mission,
          domainSlugs: toggleTarget.domains.map((d) => d.slug),
          city: toggleTarget.city ?? "",
          region: toggleTarget.region ?? "",
          website: toggleTarget.website ?? "",
          email: toggleTarget.email ?? "",
          phone: toggleTarget.phone ?? "",
          membershipOpen: toggleTarget.membershipOpen,
          membershipInfo: toggleTarget.membershipInfo ?? "",
          isActive: !toggleTarget.isActive,
        },
      );
      if (result.ok) {
        toast({
          title: result.data.organization.isActive ? "Organisation réactivée" : "Organisation désactivée",
          description: result.data.organization.isActive
            ? `${toggleTarget.name} est de nouveau visible dans l'annuaire public.`
            : `${toggleTarget.name} n'apparaît plus dans l'annuaire public (historique conservé).`,
        });
        setOrganizations(null);
        setReloadKey((k) => k + 1);
        router.refresh();
      } else {
        toast({
          title: "Action impossible",
          description: result.error?.message ?? "Réessayez dans un instant.",
          variant: "destructive",
        });
      }
    } finally {
      setPendingId(null);
      setToggleTarget(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {organizations === null
            ? "Chargement…"
            : `${organizations.length} organisation(s) enregistrée(s) — ${activeCount} active(s).`}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="min-h-11 border-[#D9D2BF]"
            onClick={() => {
              setOrganizations(null);
              setReloadKey((k) => k + 1);
            }}
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            <span className="sr-only sm:not-sr-only sm:ml-2">Actualiser</span>
          </Button>
          <Button size="sm" className="min-h-11 bg-pine text-[#F8F5EF] hover:bg-pine-soft" onClick={openCreate}>
            <Plus aria-hidden="true" className="size-4" />
            <span className="sr-only sm:not-sr-only sm:ml-2">Ajouter une organisation</span>
          </Button>
        </div>
      </div>

      {organizations === null ? (
        <div className="flex items-center justify-center rounded-2xl border border-border bg-card p-12 text-muted-foreground">
          <Loader2 aria-hidden="true" className="size-6 animate-spin" />
          <span className="sr-only">Chargement des organisations</span>
        </div>
      ) : organizations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-[15px] text-muted-foreground">
            Aucune organisation enregistrée. Ajoutez la première pour lancer l&apos;annuaire public.
          </p>
        </div>
      ) : (
        <ul className="space-y-3" aria-label="Organisations partenaires">
          {organizations.map((org) => (
            <li
              key={org.id}
              className={`rounded-2xl border border-border bg-card p-5 ${
                org.isActive ? "" : "opacity-70"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-display text-base font-semibold leading-snug">
                    {org.name}
                    {org.acronym ? <span className="text-muted-foreground"> · {org.acronym}</span> : null}
                  </h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {[org.city, org.region].filter(Boolean).join(", ") || "Togo"} ·{" "}
                    <a
                      href={`/associations/${org.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-4 hover:text-foreground"
                    >
                      /associations/{org.slug}
                    </a>
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {org.isActive ? (
                    <Badge variant="outline" className="border-[#2E6B4F]/40 bg-[#EAF3EC] text-[#2E6B4F]">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Désactivée
                    </Badge>
                  )}
                  <Badge variant="outline" className={org.membershipOpen ? "border-[#2E6B4F]/40 text-[#2E6B4F]" : ""}>
                    {org.membershipOpen ? "Adhésion ouverte" : "Adhésion fermée"}
                  </Badge>
                </div>
              </div>

              <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Domaines">
                {org.domains.map((d) => (
                  <li
                    key={d.slug}
                    className="rounded-full border border-[#D9D2BF] bg-background px-2.5 py-0.5 text-xs font-medium text-foreground/80"
                  >
                    {d.name}
                  </li>
                ))}
              </ul>

              <div className="mt-3.5 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-11 border-[#D9D2BF]"
                  onClick={() => openEdit(org)}
                >
                  Modifier
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-11"
                  disabled={pendingId === org.id}
                  onClick={() => setToggleTarget(org)}
                >
                  {pendingId === org.id ? (
                    <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                  ) : (
                    <Power aria-hidden="true" className="size-4" />
                  )}
                  <span className="ml-2">{org.isActive ? "Désactiver" : "Réactiver"}</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Dialog de création / édition */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? "Modifier l'organisation" : "Ajouter une organisation"}
            </DialogTitle>
            <DialogDescription>
              Les informations publiées apparaissent dans l&apos;annuaire public /associations.
              Les champs marqués d&apos;un * sont obligatoires.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submitForm();
            }}
          >
            {formErrors.length > 0 ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
                <ul className="list-disc space-y-1 pl-4">
                  {formErrors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <Label htmlFor="org-name">Nom de l&apos;organisation *</Label>
                <Input
                  id="org-name"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  maxLength={120}
                  required
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="org-acronym">Sigle</Label>
                <Input
                  id="org-acronym"
                  value={form.acronym}
                  onChange={(event) => setForm({ ...form, acronym: event.target.value })}
                  maxLength={20}
                  placeholder="Ex. CAIFS"
                  className="mt-1.5"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="org-mission">Mission *</Label>
              <Textarea
                id="org-mission"
                value={form.mission}
                onChange={(event) => setForm({ ...form, mission: event.target.value })}
                rows={4}
                maxLength={1500}
                required
                placeholder="Que fait l'organisation, pour qui, avec quels résultats ? (20 caractères minimum)"
                className="mt-1.5"
              />
              <p className="mt-1 text-xs text-muted-foreground">{form.mission.length}/1500</p>
            </div>

            <fieldset>
              <legend className="text-sm font-medium">
                Domaines d&apos;intervention * <span className="text-muted-foreground">(jusqu&apos;à {MAX_DOMAINS})</span>
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {domains.map((domain) => {
                  const on = form.domainSlugs.includes(domain.slug);
                  return (
                    <button
                      key={domain.slug}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleDomain(domain.slug)}
                      className={`min-h-11 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none ${
                        on
                          ? "border-pine bg-pine text-[#F8F5EF]"
                          : "border-[#D9D2BF] bg-card text-foreground hover:border-pine hover:bg-accent"
                      }`}
                    >
                      {domain.name}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="org-city">Ville</Label>
                <Input
                  id="org-city"
                  value={form.city}
                  onChange={(event) => setForm({ ...form, city: event.target.value })}
                  maxLength={80}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="org-region">Région</Label>
                <Input
                  id="org-region"
                  value={form.region}
                  onChange={(event) => setForm({ ...form, region: event.target.value })}
                  maxLength={80}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="org-website">Site web</Label>
                <Input
                  id="org-website"
                  type="url"
                  value={form.website}
                  onChange={(event) => setForm({ ...form, website: event.target.value })}
                  maxLength={200}
                  placeholder="https://…"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="org-email">Adresse e-mail</Label>
                <Input
                  id="org-email"
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  maxLength={160}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="org-phone">Téléphone</Label>
                <Input
                  id="org-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  maxLength={30}
                  placeholder="+228 90 00 00 00"
                  className="mt-1.5"
                />
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label htmlFor="org-membership-open" className="text-sm font-semibold">
                    Adhésion ouverte *
                  </Label>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Indique si l&apos;on peut intégrer la communauté de l&apos;organisation. La réponse
                    s&apos;affiche dans l&apos;annuaire public — restez exact.
                  </p>
                </div>
                <Switch
                  id="org-membership-open"
                  checked={form.membershipOpen}
                  onCheckedChange={(checked) => setForm({ ...form, membershipOpen: checked })}
                  className="mt-1 shrink-0"
                />
              </div>
              <div className="mt-3">
                <Label htmlFor="org-membership-info">
                  Modalités d&apos;adhésion {form.membershipOpen ? "(comment rejoindre ?)" : "(pourquoi ferme ?)"}
                </Label>
                <Textarea
                  id="org-membership-info"
                  value={form.membershipInfo}
                  onChange={(event) => setForm({ ...form, membershipInfo: event.target.value })}
                  rows={3}
                  maxLength={1000}
                  placeholder={
                    form.membershipOpen
                      ? "Ex. cotisation, réunion d'accueil, contact dédié, période d'inscription…"
                      : "Ex. cohortes annuelles, capacité saturée, réouverture en janvier…"
                  }
                  className="mt-1.5"
                />
                <p className="mt-1 text-xs text-muted-foreground">{form.membershipInfo.length}/1000</p>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 border-[#D9D2BF]"
                onClick={() => setFormOpen(false)}
                disabled={saving}
              >
                Annuler
              </Button>
              <Button type="submit" className="min-h-11 bg-pine text-[#F8F5EF] hover:bg-pine-soft" disabled={saving}>
                {saving ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
                {editTarget ? "Enregistrer" : "Ajouter"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmation d'activation / désactivation */}
      <AlertDialog open={toggleTarget !== null} onOpenChange={(open) => !open && setToggleTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggleTarget?.isActive ? "Désactiver" : "Réactiver"} « {toggleTarget?.name} » ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleTarget?.isActive
                ? "L'organisation disparaîtra immédiatement de l'annuaire public /associations. Rien n'est supprimé : sa fiche reste modifiable et peut être réactivée à tout moment."
                : "L'organisation redeviendra visible dans l'annuaire public, avec sa fiche actuelle."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 bg-pine text-[#F8F5EF] hover:bg-pine-soft"
              onClick={(event) => {
                event.preventDefault();
                void confirmToggle();
              }}
            >
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
