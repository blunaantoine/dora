import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getAdminSessionSafe } from "@/lib/auth-options";
import { hasPermission } from "@/lib/permissions";
import { UsersManager, type UserRow } from "@/components/admin/users-manager";
import { AccessDenied } from "@/components/admin/access-denied";

// Gestion des comptes équipe — ADMIN uniquement (MANAGE_ADMINS).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Utilisateurs",
  robots: { index: false, follow: false },
};

const frDateTime = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

export default async function UtilisateursPage() {
  const session = await getAdminSessionSafe();
  const role = session?.user.role;
  if (!hasPermission(role, "MANAGE_ADMINS")) {
    return <AccessDenied role={role} />;
  }

  const users = await db.adminUser.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      displayName: true,
      email: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  const rows: UserRow[] = users.map((user) => ({
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    lastLoginLabel: user.lastLoginAt ? frDateTime.format(user.lastLoginAt) : null,
    createdLabel: frDateTime.format(user.createdAt),
  }));

  return (
    <div className="mx-auto max-w-5xl">
      <UsersManager users={rows} currentUserId={session!.user.id} />
    </div>
  );
}
