"use client";

// ---------------------------------------------------------------------------
// Gestion manuelle des badges (§12) — interface administration.
//
// Définitions (nom, description, critères, icône de la liste sûre, activation)
// et attributions manuelles : attribution sur un dossier PUBLISHED avec
// justification obligatoire, retrait logique avec justification. Un badge
// n'est jamais une certification officielle — la mention est affichée côté
// public. Aucune attribution automatique.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { Award, Loader2, Plus, Search, Undo2 } from "lucide-react";

import { getJson, patchJson, postJson } from "@/lib/client-api";
import { BADGE_ICON_NAMES } from "@/lib/badge-icons";
import { BadgeIcon } from "@/components/public/badge-icon";
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
import { toast } from "sonner";

interface BadgeAssignment {
  id: string;
  justification: string;
  awardedAt: string;
  awardedByName: string;
  person: {
    id: string;
    publicName: string | null;
    managementName: string;
    status: string;
  };
}

interface BadgeItem {
  id: string;
  name: string;
  description: string;
  criteria: string;
  icon: string | null;
  isActive: boolean;
  /** Attributions actives renvoyées par GET /api/admin/badges (clé activeAssignments). */
  activeAssignments: BadgeAssignment[];
}

interface BadgesResponse {
  badges: BadgeItem[];
}

interface DossierHit {
  id: string;
  managementName: string;
  publicName: string | null;
  status: string;
}

function formatDateFr(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

export function BadgesManager() {
  const [data, setData] = useState<BadgesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  // Création / édition
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", criteria: "", icon: "Award" });
  const [formError, setFormError] = useState<string | null>(null);

  // Attribution
  const [assignBadge, setAssignBadge] = useState<BadgeItem | null>(null);
  const [personQuery, setPersonQuery] = useState("");
  const [personHits, setPersonHits] = useState<DossierHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<DossierHit | null>(null);
  const [assignJustification, setAssignJustification] = useState("");
  const [assignError, setAssignError] = useState<string | null>(null);

  // Retrait
  const [revokeTarget, setRevokeTarget] = useState<{ badge: BadgeItem; assignment: BadgeAssignment } | null>(null);
  const [revokeJustification, setRevokeJustification] = useState("");
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getJson<BadgesResponse>("/api/admin/badges");
    if (result.ok) setData(result.data);
    else setError(result.error.message);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  /** Recherche des dossiers publiés pour l'attribution (débouncée). */
  useEffect(() => {
    if (!assignBadge) {
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      const params = new URLSearchParams({ status: "PUBLISHED", pageSize: "10" });
      if (personQuery.trim()) params.set("q", personQuery.trim());
      const result = await getJson<{ items: DossierHit[] }>(`/api/admin/dossiers?${params.toString()}`);
      if (result.ok) {
        setPersonHits(result.data.items);
      } else {
        setPersonHits([]);
      }
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [assignBadge, personQuery]);

  function openCreate() {
    setEditId(null);
    setForm({ name: "", description: "", criteria: "", icon: "Award" });
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(badge: BadgeItem) {
    setEditId(badge.id);
    setForm({
      name: badge.name,
      description: badge.description,
      criteria: badge.criteria,
      icon: badge.icon ?? "Award",
    });
    setFormError(null);
    setFormOpen(true);
  }

  async function submitForm() {
    setFormError(null);
    setPending("form");
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      criteria: form.criteria.trim(),
      icon: form.icon,
    };
    const result = editId
      ? await patchJson<BadgeItem>(`/api/admin/badges/${editId}`, payload)
      : await postJson<BadgeItem>("/api/admin/badges", payload);
    setPending(null);
    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }
    toast.success(editId ? "Badge mis à jour." : "Badge créé.");
    setFormOpen(false);
    void load();
  }

  async function toggleActive(badge: BadgeItem) {
    setPending(`active-${badge.id}`);
    const result = await patchJson<BadgeItem>(`/api/admin/badges/${badge.id}`, { isActive: !badge.isActive });
    setPending(null);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success(badge.isActive ? "Badge désactivé : il ne peut plus être attribué et disparaît des fiches publiques." : "Badge réactivé.");
    void load();
  }

  async function submitAssign() {
    if (!assignBadge || !selectedPerson) return;
    setAssignError(null);
    setPending("assign");
    const result = await postJson<{ message: string }>(`/api/admin/badges/${assignBadge.id}/assignments`, {
      personId: selectedPerson.id,
      justification: assignJustification.trim(),
    });
    setPending(null);
    if (!result.ok) {
      setAssignError(result.error.message);
      return;
    }
    toast.success("Badge attribué (justification enregistrée, action tracée).");
    setAssignBadge(null);
    setSelectedPerson(null);
    setPersonQuery("");
    setAssignJustification("");
    void load();
  }

  async function submitRevoke() {
    if (!revokeTarget) return;
    setRevokeError(null);
    setPending("revoke");
    const result = await patchJson<{ message: string }>(
      `/api/admin/badges/assignments/${revokeTarget.assignment.id}`,
      { justification: revokeJustification.trim() },
    );
    setPending(null);
    if (!result.ok) {
      setRevokeError(result.error.message);
      return;
    }
    toast.success("Badge retiré (retrait logique, justification tracée).");
    setRevokeTarget(null);
    setRevokeJustification("");
    void load();
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Les badges sont attribués manuellement, avec justification. Ils expriment la
          reconnaissance de la plateforme — jamais une certification officielle.
        </p>
        <Button className="min-h-11" onClick={openCreate}>
          <Plus aria-hidden="true" className="h-4 w-4" />
          Nouveau badge
        </Button>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="animate-spin" aria-hidden="true" /> Chargement des badges…
        </p>
      ) : error ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : !data || data.badges.length === 0 ? (
        <p className="rounded-lg border border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
          Aucun badge défini. Créez une première définition pour pouvoir attribuer une
          reconnaissance (§12 : gestion entièrement manuelle en première version).
        </p>
      ) : (
        <ul className="grid list-none gap-4 p-0">
          {data.badges.map((badge) => (
            <li key={badge.id} className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <BadgeIcon name={badge.icon} className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-base font-semibold text-foreground">{badge.name}</h3>
                      <Badge variant="outline" className={badge.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-stone-200 bg-stone-100 text-stone-600"}>
                        {badge.isActive ? "Actif" : "Désactivé"}
                      </Badge>
                    </div>
                    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{badge.description}</p>
                    <p className="mt-1 max-w-2xl text-xs text-muted-foreground/90">
                      <span className="font-medium">Critères :</span> {badge.criteria}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={badge.isActive}
                      disabled={pending !== null}
                      onCheckedChange={() => void toggleActive(badge)}
                      aria-label={badge.isActive ? `Désactiver le badge ${badge.name}` : `Réactiver le badge ${badge.name}`}
                    />
                    <span className="text-xs text-muted-foreground">{badge.isActive ? "Actif" : "Inactif"}</span>
                  </div>
                  <Button variant="outline" className="min-h-9" onClick={() => openEdit(badge)}>
                    Modifier
                  </Button>
                  <Button
                    className="min-h-9"
                    disabled={!badge.isActive || pending !== null}
                    onClick={() => {
                      setAssignBadge(badge);
                      setSelectedPerson(null);
                      setPersonQuery("");
                      setAssignJustification("");
                      setAssignError(null);
                    }}
                  >
                    <Award aria-hidden="true" className="h-4 w-4" />
                    Attribuer
                  </Button>
                </div>
              </div>

              <div className="mt-4">
                <h4 className="text-sm font-medium text-foreground">
                  Attributions actives ({badge.activeAssignments.length})
                </h4>
                {badge.activeAssignments.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">Aucune attribution active pour ce badge.</p>
                ) : (
                  <ul className="mt-2 grid list-none gap-2 p-0">
                    {badge.activeAssignments.map((assignment) => (
                      <li
                        key={assignment.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">
                            {assignment.person.publicName ?? assignment.person.managementName}
                            <time dateTime={assignment.awardedAt} className="ml-2 text-xs font-normal text-muted-foreground">
                              — attribué le {formatDateFr(assignment.awardedAt)} par {assignment.awardedByName}
                            </time>
                          </p>
                          <p className="mt-0.5 break-words text-xs text-muted-foreground">{assignment.justification}</p>
                        </div>
                        <Button
                          variant="ghost"
                          className="min-h-9 shrink-0"
                          disabled={pending !== null}
                          onClick={() => {
                            setRevokeTarget({ badge, assignment });
                            setRevokeJustification("");
                            setRevokeError(null);
                          }}
                        >
                          <Undo2 aria-hidden="true" className="h-4 w-4" />
                          Retirer
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* — Dialog création / édition de badge — */}
      <Dialog open={formOpen} onOpenChange={(open) => { if (!open && pending === null) setFormOpen(false); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Modifier le badge" : "Nouveau badge"}</DialogTitle>
            <DialogDescription>
              Nom, description et critères apparaissent sur les fiches publiques des personnes
              attributaires. L&apos;icône provient d&apos;une liste fermée (sécurité).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="badge-name">Nom du badge (60 caractères max.)</Label>
              <Input
                id="badge-name"
                value={form.name}
                onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))}
                maxLength={60}
                className="min-h-11"
                placeholder="Ex. : Engagement communautaire"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="badge-description">Description (300 caractères max.)</Label>
              <Textarea
                id="badge-description"
                value={form.description}
                onChange={(event) => setForm((f) => ({ ...f, description: event.target.value }))}
                maxLength={300}
                rows={2}
                className="resize-none"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="badge-criteria">Critères d&apos;attribution (400 caractères max.)</Label>
              <Textarea
                id="badge-criteria"
                value={form.criteria}
                onChange={(event) => setForm((f) => ({ ...f, criteria: event.target.value }))}
                maxLength={400}
                rows={2}
                className="resize-none"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="badge-icon">Icône</Label>
              <select
                id="badge-icon"
                value={form.icon}
                onChange={(event) => setForm((f) => ({ ...f, icon: event.target.value }))}
                className="min-h-11 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {BADGE_ICON_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            {formError ? (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" className="min-h-11" disabled={pending !== null} onClick={() => setFormOpen(false)}>
              Annuler
            </Button>
            <Button className="min-h-11" disabled={pending !== null || form.name.trim().length < 2} onClick={() => void submitForm()}>
              {pending === "form" ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {editId ? "Enregistrer" : "Créer le badge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* — Dialog attribution — */}
      <Dialog open={assignBadge !== null} onOpenChange={(open) => { if (!open && pending === null) setAssignBadge(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Attribuer « {assignBadge?.name} »</DialogTitle>
            <DialogDescription>
              Choisissez un dossier <strong>publié</strong> (la reconnaissance ne s&apos;affiche
              que sur des fiches publiques) et justifiez la décision — la justification est
              obligatoire et tracée dans le journal d&apos;audit.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="person-search">Rechercher un dossier publié</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="person-search"
                  value={personQuery}
                  onChange={(event) => setPersonQuery(event.target.value)}
                  maxLength={120}
                  className="min-h-11 pl-9"
                  placeholder="Nom de gestion ou nom public…"
                />
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-border" role="listbox" aria-label="Dossiers publiés correspondants">
              {searching ? (
                <p className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Recherche…
                </p>
              ) : personHits.length === 0 ? (
                <p className="px-3 py-3 text-sm text-muted-foreground">
                  Aucun dossier publié ne correspond. Seuls les profils publiés peuvent recevoir un badge.
                </p>
              ) : (
                personHits.map((hit) => (
                  <button
                    key={hit.id}
                    type="button"
                    role="option"
                    aria-selected={selectedPerson?.id === hit.id}
                    className={`flex w-full items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-foreground/5 ${selectedPerson?.id === hit.id ? "bg-primary/10" : ""}`}
                    onClick={() => setSelectedPerson(hit)}
                  >
                    <span className="min-w-0 truncate">
                      {hit.publicName ?? hit.managementName}
                      <span className="ml-2 text-xs text-muted-foreground">({hit.managementName})</span>
                    </span>
                    {selectedPerson?.id === hit.id ? <Badge variant="secondary">Choisi</Badge> : null}
                  </button>
                ))
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="assign-justification">Justification (10 à 600 caractères)</Label>
              <Textarea
                id="assign-justification"
                value={assignJustification}
                onChange={(event) => setAssignJustification(event.target.value)}
                maxLength={600}
                rows={3}
                className="resize-none"
                placeholder="Pourquoi ce badge est attribué (critères rencontrés, éléments documentés…)"
              />
            </div>
            {assignError ? (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {assignError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" className="min-h-11" disabled={pending !== null} onClick={() => setAssignBadge(null)}>
              Annuler
            </Button>
            <Button
              className="min-h-11"
              disabled={pending !== null || !selectedPerson || assignJustification.trim().length < 10}
              onClick={() => void submitAssign()}
            >
              {pending === "assign" ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Attribuer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* — Dialog retrait — */}
      <Dialog open={revokeTarget !== null} onOpenChange={(open) => { if (!open && pending === null) setRevokeTarget(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Retirer « {revokeTarget?.badge.name} » à{" "}
              {revokeTarget?.assignment.person.publicName ?? revokeTarget?.assignment.person.managementName} ?
            </DialogTitle>
            <DialogDescription>
              Le retrait est logique (historique conservé) : il disparaît de la fiche publique et
              reste tracé. Une justification est obligatoire.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="revoke-justification">Justification du retrait (10 à 600 caractères)</Label>
            <Textarea
              id="revoke-justification"
              value={revokeJustification}
              onChange={(event) => setRevokeJustification(event.target.value)}
              maxLength={600}
              rows={3}
              className="resize-none"
            />
          </div>
          {revokeError ? (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {revokeError}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" className="min-h-11" disabled={pending !== null} onClick={() => setRevokeTarget(null)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              className="min-h-11"
              disabled={pending !== null || revokeJustification.trim().length < 10}
              onClick={() => void submitRevoke()}
            >
              {pending === "revoke" ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Retirer le badge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
