"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  ScrollText,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { hasPermission } from "@/lib/permissions";
import { ROLE_LABELS, type Role } from "@/lib/constants";
import { cn } from "@/lib/utils";

export interface AdminShellUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
}

// Coquille de l'espace d'administration : rail latéral fixe sur desktop,
// feuille (Sheet) sur mobile. Seuls les items réellement disponibles sont
// affichés, selon les permissions du rôle (aucun lien mort).
export function AdminShell({
  user,
  siteName,
  children,
}: {
  user: AdminShellUser;
  siteName: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const canManageAdmins = hasPermission(user.role, "MANAGE_ADMINS");
  const canViewAudit = hasPermission(user.role, "VIEW_AUDIT_LOG");
  const canManageDossiers = hasPermission(user.role, "MANAGE_DOSSIERS");

  const navItems: NavItem[] = [
    { href: "/admin", label: "Tableau de bord", icon: LayoutDashboard, exact: true },
    { href: "/admin/dossiers", label: "Dossiers", icon: FolderOpen },
    ...(canManageDossiers
      ? [{ href: "/admin/invitations", label: "Invitations", icon: Mail }]
      : []),
    ...(canManageAdmins
      ? [{ href: "/admin/utilisateurs", label: "Utilisateurs", icon: Users }]
      : []),
    ...(canViewAudit ? [{ href: "/admin/journal", label: "Journal", icon: ScrollText }] : []),
  ];

  function isActive(item: NavItem): boolean {
    return item.exact ? pathname === item.href : pathname.startsWith(item.href);
  }

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    await signOut({ callbackUrl: "/admin/connexion" });
    // signOut redirige ; ce code ne s'exécute qu'en cas d'échec de redirection.
    setSigningOut(false);
    router.push("/admin/connexion");
  }

  const roleLabel = ROLE_LABELS[user.role as Role] ?? user.role;

  const nav = (
    <nav aria-label="Navigation de l'espace équipe" className="flex flex-1 flex-col gap-1 px-3 py-2">
      {navItems.map((item) => {
        const active = isActive(item);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-sidebar-ring/60 focus-visible:outline-none",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            <item.icon
              aria-hidden="true"
              className={cn("size-4 shrink-0", active ? "text-gold" : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground")}
            />
            {item.label}
            {active ? <span aria-hidden="true" className="ml-auto size-1.5 rounded-full bg-gold" /> : null}
          </Link>
        );
      })}
    </nav>
  );

  const brand = (
    <div className="flex items-center gap-2.5 px-5 pt-6 pb-4">
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-full border border-gold/50 font-display text-sm font-semibold text-gold"
      >
        V
      </span>
      <span className="min-w-0">
        <span className="block truncate font-display text-sm font-semibold text-sidebar-foreground">
          Espace équipe
        </span>
        <span className="block text-[11px] text-sidebar-foreground/60">Projet en préparation</span>
      </span>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Rail latéral — desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        {brand}
        {nav}
        <div className="border-t border-sidebar-border/70 px-5 py-4">
          <p className="truncate text-xs font-medium text-sidebar-foreground/80">
            {user.name || user.email}
          </p>
          <p className="mt-0.5 text-[11px] text-sidebar-foreground/55">{roleLabel}</p>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col md:pl-64">
        {/* En-tête */}
        <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
          <div className="flex h-14 items-center gap-3 px-4 sm:h-16 sm:px-6">
            {/* Menu mobile */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label="Ouvrir le menu de navigation"
                >
                  <Menu aria-hidden="true" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-72 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground [&>button]:text-sidebar-foreground"
              >
                <SheetHeader className="border-b border-sidebar-border px-5 pt-6 pb-4">
                  <SheetTitle className="font-display text-sm font-semibold text-sidebar-foreground">
                    Espace équipe
                  </SheetTitle>
                </SheetHeader>
                {brand}
                {nav}
              </SheetContent>
            </Sheet>

            <p className="truncate font-display text-sm font-semibold text-foreground sm:text-base">
              {siteName}
            </p>

            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <div className="hidden min-w-0 text-right sm:block">
                <p className="truncate text-sm font-medium text-foreground">
                  {user.name || user.email}
                </p>
                <p className="text-[11px] text-muted-foreground">{user.email}</p>
              </div>
              <Badge
                variant="outline"
                className="hidden border-gold/60 bg-gold/10 text-pine sm:inline-flex"
                title="Votre rôle dans l'espace équipe"
              >
                {roleLabel}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSignOut}
                disabled={signingOut}
                className="border-border text-foreground/80 hover:bg-accent hover:text-foreground"
              >
                <LogOut aria-hidden="true" className="size-4" />
                <span className="hidden sm:inline">Déconnexion</span>
                <span className="sr-only sm:hidden">Déconnexion</span>
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
