import Link from "next/link";
import { Compass } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function AdminNotFound() {
  return (
    <div className="mx-auto max-w-lg py-12">
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <Compass aria-hidden="true" className="mx-auto size-10 text-muted-foreground" />
        <h1 className="mt-4 font-display text-xl font-semibold text-foreground">
          Page introuvable
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          La page demandée n&apos;existe pas ou a été déplacée.
        </p>
        <Button asChild className="mt-6">
          <Link href="/admin">Retour au tableau de bord</Link>
        </Button>
      </div>
    </div>
  );
}
