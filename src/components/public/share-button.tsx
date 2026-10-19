"use client";

// ---------------------------------------------------------------------------
// Bouton de partage de la fiche publique (§4.4) — SEUL composant client des
// pages publiques : les pages restent lisibles sans JavaScript (Server
// Components + formulaires GET natifs, perf 3G §19).
//
//   - Web Share API si disponible (mobile) ;
//   - sinon copie du lien dans le presse-papiers (fallback) ;
//   - retour visuel immédiat (« Lien copié »), aucun envoi réseau.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Link2, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type ShareState = "idle" | "copied" | "error";

export function ShareButton({ url, title }: { url: string; title: string }) {
  const [state, setState] = useState<ShareState>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const share = useCallback(async () => {
    const absoluteUrl = new URL(url, window.location.origin).toString();

    // Web Share API (partage natif mobile) — texte minimal, aucune donnée privée.
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url: absoluteUrl });
        return; // partage réussi (ou annulé par l'utilisateur) — pas d'état à afficher
      } catch (error) {
        // AbortError : annulation utilisateur — on ne montre pas d'erreur.
        if ((error as DOMException)?.name === "AbortError") return;
        // Autre échec → tentative de copie ci-dessous.
      }
    }

    // Fallback : copie du lien.
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setState("copied");
    } catch {
      setState("error");
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setState("idle"), 2500);
  }, [url, title]);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="min-h-11 border-pine text-pine hover:bg-accent hover:text-pine"
      onClick={() => void share()}
      aria-label={
        state === "copied" ? "Lien copié dans le presse-papiers" : `Partager le profil de ${title}`
      }
      aria-live="polite"
    >
      {state === "copied" ? (
        <>
          <Check aria-hidden="true" />
          Lien copié
        </>
      ) : state === "error" ? (
        <>
          <Link2 aria-hidden="true" />
          Copie impossible
        </>
      ) : (
        <>
          <Share2 aria-hidden="true" />
          Partager
        </>
      )}
    </Button>
  );
}
