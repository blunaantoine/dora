"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

// Boundary d'erreur de l'annuaire : message clair + bouton « Réessayer » réel
// (reset() relance le rendu du segment, donc la requête Prisma).

export default function AnnuaireError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Détail complet côté console uniquement (rien de technique à l'écran).
    console.error("[annuaire] Erreur de chargement des profils :", error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-lg rounded-xl border border-border bg-card p-8 text-center">
        <AlertTriangle aria-hidden="true" className="mx-auto size-10 text-destructive" />
        <h1 className="mt-4 font-display text-xl font-semibold text-foreground">
          Une erreur est survenue
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          L&apos;annuaire n&apos;a pas pu être chargé. Vous pouvez réessayer ; si le problème
          persiste, revenez plus tard.
        </p>
        <Button onClick={reset} className="mt-6">
          <RotateCcw aria-hidden="true" />
          Réessayer
        </Button>
      </div>
    </div>
  );
}
