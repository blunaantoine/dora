"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, ShieldAlert, Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { postJson, patchJson, ClientApiError } from "@/lib/client-api";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/constants";
import { cn } from "@/lib/utils";

export interface UserRow {
  id: string;
  displayName: string;
  email: string;
  role: string;
  isActive: boolean;
  lastLoginLabel: string | null;
  createdLabel: string;
}

interface PendingAction {
  userId: string;
  kind: "deactivate" | "activate" | "role";
  nextRole?: Role;
}

const ROLE_BADGE_CLASS: Record<Role, string> = {
  ADMIN: "border-pine/40 bg-pine text-[#F8F5EF]",
  MODERATOR: "border-stone-300 bg-stone-100 text-stone-700",
  EDITOR: "border-gold/60 bg-gold/15 text-pine",
};

// Gestion des comptes équipe : création, activation/désactivation, rôle.
// Toutes les mutations passent par /api/admin/users (aucune server action) ;
// les protections sensibles sont appliquées côté serveur et doublées ici
// (pas d'action sur son propre compte, confirmation pour chaque action).
export function UsersManager({
  users,
  currentUserId,
}: {
  users: UserRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [createOpen, setCreateOpen] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [actingUserId, setActingUserId] = useState<string | null>(null);

  const lastActiveAdmin = useMemo(
    () =>
      users.filter((u) => u.role === "ADMIN" && u.isActive).length <= 1
        ? users.find((u) => u.role === "ADMIN" && u.isActive)
        : undefined,
    [users],
  );

  async function applyPending() {
    if (!pending) return;
    setActingUserId(pending.userId);

    try {
      if (pending.kind === "role") {
        const result = await patchJson(`/api/admin/users/${pending.userId}`, { role: pending.nextRole });
        if (!result.ok) throw result.error;
        toast({
          title: "Rôle modifié",
          description: "Le rôle du compte a été mis à jour et ses sessions ont été renouvelées.",
        });
      } else {
        const deactivate = pending.kind === "deactivate";
        const result = await patchJson(`/api/admin/users/${pending.userId}`, {
          isActive: !deactivate,
        });
        if (!result.ok) throw result.error;
        toast({
          title: deactivate ? "Compte désactivé" : "Compte réactivé",
          description: deactivate
            ? "Le compte est désactivé : ses sessions ont été révoquées immédiatement."
            : "Le compte peut de nouveau se connecter.",
        });
      }
      router.refresh();
    } catch (error) {
      const message =
        error instanceof ClientApiError ? error.message : "Une erreur inattendue est survenue.";
      toast({ title: "Action impossible", description: message, variant: "destructive" });
    } finally {
      setActingUserId(null);
      setPending(null);
    }
  }

  return (
    <div>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
            Utilisateurs
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Comptes de l&apos;équipe. Vous ne pouvez pas modifier votre propre compte, et le
            dernier compte administrateur actif ne peut pas être désactivé.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden="true" />
          Nouvel administrateur
        </Button>
      </header>

      <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead>Nom</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Actif</TableHead>
                <TableHead>Dernière connexion</TableHead>
                <TableHead>Créé le</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const isSelf = user.id === currentUserId;
                const isLastAdmin =
                  lastActiveAdmin !== undefined && lastActiveAdmin.id === user.id;
                const busy = actingUserId === user.id;
                return (
                  <TableRow key={user.id} className={cn(busy && "opacity-60")}>
                    <TableCell className="font-medium">
                      <span className="inline-flex items-center gap-2">
                        {user.displayName}
                        {isSelf ? (
                          <Badge variant="secondary" className="text-[11px]">
                            Vous
                          </Badge>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{user.email}</TableCell>
                    <TableCell>
                      {isSelf ? (
                        <Badge variant="outline" className={ROLE_BADGE_CLASS[user.role as Role] ?? ""}>
                          {ROLE_LABELS[user.role as Role] ?? user.role}
                        </Badge>
                      ) : (
                        <Select
                          value={user.role}
                          disabled={busy || user.role === "ADMIN" && isLastAdmin}
                          onValueChange={(nextRole) =>
                            setPending({ userId: user.id, kind: "role", nextRole: nextRole as Role })
                          }
                        >
                          <SelectTrigger
                            size="sm"
                            aria-label={`Rôle de ${user.displayName}`}
                            className="w-[190px]"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map((role) => (
                              <SelectItem key={role} value={role}>
                                {ROLE_LABELS[role]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={user.isActive}
                        disabled={isSelf || busy || (isLastAdmin && user.isActive)}
                        onCheckedChange={(checked) =>
                          setPending({
                            userId: user.id,
                            kind: checked ? "activate" : "deactivate",
                          })
                        }
                        aria-label={
                          isLastAdmin && user.isActive
                            ? "Dernier administrateur actif : désactivation impossible"
                            : user.isActive
                              ? `Désactiver le compte de ${user.displayName}`
                              : `Réactiver le compte de ${user.displayName}`
                        }
                        title={
                          isSelf
                            ? "Vous ne pouvez pas modifier votre propre compte"
                            : isLastAdmin && user.isActive
                              ? "Dernier administrateur actif : désactivation impossible"
                              : undefined
                        }
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.lastLoginLabel ?? "Jamais connecté"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{user.createdLabel}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {users.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-border bg-card/60 px-6 py-12 text-center text-sm text-muted-foreground">
          Aucun compte trouvé.
        </p>
      ) : null}

      {/* Confirmation des actions sensibles */}
      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.kind === "role"
                ? "Modifier le rôle de ce compte ?"
                : pending?.kind === "deactivate"
                  ? "Désactiver ce compte ?"
                  : "Réactiver ce compte ?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.kind === "role" ? (
                <>
                  Nouveau rôle : <strong>{pending.nextRole ? ROLE_LABELS[pending.nextRole] : ""}</strong>.
                  Les sessions existantes du compte seront renouvelées.
                </>
              ) : pending?.kind === "deactivate" ? (
                <>
                  La personne ne pourra plus se connecter et ses sessions seront révoquées
                  immédiatement. Ses entrées passées dans le journal sont conservées.
                </>
              ) : (
                <>La personne pourra de nouveau se connecter avec ses identifiants.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actingUserId !== null}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={actingUserId !== null}
              onClick={(event) => {
                event.preventDefault();
                void applyPending();
              }}
            >
              {actingUserId !== null ? (
                <>
                  <Loader2 aria-hidden="true" className="animate-spin" />
                  Application…
                </>
              ) : (
                "Confirmer"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Création d'un compte */}
      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          setCreateOpen(false);
          router.refresh();
          toast({
            title: "Compte créé",
            description: "Le nouveau compte équipe peut maintenant se connecter.",
          });
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Création d'un compte : politique ≥ 12 caractères + lettre + chiffre avec
// jauge en direct (le contrôle serveur reste la source de vérité).
// ---------------------------------------------------------------------------

function CreateUserDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("MODERATOR");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const rules = useMemo(
    () => [
      { label: "Au moins 12 caractères", ok: password.length >= 12 },
      { label: "Au moins une lettre", ok: /[a-zA-Z]/.test(password) },
      { label: "Au moins un chiffre", ok: /[0-9]/.test(password) },
    ],
    [password],
  );
  const passwordValid = rules.every((rule) => rule.ok);

  function resetForm() {
    setDisplayName("");
    setEmail("");
    setPassword("");
    setRole("MODERATOR");
    setShowPassword(false);
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setFormError(null);

    if (!displayName.trim() || !email.trim()) {
      setFormError("Merci de renseigner le nom d'affichage et l'adresse e-mail.");
      return;
    }
    if (!passwordValid) {
      setFormError("Le mot de passe ne respecte pas encore les règles de sécurité.");
      return;
    }

    setSubmitting(true);
    const result = await postJson<unknown>("/api/admin/users", {
      displayName: displayName.trim(),
      email: email.trim(),
      password,
      role,
    });
    setSubmitting(false);

    if (!result.ok) {
      setFormError(result.error.message);
      toast({ title: "Création impossible", description: result.error.message, variant: "destructive" });
      return;
    }

    resetForm();
    onCreated();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!submitting) onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">Créer un compte équipe</DialogTitle>
          <DialogDescription>
            Le mot de passe doit contenir au moins 12 caractères, une lettre et un chiffre.
            Communiquez-le de façon sécurisée : il n&apos;est jamais stocké en clair.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {formError ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {formError}
            </p>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="new-display-name">Nom d&apos;affichage</Label>
            <Input
              id="new-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Prénom Nom"
              maxLength={80}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-email">Adresse e-mail</Label>
            <Input
              id="new-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="prenom.nom@exemple.org"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-password">Mot de passe</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {showPassword ? (
                  <EyeOff aria-hidden="true" className="size-4" />
                ) : (
                  <Eye aria-hidden="true" className="size-4" />
                )}
              </button>
            </div>
            <ul className="grid gap-1 pt-1">
              {rules.map((rule) => (
                <li
                  key={rule.label}
                  className={cn(
                    "flex items-center gap-2 text-xs transition-colors",
                    rule.ok ? "text-emerald-700" : "text-muted-foreground",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-1.5 rounded-full",
                      rule.ok ? "bg-emerald-600" : "bg-muted-foreground/40",
                    )}
                  />
                  {rule.label}
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-role">Rôle</Label>
            <Select value={role} onValueChange={(value) => setRole(value as Role)}>
              <SelectTrigger id="new-role" className="w-full" aria-label="Rôle du nouveau compte">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {role === "ADMIN"
                ? "Accès complet : dossiers, comptes, journal, paramètres."
                : role === "MODERATOR"
                  ? "Modération des témoignages, traitement des propositions, statistiques."
                  : "Gestion éditoriale des catégories et statistiques."}
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 aria-hidden="true" className="animate-spin" />
                  Création…
                </>
              ) : (
                "Créer le compte"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
