"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

// Boundary d'erreur de l'espace admin : message générique (aucun détail
// technique exposé) + bouton « Réessayer » réel (reset() relance le rendu).
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin] Erreur de rendu :", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-12">
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <AlertTriangle aria-hidden="true" className="mx-auto size-10 text-destructive" />
        <h1 className="mt-4 font-display text-xl font-semibold text-foreground">
          Une erreur est survenue
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Cette page n&apos;a pas pu être affichée. Vous pouvez réessayer ; si le problème
          persiste, déconnectez-vous puis reconnectez-vous.
        </p>
        <Button onClick={reset} className="mt-6">
          <RotateCcw aria-hidden="true" />
          Réessayer
        </Button>
      </div>
    </div>
  );
}
