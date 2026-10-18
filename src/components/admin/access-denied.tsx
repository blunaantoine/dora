import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ROLE_LABELS, type Role } from "@/lib/constants";

// Page « Accès refusé » (403) rendue côté serveur quand un rôle connecté
// tente d'accéder à une section hors de ses permissions.
export function AccessDenied({ role }: { role?: string }) {
  const roleLabel = role ? (ROLE_LABELS[role as Role] ?? role) : null;

  return (
    <div className="mx-auto max-w-lg py-10">
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <ShieldAlert aria-hidden="true" className="mx-auto size-10 text-destructive" />
        <h1 className="mt-4 font-display text-xl font-semibold text-foreground">
          Accès refusé
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Votre rôle{roleLabel ? <> ({roleLabel})</> : null} ne dispose pas des permissions
          nécessaires pour consulter cette section.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/admin">Retour au tableau de bord</Link>
        </Button>
      </div>
    </div>
  );
}
