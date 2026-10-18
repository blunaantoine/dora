import { redirect } from "next/navigation";
import { getAdminSessionSafe } from "@/lib/auth-options";
import { AdminShell } from "@/components/admin/admin-shell";

// Garde de session (double filet avec src/proxy.ts) : en plus du JWT vérifié
// par le proxy, getAdminSessionSafe() relit le compte en base — une session
// révoquée (tokenVersion incrémentée) ou un compte désactivé aboutit à une
// redirection vers la page de connexion.
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getAdminSessionSafe();
  if (!session) {
    redirect("/admin/connexion");
  }

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
    >
      {children}
    </AdminShell>
  );
}
