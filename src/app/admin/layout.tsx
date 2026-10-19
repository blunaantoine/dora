import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminSessionSafe } from "@/lib/auth-options";
import { hasPermission } from "@/lib/permissions";
import { AdminShell } from "@/components/admin/admin-shell";

// Garde de session (double filet avec src/proxy.ts) : en plus du JWT vérifié
// par le proxy, getAdminSessionSafe() relit le compte en base — une session
// révoquée (tokenVersion incrémentée) ou un compte désactivé aboutit à une
// redirection vers la page de connexion.
//
// Compteurs de travail (phase 5) : témoignages PENDING (§9) et propositions
// NEW/POTENTIAL_DUPLICATE (§11) — calculés uniquement pour les rôles qui ont
// la permission correspondante, jamais de faux chiffres.
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getAdminSessionSafe();
  if (!session) {
    redirect("/admin/connexion");
  }

  const canModerateTestimonials = hasPermission(session.user.role, "MODERATE_TESTIMONIALS");
  const canManageNominations = hasPermission(session.user.role, "MANAGE_NOMINATIONS");

  const [pendingTestimonials, newNominations, duplicateNominations] = await Promise.all([
    canModerateTestimonials
      ? db.testimonial.count({ where: { status: "PENDING" } })
      : Promise.resolve(0),
    canManageNominations
      ? db.nomination.count({ where: { status: "NEW" } })
      : Promise.resolve(0),
    canManageNominations
      ? db.nomination.count({ where: { status: "POTENTIAL_DUPLICATE" } })
      : Promise.resolve(0),
  ]);

  return (
    <AdminShell
      siteName={
        process.env.SITE_NAME?.trim() ||
        "Plateforme de valorisation des femmes et des filles engagées"
      }
      user={{
        id: session.user.id,
        name: session.user.name ?? "",
        email: session.user.email ?? "",
        role: session.user.role,
      }}
      counters={{
        pendingTestimonials,
        openNominations: newNominations + duplicateNominations,
      }}
    >
      {children}
    </AdminShell>
  );
}
