import type { Metadata } from "next";

import { getAdminSessionSafe } from "@/lib/auth-options";
import { hasPermission } from "@/lib/permissions";
import { AccessDenied } from "@/components/admin/access-denied";
import { BadgesManager } from "@/components/admin/badges-manager";

// Badges et reconnaissances (§12) — gestion entièrement manuelle en première
// version : définitions, attribution et retrait avec justification, sur des
// profils publiés uniquement.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Badges",
  robots: { index: false, follow: false },
};

export default async function BadgesPage() {
  const session = await getAdminSessionSafe();
  const role = session?.user.role;

  if (!hasPermission(role, "MANAGE_BADGES")) {
    return <AccessDenied role={role} />;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <header>
        <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
          Badges et reconnaissances
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Reconnaissances attribuées manuellement par l&apos;équipe (§12). Un badge exprime la
          reconnaissance de la plateforme et ne doit jamais être présenté comme une certification
          officielle — la mention apparaît discrètement sur les fiches publiques. Toute attribution
          et tout retrait demandent une justification et sont journalisés.
        </p>
      </header>

      <section aria-label="Liste des badges" className="mt-8">
        <BadgesManager />
      </section>
    </div>
  );
}
