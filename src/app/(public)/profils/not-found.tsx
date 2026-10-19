import Link from "next/link";
import { UserX } from "lucide-react";

import { Button } from "@/components/ui/button";

// 404 de la fiche publique : profil inexistant, jamais publié ou dépublié —
// message volontairement générique (anti-énumération, §4.5), sans indication
// de l'existence éventuelle d'un profil privé.

export default function ProfilNotFound() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-lg rounded-xl border border-border bg-card p-8 text-center">
        <UserX aria-hidden="true" className="mx-auto size-10 text-muted-foreground/70" />
        <h1 className="mt-4 font-display text-xl font-semibold text-foreground">
          Profil introuvable
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Ce profil n&apos;existe pas ou n&apos;est plus disponible : il a peut-être été dépublié
          à la demande de la personne concernée.
        </p>
        <Button asChild className="mt-6 min-h-11">
          <Link href="/profils">Retour à l&apos;annuaire des parcours</Link>
        </Button>
      </div>
    </div>
  );
}
