"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { AlertCircle, Eye, EyeOff, Loader2, LockKeyhole, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { postJson } from "@/lib/client-api";

// Formulaire de connexion administrateur.
// Flux : pré-vérification du seuil de tentatives (isLoginAllowed via
// /api/auth/check-rate-limit, recommandation de la 2-a) → signIn → redirection
// vers la page demandée (?from=…). NextAuth masquant les messages de
// authorize(), l'échec affiche un message générique ; si la cause était le
// seuil de tentatives, une seconde vérification permet de l'expliciter.

type FormError = { message: string } | null;

export function ConnexionForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = sanitizeFrom(searchParams.get("from"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<FormError>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError({ message: "Merci de renseigner votre adresse e-mail et votre mot de passe." });
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // 1. Pré-vérification du seuil (message clair avant de consommer un essai).
      const check = await postJson<{ allowed: boolean; retryAfterSec: number }>(
        "/api/auth/check-rate-limit",
        { email: trimmedEmail },
      );
      if (check.ok && !check.data.allowed) {
        setError({ message: formatRetryMessage(check.data.retryAfterSec) });
        return;
      }

      // 2. Connexion NextAuth (redirect:false → résultat géré ici).
      const result = await signIn("credentials", {
        email: trimmedEmail,
        password,
        redirect: false,
      });

      if (result?.error) {
        // NextAuth v4 masque la cause (401 générique) : on vérifie si le seuil
        // de tentatives est atteint pour afficher le bon message, sinon message
        // générique — le serveur tranche.
        const recheck = await postJson<{ allowed: boolean; retryAfterSec: number }>(
          "/api/auth/check-rate-limit",
          { email: trimmedEmail },
        );
        if (recheck.ok && !recheck.data.allowed) {
          setError({ message: formatRetryMessage(recheck.data.retryAfterSec) });
        } else {
          setError({
            message:
              "Identifiants invalides ou compte inaccessible. Vérifiez votre e-mail et votre mot de passe.",
          });
        }
        return;
      }

      // 3. Succès : navigation vers la destination demandée (ou le tableau de bord).
      router.push(from ?? "/admin");
      router.refresh();
    } catch {
      setError({
        message: "Une erreur inattendue est survenue. Merci de réessayer dans un instant.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="email">Adresse e-mail</Label>
        <div className="relative">
          <Mail
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="prenom.nom@exemple.org"
            className="pl-9"
            aria-invalid={Boolean(error)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Mot de passe</Label>
        <div className="relative">
          <LockKeyhole
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            className="pr-10 pl-9"
            aria-invalid={Boolean(error)}
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
      </div>

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 aria-hidden="true" className="animate-spin" />
            Connexion en cours…
          </>
        ) : (
          "Se connecter"
        )}
      </Button>
    </form>
  );
}

function sanitizeFrom(raw: string | null): string | null {
  if (!raw) return null;
  // Uniquement des destinations internes à l'espace admin.
  return raw.startsWith("/admin") && !raw.startsWith("/admin/connexion") ? raw : null;
}

function formatRetryMessage(retryAfterSec: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
  return `Trop de tentatives de connexion. Pour des raisons de sécurité, merci de réessayer dans environ ${minutes} minute${minutes > 1 ? "s" : ""}.`;
}
