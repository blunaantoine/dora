import type { Metadata } from "next";
import { Suspense } from "react";
import { ConnexionForm } from "@/components/admin/connexion-form";
import { Skeleton } from "@/components/ui/skeleton";

// Page non indexée (le proxy ajoute déjà les en-têtes de sécurité sur /admin*).
export const metadata: Metadata = {
  title: "Connexion à l'espace équipe",
  robots: { index: false, follow: false },
};

export default function ConnexionPage() {
  return (
    <div className="w-full max-w-md">
      <div className="rounded-2xl border border-[#F8F5EF]/15 bg-card p-6 shadow-lg sm:p-8">
        <div
          aria-hidden="true"
          className="mx-auto h-1 w-14 rounded-full bg-gold"
        />
        <h1 className="mt-4 text-center font-display text-2xl font-semibold text-foreground">
          Espace équipe
        </h1>
        <p className="mt-2 text-center text-sm leading-relaxed text-muted-foreground">
          Connexion réservée aux membres de l&apos;équipe. Toute tentative est journalisée.
        </p>
        <Suspense fallback={<ConnexionSkeleton />}>
          <ConnexionForm />
        </Suspense>
      </div>
    </div>
  );
}

function ConnexionSkeleton() {
  return (
    <div className="mt-6 space-y-4" aria-hidden="true">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
