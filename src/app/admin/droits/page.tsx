import type { Metadata } from "next";

import { getAdminSessionSafe } from "@/lib/auth-options";
import { hasPermission } from "@/lib/permissions";
import { AccessDenied } from "@/components/admin/access-denied";
import { RightsRequestsManager } from "@/components/admin/rights-requests-manager";

// Suivi des demandes de droits des personnes (§15.3) : enregistrées, suivies,
// clôturées avec une trace de décision. Le retrait de publication peut être
// exécuté immédiatement lors de la décision (§8.5, §14 retrait simplifié).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Droits des personnes",
  robots: { index: false, follow: false },
};

export default async function DroitsPage() {
  const session = await getAdminSessionSafe();
  const role = session?.user.role;

  if (!hasPermission(role, "MANAGE_DOSSIERS")) {
    return <AccessDenied role={role} />;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <header>
        <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
          Droits des personnes
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Demandes d&apos;accès, de correction, de limitation, de retrait de publication,
          d&apos;effacement, de retrait de consentement et signalements (§15.3). Chaque demande
          est traitée avec une décision explicative et une trace. Pour une mineure, le retrait
          est simplifié et l&apos;exécution de la dépublication est immédiate lors de la décision.
        </p>
      </header>

      <section aria-label="Liste des demandes de droits" className="mt-8">
        <RightsRequestsManager />
      </section>
    </div>
  );
}
